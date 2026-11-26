// Cognito Hosted UI OAuth2 Authorization Code + PKCE helper (docs/architecture.md §2 & §9.7).

const STORAGE_ID_TOKEN = 'cognito_id_token'
const STORAGE_VERIFIER = 'cognito_pkce_verifier'
const STORAGE_STATE = 'cognito_oauth_state'
const STORAGE_OPEN_CREATE = 'cognito_open_create_after'

export interface CognitoProfile {
  sub: string
  email?: string
  name?: string
}

export interface CognitoCallbackResult {
  handled: boolean
  ok?: boolean
  error?: string
  openCreateAfter?: boolean
  email?: string
}

function getStorage(): Storage | null {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null
  } catch {
    return null
  }
}

export function getCognitoConfig(): { domain: string; clientId: string } {
  const rawDomain = (import.meta.env.VITE_COGNITO_DOMAIN as string | undefined) ?? ''
  const rawClientId = (import.meta.env.VITE_COGNITO_CLIENT_ID as string | undefined) ?? ''
  const domain = rawDomain.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '')
  const clientId = rawClientId.trim()
  return { domain, clientId }
}

export function isCognitoConfigured(): boolean {
  const { domain, clientId } = getCognitoConfig()
  return Boolean(domain && clientId)
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function generateRandomBase64Url(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  return toBase64Url(bytes)
}

export async function computeS256Challenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return toBase64Url(new Uint8Array(digest))
}

export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    return JSON.parse(atob(padded)) as Record<string, unknown>
  } catch {
    return null
  }
}

function isTokenValid(token: string): boolean {
  const payload = decodeJwtPayload(token)
  if (!payload) return false
  if (typeof payload.exp === 'number') {
    return payload.exp * 1000 > Date.now() + 10_000
  }
  return true
}

export function getStoredCognitoIdToken(): string | null {
  const storage = getStorage()
  if (!storage) return null
  const token = storage.getItem(STORAGE_ID_TOKEN)
  if (!token) return null
  if (!isTokenValid(token)) {
    storage.removeItem(STORAGE_ID_TOKEN)
    return null
  }
  return token
}

export function setStoredCognitoIdToken(token: string): void {
  const storage = getStorage()
  if (storage && token.trim()) {
    storage.setItem(STORAGE_ID_TOKEN, token.trim())
  }
}

export function clearCognitoSession(): void {
  const storage = getStorage()
  if (!storage) return
  storage.removeItem(STORAGE_ID_TOKEN)
  storage.removeItem(STORAGE_VERIFIER)
  storage.removeItem(STORAGE_STATE)
  storage.removeItem(STORAGE_OPEN_CREATE)
}

export function getCognitoProfile(): CognitoProfile | null {
  const token = getStoredCognitoIdToken()
  if (!token) return null
  const payload = decodeJwtPayload(token)
  if (!payload || typeof payload.sub !== 'string') return null
  return {
    sub: payload.sub,
    email: typeof payload.email === 'string' ? payload.email : undefined,
    name: typeof payload.name === 'string' ? payload.name : undefined,
  }
}

export async function startCognitoLogin(options: { openCreateAfter?: boolean } = {}): Promise<void> {
  const { domain, clientId } = getCognitoConfig()
  if (!domain || !clientId) {
    throw new Error('Konfigurasi Cognito belum diset.')
  }

  const storage = getStorage()
  const verifier = generateRandomBase64Url(48)
  const state = generateRandomBase64Url(24)
  const challenge = await computeS256Challenge(verifier)

  if (storage) {
    storage.setItem(STORAGE_VERIFIER, verifier)
    storage.setItem(STORAGE_STATE, state)
    if (options.openCreateAfter) {
      storage.setItem(STORAGE_OPEN_CREATE, '1')
    } else {
      storage.removeItem(STORAGE_OPEN_CREATE)
    }
  }

  const redirectUri = `${window.location.origin}/callback`
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    scope: 'openid email profile',
    redirect_uri: redirectUri,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  })
  window.location.assign(`https://${domain}/login?${params.toString()}`)
}

export async function handleCognitoCallback(): Promise<CognitoCallbackResult> {
  if (typeof window === 'undefined' || window.location.pathname !== '/callback') {
    return { handled: false }
  }

  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  const state = params.get('state')
  const oauthError = params.get('error')
  const errorDesc = params.get('error_description')

  const storage = getStorage()
  const expectedState = storage?.getItem(STORAGE_STATE) ?? null
  const verifier = storage?.getItem(STORAGE_VERIFIER) ?? null
  const openCreateAfter = storage?.getItem(STORAGE_OPEN_CREATE) === '1'

  storage?.removeItem(STORAGE_VERIFIER)
  storage?.removeItem(STORAGE_STATE)
  storage?.removeItem(STORAGE_OPEN_CREATE)
  window.history.replaceState(null, '', '/')

  if (oauthError) {
    return {
      handled: true,
      ok: false,
      error: errorDesc || oauthError,
      openCreateAfter,
    }
  }

  if (!code || !state || !expectedState || state !== expectedState || !verifier) {
    return {
      handled: true,
      ok: false,
      error: 'Sesi login Cognito tidak valid atau kadaluarsa. Coba login lagi.',
      openCreateAfter,
    }
  }

  const { domain, clientId } = getCognitoConfig()
  if (!domain || !clientId) {
    return {
      handled: true,
      ok: false,
      error: 'Konfigurasi Cognito belum lengkap.',
      openCreateAfter,
    }
  }

  try {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      code,
      redirect_uri: `${window.location.origin}/callback`,
      code_verifier: verifier,
    })
    const res = await fetch(`https://${domain}/oauth2/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
    if (!res.ok) {
      return {
        handled: true,
        ok: false,
        error: 'Gagal menukar kode login Cognito.',
        openCreateAfter,
      }
    }
    const tokenBody = (await res.json()) as { id_token?: string }
    if (!tokenBody.id_token) {
      return {
        handled: true,
        ok: false,
        error: 'Token identitas Cognito tidak ditemukan.',
        openCreateAfter,
      }
    }
    setStoredCognitoIdToken(tokenBody.id_token)
    const payload = decodeJwtPayload(tokenBody.id_token)
    return {
      handled: true,
      ok: true,
      openCreateAfter,
      email: typeof payload?.email === 'string' ? payload.email : undefined,
    }
  } catch {
    return {
      handled: true,
      ok: false,
      error: 'Tidak bisa menghubungi layanan login Cognito.',
      openCreateAfter,
    }
  }
}

export function logoutCognito(): void {
  clearCognitoSession()
  const { domain, clientId } = getCognitoConfig()
  if (domain && clientId && typeof window !== 'undefined') {
    const params = new URLSearchParams({
      client_id: clientId,
      logout_uri: window.location.origin,
    })
    window.location.assign(`https://${domain}/logout?${params.toString()}`)
  }
}

