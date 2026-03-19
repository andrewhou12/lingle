/**
 * Custom Rime TTS plugin with persistent WebSocket connection.
 *
 * Same pattern as cartesia-tts.ts — keeps a single WebSocket alive for the
 * entire agent session, avoiding the connection overhead on every turn.
 *
 * Uses the /ws3 JSON endpoint: wss://users-ws.rime.ai/ws3
 * Docs: https://docs.rime.ai/api-reference/arcana/websockets-json
 */
import { tts, AudioByteStream } from '@livekit/agents'
import type { APIConnectOptions } from '@livekit/agents'
// @ts-ignore - ws types not available in production image
import WebSocket from 'ws'

export interface RimeTTSOptions {
  apiKey?: string
  modelId?: string
  speaker: string
  lang?: string
  samplingRate?: number
  segment?: 'immediate' | 'bySentence' | 'never'
  speedAlpha?: number
}

const DEFAULTS = {
  modelId: 'arcana',
  lang: 'eng',
  samplingRate: 24000,
  segment: 'immediate' as const,
}

/** Shared persistent WebSocket connection for all streams in a session */
let sharedWs: WebSocket | null = null
let sharedWsUrl = ''
let sharedWsReady: Promise<void> | null = null

let requestCounter = 0
function nextContextId(): string {
  return `ctx-${Date.now()}-${++requestCounter}`
}

export class TTS extends tts.TTS {
  readonly label = 'rime-persistent'
  #opts: Required<Pick<RimeTTSOptions, 'modelId' | 'lang' | 'samplingRate' | 'segment'>> & RimeTTSOptions

  constructor(opts: RimeTTSOptions) {
    super(opts.samplingRate || DEFAULTS.samplingRate, 1, { streaming: true })
    this.#opts = { ...DEFAULTS, ...opts }
  }

  synthesize(text: string, connOptions?: APIConnectOptions, abortSignal?: AbortSignal): tts.ChunkedStream {
    throw new Error('Use stream() for Rime persistent TTS')
  }

  stream(options?: { connOptions?: APIConnectOptions }): SynthesizeStream {
    return new SynthesizeStream(this, this.#opts, options?.connOptions)
  }

  get opts() {
    return this.#opts
  }
}

// Message listener registry keyed by contextId
type MessageHandler = (msg: RimeMessage) => void
const messageHandlers = new Map<string, MessageHandler>()
// Also track a "current" handler for messages without contextId
let currentHandler: MessageHandler | null = null

interface RimeMessage {
  type: string        // "chunk" | "timestamps" | "error"
  data?: string       // base64 audio (for "chunk")
  contextId?: string | null
  message?: string    // error message
  word_timestamps?: {
    words: string[]
    start: number[]
    end: number[]
  }
}

function getOrCreateWebSocket(opts: {
  apiKey: string
  modelId: string
  speaker: string
  lang: string
  samplingRate: number
  segment: string
  speedAlpha?: number
}): Promise<WebSocket> {
  const params = new URLSearchParams({
    speaker: opts.speaker,
    modelId: opts.modelId,
    audioFormat: 'pcm',
    lang: opts.lang,
    samplingRate: String(opts.samplingRate),
    segment: opts.segment,
  })
  if (opts.speedAlpha !== undefined) {
    params.set('speedAlpha', String(opts.speedAlpha))
  }

  const url = `wss://users-ws.rime.ai/ws3?${params.toString()}`

  if (sharedWs && sharedWs.readyState === WebSocket.OPEN && sharedWsUrl === url) {
    return Promise.resolve(sharedWs)
  }

  // Close stale connection
  if (sharedWs) {
    try { sharedWs.close() } catch {}
    sharedWs = null
  }

  sharedWsUrl = url
  sharedWsReady = new Promise<void>((resolve, reject) => {
    console.log('[rime-persistent] opening WebSocket...')
    const ws = new WebSocket(url, {
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
      },
    })

    const timeout = setTimeout(() => {
      ws.close()
      reject(new Error('Rime WebSocket handshake timeout (10s)'))
    }, 10000)

    ws.on('open', () => {
      clearTimeout(timeout)
      console.log('[rime-persistent] WebSocket connected')
      sharedWs = ws
      resolve()
    })

    ws.on('message', (data: WebSocket.Data) => {
      try {
        const msg: RimeMessage = JSON.parse(data.toString())
        // Route to handler by contextId, or fall back to current handler
        const handler = (msg.contextId ? messageHandlers.get(msg.contextId) : null) || currentHandler
        if (handler) {
          handler(msg)
        }
      } catch {
        // Parse error — ignore
      }
    })

    ws.on('close', (code: number, reason: Buffer) => {
      console.log(`[rime-persistent] WebSocket closed: ${code} ${reason?.toString()}`)
      sharedWs = null
      sharedWsReady = null
    })

    ws.on('error', (err: Error) => {
      console.error('[rime-persistent] WebSocket error:', err.message)
      clearTimeout(timeout)
      sharedWs = null
      sharedWsReady = null
      reject(err)
    })
  })

  return sharedWsReady.then(() => sharedWs!)
}

class SynthesizeStream extends tts.SynthesizeStream {
  readonly label = 'rime-persistent'
  #opts: TTS['opts']
  #contextId = nextContextId()

  constructor(
    ttsInstance: TTS,
    opts: TTS['opts'],
    connOptions?: APIConnectOptions,
  ) {
    super(ttsInstance, connOptions)
    this.#opts = opts
  }

  protected async run(): Promise<void> {
    const apiKey = this.#opts.apiKey || process.env.RIME_API_KEY || ''
    let ws: WebSocket

    try {
      ws = await getOrCreateWebSocket({
        apiKey,
        modelId: this.#opts.modelId,
        speaker: this.#opts.speaker,
        lang: this.#opts.lang,
        samplingRate: this.#opts.samplingRate,
        segment: this.#opts.segment,
        speedAlpha: this.#opts.speedAlpha,
      })
    } catch (err) {
      console.error('[rime-persistent] failed to connect:', err)
      throw err
    }

    const contextId = this.#contextId
    const bstream = new AudioByteStream(this.#opts.samplingRate, 1)

    let lastFrame: ReturnType<AudioByteStream['flush']>[number] | undefined
    let done = false
    let eosReceived = false

    const sendLastFrame = (final: boolean) => {
      if (lastFrame && !this.queue.closed) {
        this.queue.put({
          requestId: contextId,
          segmentId: contextId,
          frame: lastFrame,
          final,
        })
        lastFrame = undefined
      }
    }

    // Register message handler for this context
    const messagePromises: RimeMessage[] = []
    let messageResolve: (() => void) | null = null

    const handler: MessageHandler = (msg) => {
      messagePromises.push(msg)
      if (messageResolve) {
        messageResolve()
        messageResolve = null
      }
    }

    messageHandlers.set(contextId, handler)
    currentHandler = handler

    // Process incoming messages
    const recvTask = async () => {
      while (!done && !this.closed && !this.abortSignal.aborted) {
        if (messagePromises.length === 0) {
          await new Promise<void>((resolve) => {
            messageResolve = resolve
            if (this.abortSignal.aborted) resolve()
          })
        }

        while (messagePromises.length > 0) {
          const msg = messagePromises.shift()!

          if (msg.type === 'error') {
            console.error('[rime-persistent] error:', msg.message)
            continue
          }

          if (msg.type === 'chunk' && msg.data) {
            const audioBuffer = Buffer.from(msg.data, 'base64')
            const audioData = audioBuffer.buffer.slice(
              audioBuffer.byteOffset,
              audioBuffer.byteOffset + audioBuffer.byteLength,
            )
            for (const frame of bstream.write(audioData)) {
              sendLastFrame(false)
              lastFrame = frame
            }
          } else if (msg.type === 'timestamps') {
            // We don't use word timestamps currently, but could in the future
          }
        }

        // After processing all messages, check if EOS was sent and no more audio is coming
        if (eosReceived && messagePromises.length === 0) {
          // Give a small window for final chunks to arrive
          await new Promise<void>((resolve) => setTimeout(resolve, 100))
          if (messagePromises.length === 0) {
            // Flush remaining audio
            for (const frame of bstream.flush()) {
              sendLastFrame(false)
              lastFrame = frame
            }
            sendLastFrame(true)
            if (!this.queue.closed) {
              this.queue.put(SynthesizeStream.END_OF_STREAM)
            }
            done = true
          }
        }
      }
    }

    // Process text input and send to Rime
    const inputTask = async () => {
      let buffer = ''
      const MIN_WORDS = 2

      const sendText = (text: string) => {
        if (ws.readyState !== WebSocket.OPEN) return
        ws.send(JSON.stringify({ text, contextId }))
      }

      const sendOperation = (op: 'flush' | 'clear' | 'eos') => {
        if (ws.readyState !== WebSocket.OPEN) return
        ws.send(JSON.stringify({ operation: op }))
      }

      for await (const data of this.input) {
        if (this.abortSignal.aborted) break

        if (data === SynthesizeStream.FLUSH_SENTINEL) {
          if (buffer.trim()) {
            sendText(buffer)
            buffer = ''
          }
          sendOperation('flush')
          continue
        }

        buffer += data

        // Send when we have enough words
        const words = buffer.trim().split(/\s+/)
        if (words.length >= MIN_WORDS && /[.!?。！？、,;:\n]/.test(buffer)) {
          sendText(buffer)
          buffer = ''
        } else if (words.length >= 8) {
          sendText(buffer)
          buffer = ''
        }
      }

      // Send remaining buffer
      if (buffer.trim()) {
        sendText(buffer)
      }

      // Signal end of stream — flush remaining audio but don't close the connection
      sendOperation('flush')
      eosReceived = true

      // Wake up the recv task
      if (messageResolve) {
        messageResolve()
        messageResolve = null
      }
    }

    try {
      await Promise.all([inputTask(), recvTask()])
    } finally {
      messageHandlers.delete(contextId)
      if (currentHandler === handler) {
        currentHandler = null
      }
      // Don't close the WebSocket — it's shared across turns
    }
  }
}
