import type { EmojiType, WsEnvelope } from '../types'

export type WsMessageCallback = (msg: WsEnvelope<any>) => void

export class WebSocketClient {
  private ws: WebSocket | null = null
  private url: string = ''
  private listeners: Set<WsMessageCallback> = new Set()
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null
  private lastMessageSentMs: number = Date.now()

  public isConnected: boolean = false

  connect(baseUrl: string, token: string): Promise<void> {
    const separator = baseUrl.includes('?') ? '&' : '?'
    this.url = `${baseUrl}${separator}token=${encodeURIComponent(token)}`

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url)

        this.ws.onopen = () => {
          this.isConnected = true
          this.startHeartbeat()
          this.send('session.resume', {})
          resolve()
        }

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data) as WsEnvelope<any>
            this.notifyListeners(data)
          } catch (e) {
            console.error('Failed to parse WebSocket message:', e)
          }
        }

        this.ws.onerror = (err) => {
          console.warn('WebSocket error:', err)
        }

        this.ws.onclose = () => {
          this.isConnected = false
          this.stopHeartbeat()
        }
      } catch (err) {
        reject(err)
      }
    })
  }

  disconnect() {
    this.stopHeartbeat()
    if (this.ws) {
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
