/**
 * PCMStreamPlayer — plays PCM Int16LE audio from a ReadableStream via Web Audio API.
 * Schedules AudioBuffer chunks for gapless playback as they arrive.
 */
export class PCMStreamPlayer {
  private ctx: AudioContext | null = null
  private sampleRate: number
  private nextStartTime = 0
  private playStartTime = 0
  private scheduledNodes: AudioBufferSourceNode[] = []
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null
  private _playing = false
  private _playbackRate = 1.0
  private _totalScheduledDuration = 0
  private residualBuffer: Uint8Array | null = null
  private playGeneration = 0
  private lastSampleValue = 0
  // Debug diagnostics — flip via: window.__VOICE_DEBUG = true
  static get debug(): boolean {
    return typeof window !== 'undefined' && !!(window as any).__VOICE_DEBUG
  }
  private chunkIndex = 0
  private underrunCount = 0
  private prevLastSample = 0

  // Min 256 samples (~16ms at 16kHz) to avoid scheduling tiny buffers that cause clicks
  private static readonly MIN_SAMPLES = 256

  constructor(sampleRate = 24000) {
    this.sampleRate = sampleRate
  }

  get isPlaying() {
    return this._playing
  }

  get totalDuration() {
    return this._totalScheduledDuration
  }

  get currentTime(): number {
    if (!this.ctx || !this._playing) return 0
    return this.ctx.currentTime - this.playStartTime
  }

  get progress(): number {
    if (!this._playing || this._totalScheduledDuration === 0) return 0
    const totalWallDuration = this.nextStartTime - this.playStartTime
    if (totalWallDuration <= 0) return 0
    return Math.min(this.currentTime / totalWallDuration, 1)
  }

  set playbackRate(rate: number) {
    this._playbackRate = rate
    for (const node of this.scheduledNodes) {
      node.playbackRate.value = rate
    }
  }

  /** Pre-create AudioContext so first play() has no init delay (15-45ms saving) */
  warmup() {
    const t = performance.now()
    const created = !this.ctx || this.ctx.state === 'closed'
    this.ensureContext()
    console.log(`[pcm-player:opt] warmup ${created ? 'CREATED' : 'already-exists'} AudioContext ${(performance.now() - t).toFixed(1)}ms`)
  }

  private ensureContext(): AudioContext {
    if (!this.ctx || this.ctx.state === 'closed') {
      const t = performance.now()
      this.ctx = new AudioContext({ sampleRate: this.sampleRate })
      console.log(`[pcm-player:opt] AudioContext created ${(performance.now() - t).toFixed(1)}ms`)
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume()
    }
    return this.ctx
  }

  /**
   * Play PCM audio from a ReadableStream. Resolves when all audio has finished playing.
   * Call interrupt() to stop early.
   */
  async play(stream: ReadableStream<Uint8Array>): Promise<void> {
    this.stopCurrentPlayback()

    const ctx = this.ensureContext()
    const gen = ++this.playGeneration
    this._playing = true
    this.reader = stream.getReader()
    this._totalScheduledDuration = 0
    this.residualBuffer = null
    this.lastSampleValue = 0
    this.chunkIndex = 0
    this.underrunCount = 0
    this.prevLastSample = 0
    // Reset nextStartTime to now for each new sentence
    this.nextStartTime = ctx.currentTime
    this.playStartTime = ctx.currentTime

    try {
      let flushedResidualAsLast = false

      while (this._playing) {
        const { done, value } = await this.reader.read()
        if (done || !this._playing) break
        if (!value || value.length === 0) continue

        let data = value

        // Prepend any residual bytes from previous iteration
        if (this.residualBuffer) {
          const combined = new Uint8Array(this.residualBuffer.length + data.length)
          combined.set(this.residualBuffer)
          combined.set(data, this.residualBuffer.length)
          data = combined
          this.residualBuffer = null
        }

        // Int16 = 2 bytes per sample; ensure even byte count
        const usableLength = data.length - (data.length % 2)
        const numSamples = usableLength / 2

        if (numSamples < PCMStreamPlayer.MIN_SAMPLES) {
          // Too small — buffer for next iteration
          this.residualBuffer = data
          continue
        }

        this.scheduleChunk(ctx, data.slice(0, usableLength))

        // Save trailing odd byte if any
        if (usableLength < data.length) {
          this.residualBuffer = data.slice(usableLength)
        }
      }

      // Flush any remaining residual
      if (this.residualBuffer && this.residualBuffer.length >= 2 && this._playing) {
        const len = this.residualBuffer.length - (this.residualBuffer.length % 2)
        if (len >= 2) {
          this.scheduleChunk(ctx, this.residualBuffer.slice(0, len), true)
          flushedResidualAsLast = true
        }
        this.residualBuffer = null
      }

      // If stream ended cleanly with no residual fade-out, schedule a tiny tail
      // that ramps from lastSampleValue → 0 to prevent an abrupt cutoff click
      if (this._playing && !flushedResidualAsLast && this.lastSampleValue !== 0) {
        const tailSamples = PCMStreamPlayer.FADE_OUT_SAMPLES
        const tail = new Float32Array(tailSamples)
        for (let i = 0; i < tailSamples; i++) {
          tail[i] = this.lastSampleValue * (1 - i / tailSamples)
        }
        const buffer = ctx.createBuffer(1, tailSamples, this.sampleRate)
        buffer.copyToChannel(tail, 0)
        const source = ctx.createBufferSource()
        source.buffer = buffer
        source.playbackRate.value = this._playbackRate
        source.connect(ctx.destination)
        if (this.nextStartTime < ctx.currentTime) {
          this.nextStartTime = ctx.currentTime
        }
        source.start(this.nextStartTime)
        const tailDuration = tailSamples / this.sampleRate
        this.nextStartTime += tailDuration / this._playbackRate
        this.scheduledNodes.push(source)
        source.onended = () => {
          const idx = this.scheduledNodes.indexOf(source)
          if (idx !== -1) this.scheduledNodes.splice(idx, 1)
        }
      }

      // Debug: log playback summary
      if (PCMStreamPlayer.debug) {
        console.log(
          `[voice-debug:summary] gen:${gen} chunks:${this.chunkIndex} dur:${(this._totalScheduledDuration * 1000).toFixed(0)}ms` +
          ` underruns:${this.underrunCount} lastSample:${this.lastSampleValue.toFixed(4)}` +
          ` flushedAsLast:${flushedResidualAsLast} tailScheduled:${!flushedResidualAsLast && this.lastSampleValue !== 0}`
        )
      }

      // Wait for all scheduled audio to finish playing.
      // Use a simple timeout based on the precise scheduled end time — no event listeners
      // needed since we know exactly when the last buffer finishes.
      if (this._playing && this.nextStartTime > ctx.currentTime) {
        const remainingMs = (this.nextStartTime - ctx.currentTime) * 1000 + 30
        await new Promise((r) => setTimeout(r, remainingMs))
      }
    } catch (err) {
      if (this._playing) {
        console.error('[pcm-player] stream error:', err)
      }
    } finally {
      if (gen === this.playGeneration) {
        this._playing = false
        this.reader = null
      } else {
        console.log(`[pcm-player] stale play() gen=${gen} skipping cleanup (current=${this.playGeneration})`)
      }
    }
  }

  // Fade-out last ~16ms (256 samples at 16kHz) to prevent end-of-sentence pops
  private static readonly FADE_OUT_SAMPLES = 256

  private scheduleChunk(ctx: AudioContext, data: Uint8Array, isLast = false) {
    if (!this._playing) return

    const numSamples = data.length / 2
    const float32 = new Float32Array(numSamples)
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength)

    for (let i = 0; i < numSamples; i++) {
      float32[i] = view.getInt16(i * 2, true) / 32768.0
    }

    // Track the last sample value for fade-out tail scheduling
    this.lastSampleValue = float32[numSamples - 1]

    // Apply fade-out on the last chunk to prevent clicks from non-zero final samples
    if (isLast && numSamples > PCMStreamPlayer.FADE_OUT_SAMPLES) {
      const fadeStart = numSamples - PCMStreamPlayer.FADE_OUT_SAMPLES
      for (let i = 0; i < PCMStreamPlayer.FADE_OUT_SAMPLES; i++) {
        float32[fadeStart + i] *= 1 - i / PCMStreamPlayer.FADE_OUT_SAMPLES
      }
    }

    const buffer = ctx.createBuffer(1, numSamples, this.sampleRate)
    buffer.copyToChannel(float32, 0)

    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.playbackRate.value = this._playbackRate
    source.connect(ctx.destination)

    const chunkDuration = numSamples / this.sampleRate
    const aheadBy = this.nextStartTime - ctx.currentTime
    const wasUnderrun = this.nextStartTime < ctx.currentTime

    // Don't schedule in the past
    if (wasUnderrun) {
      this.nextStartTime = ctx.currentTime
      this.underrunCount++
    }

    // Debug: log scheduling details per chunk
    if (PCMStreamPlayer.debug) {
      const firstSample = float32[0]
      const lastSample = float32[numSamples - 1]
      const discontinuity = this.chunkIndex > 0 ? Math.abs(firstSample - this.prevLastSample) : 0
      console.log(
        `[voice-debug:schedule] chunk#${this.chunkIndex} samples:${numSamples} dur:${(chunkDuration * 1000).toFixed(1)}ms` +
        ` ahead:${(aheadBy * 1000).toFixed(1)}ms${wasUnderrun ? ' UNDERRUN' : ''}` +
        ` first:${firstSample.toFixed(4)} last:${lastSample.toFixed(4)}` +
        (discontinuity > 0.1 ? ` DISCONTINUITY:${discontinuity.toFixed(4)}` : '') +
        (isLast ? ' [LAST]' : '')
      )
      this.prevLastSample = lastSample
    }

    source.start(this.nextStartTime)
    this.nextStartTime += chunkDuration / this._playbackRate
    this._totalScheduledDuration += chunkDuration
    this.chunkIndex++

    this.scheduledNodes.push(source)

    source.onended = () => {
      const idx = this.scheduledNodes.indexOf(source)
      if (idx !== -1) this.scheduledNodes.splice(idx, 1)
    }
  }

  /** Stop current playback, cancel stream reader, stop all scheduled nodes */
  interrupt() {
    this._playing = false

    if (this.reader) {
      this.reader.cancel().catch(() => {})
      this.reader = null
    }

    for (const node of this.scheduledNodes) {
      try { node.stop() } catch {}
      try { node.disconnect() } catch {}
    }
    this.scheduledNodes = []
    this.residualBuffer = null
    this._totalScheduledDuration = 0
    this.nextStartTime = 0
    this.lastSampleValue = 0
  }

  private stopCurrentPlayback() {
    if (this.reader) {
      this.reader.cancel().catch(() => {})
      this.reader = null
    }
    for (const node of this.scheduledNodes) {
      try { node.stop() } catch {}
      try { node.disconnect() } catch {}
    }
    this.scheduledNodes = []
    this._playing = false
    this.residualBuffer = null
    this.lastSampleValue = 0
  }

  /** Close the AudioContext entirely (call on unmount) */
  dispose() {
    this.interrupt()
    if (this.ctx) {
      this.ctx.close().catch(() => {})
      this.ctx = null
    }
  }
}
