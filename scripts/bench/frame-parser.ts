/**
 * Binary voice-stream frame parser with timing instrumentation.
 * Duplicates frame constants from apps/web/lib/voice/voice-stream-protocol.ts
 * to avoid Next.js import issues.
 */

const FRAME = {
  TEXT_DELTA: 0x01,
  AUDIO: 0x02,
  SENTENCE_START: 0x03,
  SENTENCE_END: 0x04,
  DONE: 0x05,
  ERROR: 0x06,
} as const

const HEADER_SIZE = 5

export interface SentenceTiming {
  text: string
  startTime: number
  firstAudioTime: number | null
  endTime: number | null
  audioBytes: number
}

export interface FrameTimings {
  requestStart: number
  firstTextDelta: number | null
  firstAudio: number | null
  sentences: SentenceTiming[]
  doneTime: number | null
  error: string | null
  fullText: string
  totalAudioBytes: number
  frameCount: number
}

export async function parseFramesWithTiming(
  body: ReadableStream<Uint8Array>,
  requestStart: number,
): Promise<FrameTimings> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = new Uint8Array(0)

  const result: FrameTimings = {
    requestStart,
    firstTextDelta: null,
    firstAudio: null,
    sentences: [],
    doneTime: null,
    error: null,
    fullText: '',
    totalAudioBytes: 0,
    frameCount: 0,
  }

  let currentSentence: SentenceTiming | null = null

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      // Append to buffer
      const newBuf = new Uint8Array(buffer.length + value.length)
      newBuf.set(buffer)
      newBuf.set(value, buffer.length)
      buffer = newBuf

      // Parse complete frames
      while (buffer.length >= HEADER_SIZE) {
        const type = buffer[0]
        const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
        const length = view.getUint32(1, false)

        if (buffer.length < HEADER_SIZE + length) break

        const payload = buffer.slice(HEADER_SIZE, HEADER_SIZE + length)
        buffer = buffer.slice(HEADER_SIZE + length)
        const now = performance.now()
        result.frameCount++

        switch (type) {
          case FRAME.TEXT_DELTA: {
            const text = decoder.decode(payload)
            result.fullText += text
            if (result.firstTextDelta === null) result.firstTextDelta = now
            break
          }
          case FRAME.AUDIO: {
            result.totalAudioBytes += payload.length
            if (result.firstAudio === null) result.firstAudio = now
            if (currentSentence) {
              currentSentence.audioBytes += payload.length
              if (currentSentence.firstAudioTime === null) {
                currentSentence.firstAudioTime = now
              }
            }
            break
          }
          case FRAME.SENTENCE_START: {
            const text = decoder.decode(payload)
            currentSentence = {
              text,
              startTime: now,
              firstAudioTime: null,
              endTime: null,
              audioBytes: 0,
            }
            result.sentences.push(currentSentence)
            break
          }
          case FRAME.SENTENCE_END: {
            if (currentSentence) {
              currentSentence.endTime = now
              currentSentence = null
            }
            break
          }
          case FRAME.DONE: {
            result.doneTime = now
            return result
          }
          case FRAME.ERROR: {
            result.error = decoder.decode(payload)
            result.doneTime = now
            return result
          }
        }
      }
    }

    // Stream ended without DONE frame
    result.doneTime = performance.now()
  } finally {
    reader.releaseLock()
  }

  return result
}
