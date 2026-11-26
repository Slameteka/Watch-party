import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearCognitoSession,
  computeS256Challenge,
  decodeJwtPayload,
  getCognitoConfig,
  getCognitoProfile,
  getStoredCognitoIdToken,
  handleCognitoCallback,
  isCognitoConfigured,
  logoutCognito,
  setStoredCognitoIdToken,
  startCognitoLogin,
} from './auth'

function toBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function createMemoryStorage(): Storage {
  const store = new Map<string, string>()
  return {
    get length() {
      return store.size
    },
    clear() {
      store.clear()
    },
    getItem(key: string) {
      return store.get(key) ?? null
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null
    },
    removeItem(key: string) {
      store.delete(key)
    },
    setItem(key: string, value: string) {
      store.set(key, value)
    },
  }
}

function makeJwt(payload: Record<string, unknown>): string {
  const header = toBase64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const body = toBase64Url(JSON.stringify(payload))
  return `${header}.${body}.signature`
}

interface MockWindow {
  location: {
    origin: string
    pathname: string
    search: string
    assign: ReturnType<typeof vi.fn>
  }
  history: {
    replaceState: ReturnType<typeof vi.fn>
  }
}

function installBrowserStubs(pathname = '/', search = ''): {
  storage: Storage
  mockWindow: MockWindow
} {
  const storage = createMemoryStorage()
  const mockWindow: MockWindow = {
    location: {
      origin: 'https://watchparty.chescloud.my.id',
      pathname,
      search,
      assign: vi.fn(),
    },
    history: {
      replaceState: vi.fn(),
    },
  }
  vi.stubGlobal('sessionStorage', storage)
  vi.stubGlobal('window', mockWindow)
  return { storage, mockWindow }
}

describe('cognito auth PKCE helper', () => {
  beforeEach(() => {
    installBrowserStubs()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('reads Cognito env configuration safely', () => {
    vi.stubEnv('VITE_COGNITO_DOMAIN', '')
    vi.stubEnv('VITE_COGNITO_CLIENT_ID', '')
    expect(isCognitoConfigured()).toBe(false)

    vi.stubEnv('VITE_COGNITO_DOMAIN', 'watchparty-prod-auth.auth.ap-southeast-1.amazoncognito.com')
    vi.stubEnv('VITE_COGNITO_CLIENT_ID', '5qn5cl45ldd6t5d5ldslridccb')

    expect(isCognitoConfigured()).toBe(true)
    expect(getCognitoConfig()).toEqual({
      domain: 'watchparty-prod-auth.auth.ap-southeast-1.amazoncognito.com',
      clientId: '5qn5cl45ldd6t5d5ldslridccb',
    })
  })

  it('computes RFC 7636 S256 base64url challenge without padding', async () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
    const challenge = await computeS256Challenge(verifier)

    expect(challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
    expect(challenge).not.toContain('=')
    expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })

  it('decodes JWT payload, enforces expiry skew, and extracts Cognito profile', () => {
    const futureExp = Math.floor(Date.now() / 1000) + 3600
    const validToken = makeJwt({
      sub: 'user-123',
      email: 'host@example.com',
      name: 'Host Satu',
      exp: futureExp,
    })

    expect(decodeJwtPayload(validToken)?.sub).toBe('user-123')
    expect(decodeJwtPayload('malformed')).toBeNull()

    setStoredCognitoIdToken(validToken)
    expect(getStoredCognitoIdToken()).toBe(validToken)
    expect(getCognitoProfile()).toEqual({
      sub: 'user-123',
      email: 'host@example.com',
      name: 'Host Satu',
    })

    const expiredToken = makeJwt({
      sub: 'user-123',
      email: 'host@example.com',
      exp: Math.floor(Date.now() / 1000) - 60,
    })
    setStoredCognitoIdToken(expiredToken)
    expect(getStoredCognitoIdToken()).toBeNull()
    expect(getCognitoProfile()).toBeNull()

    setStoredCognitoIdToken(validToken)
    clearCognitoSession()
    expect(getStoredCognitoIdToken()).toBeNull()
  })

  it('redirects to Cognito /login with PKCE S256 parameters', async () => {
    vi.stubEnv('VITE_COGNITO_DOMAIN', 'watchparty-prod-auth.auth.ap-southeast-1.amazoncognito.com')
    vi.stubEnv('VITE_COGNITO_CLIENT_ID', 'client-abc')
    const { storage, mockWindow } = installBrowserStubs()

    await startCognitoLogin({ openCreateAfter: true })

    expect(mockWindow.location.assign).toHaveBeenCalledTimes(1)
    const targetUrl = new URL(mockWindow.location.assign.mock.calls[0][0] as string)

    expect(targetUrl.origin).toBe('https://watchparty-prod-auth.auth.ap-southeast-1.amazoncognito.com')
    expect(targetUrl.pathname).toBe('/login')
    expect(targetUrl.searchParams.get('response_type')).toBe('code')
    expect(targetUrl.searchParams.get('client_id')).toBe('client-abc')
    expect(targetUrl.searchParams.get('redirect_uri')).toBe(
      'https://watchparty.chescloud.my.id/callback',
    )
    expect(targetUrl.searchParams.get('code_challenge_method')).toBe('S256')

    const verifier = storage.getItem('cognito_pkce_verifier')
    const state = storage.getItem('cognito_oauth_state')
    expect(verifier).toBeTruthy()
    expect(state).toBeTruthy()
    expect(storage.getItem('cognito_open_create_after')).toBe('1')
    expect(targetUrl.searchParams.get('state')).toBe(state)
    expect(targetUrl.searchParams.get('code_challenge')).toBe(
      await computeS256Challenge(verifier!),
    )
  })

  it('ignores non-callback paths in handleCognitoCallback', async () => {
    installBrowserStubs('/', '')
    const result = await handleCognitoCallback()
    expect(result).toEqual({ handled: false })
  })

  it('rejects callback with mismatched CSRF state and cleans URL', async () => {
    vi.stubEnv('VITE_COGNITO_DOMAIN', 'watchparty-prod-auth.auth.ap-southeast-1.amazoncognito.com')
    vi.stubEnv('VITE_COGNITO_CLIENT_ID', 'client-abc')
    const { storage, mockWindow } = installBrowserStubs(
      '/callback',
      '?code=auth-code-123&state=wrong-state',
    )
    storage.setItem('cognito_oauth_state', 'expected-state')
    storage.setItem('cognito_pkce_verifier', 'verifier-xyz')

    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const result = await handleCognitoCallback()

    expect(result.handled).toBe(true)
    expect(result.ok).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(mockWindow.history.replaceState).toHaveBeenCalledWith(null, '', '/')
  })

  it('exchanges authorization code for id_token on /callback and cleans up state', async () => {
    vi.stubEnv('VITE_COGNITO_DOMAIN', 'watchparty-prod-auth.auth.ap-southeast-1.amazoncognito.com')
    vi.stubEnv('VITE_COGNITO_CLIENT_ID', 'client-abc')
    const { storage, mockWindow } = installBrowserStubs(
      '/callback',
      '?code=auth-code-123&state=state-xyz',
    )
    storage.setItem('cognito_oauth_state', 'state-xyz')
    storage.setItem('cognito_pkce_verifier', 'verifier-xyz')
    storage.setItem('cognito_open_create_after', '1')

    const idToken = makeJwt({
      sub: 'host-1',
      email: 'host@example.com',
      exp: Math.floor(Date.now() / 1000) + 3600,
    })

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id_token: idToken, access_token: 'acc-ignored' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await handleCognitoCallback()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [tokenUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(tokenUrl).toBe('https://watchparty-prod-auth.auth.ap-southeast-1.amazoncognito.com/oauth2/token')
    expect(init.method).toBe('POST')
    expect(String(init.body)).toContain('grant_type=authorization_code')
    expect(String(init.body)).toContain('code=auth-code-123')
    expect(String(init.body)).toContain('code_verifier=verifier-xyz')

    expect(result).toEqual({
      handled: true,
      ok: true,
      openCreateAfter: true,
      email: 'host@example.com',
    })
    expect(getStoredCognitoIdToken()).toBe(idToken)
    expect(storage.getItem('cognito_pkce_verifier')).toBeNull()
    expect(storage.getItem('cognito_oauth_state')).toBeNull()
    expect(mockWindow.history.replaceState).toHaveBeenCalledWith(null, '', '/')
  })

  it('clears storage and redirects to Cognito /logout on logoutCognito', () => {
    vi.stubEnv('VITE_COGNITO_DOMAIN', 'watchparty-prod-auth.auth.ap-southeast-1.amazoncognito.com')
    vi.stubEnv('VITE_COGNITO_CLIENT_ID', 'client-abc')
    const { mockWindow } = installBrowserStubs()

    setStoredCognitoIdToken(
      makeJwt({ sub: 'u1', exp: Math.floor(Date.now() / 1000) + 3600 }),
    )
    logoutCognito()

    expect(getStoredCognitoIdToken()).toBeNull()
    expect(mockWindow.location.assign).toHaveBeenCalledTimes(1)
    const logoutUrl = new URL(mockWindow.location.assign.mock.calls[0][0] as string)
    expect(logoutUrl.pathname).toBe('/logout')
    expect(logoutUrl.searchParams.get('client_id')).toBe('client-abc')
    expect(logoutUrl.searchParams.get('logout_uri')).toBe('https://watchparty.chescloud.my.id')
  })
})
