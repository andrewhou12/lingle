/**
 * Custom Rime TTS plugin with persistent WebSocket connection.
 *
 * Same pattern as cartesia-tts.ts — keeps a single WebSocket alive for the
 * entire agent session, avoiding the connection overhead on every turn.
 *
 * Uses the /ws3 JSON endpoint: wss://users-ws.rime.ai/ws3
 * Docs: https://docs.rime.ai/api-reference/arcana/websockets-json
 *
 * Key design: uses segment=never so Rime buffers all text until we explicitly
 * send { operation: "flush" }. We flush at sentence boundaries so each
 * synthesized audio segment has natural prosody.
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
  speedAlpha?: number
}

const DEFAULTS = {
  modelId: 'arcana',
  lang: 'eng',
  samplingRate: 24000,
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
  #opts: Required<Pick<RimeTTSOptions, 'modelId' | 'lang' | 'samplingRate'>> & RimeTTSOptions

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
  type: string        // "chunk" | "timestamps" | "error" | "done"
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
  speedAlpha?: number
}): Promise<WebSocket> {
  const params = new URLSearchParams({
    speaker: opts.speaker,
    modelId: opts.modelId,
    audioFormat: 'pcm',
    lang: opts.lang,
    samplingRate: String(opts.samplingRate),
    // segment=never: Rime buffers all text, only synthesizes on flush
    segment: 'never',
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

/** Sentence-ending punctuation pattern */
const SENTENCE_END = /[.!?。！？]\s*$/

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
    let inputDone = false

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
    const messageQueue: RimeMessage[] = []
    let messageResolve: (() => void) | null = null

    const handler: MessageHandler = (msg) => {
      messageQueue.push(msg)
      if (messageResolve) {
        messageResolve()
        messageResolve = null
      }
    }

    messageHandlers.set(contextId, handler)
    currentHandler = handler

    // ── Receive task ──
    // Rime doesn't send a "done" message after flush — we detect completion
    // by waiting for chunks to stop arriving after all input is flushed.
    const IDLE_TIMEOUT_MS = 300
    const FIRST_CHUNK_TIMEOUT_MS = 3000
    let lastChunkTs = 0
    let receivedAnyChunk = false

    const recvTask = async () => {
      while (!done && !this.closed && !this.abortSignal.aborted) {
        if (messageQueue.length === 0) {
          if (inputDone) {
            // Draining — wait for chunks with timeout
            const timeout = receivedAnyChunk ? IDLE_TIMEOUT_MS : FIRST_CHUNK_TIMEOUT_MS
            const elapsed = Date.now() - lastChunkTs
            const remaining = timeout - elapsed
            if (remaining <= 0) break

            await new Promise<void>((resolve) => {
              const timer = setTimeout(resolve, remaining)
              messageResolve = () => { clearTimeout(timer); resolve() }
              if (this.abortSignal.aborted) { clearTimeout(timer); resolve() }
            })

            if (messageQueue.length === 0) {
              if (Date.now() - lastChunkTs >= timeout) break
              continue
            }
          } else {
            // Still receiving input — block until a message arrives
            await new Promise<void>((resolve) => {
              messageResolve = resolve
              if (this.abortSignal.aborted) resolve()
            })
          }
        }

        while (messageQueue.length > 0) {
          const msg = messageQueue.shift()!

          if (msg.type === 'error') {
            console.error('[rime-persistent] error:', msg.message)
            continue
          }

          if (msg.type === 'chunk' && msg.data) {
            lastChunkTs = Date.now()
            receivedAnyChunk = true
            const audioBuffer = Buffer.from(msg.data, 'base64')
            const audioData = audioBuffer.buffer.slice(
              audioBuffer.byteOffset,
              audioBuffer.byteOffset + audioBuffer.byteLength,
            )
            for (const frame of bstream.write(audioData)) {
              sendLastFrame(false)
              lastFrame = frame
            }
          }
          // timestamps — ignored for now
        }
      }

      // Flush remaining audio in buffer
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

    // ── Input task ──
    // Stream LLM tokens to Rime, flush at sentence boundaries.
    // With segment=never, Rime buffers all text until we flush, so each
    // flushed segment is a complete sentence with natural prosody.
    const inputTask = async () => {
      let buffer = ''

      const sendText = (text: string) => {
        if (ws.readyState !== WebSocket.OPEN) return
        ws.send(JSON.stringify({ text, contextId }))
      }

      const flush = () => {
        if (ws.readyState !== WebSocket.OPEN) return
        ws.send(JSON.stringify({ operation: 'flush' }))
      }

      for await (const data of this.input) {
        if (this.abortSignal.aborted) break

        if (data === SynthesizeStream.FLUSH_SENTINEL) {
          // Framework flush — send buffered text and trigger synthesis
          if (buffer.trim()) {
            sendText(buffer)
            buffer = ''
          }
          flush()
          continue
        }

        // Accumulate LLM token
        buffer += data

        // Send text to Rime's buffer token-by-token (Rime holds it until flush)
        // But we send in chunks to reduce WebSocket message count
        if (buffer.length >= 2) {
          sendText(buffer)
          buffer = ''
        }
      }

      // Send any remaining text
      if (buffer.trim()) {
        sendText(buffer)
      }

      // Final flush to synthesize everything remaining
      flush()
      inputDone = true
      if (!lastChunkTs) lastChunkTs = Date.now()

      // Wake recv task
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
