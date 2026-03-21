/**
 * Custom Rime TTS plugin with persistent WebSocket connection.
 *
 * Keeps a single WebSocket alive for the entire agent session, avoiding
 * the ~150-200ms connection overhead on every turn.
 *
 * Uses the /ws3 JSON endpoint: wss://users-ws.rime.ai/ws3
 * Docs: https://docs.rime.ai/api-reference/arcana/websockets-json
 *       https://docs.rime.ai/docs/websockets-segment
 *
 * Protocol notes (from official Rime docs):
 * - segment=never is RECOMMENDED for voice agents / LLM streaming.
 *   Rime never synthesizes automatically — only on explicit `flush`.
 *   Each flush synthesizes the entire accumulated buffer as one utterance.
 * - There is NO "done" message. Server sends only: chunk, timestamps, error.
 * - Rime does NOT maintain multiple simultaneous context IDs.
 *   All chunks are tagged with the most recent contextId.
 * - `clear` discards the buffer AND stops queued synthesis.
 * - `eos` synthesizes remaining buffer then CLOSES the connection.
 *
 * Completion detection: idle timeout after all input is flushed.
 * With sentence-level flushing, there's typically only 1-3 flushes per
 * turn, and gaps between them are short. 5s timeout is very conservative.
 *
 * Preemptive generation: INCOMPATIBLE with Rime's shared WebSocket.
 * Must be disabled in AgentSession voiceOptions for Rime.
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
  /** Skip text normalization for lower latency (may affect pronunciation of numbers/abbreviations) */
  reduceLatency?: boolean
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

// Message listener: only the active stream receives messages.
// Rime doesn't support concurrent contexts, so only one handler at a time.
type MessageHandler = (msg: RimeMessage) => void
let activeHandler: MessageHandler | null = null

interface RimeMessage {
  type: string        // "chunk" | "timestamps" | "error" (no "done" per Rime docs)
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
  reduceLatency?: boolean
}): Promise<WebSocket> {
  const params = new URLSearchParams({
    speaker: opts.speaker,
    modelId: opts.modelId,
    audioFormat: 'pcm',
    lang: opts.lang,
    samplingRate: String(opts.samplingRate),
    // segment=never: Rime's recommended mode for voice agents.
    // Never synthesizes automatically — only on explicit flush.
    // Each flush synthesizes the entire buffer as one prosodic utterance.
    segment: 'never',
  })
  if (opts.speedAlpha !== undefined) {
    params.set('speedAlpha', String(opts.speedAlpha))
  }
  if (opts.reduceLatency) {
    params.set('noTextNormalization', 'true')
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
        // Route all messages to the single active handler.
        // Rime doesn't support concurrent contexts — only one stream at a time.
        if (activeHandler) {
          activeHandler(msg)
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

    // ── Latency instrumentation ──
    const streamStartTs = Date.now()
    let firstTokenTs = 0        // first LLM token received by TTS
    let firstSendTs = 0         // first text sent to Rime WS
    let firstFlushTs = 0        // first flush operation sent
    let firstAudioTs = 0        // first audio chunk received from Rime
    let firstFrameQueuedTs = 0  // first audio frame put into output queue
    let totalTextSent = ''

    try {
      ws = await getOrCreateWebSocket({
        apiKey,
        modelId: this.#opts.modelId,
        speaker: this.#opts.speaker,
        lang: this.#opts.lang,
        samplingRate: this.#opts.samplingRate,
        speedAlpha: this.#opts.speedAlpha,
        reduceLatency: this.#opts.reduceLatency,
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

    // Register as the active handler. Clear any stale synthesis from
    // a previous stream before we start.
    const messageQueue: RimeMessage[] = []
    let messageResolve: (() => void) | null = null

    const handler: MessageHandler = (msg) => {
      messageQueue.push(msg)
      if (messageResolve) {
        messageResolve()
        messageResolve = null
      }
    }

    // Take over the shared connection: clear old state, become active handler
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ operation: 'clear' }))
    }
    activeHandler = handler

    // Helper: wait for message, timeout, OR abort signal
    const waitForMessage = (timeoutMs?: number): Promise<void> => {
      return new Promise<void>((resolve) => {
        let timer: ReturnType<typeof setTimeout> | null = null
        const cleanup = () => {
          if (timer) clearTimeout(timer)
          this.abortSignal.removeEventListener('abort', onAbort)
        }
        const onAbort = () => { cleanup(); resolve() }
        const onTimeout = () => { cleanup(); resolve() }
        const onMessage = () => { cleanup(); resolve() }

        messageResolve = onMessage
        this.abortSignal.addEventListener('abort', onAbort, { once: true })
        if (timeoutMs !== undefined) {
          timer = setTimeout(onTimeout, timeoutMs)
        }
        if (this.abortSignal.aborted) { cleanup(); resolve() }
      })
    }

    // ── Receive task ──
    // No "done" message in Rime's protocol (confirmed by docs).
    // Completion detected via idle timeout after all input is flushed.
    //
    // IMPORTANT: The idle timer must reset when inputDone is set, not just on
    // each audio chunk. Otherwise, if the LLM streams slowly (e.g., 5s for a
    // full response), the gap between the last chunk from flush N and inputDone
    // can exceed the idle timeout, causing the recvTask to exit before Rime
    // synthesizes the text from the final flush. This was the cause of audio
    // cutoff — the recvTask would see "3.9s since last chunk > 2s timeout"
    // and exit immediately when inputDone was set, even though Rime still had
    // queued flushes to synthesize.
    const IDLE_TIMEOUT_MS = 3000       // timeout after inputDone + last chunk
    const FIRST_CHUNK_TIMEOUT_MS = 8000
    let lastChunkTs = 0
    let inputDoneTs = 0                // when inputDone was set — for fresh timeout
    let receivedAnyChunk = false
    let chunkCount = 0
    let totalAudioBytes = 0

    const recvTask = async () => {
      while (!done && !this.closed && !this.abortSignal.aborted) {
        if (messageQueue.length === 0) {
          if (inputDone) {
            // Use the LATER of lastChunkTs and inputDoneTs as the baseline
            // for the idle timeout. This ensures we give Rime a full timeout
            // window to synthesize queued flushes after all input is sent.
            const baseline = Math.max(lastChunkTs, inputDoneTs)
            const timeout = receivedAnyChunk ? IDLE_TIMEOUT_MS : FIRST_CHUNK_TIMEOUT_MS
            const elapsed = Date.now() - baseline
            const remaining = timeout - elapsed
            if (remaining <= 0) break

            await waitForMessage(remaining)
            if (done || this.abortSignal.aborted) break
            if (messageQueue.length === 0) {
              if (Date.now() - Math.max(lastChunkTs, inputDoneTs) >= timeout) break
              continue
            }
          } else {
            await waitForMessage()
            if (done || this.abortSignal.aborted) break
          }
        }

        while (messageQueue.length > 0) {
          const msg = messageQueue.shift()!

          if (msg.type === 'error') {
            console.error('[rime-persistent] error:', msg.message)
            continue
          }

          if (msg.type === 'chunk' && msg.data) {
            if (!firstAudioTs) {
              firstAudioTs = Date.now()
              console.log(`[rime-latency] (${contextId}) first audio chunk: +${firstAudioTs - streamStartTs}ms from stream start, +${firstFlushTs ? firstAudioTs - firstFlushTs : '?'}ms from first flush`)
            }
            lastChunkTs = Date.now()
            receivedAnyChunk = true
            chunkCount++
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
          }
          // Ignore timestamps and any other message types
        }
      }

      // Flush remaining audio
      for (const frame of bstream.flush()) {
        sendLastFrame(false)
        lastFrame = frame
      }
      sendLastFrame(true)
      if (!this.queue.closed) {
        this.queue.put(SynthesizeStream.END_OF_STREAM)
      }
      const idleWaitMs = lastChunkTs ? Date.now() - lastChunkTs : 0
      const sinceInputDone = inputDoneTs ? Date.now() - inputDoneTs : 0
      console.log(`[rime-latency] (${contextId}) recvTask done: chunks=${chunkCount} audioBytes=${totalAudioBytes} idleWait=${idleWaitMs}ms sinceInputDone=${sinceInputDone}ms aborted=${this.abortSignal.aborted}`)
      done = true
    }

    // ── Input task ──
    // segment=never: Rime buffers all text, only synthesizes on flush.
    //
    // CRITICAL: Only ONE flush per turn — at the END of input.
    // Testing proved that Rime drops ANY queued flush while synthesis is in
    // progress, even with just 2 flushes (first + final). The first flush's
    // audio plays, but the final flush's text is silently lost.
    //
    // Strategy: send all tokens to Rime immediately (they buffer without
    // synthesizing), then flush ONCE at end of input. This synthesizes the
    // entire response as one prosodic utterance — no cutoff, good prosody.
    //
    // Tradeoff: TTFB is higher since we wait for all LLM tokens before
    // flushing. For typical 1-3 sentence responses (~500-800ms of LLM
    // streaming), the added TTFB is small. For longer responses, consider
    // switching to Cartesia which handles streaming natively.

    const inputTask = async () => {
      let flushCount = 0

      const sendText = (text: string) => {
        if (ws.readyState !== WebSocket.OPEN) return
        if (!firstSendTs) {
          firstSendTs = Date.now()
        }
        ws.send(JSON.stringify({ text, contextId }))
        totalTextSent += text
      }

      const flush = () => {
        if (ws.readyState !== WebSocket.OPEN) return
        if (!firstFlushTs) {
          firstFlushTs = Date.now()
          console.log(`[rime-latency] (${contextId}) flush: +${firstFlushTs - streamStartTs}ms from stream start, text="${totalTextSent.slice(0, 60).trim()}"`)
        }
        flushCount++
        ws.send(JSON.stringify({ operation: 'flush', contextId }))
      }

      const clear = () => {
        if (ws.readyState !== WebSocket.OPEN) return
        ws.send(JSON.stringify({ operation: 'clear' }))
      }

      for await (const data of this.input) {
        if (this.abortSignal.aborted) break

        if (!firstTokenTs) {
          firstTokenTs = Date.now()
        }

        if (data === SynthesizeStream.FLUSH_SENTINEL) {
          // Framework flush — ignore mid-stream. We only flush at end of input.
          continue
        }

        // Send every token to Rime immediately — with segment=never, Rime
        // buffers them without synthesizing. This gives Rime a head start on
        // text processing. We trigger synthesis via a single flush at end.
        sendText(data)
      }

      // Abort: clear Rime's buffer + stop queued synthesis, exit immediately
      if (this.abortSignal.aborted) {
        clear()
        done = true
        inputDone = true
        inputDoneTs = Date.now()
        if (!lastChunkTs) lastChunkTs = Date.now()
        if (messageResolve) { messageResolve(); messageResolve = null }
        console.log(`[rime-latency] (${contextId}) ABORTED +${Date.now() - streamStartTs}ms flushes=${flushCount}`)
        return
      }

      // Empty turn (tool-only) — signal done immediately
      if (!totalTextSent) {
        console.log(`[rime-latency] (${contextId}) empty turn, skipping`)
        done = true
        inputDone = true
        inputDoneTs = Date.now()
        if (!lastChunkTs) lastChunkTs = Date.now()
        if (messageResolve) { messageResolve(); messageResolve = null }
        if (!this.queue.closed) {
          this.queue.put(SynthesizeStream.END_OF_STREAM)
        }
        return
      }

      // Final flush for any remaining text (partial sentence at end of LLM output)
      flush()
      console.log(`[rime-latency] (${contextId}) input done: flushes=${flushCount} text="${totalTextSent.slice(0, 100)}"`)
      inputDone = true
      inputDoneTs = Date.now()
      if (!lastChunkTs) lastChunkTs = Date.now()
      if (messageResolve) { messageResolve(); messageResolve = null }
    }

    try {
      await Promise.all([inputTask(), recvTask()])
    } finally {
      if (activeHandler === handler) {
        activeHandler = null
      }
      // Don't close the WebSocket — it's shared across turns

      // ── Print latency summary ──
      const endTs = Date.now()
      const ttfb = firstAudioTs && firstFlushTs ? firstAudioTs - firstFlushTs : 0
      const tokenToFlush = firstFlushTs && firstTokenTs ? firstFlushTs - firstTokenTs : 0
      const totalDuration = endTs - streamStartTs
      const audioMs = totalAudioBytes / (this.#opts.samplingRate * 2) * 1000  // 16-bit PCM
      console.log(`[rime-latency] (${contextId}) ──── SUMMARY ────`)
      console.log(`[rime-latency]   stream duration:     ${totalDuration}ms`)
      console.log(`[rime-latency]   first token → flush: ${tokenToFlush}ms  (client buffering)`)
      console.log(`[rime-latency]   flush → first audio: ${ttfb}ms  (Rime TTFB)`)
      console.log(`[rime-latency]   first audio → queue: ${firstFrameQueuedTs && firstAudioTs ? firstFrameQueuedTs - firstAudioTs : 0}ms  (frame processing)`)
      console.log(`[rime-latency]   chunks: ${chunkCount}, audio: ${(audioMs / 1000).toFixed(1)}s (${totalAudioBytes} bytes)`)
      console.log(`[rime-latency]   text: "${totalTextSent.slice(0, 80).trim()}"`)
      if (this.abortSignal.aborted) {
        console.log(`[rime-latency]   ⚠ ABORTED (preemptive gen cancelled)`)
      }
      console.log(`[rime-latency] ──── END ────`)
    }
  }
}
