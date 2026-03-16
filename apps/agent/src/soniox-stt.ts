/**
 * Custom Soniox STT plugin for LiveKit Agents.
 *
 * Wraps the @soniox/node SDK's realtime WebSocket API to implement
 * LiveKit's stt.STT / stt.SpeechStream interface.
 *
 * Advantages over Deepgram for language learning:
 * - Better Japanese WER (8.7% vs ~11%)
 * - Token-level streaming with per-token confidence + language detection
 * - Endpoint detection built into the service
 * - Lower cost ($0.10-0.12/hr vs $0.20-0.40/hr)
 */
import { stt, AudioByteStream } from '@livekit/agents'
import type { APIConnectOptions } from '@livekit/agents'
import { SonioxNodeClient } from '@soniox/node'
import type { RealtimeSttSession, RealtimeResult, SttSessionConfig } from '@soniox/node'

export interface SonioxSTTOptions {
  apiKey?: string
  model?: string
  language?: string
  languageHints?: string[]
  sampleRate?: number
  numChannels?: number
  enableEndpointDetection?: boolean
  maxEndpointDelayMs?: number
  /** Domain-specific terms to boost recognition accuracy */
  contextTerms?: string[]
}

const DEFAULT_OPTS: Required<Pick<SonioxSTTOptions, 'model' | 'sampleRate' | 'numChannels' | 'enableEndpointDetection' | 'maxEndpointDelayMs'>> = {
  model: 'stt-rt-preview',
  sampleRate: 48000,
  numChannels: 1,
  enableEndpointDetection: true,
  maxEndpointDelayMs: 2000,
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
  #session: RealtimeSttSession | null = null
  #speechStarted = false
  #requestId = 0

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

  protected async run(): Promise<void> {
    const config: SttSessionConfig = {
      model: this.#opts.model,
      audio_format: 'pcm_s16le',
      sample_rate: this.#opts.sampleRate,
      num_channels: this.#opts.numChannels,
      enable_endpoint_detection: this.#opts.enableEndpointDetection,
      max_endpoint_delay_ms: this.#opts.maxEndpointDelayMs,
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
      config.context = {
        terms: this.#opts.contextTerms,
      }
    }

    const session = this.#client.realtime.stt(config)
    this.#session = session

    // Set up result handlers before connecting
    const resultHandler = (result: RealtimeResult) => {
      this.#handleResult(result)
    }
    const endpointHandler = () => {
      this.#handleEndpoint()
    }

    session.on('result', resultHandler)
    session.on('endpoint', endpointHandler)

    try {
      const connectStart = Date.now()
      await session.connect()
      console.log(`[soniox] connected in ${Date.now() - connectStart}ms`)

      // Audio chunking: 100ms chunks for streaming
      const audioStream = new AudioByteStream(
        this.#opts.sampleRate,
        this.#opts.numChannels,
        Math.floor(this.#opts.sampleRate / 10),
      )

      // Process input frames until closed
      while (!this.input.closed && !this.closed) {
        const result = await this.input.next()
        if (result.done) break

        const data = result.value

        if (data === SpeechStream.FLUSH_SENTINEL) {
          const frames = audioStream.flush()
          for (const frame of frames) {
            if (this.#session?.state === 'connected') {
              session.sendAudio(Buffer.from(frame.data.buffer))
            }
          }
        } else {
          const frames = audioStream.write(data.data.buffer as ArrayBuffer)
          for (const frame of frames) {
            if (this.#session?.state === 'connected') {
              session.sendAudio(Buffer.from(frame.data.buffer))
            }
          }
        }
      }

      // Flush remaining audio
      const remaining = audioStream.flush()
      for (const frame of remaining) {
        if (this.#session?.state === 'connected') {
          session.sendAudio(Buffer.from(frame.data.buffer))
        }
      }

      // Gracefully finish the session
      await session.finish()
    } finally {
      session.off('result', resultHandler)
      session.off('endpoint', endpointHandler)
      this.#session = null
    }
  }

  #handleResult(result: RealtimeResult): void {
    if (!result.tokens.length) return

    const text = result.tokens.map((t) => t.text).join('')
    if (!text.trim()) return

    // Determine if any tokens are final
    const isFinal = result.tokens.some((t) => t.is_final)

    // Emit START_OF_SPEECH on first real tokens
    if (!this.#speechStarted) {
      this.#speechStarted = true
      this.queue.put({
        type: stt.SpeechEventType.START_OF_SPEECH,
      })
    }

    // Calculate timing from token timestamps
    const startMs = result.tokens[0]?.start_ms ?? 0
    const endMs = result.tokens[result.tokens.length - 1]?.end_ms ?? startMs

    // Average confidence across tokens
    const avgConfidence =
      result.tokens.reduce((sum, t) => sum + t.confidence, 0) / result.tokens.length

    // Detected language from first token with language info
    const detectedLang = result.tokens.find((t) => t.language)?.language || ''

    const speechData: stt.SpeechData = {
      language: detectedLang,
      text: text.trim(),
      startTime: startMs / 1000,
      endTime: endMs / 1000,
      confidence: avgConfidence,
    }

    this.#requestId++
    this.queue.put({
      type: isFinal ? stt.SpeechEventType.FINAL_TRANSCRIPT : stt.SpeechEventType.INTERIM_TRANSCRIPT,
      alternatives: [speechData],
      requestId: `soniox-${this.#requestId}`,
    })
  }

  #handleEndpoint(): void {
    if (this.#speechStarted) {
      this.queue.put({
        type: stt.SpeechEventType.END_OF_SPEECH,
      })
      this.#speechStarted = false
    }
  }
}
