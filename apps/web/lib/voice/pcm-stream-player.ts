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

  // Min 256 samples (~11ms at 24kHz) to avoid scheduling tiny buffers that cause clicks
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

  private ensureContext(): AudioContext {
    if (!this.ctx || this.ctx.state === 'closed') {
      this.ctx = new AudioContext({ sampleRate: this.sampleRate })
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
    this._playing = true
    this.reader = stream.getReader()
    this._totalScheduledDuration = 0
    this.residualBuffer = null
    // Reset nextStartTime to now for each new sentence
    this.nextStartTime = ctx.currentTime
    this.playStartTime = ctx.currentTime

    try {
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
          this.scheduleChunk(ctx, this.residualBuffer.slice(0, len))
        }
        this.residualBuffer = null
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
      this._playing = false
      this.reader = null
    }
  }

  private scheduleChunk(ctx: AudioContext, data: Uint8Array) {
    if (!this._playing) return

    const numSamples = data.length / 2
    const float32 = new Float32Array(numSamples)
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength)

    for (let i = 0; i < numSamples; i++) {
      float32[i] = view.getInt16(i * 2, true) / 32768.0
    }

    const buffer = ctx.createBuffer(1, numSamples, this.sampleRate)
    buffer.copyToChannel(float32, 0)

    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.playbackRate.value = this._playbackRate
    source.connect(ctx.destination)

    const chunkDuration = numSamples / this.sampleRate

    // Don't schedule in the past
    if (this.nextStartTime < ctx.currentTime) {
      this.nextStartTime = ctx.currentTime
    }

    source.start(this.nextStartTime)
    this.nextStartTime += chunkDuration / this._playbackRate
    this._totalScheduledDuration += chunkDuration

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
