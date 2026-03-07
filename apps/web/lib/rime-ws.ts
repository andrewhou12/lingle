import WebSocket from 'ws'

const RIME_API_KEY = process.env.RIME_API_KEY || ''
const RIME_VOICE_ID = process.env.RIME_VOICE_ID || 'cove'
const RIME_MODEL_ID = process.env.RIME_MODEL_ID || 'arcana'
const RIME_LANG = process.env.RIME_LANG || ''

// ws2 = mist/mistv2 models, ws3 = arcana model
const WS_URL = RIME_MODEL_ID === 'arcana'
  ? 'wss://users-ws.rime.ai/ws3'
  : 'wss://users-ws.rime.ai/ws2'
const SYNTHESIS_TIMEOUT_MS = 10_000
const RECONNECT_DELAY_MS = 1_000

// Arcana ws3 response format
interface ArcanaMessage {
  type: 'chunk' | 'timestamps' | 'done' | 'error'
  data?: string // base64 audio (for type: "chunk")
  contextId?: string | null
  message?: string // for type: "error"
  word_timestamps?: { words: string[]; start: number[]; end: number[] }
}

// Mist ws2 response format
interface MistMessage {
  audio?: Array<{ data: string; duration?: number; is_eos?: boolean }>
  is_eos?: boolean
  error?: string
}

class RimeWebSocket {
  private ws: WebSocket | null = null
  private connecting = false
  private queue: Array<{
    resolve: (buf: Buffer) => void
    reject: (err: Error) => void
    text: string
  }> = []
  private processing = false
  private speedAlpha = 1.0
  private isArcana = RIME_MODEL_ID === 'arcana'

  private buildUrl(): string {
    const params = new URLSearchParams({
      speaker: RIME_VOICE_ID,
      modelId: RIME_MODEL_ID,
      audioFormat: 'mp3',
      samplingRate: this.isArcana ? '24000' : '44100',
      segment: 'never',
    })
    if (!this.isArcana) {
      params.set('pauseBetweenBrackets', 'true')
      params.set('speedAlpha', this.speedAlpha.toString())
    }
    if (RIME_LANG) params.set('lang', RIME_LANG)
    return `${WS_URL}?${params.toString()}`
  }

  private async connect(): Promise<WebSocket> {
    if (this.ws?.readyState === WebSocket.OPEN) return this.ws
    if (this.connecting) {
      return new Promise((resolve, reject) => {
        const check = setInterval(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            clearInterval(check)
            resolve(this.ws!)
          } else if (!this.connecting) {
            clearInterval(check)
            reject(new Error('Connection failed'))
          }
        }, 50)
      })
    }

    this.connecting = true
    return new Promise((resolve, reject) => {
      const url = this.buildUrl()
      console.log('[rime-ws] connecting to', url.replace(RIME_API_KEY, '***'))
      const ws = new WebSocket(url, {
        headers: { Authorization: `Bearer ${RIME_API_KEY}` },
      })

      ws.on('open', () => {
        console.log('[rime-ws] connected')
        this.ws = ws
        this.connecting = false
        resolve(ws)
      })

      ws.on('close', (code, reason) => {
        console.log('[rime-ws] closed:', code, reason.toString())
        this.ws = null
        this.connecting = false
      })

      ws.on('error', (err) => {
        console.error('[rime-ws] error:', err.message)
        this.ws = null
        this.connecting = false
        reject(err)
      })
    })
  }

  async synthesize(text: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      this.queue.push({ resolve, reject, text })
      this.processQueue()
    })
  }

  private async processQueue() {
    if (this.processing || this.queue.length === 0) return
    this.processing = true

    const item = this.queue.shift()!
    try {
      const result = await this.doSynthesize(item.text)
      item.resolve(result)
    } catch (err) {
      item.reject(err instanceof Error ? err : new Error(String(err)))
    } finally {
      this.processing = false
      this.processQueue()
    }
  }

  private async doSynthesize(text: string): Promise<Buffer> {
    let ws: WebSocket
    try {
      ws = await this.connect()
    } catch {
      // Retry once after delay
      await new Promise((r) => setTimeout(r, RECONNECT_DELAY_MS))
      ws = await this.connect()
    }

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []
      let done = false

      const timeout = setTimeout(() => {
        if (!done) {
          done = true
          cleanup()
          reject(new Error('Rime synthesis timeout'))
        }
      }, SYNTHESIS_TIMEOUT_MS)

      const onMessage = (data: WebSocket.Data) => {
        if (done) return
        try {
          const raw = JSON.parse(data.toString())

          if (this.isArcana) {
            const msg = raw as ArcanaMessage
            if (msg.type === 'error') {
              done = true
              cleanup()
              reject(new Error(`Rime error: ${msg.message}`))
              return
            }
            if (msg.type === 'chunk' && msg.data) {
              chunks.push(Buffer.from(msg.data, 'base64'))
            }
            if (msg.type === 'done' || msg.type === 'timestamps') {
              done = true
              cleanup()
              resolve(Buffer.concat(chunks))
              return
            }
          } else {
            const msg = raw as MistMessage
            if (msg.error) {
              done = true
              cleanup()
              reject(new Error(`Rime error: ${msg.error}`))
              return
            }
            if (msg.audio) {
              for (const chunk of msg.audio) {
                chunks.push(Buffer.from(chunk.data, 'base64'))
              }
            }
            if (msg.is_eos) {
              done = true
              cleanup()
              resolve(Buffer.concat(chunks))
            }
          }
        } catch (err) {
          done = true
          cleanup()
          reject(err instanceof Error ? err : new Error(String(err)))
        }
      }

      const onClose = () => {
        if (!done) {
          done = true
          cleanup()
          // For Arcana, close after sending eos means synthesis is complete
          if (this.isArcana && chunks.length > 0) {
            resolve(Buffer.concat(chunks))
          } else {
            reject(new Error('WebSocket closed during synthesis'))
          }
        }
      }

      const onError = (err: Error) => {
        if (!done) {
          done = true
          cleanup()
          reject(err)
        }
      }

      const cleanup = () => {
        clearTimeout(timeout)
        ws.off('message', onMessage)
        ws.off('close', onClose)
        ws.off('error', onError)
      }

      ws.on('message', onMessage)
      ws.on('close', onClose)
      ws.on('error', onError)

      // Send text then signal end of input
      ws.send(JSON.stringify({ text }))
      ws.send(JSON.stringify({ operation: 'flush' }))
    })
  }

  /**
   * Streaming synthesis — returns { readable, cancel } with raw PCM Int16LE chunks.
   * Uses a TransformStream so writer.close() properly flushes through HTTP responses.
   * Creates a dedicated WS connection with PCM format per call.
   */
  synthesizeStream(text: string, speed?: number): { readable: ReadableStream<Uint8Array>; cancel: () => void } {
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
    const writer = writable.getWriter()
    const isArcana = this.isArcana

    const params = new URLSearchParams({
      speaker: RIME_VOICE_ID,
      modelId: RIME_MODEL_ID,
      audioFormat: 'pcm',
      samplingRate: '24000',
      segment: 'never',
    })
    if (!isArcana) {
      params.set('pauseBetweenBrackets', 'true')
      if (speed && speed !== 1.0) {
        params.set('speedAlpha', (1.0 / speed).toString())
      }
    }
    if (RIME_LANG) params.set('lang', RIME_LANG)

    const url = `${WS_URL}?${params.toString()}`
    console.log('[rime-ws] streaming connect (PCM)')
    const ws = new WebSocket(url, {
      headers: { Authorization: `Bearer ${RIME_API_KEY}` },
    })

    let done = false

    const synthesisTimeout = setTimeout(() => {
      console.warn('[rime-ws] streaming synthesis timeout')
      finish()
    }, SYNTHESIS_TIMEOUT_MS)

    const finish = () => {
      if (done) return
      done = true
      clearTimeout(synthesisTimeout)
      writer.close().catch(() => {})
      try { ws.close() } catch {}
    }

    const fail = (err: Error) => {
      if (done) return
      done = true
      clearTimeout(synthesisTimeout)
      writer.abort(err).catch(() => {})
      try { ws.close() } catch {}
    }

    ws.on('open', () => {
      console.log('[rime-ws] streaming connected')
      ws.send(JSON.stringify({ text }))
      ws.send(JSON.stringify({ operation: 'flush' }))
    })

    let chunkCount = 0

    ws.on('message', (data: WebSocket.Data) => {
      if (done) return
      try {
        const raw = JSON.parse(data.toString())

        // Log every message type for debugging
        const msgType = raw.type || (raw.is_eos ? 'eos' : raw.audio ? 'audio' : 'unknown')
        if (msgType !== 'chunk') {
          console.log('[rime-ws] stream msg:', msgType, JSON.stringify(raw).slice(0, 200))
        }

        if (isArcana) {
          const msg = raw as ArcanaMessage
          if (msg.type === 'error') {
            fail(new Error(`Rime error: ${msg.message}`))
            return
          }
          if (msg.type === 'chunk' && msg.data) {
            chunkCount++
            if (chunkCount === 1) console.log('[rime-ws] first PCM chunk received')
            const buf = Buffer.from(msg.data, 'base64')
            const copy = new Uint8Array(buf.length)
            copy.set(buf)
            writer.write(copy).catch(() => {})
          }
          if (msg.type === 'done' || msg.type === 'timestamps') {
            console.log('[rime-ws] synthesis complete (' + chunkCount + ' chunks)')
            finish()
          }
        } else {
          const msg = raw as MistMessage
          if (msg.error) {
            fail(new Error(`Rime error: ${msg.error}`))
            return
          }
          if (msg.audio) {
            for (const chunk of msg.audio) {
              const buf = Buffer.from(chunk.data, 'base64')
              const copy = new Uint8Array(buf.length)
              copy.set(buf)
              writer.write(copy).catch(() => {})
            }
          }
          if (msg.is_eos) {
            finish()
          }
        }
      } catch (err) {
        fail(err instanceof Error ? err : new Error(String(err)))
      }
    })

    ws.on('close', (code, reason) => {
      console.log('[rime-ws] stream WS closed:', code, reason?.toString(), '(' + chunkCount + ' chunks)')
      finish()
    })

    ws.on('error', (err) => {
      console.error('[rime-ws] streaming error:', err.message)
      fail(err)
    })

    const cancel = () => {
      clearTimeout(synthesisTimeout)
      done = true
      writer.abort().catch(() => {})
      try { ws.close() } catch {}
    }

    return { readable, cancel }
  }

  clear() {
    for (const item of this.queue) {
      item.reject(new Error('Synthesis cancelled'))
    }
    this.queue = []

    if (this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ operation: 'clear' }))
      } catch {
        // ignore
      }
    }
  }

  updateSpeed(speedAlpha: number) {
    this.speedAlpha = speedAlpha
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  disconnect() {
    this.queue = []
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }
}

// Module-level singleton
let instance: RimeWebSocket | null = null

export function getRimeWs(): RimeWebSocket {
  if (!instance) {
    instance = new RimeWebSocket()
  }
  return instance
}
