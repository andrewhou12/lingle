/**
 * Custom Rime TTS plugin with persistent WebSocket connection.
 *
 * Same pattern as cartesia-tts.ts — keeps a single WebSocket alive for the
 * entire agent session, avoiding the connection overhead on every turn.
 *
 * Uses the /ws3 JSON endpoint: wss://users-ws.rime.ai/ws3
 * Docs: https://docs.rime.ai/api-reference/arcana/websockets-json
 *
 * Uses segment=bySentence so Rime auto-detects sentence boundaries and
 * synthesizes each sentence as a prosodically-complete unit. We just stream
 * text tokens in and Rime handles segmentation — no manual flush timing.
 *
 * Completion detection: With segment=bySentence, Rime sends a `type=done`
 * message after all audio for a context is synthesized — same as Cartesia.
 * This is the primary completion signal. Idle timeout (5s) is a fallback.
 *
 * IMPORTANT: We do NOT use the `eos` operation because it closes the shared
 * WebSocket. With preemptive generation, multiple TTS streams share the same
 * connection — eos from one stream would kill the connection for all others.
 * Instead, we use `flush` for the final text and `done` for completion.
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
// Track the most recently created handler for messages without contextId.
// With preemptive generation, multiple streams may exist concurrently —
// only the latest stream should receive untagged messages.
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
  speedAlpha?: number
}): Promise<WebSocket> {
  const params = new URLSearchParams({
    speaker: opts.speaker,
    modelId: opts.modelId,
    audioFormat: 'pcm',
    lang: opts.lang,
    samplingRate: String(opts.samplingRate),
    // segment=bySentence: Rime auto-detects sentence boundaries and synthesizes
    // each sentence as a prosodically-complete unit. This avoids the stuttering
    // caused by segment=never + manual flush, where flush boundaries could split
    // words or phrases (e.g., "What" | "'s your name?"), creating independent
    // audio segments with broken prosody.
    segment: 'bySentence',
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
        // Route to handler by contextId, or fall back to current handler.
        // Note: Rime doesn't reliably maintain concurrent contextIds —
        // it may tag chunks with the most recent contextId regardless of
        // which flush produced them. The currentHandler fallback handles this.
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
    // With segment=bySentence, Rime sends a `type=done` message after all
    // audio for a context is synthesized — same pattern as Cartesia. This is
    // the primary completion signal. Idle timeout is a fallback only.
    const IDLE_TIMEOUT_MS = 5000
    const FIRST_CHUNK_TIMEOUT_MS = 8000
    let lastChunkTs = 0
    let receivedAnyChunk = false

    let chunkCount = 0
    let totalAudioBytes = 0

    // Helper: create a promise that resolves on message, timeout, OR abort signal.
    // This ensures aborted streams exit immediately instead of waiting 5s.
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
        // Resolve immediately if already aborted
        if (this.abortSignal.aborted) { cleanup(); resolve() }
      })
    }

    const recvTask = async () => {
      while (!done && !this.closed && !this.abortSignal.aborted) {
        if (messageQueue.length === 0) {
          if (inputDone) {
            // Draining — wait for chunks with timeout (or abort)
            const timeout = receivedAnyChunk ? IDLE_TIMEOUT_MS : FIRST_CHUNK_TIMEOUT_MS
            const elapsed = Date.now() - lastChunkTs
            const remaining = timeout - elapsed
            if (remaining <= 0) break

            await waitForMessage(remaining)

            if (this.abortSignal.aborted) break
            if (messageQueue.length === 0) {
              if (Date.now() - lastChunkTs >= timeout) break
              continue
            }
          } else {
            // Still receiving input — block until a message arrives (or abort)
            await waitForMessage()
            if (this.abortSignal.aborted) break
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
          } else if (msg.type === 'done') {
            // Rime sends `done` after all audio for a context is synthesized
            // (with segment=bySentence). BUT: Rime tags messages with the most
            // recent contextId, not the one that produced the audio. So a `done`
            // from a previous (preemptive) context can arrive tagged as ours.
            // Only trust `done` when inputDone is true — otherwise it's stale.
            if (!inputDone) {
              console.log(`[rime] recv (${contextId}) ignoring stale done (inputDone=false)`)
              continue
            }
            for (const frame of bstream.flush()) {
              sendLastFrame(false)
              lastFrame = frame
            }
            sendLastFrame(true)
            if (!this.queue.closed) {
              this.queue.put(SynthesizeStream.END_OF_STREAM)
            }
            console.log(`[rime] recvTask done (${contextId}) chunks=${chunkCount} audioBytes=${totalAudioBytes} inputDone=${inputDone} aborted=${this.abortSignal.aborted} reason=done`)
            done = true
            return
          } else if (msg.type !== 'timestamps') {
            console.log(`[rime] recv (${contextId}) type=${msg.type} msg=${msg.message || ''}`)
          }
        }
      }

      // Fallback: flush remaining audio (timeout or abort path)
      for (const frame of bstream.flush()) {
        sendLastFrame(false)
        lastFrame = frame
      }
      sendLastFrame(true)
      if (!this.queue.closed) {
        this.queue.put(SynthesizeStream.END_OF_STREAM)
      }
      console.log(`[rime] recvTask done (${contextId}) chunks=${chunkCount} audioBytes=${totalAudioBytes} inputDone=${inputDone} aborted=${this.abortSignal.aborted} reason=timeout`)
      done = true
    }

    // ── Input task ──
    // With segment=bySentence, Rime auto-detects sentence boundaries in the
    // incoming text stream. Each sentence is synthesized as a prosodically-
    // complete unit — no manual flush timing needed. We just stream tokens in
    // as fast as the LLM produces them. Rime handles the rest.
    //
    // We use `flush` (not `eos`) for the final text because eos is a
    // connection-level operation that closes the shared WebSocket. With
    // preemptive generation, multiple streams share the same connection.

    const inputTask = async () => {
      let totalTextSent = ''

      const sendText = (text: string) => {
        if (ws.readyState !== WebSocket.OPEN) return
        ws.send(JSON.stringify({ text, contextId }))
        totalTextSent += text
      }

      const flush = () => {
        if (ws.readyState !== WebSocket.OPEN) return
        ws.send(JSON.stringify({ operation: 'flush', contextId }))
      }

      const clear = () => {
        if (ws.readyState !== WebSocket.OPEN) return
        console.log(`[rime] clear (${contextId}) — aborted, discarding buffer`)
        ws.send(JSON.stringify({ operation: 'clear', contextId }))
      }

      console.log(`[rime] inputTask started (${contextId})`)

      for await (const data of this.input) {
        if (this.abortSignal.aborted) break

        if (data === SynthesizeStream.FLUSH_SENTINEL) {
          // Framework flush — force Rime to synthesize any buffered text now
          flush()
          continue
        }

        // Stream each token directly to Rime. With bySentence segmentation,
        // Rime accumulates text and auto-synthesizes at sentence boundaries.
        sendText(data)
      }

      // If aborted (e.g. preemptive generation cancelled), clear Rime's buffer
      // and signal recv task to exit immediately — don't drain for 5s.
      if (this.abortSignal.aborted) {
        clear()
        done = true      // Tell recv task to exit its while loop
        inputDone = true
        if (!lastChunkTs) lastChunkTs = Date.now()
        if (messageResolve) {
          messageResolve()
          messageResolve = null
        }
        console.log(`[rime] inputTask aborted (${contextId})`)
        return
      }

      // If nothing was ever sent (tool-only turn), skip and signal done
      if (!totalTextSent) {
        console.log(`[rime] inputTask done (${contextId}) — empty transcript, skipping`)
        inputDone = true
        if (!lastChunkTs) lastChunkTs = Date.now()
        if (messageResolve) {
          messageResolve()
          messageResolve = null
        }
        if (!this.queue.closed) {
          this.queue.put(SynthesizeStream.END_OF_STREAM)
        }
        return
      }

      // Final flush — synthesize any remaining buffered text (partial sentence
      // at the end of the LLM output). Don't use eos — it would close the
      // shared WebSocket and break other streams (preemptive generation).
      flush()
      console.log(`[rime] inputTask done (${contextId}) totalText="${totalTextSent.slice(0, 100)}"`)
      inputDone = true
      if (!lastChunkTs) lastChunkTs = Date.now()

      // Wake recv task to start draining
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
