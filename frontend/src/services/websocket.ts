import type { EmojiType, WsEnvelope } from '../types'

export type WsMessageCallback = (msg: WsEnvelope<any>) => void
export type WsCloseCallback = (event: { code: number; reason: string; wasOpen: boolean }) => void

export class WebSocketClient {
  private ws: WebSocket | null = null
  private url: string = ''
  private listeners: Set<WsMessageCallback> = new Set()
  private closeListeners: Set<WsCloseCallback> = new Set()
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null
  private lastMessageSentMs: number = Date.now()

  public isConnected: boolean = false

  /**
   * Open the WebSocket and send `session.resume` as soon as it is open.
   * Resolves when open. Rejects if the connection fails before it opens.
   * `resumePayload` is `{ lastVersion }` on reconnect (ws-messages.md §5.2).
   */
  connect(
    baseUrl: string,
    token: string,
    resumePayload: { lastVersion?: number } = {}
  ): Promise<void> {
    const separator = baseUrl.includes('?') ? '&' : '?'
    this.url = `${baseUrl}${separator}token=${encodeURIComponent(token)}`

    return new Promise((resolve, reject) => {
      try {
        const ws = new WebSocket(this.url)
        this.ws = ws
        let wasOpen = false

        ws.onopen = () => {
          wasOpen = true
          this.isConnected = true
          this.startHeartbeat()
          this.send('session.resume', resumePayload)
          resolve()
        }

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data) as WsEnvelope<any>
            this.notifyListeners(data)
          } catch (e) {
            console.error('Failed to parse WebSocket message:', e)
          }
        }

        ws.onerror = (err) => {
          console.warn('WebSocket error:', err)
        }

        ws.onclose = (event) => {
          // Ignore events of an old socket that was already replaced.
          if (this.ws !== ws) return
          this.isConnected = false
          this.stopHeartbeat()
          if (!wasOpen) reject(new Error('WebSocket closed before it opened'))
          this.closeListeners.forEach((cb) => {
            try {
              cb({ code: event.code, reason: event.reason, wasOpen })
            } catch (e) {
              console.error('Error in WS close listener:', e)
            }
          })
        }
      } catch (err) {
        reject(err)
      }
    })
  }

  disconnect() {
    this.stopHeartbeat()
    if (this.ws) {
      // Detach first so an intentional close does not look like a lost connection.
      this.ws.onclose = null
      this.ws.close()
      this.ws = null
    }
    this.isConnected = false
  }

  send<T extends Record<string, unknown>>(type: string, payload: T, requestId?: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('Cannot send WebSocket message: socket not open', type)
      return
    }

    const envelope: WsEnvelope<T> = {
      v: 1,
      type,
      requestId: requestId || `req-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      sentAtMs: Date.now(),
      payload,
    }

    this.ws.send(JSON.stringify(envelope))
    this.lastMessageSentMs = Date.now()
  }

  sendChat(text: string) {
    this.send('chat.send', { text })
  }

  sendReaction(emoji: EmojiType) {
    this.send('reaction.send', { emoji })
  }

  sendPlayerStatus(status: 'buffering' | 'syncing' | 'ready') {
    this.send('player.status', { status })
  }

  sendClockPing(clientSendMs: number = Date.now()) {
    this.send('clock.ping', { clientSendMs })
  }

  private startHeartbeat() {
    this.stopHeartbeat()
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now()
      if (now - this.lastMessageSentMs >= 4.5 * 60 * 1000) {
        this.send('heartbeat', {})
      }
    }, 60 * 1000)
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
  }

  /** Called when an open connection closes (not after `disconnect()`). */
  onClose(cb: WsCloseCallback): () => void {
    this.closeListeners.add(cb)
    return () => {
      this.closeListeners.delete(cb)
    }
  }

  onMessage(cb: WsMessageCallback): () => void {
    this.listeners.add(cb)
    return () => {
      this.listeners.delete(cb)
    }
  }

  private notifyListeners(msg: WsEnvelope<any>) {
    this.listeners.forEach((cb) => {
      try {
        cb(msg)
      } catch (e) {
        console.error('Error in WS message listener:', e)
      }
    })
  }
}

export const wsClient = new WebSocketClient()
