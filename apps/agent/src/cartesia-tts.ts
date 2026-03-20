/**
 * Custom Cartesia TTS plugin with persistent WebSocket connection.
 *
 * The stock LiveKit Cartesia plugin opens a new WebSocket for every
 * SynthesizeStream (i.e. every turn). The handshake + TLS adds ~150-200ms
 * TTFB overhead per turn.
 *
 * This plugin keeps a single WebSocket alive for the entire agent session
 * and multiplexes synthesis requests via unique context_id values, saving
 * the connection overhead on every turn after the first.
 *
 * TODO: Per-token streaming to Cartesia (like rime-tts.ts does) would
 * eliminate ~200-600ms of client-side buffering latency. Attempted in
 * v3-latency-optimization but reverted — sending individual LLM tokens
 * with max_buffer_delay_ms: 0 caused choppy audio (clips between words).
 * Cartesia needs enough text context for natural prosody, unlike Rime
 * which handles this server-side with segment=bySentence.
 * To fix: either use max_buffer_delay_ms ~100ms with per-token streaming,
 * or use a lightweight time-based client buffer (~50-100ms) instead of
 * the current word/char-count thresholds.
 */
import { tts, AudioByteStream } from '@livekit/agents'
import type { APIConnectOptions } from '@livekit/agents'
// @ts-ignore - ws types not available in production image
import WebSocket from 'ws'

export interface CartesiaTTSOptions {
  apiKey?: string
  model?: string
  voice: string
  language?: string
  speed?: number
  sampleRate?: number
  baseUrl?: string
  apiVersion?: string
  wordTimestamps?: boolean
}

const DEFAULTS = {
  model: 'sonic-3',
  language: 'en',
  sampleRate: 24000,
  baseUrl: 'https://api.cartesia.ai',
  apiVersion: '2025-04-16',
  wordTimestamps: false,
}

/** Shared persistent WebSocket connection for all streams in a session */
let sharedWs: WebSocket | null = null
let sharedWsUrl = ''
let sharedWsReady: Promise<void> | null = null

let requestCounter = 0
function nextRequestId(): string {
  return `ctx-${Date.now()}-${++requestCounter}`
}

export class TTS extends tts.TTS {
  readonly label = 'cartesia-persistent'
  #opts: Required<Pick<CartesiaTTSOptions, 'model' | 'language' | 'sampleRate' | 'baseUrl' | 'apiVersion' | 'wordTimestamps'>> & CartesiaTTSOptions

  constructor(opts: CartesiaTTSOptions) {
    super(opts.sampleRate || DEFAULTS.sampleRate, 1, { streaming: true })
    this.#opts = { ...DEFAULTS, ...opts }
  }

  synthesize(text: string, connOptions?: APIConnectOptions, abortSignal?: AbortSignal): tts.ChunkedStream {
    // Use streaming mode for everything — one-shot not implemented
    throw new Error('Use stream() for Cartesia persistent TTS')
  }

  stream(options?: { connOptions?: APIConnectOptions }): SynthesizeStream {
    return new SynthesizeStream(this, this.#opts, options?.connOptions)
  }

  get opts() {
    return this.#opts
  }
}

// Message listener registry keyed by context_id
type MessageHandler = (msg: CartesiaMessage) => void
const messageHandlers = new Map<string, MessageHandler>()

interface CartesiaMessage {
  type: string
  data?: string        // base64 audio (for "chunk")
  done?: boolean
  status_code?: number
  step_time?: number
  context_id?: string
  error?: string
  word_timestamps?: {
    words: string[]
    start: number[]
    end: number[]
  }
}

function getOrCreateWebSocket(opts: {
  apiKey: string
  baseUrl: string
  apiVersion: string
}): Promise<WebSocket> {
  const wsUrl = opts.baseUrl.replace(/^http/, 'ws')
  const url = `${wsUrl}/tts/websocket?api_key=${opts.apiKey}&cartesia_version=${opts.apiVersion}`

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
    console.log('[cartesia-persistent] opening WebSocket...')
    const ws = new WebSocket(url)

    const timeout = setTimeout(() => {
      ws.close()
      reject(new Error('Cartesia WebSocket handshake timeout (10s)'))
    }, 10000)

    ws.on('open', () => {
      clearTimeout(timeout)
      console.log('[cartesia-persistent] WebSocket connected')
      sharedWs = ws
      resolve()
    })

    ws.on('message', (data: WebSocket.Data) => {
      try {
        const msg: CartesiaMessage = JSON.parse(data.toString())
        const handler = msg.context_id ? messageHandlers.get(msg.context_id) : null
        if (handler) {
          handler(msg)
        }
      } catch {
        // Parse error — ignore
      }
    })

    ws.on('close', (code: number, reason: Buffer) => {
      console.log(`[cartesia-persistent] WebSocket closed: ${code} ${reason?.toString()}`)
      sharedWs = null
      sharedWsReady = null
    })

    ws.on('error', (err: Error) => {
      console.error('[cartesia-persistent] WebSocket error:', err.message)
      clearTimeout(timeout)
      sharedWs = null
      sharedWsReady = null
      reject(err)
    })
  })

  return sharedWsReady.then(() => sharedWs!)
}

class SynthesizeStream extends tts.SynthesizeStream {
  readonly label = 'cartesia-persistent'
  #opts: TTS['opts']
  #segmentBuffer = ''  // Buffer text until we have enough for a sentence
  #contextId = nextRequestId()

  constructor(
    ttsInstance: TTS,
    opts: TTS['opts'],
    connOptions?: APIConnectOptions,
  ) {
    super(ttsInstance, connOptions)
    this.#opts = opts
  }

  #buildPacket() {
    const packet: Record<string, unknown> = {
      model_id: this.#opts.model,
      voice: { mode: 'id', id: this.#opts.voice },
      output_format: {
        container: 'raw',
        encoding: 'pcm_s16le',
        sample_rate: this.#opts.sampleRate,
      },
      language: this.#opts.language,
      add_timestamps: this.#opts.wordTimestamps,
      max_buffer_delay_ms: 0,
    }

    if (this.#opts.speed !== undefined) {
      packet.generation_config = { speed: this.#opts.speed }
    }

    return packet
  }

  protected async run(): Promise<void> {
    const apiKey = this.#opts.apiKey || process.env.CARTESIA_API_KEY || ''
    let ws: WebSocket

    try {
      ws = await getOrCreateWebSocket({
        apiKey,
        baseUrl: this.#opts.baseUrl,
        apiVersion: this.#opts.apiVersion,
      })
    } catch (err) {
      console.error('[cartesia-persistent] failed to connect:', err)
      throw err
    }

    const contextId = this.#contextId
    const bstream = new AudioByteStream(this.#opts.sampleRate, 1)
    const packet = this.#buildPacket()

    let lastFrame: ReturnType<AudioByteStream['flush']>[number] | undefined
    let done = false

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
    const messagePromises: CartesiaMessage[] = []
    let messageResolve: (() => void) | null = null

    const handler: MessageHandler = (msg) => {
      messagePromises.push(msg)
      if (messageResolve) {
        messageResolve()
        messageResolve = null
      }
    }

    messageHandlers.set(contextId, handler)

    // Process incoming messages in a background task
    const recvTask = async () => {
      while (!done && !this.closed && !this.abortSignal.aborted) {
        // Wait for messages
        if (messagePromises.length === 0) {
          await new Promise<void>((resolve) => {
            messageResolve = resolve
            // Also resolve on abort
            if (this.abortSignal.aborted) resolve()
          })
        }

        while (messagePromises.length > 0) {
          const msg = messagePromises.shift()!

          if (msg.error) {
            console.error('[cartesia-persistent] error:', msg.error)
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
          } else if (msg.type === 'done') {
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

    // Process text input and send to Cartesia
    const inputTask = async () => {
      let buffer = ''
      let sentAnything = false
      const MIN_WORDS = 1  // Send at first punctuation after any word

      const sendChunk = (text: string, isContinue: boolean) => {
        if (ws.readyState !== WebSocket.OPEN) return
        const msg = {
          ...packet,
          context_id: contextId,
          transcript: text,
          continue: isContinue,
        }
        ws.send(JSON.stringify(msg))
        sentAnything = true
      }

      for await (const data of this.input) {
        if (this.abortSignal.aborted) break

        if (data === SynthesizeStream.FLUSH_SENTINEL) {
          // Flush buffered text
          if (buffer.trim()) {
            sendChunk(buffer + ' ', true)
            buffer = ''
          }
          continue
        }

        buffer += data

        // Send when we have enough text for Cartesia to start synthesizing.
        // Japanese/CJK has no spaces, so word-count doesn't work — use char count.
        const words = buffer.trim().split(/\s+/)
        const hasPunctuation = /[.!?。！？、,;:—\n]/.test(buffer)
        const charCount = buffer.trim().length

        if (words.length >= MIN_WORDS && hasPunctuation) {
          sendChunk(buffer + ' ', true)
          buffer = ''
        } else if (charCount >= 6 && hasPunctuation) {
          // CJK: send at punctuation after ~6 chars (~2-3 Japanese words)
          sendChunk(buffer + ' ', true)
          buffer = ''
        } else if (charCount >= 12) {
          // CJK: force send after ~12 chars even without punctuation
          sendChunk(buffer + ' ', true)
          buffer = ''
        } else if (words.length >= 4) {
          // Latin: force send after 4 words even without punctuation
          sendChunk(buffer + ' ', true)
          buffer = ''
        }
      }

      // If aborted (preemptive generation cancelled), close the Cartesia context
      // immediately so it stops synthesizing. Without this, cancelled preemptive
      // contexts pile up on the shared WebSocket and delay real synthesis requests.
      if (this.abortSignal.aborted) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            ...packet,
            context_id: contextId,
            transcript: ' ',
            continue: false,
          }))
        }
        done = true
        if (!this.queue.closed) {
          this.queue.put(SynthesizeStream.END_OF_STREAM)
        }
        return
      }

      // Send remaining buffer
      if (buffer.trim()) {
        sendChunk(buffer + ' ', true)
      }

      // Send end-of-input — but only if we actually sent text.
      // Cartesia rejects empty/whitespace-only transcripts.
      if (sentAnything) {
        // Flush to force immediate synthesis of any buffered text
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            ...packet,
            context_id: contextId,
            transcript: '',
            continue: true,
            flush: true,
          }))
        }
        // Close the context
        sendChunk(' ', false)
      } else {
        // Nothing to synthesize (tool-only turn) — signal done immediately
        done = true
        if (!this.queue.closed) {
          this.queue.put(SynthesizeStream.END_OF_STREAM)
        }
      }
    }

    try {
      await Promise.all([inputTask(), recvTask()])
    } finally {
      messageHandlers.delete(contextId)
      // Don't close the WebSocket — it's shared across turns
    }
  }
}
