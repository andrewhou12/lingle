const JP_SENTENCE_ENDINGS = /[。！？\n]/
const JP_QUOTE_END = /」\s/
const MAX_FLUSH_LENGTH = 120

export interface SentenceBoundaryTracker {
  /** Feed new text (full accumulated text). Returns newly completed sentences. */
  feed(fullText: string): string[]
  /** Force-flush any remaining buffered text. */
  flush(): string | null
  /** Reset the tracker. */
  reset(): void
}

export function createSentenceBoundaryTracker(): SentenceBoundaryTracker {
  let cursor = 0

  return {
    feed(fullText: string): string[] {
      const sentences: string[] = []
      const newText = fullText.slice(cursor)

      let searchStart = 0
      for (let i = 0; i < newText.length; i++) {
        const char = newText[i]
        const remaining = newText.slice(i)

        // Check for Japanese sentence endings
        if (JP_SENTENCE_ENDINGS.test(char) || JP_QUOTE_END.test(remaining.slice(0, 2))) {
          const sentence = newText.slice(searchStart, i + 1).trim()
          if (sentence) {
            sentences.push(sentence)
          }
          searchStart = i + 1
        }
      }

      // Fallback: force flush after MAX_FLUSH_LENGTH chars with no boundary
      const unflushed = newText.slice(searchStart)
      if (unflushed.length >= MAX_FLUSH_LENGTH) {
        // Find the last space or comma to break at
        let breakAt = -1
        for (let i = unflushed.length - 1; i >= 0; i--) {
          if (unflushed[i] === '、' || unflushed[i] === ',' || unflushed[i] === ' ') {
            breakAt = i
            break
          }
        }
        if (breakAt > 0) {
          const sentence = unflushed.slice(0, breakAt + 1).trim()
          if (sentence) {
            sentences.push(sentence)
            searchStart += breakAt + 1
          }
        }
      }

      cursor += searchStart
      return sentences
    },

    flush(): string | null {
      // This will be called when the stream finishes
      // The caller should just pass the remaining text
      return null
    },

    reset() {
      cursor = 0
    },
  }
}
