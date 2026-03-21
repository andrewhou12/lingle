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
  /**
   * Cartesia server-side buffer delay in ms for Latin languages.
   * CJK languages use client-side buffering by default (see cjkMode).
   *
   * - 0: Client-side buffering only (original behavior)
   * - 150: Per-token streaming with server-side accumulation (recommended for Latin)
   */
  bufferDelayMs?: number
  /**
   * CJK audio quality mode. Controls the latency/quality tradeoff for
   * Japanese, Korean, and Chinese where LLM tokens are small (1-2 chars)
   * and arrive slowly (300ms+ apart).
   *
   * - 'natural' (default): Client-side buffering at punctuation/6 chars.
   *   Smooth audio, no splits. ~200-280ms client buffer overhead.
   *
   * - 'fast': Per-token streaming with max_buffer_delay_ms=300.
   *   ~200ms faster TTFB. Cartesia accumulates 300ms of tokens before
   *   synthesizing. Usually captures 1-2 tokens for decent prosody,
   *   but occasionally splits on slow tokens ("so"..."u" instead of "sou").
   */
  cjkMode?: 'natural' | 'fast'
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

  get #isCJK(): boolean {
    return ['ja', 'ko', 'zh'].includes(this.#opts.language || 'en')
  }

  #buildPacket() {
    const isCJK = this.#isCJK
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
      // CJK natural: client-side buffering, server synthesizes immediately (0).
      // CJK fast: per-token, server accumulates 300ms of tokens.
      // Latin: per-token, server accumulates bufferDelayMs of tokens.
      max_buffer_delay_ms: isCJK
        ? (this.#opts.cjkMode === 'fast' ? 300 : 0)
        : (this.#opts.bufferDelayMs ?? 0),
    }

    if (this.#opts.speed !== undefined) {
      packet.generation_config = { speed: this.#opts.speed }
    }

    return packet
  }

  protected async run(): Promise<void> {
    const apiKey = this.#opts.apiKey || process.env.CARTESIA_API_KEY || ''
    let ws: WebSocket

    // ── Latency instrumentation ──
    const streamStartTs = Date.now()
    let firstTokenTs = 0        // first LLM token received by TTS
    let firstSendTs = 0         // first text chunk sent to Cartesia WS
    let firstAudioTs = 0        // first audio chunk received from Cartesia
    let firstFrameQueuedTs = 0  // first audio frame put into output queue
    let chunksSent = 0
    let chunksReceived = 0
    let totalAudioBytes = 0
    let totalTextSent = ''
    let doneTs = 0

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
        if (!firstFrameQueuedTs) {
          firstFrameQueuedTs = Date.now()
        }
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
            if (!firstAudioTs) {
              firstAudioTs = Date.now()
              console.log(`[cartesia-latency] (${contextId}) first audio chunk: +${firstAudioTs - streamStartTs}ms from stream start, +${firstSendTs ? firstAudioTs - firstSendTs : '?'}ms from first send`)
            }
            chunksReceived++
            const audioBuffer = Buffer.from(msg.data, 'base64')
            totalAudioBytes += audioBuffer.length
            const audioData = audioBuffer.buffer.slice(
              audioBuffer.byteOffset,
              audioBuffer.byteOffset + audioBuffer.byteLength,
            )
            for (const frame of bstream.write(audioData)) {
              sendLastFrame(false)
              lastFrame = frame
            }
          } else if (msg.type === 'done') {
            doneTs = Date.now()
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

    // Process text input and send to Cartesia.
    //
    // Language-aware buffering:
    //
    // CJK (ja, ko, zh): Client-side buffering ONLY. Haiku outputs Japanese
    //   at ~1-3 tok/s with 1-2 char tokens. Per-token streaming causes choppy
    //   audio ("so"..."u" instead of "sou") because neither the 80ms timer nor
    //   max_buffer_delay_ms=150 can accumulate multiple tokens — they arrive
    //   300ms+ apart. Client-side buffering at punctuation/char-count boundaries
    //   gives Cartesia enough context for natural prosody.
    //
    // Latin (en, es, fr, etc.): Hybrid mode. Buffered first chunk (2+ words)
    //   for prosody context, then per-token with server-side buffering
    //   (max_buffer_delay_ms). LLM outputs Latin at 10-40 tok/s with 1-2 word
    //   tokens, so the server buffer captures multiple tokens before synthesizing.
    //
    const isCJK = this.#isCJK
    const cjkFastMode = isCJK && this.#opts.cjkMode === 'fast'
    // Per-token after first chunk: Latin always (if bufferDelayMs>0), or CJK in fast mode
    const usePerTokenAfterFirst = cjkFastMode || (!isCJK && (this.#opts.bufferDelayMs ?? 0) > 0)

    const inputTask = async () => {
      let sentAnything = false
      let firstChunkSent = false
      let buffer = ''

      const sendChunk = (text: string, isContinue: boolean) => {
        if (ws.readyState !== WebSocket.OPEN) return
        if (!firstSendTs) {
          firstSendTs = Date.now()
          const mode = cjkFastMode ? 'cjk-fast' : isCJK ? 'cjk-natural' : (usePerTokenAfterFirst ? 'latin-hybrid' : 'latin-buffered')
          console.log(`[cartesia-latency] (${contextId}) first chunk sent: +${firstSendTs - streamStartTs}ms from stream start, mode=${mode}, text="${text.slice(0, 60).trim()}"`)
        }
        chunksSent++
        totalTextSent += text
        const msg = {
          ...packet,
          context_id: contextId,
          transcript: text,
          continue: isContinue,
        }
        ws.send(JSON.stringify(msg))
        sentAnything = true
      }

      // Time-based first-send for Latin and CJK fast mode.
      // CJK natural mode doesn't use the timer — waits for 6 chars/punctuation.
      let firstSendTimer: ReturnType<typeof setTimeout> | null = null
      const useTimer = !isCJK || cjkFastMode

      const startFirstSendTimer = () => {
        if (!useTimer || firstChunkSent || firstSendTimer) return
        firstSendTimer = setTimeout(() => {
          firstSendTimer = null
          if (!firstChunkSent && buffer.trim()) {
            sendChunk(buffer + ' ', true)
            buffer = ''
            firstChunkSent = true
          }
        }, 80)
      }

      for await (const data of this.input) {
        if (this.abortSignal.aborted) break

        if (!firstTokenTs) firstTokenTs = Date.now()

        if (data === SynthesizeStream.FLUSH_SENTINEL) {
          if (buffer.trim()) {
            sendChunk(buffer + ' ', true)
            buffer = ''
            firstChunkSent = true
          }
          if (firstSendTimer) { clearTimeout(firstSendTimer); firstSendTimer = null }
          continue
        }

        buffer += data

        const hasPunctuation = /[.!?。！？、,;:—\n]/.test(buffer)
        const charCount = buffer.trim().length

        if (!firstChunkSent) {
          // ── FIRST CHUNK ──
          if (useTimer) startFirstSendTimer()

          if (isCJK && !cjkFastMode) {
            // CJK natural: punctuation or 6+ chars (no timer)
            if (hasPunctuation && charCount >= 2) {
              sendChunk(buffer + ' ', true)
              buffer = ''
              firstChunkSent = true
            } else if (charCount >= 6) {
              sendChunk(buffer + ' ', true)
              buffer = ''
              firstChunkSent = true
            }
          } else {
            // Latin first chunk: punctuation, 2 words, or 80ms timer
            const words = buffer.trim().split(/\s+/)
            if (hasPunctuation && charCount >= 1) {
              if (firstSendTimer) { clearTimeout(firstSendTimer); firstSendTimer = null }
              sendChunk(buffer + ' ', true)
              buffer = ''
              firstChunkSent = true
            } else if (words.length >= 2 && /\s$/.test(buffer)) {
              if (firstSendTimer) { clearTimeout(firstSendTimer); firstSendTimer = null }
              sendChunk(buffer + ' ', true)
              buffer = ''
              firstChunkSent = true
            }
          }
        } else if (usePerTokenAfterFirst) {
          // ── SUBSEQUENT (Latin per-token) ──
          // Send accumulated buffer + new token directly. Cartesia's
          // server-side max_buffer_delay_ms handles prosody timing.
          sendChunk(buffer, true)
          buffer = ''
        } else {
          // ── SUBSEQUENT (client-side buffered — CJK or bufferDelayMs=0) ──
          if (hasPunctuation) {
            sendChunk(buffer + ' ', true)
            buffer = ''
          } else if (charCount >= 12) {
            sendChunk(buffer + ' ', true)
            buffer = ''
          } else if (!isCJK && buffer.trim().split(/\s+/).length >= 4) {
            sendChunk(buffer + ' ', true)
            buffer = ''
          }
        }
      }

      if (firstSendTimer) { clearTimeout(firstSendTimer); firstSendTimer = null }

      // Send remaining buffer
      if (buffer.trim()) {
        sendChunk(buffer + ' ', true)
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
        console.log(`[cartesia-latency] (${contextId}) ABORTED +${Date.now() - streamStartTs}ms`)
        return
      }

      // Send end-of-input — but only if we actually sent text.
      // Cartesia rejects empty/whitespace-only transcripts.
      if (sentAnything) {
        // Close the context with continue: false. This tells Cartesia to
        // synthesize any remaining buffered text and send a "done" message.
        // The recvTask will handle the "done" message and signal completion.
        // No sleep needed — Cartesia processes the close signal and returns
        // all remaining audio before sending "done".
        sendChunk(' ', false)
        console.log(`[cartesia-latency] (${contextId}) context closed (no flush delay)`)
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

      // ── Print latency summary ──
      const endTs = Date.now()
      const ttfb = firstAudioTs && firstSendTs ? firstAudioTs - firstSendTs : 0
      const tokenToSend = firstSendTs && firstTokenTs ? firstSendTs - firstTokenTs : 0
      const totalDuration = endTs - streamStartTs
      const audioMs = totalAudioBytes / (this.#opts.sampleRate * 2) * 1000  // 16-bit PCM
      console.log(`[cartesia-latency] (${contextId}) ──── SUMMARY ────`)
      console.log(`[cartesia-latency]   stream duration:    ${totalDuration}ms`)
      console.log(`[cartesia-latency]   first token → send: ${tokenToSend}ms  (client buffering)`)
      console.log(`[cartesia-latency]   send → first audio: ${ttfb}ms  (Cartesia TTFB)`)
      console.log(`[cartesia-latency]   first audio → queue:${firstFrameQueuedTs && firstAudioTs ? firstFrameQueuedTs - firstAudioTs : 0}ms  (frame processing)`)
      console.log(`[cartesia-latency]   chunks sent/recv:   ${chunksSent}/${chunksReceived}`)
      console.log(`[cartesia-latency]   audio: ${(audioMs / 1000).toFixed(1)}s (${totalAudioBytes} bytes)`)
      console.log(`[cartesia-latency]   text: "${totalTextSent.slice(0, 80).trim()}"`)
      if (this.abortSignal.aborted) {
        console.log(`[cartesia-latency]   ⚠ ABORTED (preemptive gen cancelled)`)
      }
      console.log(`[cartesia-latency] ──── END ────`)
    }
  }
}
