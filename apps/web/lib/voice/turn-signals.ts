import { isFillerWord } from './filler-words'

// ── Types ──

export interface EnrichedToken {
  text: string
  is_final: boolean
  confidence: number
  start_ms?: number
  end_ms?: number
  language?: string
}

export interface TurnSignals {
  hesitationCount: number
  fillerCount: number
  fillerTokens: string[]
  avgConfidence: number
  lowConfidenceTokens: { text: string; confidence: number }[]
  trailedOff: boolean
  selfCorrected: boolean
  speakingPaceWPM: number
  l1Tokens: { text: string; language: string }[]
  l1TokenRatio: number
  totalSilenceMs: number
  durationMs: number
}

interface SignalOptions {
  targetLanguageCode: string
  nativeLanguageCode?: string
}

// ── Constants ──

const HESITATION_GAP_MS = 500
const LOW_CONFIDENCE_THRESHOLD = 0.6
const TRAIL_OFF_GAP_MS = 2000

// ── Core computation ──

export function computeTurnSignals(
  tokens: EnrichedToken[],
  options: SignalOptions,
): TurnSignals {
  const { targetLanguageCode, nativeLanguageCode } = options

  let hesitationCount = 0
  let totalSilenceMs = 0
  let fillerCount = 0
  const fillerTokens: string[] = []
  const lowConfidenceTokens: { text: string; confidence: number }[] = []
  const l1Tokens: { text: string; language: string }[] = []
  let selfCorrected = false

  let confidenceSum = 0
  let confidenceCount = 0
  let totalWordsForPace = 0

  const finalTokens = tokens.filter((t) => t.is_final && t.text.trim())

  // Detect hesitation gaps and silence
  for (let i = 1; i < finalTokens.length; i++) {
    const prev = finalTokens[i - 1]
    const curr = finalTokens[i]
    if (prev.end_ms != null && curr.start_ms != null) {
      const gap = curr.start_ms - prev.end_ms
      if (gap >= HESITATION_GAP_MS) {
        hesitationCount++
        totalSilenceMs += gap
      }
    }
  }

  // Analyze each token
  for (const token of finalTokens) {
    const text = token.text.trim()
    if (!text) continue

    // Confidence
    if (token.confidence > 0) {
      confidenceSum += token.confidence
      confidenceCount++
    }
    if (token.confidence > 0 && token.confidence < LOW_CONFIDENCE_THRESHOLD) {
      lowConfidenceTokens.push({ text, confidence: token.confidence })
    }

    // Filler detection — check against both target and native language
    if (isFillerWord(text, targetLanguageCode) || (nativeLanguageCode && isFillerWord(text, nativeLanguageCode))) {
      fillerCount++
      fillerTokens.push(text)
    }

    // L1 intrusion detection
    if (nativeLanguageCode && token.language && token.language !== targetLanguageCode) {
      l1Tokens.push({ text, language: token.language })
    }

    totalWordsForPace++
  }

  // Self-correction: detect if any non-final tokens appeared that diverged from final text
  const hasNonFinal = tokens.some((t) => !t.is_final && t.text.trim())
  const hasFinal = tokens.some((t) => t.is_final && t.text.trim())
  if (hasNonFinal && hasFinal) {
    // Compare last non-final segment to final — if they differ significantly, it's a correction
    const nonFinalTexts = tokens.filter((t) => !t.is_final && t.text.trim()).map((t) => t.text.trim())
    const finalTexts = finalTokens.map((t) => t.text.trim())
    const lastNonFinal = nonFinalTexts[nonFinalTexts.length - 1]
    const lastFinal = finalTexts[finalTexts.length - 1]
    if (lastNonFinal && lastFinal && lastNonFinal !== lastFinal) {
      selfCorrected = true
    }
  }

  // Trailed off: last token ended and there's been a long gap (or utterance ended without sentence-ending punctuation)
  const trailedOff = (() => {
    if (finalTokens.length < 2) return false
    const lastToken = finalTokens[finalTokens.length - 1]
    const secondLast = finalTokens[finalTokens.length - 2]
    // Check for trailing gap
    if (secondLast.end_ms != null && lastToken.start_ms != null) {
      const gap = lastToken.start_ms - secondLast.end_ms
      if (gap >= TRAIL_OFF_GAP_MS) return true
    }
    return false
  })()

  // Duration
  const firstStart = finalTokens.find((t) => t.start_ms != null)?.start_ms ?? 0
  const lastEnd = [...finalTokens].reverse().find((t) => t.end_ms != null)?.end_ms ?? 0
  const durationMs = lastEnd > firstStart ? lastEnd - firstStart : 0

  // Speaking pace (WPM)
  const durationMinutes = durationMs / 60_000
  const speakingPaceWPM = durationMinutes > 0 ? Math.round(totalWordsForPace / durationMinutes) : 0

  const avgConfidence = confidenceCount > 0 ? confidenceSum / confidenceCount : 1
  const l1TokenRatio = finalTokens.length > 0 ? l1Tokens.length / finalTokens.length : 0

  return {
    hesitationCount,
    fillerCount,
    fillerTokens,
    avgConfidence,
    lowConfidenceTokens,
    trailedOff,
    selfCorrected,
    speakingPaceWPM,
    l1Tokens,
    l1TokenRatio,
    totalSilenceMs,
    durationMs,
  }
}

// ── LLM formatting ──

/**
 * Format turn signals into a short annotation string for the LLM.
 * Returns null if there's nothing noteworthy to report.
 */
export function formatSignalsForLLM(signals: TurnSignals): string | null {
  const parts: string[] = []

  if (signals.hesitationCount >= 2) {
    parts.push(`hesitating (${signals.hesitationCount} pauses)`)
  }

  if (signals.fillerCount >= 2) {
    const unique = [...new Set(signals.fillerTokens)]
    parts.push(`filler words: ${unique.slice(0, 4).join(', ')}`)
  }

  if (signals.lowConfidenceTokens.length > 0) {
    const words = signals.lowConfidenceTokens.slice(0, 3).map((t) => t.text)
    parts.push(`uncertain on: ${words.join(', ')}`)
  }

  if (signals.l1Tokens.length > 0) {
    const words = signals.l1Tokens.slice(0, 4).map((t) => t.text)
    parts.push(`switched to native language: ${words.join(', ')}`)
  }

  if (signals.trailedOff) {
    parts.push('trailed off')
  }

  if (signals.selfCorrected) {
    parts.push('self-corrected')
  }

  if (signals.avgConfidence < 0.5 && parts.length === 0) {
    parts.push('low overall confidence')
  }

  if (parts.length === 0) return null

  return `[Learner signals: ${parts.join('; ')}]`
}
