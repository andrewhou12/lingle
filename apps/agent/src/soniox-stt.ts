/**
 * Custom Soniox STT plugin for LiveKit Agents.
 *
 * Wraps the @soniox/node SDK's realtime WebSocket API to implement
 * LiveKit's stt.STT / stt.SpeechStream interface.
 *
 * The v1.0.x framework feeds audio through the base class pumpInput() →
 * this.input pipeline. The run() method reads from this.input and sends
 * audio to the Soniox WebSocket. We keep run() alive for the full
 * SpeechStream lifetime (waiting on abortSignal) so the Soniox connection
 * persists across VAD silence gaps.
 */
import { stt, AudioByteStream } from '@livekit/agents'
import type { APIConnectOptions } from '@livekit/agents'
import { SonioxNodeClient } from '@soniox/node'
import type { RealtimeResult, SttSessionConfig } from '@soniox/node'

export interface SonioxSTTOptions {
  apiKey?: string
  model?: string
  language?: string
  languageHints?: string[]
  sampleRate?: number
  numChannels?: number
  enableEndpointDetection?: boolean
  maxEndpointDelayMs?: number
  contextTerms?: string[]
}

const DEFAULT_OPTS: Required<Pick<SonioxSTTOptions, 'model' | 'sampleRate' | 'numChannels' | 'enableEndpointDetection' | 'maxEndpointDelayMs'>> = {
  model: 'stt-rt-preview',
  sampleRate: 24000,
  numChannels: 1,
  enableEndpointDetection: true,
  maxEndpointDelayMs: 1000,
}

export class STT extends stt.STT {
  readonly label = 'soniox'
  #opts: SonioxSTTOptions & typeof DEFAULT_OPTS
  #client: SonioxNodeClient

  constructor(opts: SonioxSTTOptions = {}) {
    super({
      streaming: true,
      interimResults: true,
    })
    this.#opts = { ...DEFAULT_OPTS, ...opts }
    this.#client = new SonioxNodeClient({
      api_key: opts.apiKey || process.env.SONIOX_API_KEY,
    })
  }

  async _recognize(): Promise<stt.SpeechEvent> {
    throw new Error('Soniox STT only supports streaming mode')
  }

  stream(options?: { connOptions?: APIConnectOptions }): SpeechStream {
    return new SpeechStream(this, this.#client, this.#opts, options?.connOptions)
  }
}

class SpeechStream extends stt.SpeechStream {
  readonly label = 'soniox'
  #client: SonioxNodeClient
  #opts: SonioxSTTOptions & typeof DEFAULT_OPTS
  #speechStarted = false
  #requestId = 0
  #lastPreflightTs = 0     // throttle PREFLIGHT_TRANSCRIPT to avoid spamming LLM

  constructor(
    sttInstance: STT,
    client: SonioxNodeClient,
    opts: SonioxSTTOptions & typeof DEFAULT_OPTS,
    connOptions?: APIConnectOptions,
  ) {
    super(sttInstance, opts.sampleRate, connOptions)
    this.#client = client
    this.#opts = opts
  }

  #buildConfig(): SttSessionConfig {
    const config: SttSessionConfig = {
      model: this.#opts.model,
      audio_format: 'pcm_s16le',
      sample_rate: this.#opts.sampleRate,
      num_channels: this.#opts.numChannels,
      enable_endpoint_detection: this.#opts.enableEndpointDetection,
      enable_language_identification: true,
    }

    if (this.#opts.languageHints?.length) {
      config.language_hints = this.#opts.languageHints
      config.language_hints_strict = true
    } else if (this.#opts.language) {
      config.language_hints = [this.#opts.language]
      config.language_hints_strict = true
    }

    if (this.#opts.contextTerms?.length) {
      config.context = { terms: this.#opts.contextTerms }
    }

    return config
  }

  protected async run(): Promise<void> {
    const config = this.#buildConfig()
    const session = this.#client.realtime.stt(config)

    const resultHandler = (result: RealtimeResult) => this.#handleResult(result)
    const endpointHandler = () => this.#handleEndpoint()

    session.on('result', resultHandler)
    session.on('endpoint', endpointHandler)
    session.on('error', (err: unknown) => {
      console.error(`[soniox] SESSION ERROR EVENT:`, err)
    })
    session.on('state_change', (update: { old_state: string; new_state: string }) => {
      if (update.new_state === 'error' || update.new_state === 'closed') {
        console.log(`[soniox] state: ${update.old_state} → ${update.new_state}`)
      }
    })

    try {
      const connectStart = Date.now()
      console.log(`[soniox] connecting... model=${config.model} sampleRate=${config.sample_rate} hints=${config.language_hints?.join(',') ?? 'none'}`)
      await session.connect()
      console.log(`[soniox] connected in ${Date.now() - connectStart}ms, state=${session.state}`)

      const audioStream = new AudioByteStream(
        this.#opts.sampleRate,
        this.#opts.numChannels,
        Math.floor(this.#opts.sampleRate / 10), // 100ms chunks
      )

      // Read audio from this.input (fed by base class pumpInput).
      // Race against abortSignal so close() unblocks immediately.
      const abortPromise = new Promise<undefined>((resolve) => {
        if (this.abortSignal.aborted) return resolve(undefined)
        this.abortSignal.addEventListener('abort', () => resolve(undefined), { once: true })
      })

      let audioFrameCount = 0
      while (true) {
        const result = await Promise.race([this.input.next(), abortPromise])

        if (result === undefined || result.done) break

        const data = result.value

        if (data === SpeechStream.FLUSH_SENTINEL) {
          const frames = audioStream.flush()
          for (const frame of frames) {
            if (session.state === 'connected') {
              session.sendAudio(Buffer.from(frame.data.buffer))
            }
          }
        } else {
          const frames = audioStream.write(data.data.buffer as ArrayBuffer)
          for (const frame of frames) {
            if (session.state === 'connected') {
              session.sendAudio(Buffer.from(frame.data.buffer))
              audioFrameCount++
            }
          }
        }
      }

      // Flush remaining audio
      if (session.state === 'connected') {
        const remaining = audioStream.flush()
        for (const frame of remaining) {
          session.sendAudio(Buffer.from(frame.data.buffer))
        }
        await session.finish()
      }
    } catch (err) {
      console.error(`[soniox] session error:`, err)
      throw err
    } finally {
      session.off('result', resultHandler)
      session.off('endpoint', endpointHandler)
    }
  }

  #handleResult(result: RealtimeResult): void {
    if (!result.tokens.length) return

    const text = result.tokens.map((t) => t.text).join('')
    if (!text.trim()) return

    const isFinal = result.tokens.some((t) => t.is_final)

    if (!this.#speechStarted) {
      this.#speechStarted = true
      this.queue.put({ type: stt.SpeechEventType.START_OF_SPEECH })
    }

    const startMs = result.tokens[0]?.start_ms ?? 0
    const endMs = result.tokens[result.tokens.length - 1]?.end_ms ?? startMs
    const avgConfidence =
      result.tokens.reduce((sum, t) => sum + t.confidence, 0) / result.tokens.length
    const detectedLang = result.tokens.find((t) => t.language)?.language || ''

    const speechData: stt.SpeechData = {
      language: detectedLang as stt.SpeechData['language'],
      text: text.trim(),
      startTime: startMs / 1000,
      endTime: endMs / 1000,
      confidence: avgConfidence,
    }

    this.#requestId++
    // PREFLIGHT_TRANSCRIPT triggers preemptive LLM generation; INTERIM only updates UI.
    // Throttle PREFLIGHT to avoid spamming cancelled LLM requests — each preemptive
    // attempt opens an uncached LLM stream (~400ms TTFT) + TTS stream, then cancels it
    // when the next transcript arrives. Too frequent = massive waste + TTS contention.
    // 1500ms ensures at most ~1 preemptive attempt during typical speech.
    let eventType: stt.SpeechEventType
    if (isFinal) {
      eventType = stt.SpeechEventType.FINAL_TRANSCRIPT
      this.#lastPreflightTs = 0  // reset throttle for next utterance
    } else {
      const now = Date.now()
      const sinceLast = now - this.#lastPreflightTs
      if (sinceLast >= 1500 && text.trim().split(/\s+/).length >= 2) {
        eventType = stt.SpeechEventType.PREFLIGHT_TRANSCRIPT
        this.#lastPreflightTs = now
      } else {
        eventType = stt.SpeechEventType.INTERIM_TRANSCRIPT
      }
    }
    this.queue.put({
      type: eventType,
      alternatives: [speechData],
      requestId: `soniox-${this.#requestId}`,
    })

    if (isFinal && this.#speechStarted) {
      this.queue.put({ type: stt.SpeechEventType.END_OF_SPEECH })
      this.#speechStarted = false
    }
  }

  #handleEndpoint(): void {
    if (this.#speechStarted) {
      this.queue.put({ type: stt.SpeechEventType.END_OF_SPEECH })
      this.#speechStarted = false
    }
  }
}
