/**
 * CEFR Delta Computation — fully algorithmic, NO LLM.
 *
 * Deterministic formula. Max +/-0.15 per session. Never computed by LLM.
 *
 * Factors:
 *   Grammar: errors (negative) + vocab range produced (positive)
 *   Fluency: L1 switches, hesitations (negative) + self-corrections,
 *            grammar diversity produced (positive)
 */
import type { ErrorLog, FluencySignals } from '@lingle/shared'

export function computeCefrDeltas(
  currentGrammar: number,
  currentFluency: number,
  errors: ErrorLog[],
  fluencySignals: FluencySignals,
  sessionDurationMinutes: number,
  producedVocabCount: number = 0,
  producedGrammarCount: number = 0,
): { grammarDelta: number; fluencyDelta: number } {
  // --- Grammar Delta ---
  const majorErrors = errors.filter((e) => e.severity === 'major').length
  const minorErrors = errors.filter((e) => e.severity === 'minor').length

  // Base: slight positive drift for completing a session
  let grammarDelta = 0.02

  // Penalize for errors (scaled to session length)
  const minuteScale = Math.min(sessionDurationMinutes / 30, 1.0)
  grammarDelta -= (majorErrors * 0.04) * minuteScale
  grammarDelta -= (minorErrors * 0.01) * minuteScale

  // Reward for vocab range: each unique vocab word produced adds a small positive signal
  // Diminishing returns: first 5 words matter most, then tapers off
  const vocabBonus = Math.min(producedVocabCount * 0.005, 0.04)
  grammarDelta += vocabBonus

  // Cap: never move more than +/-0.15 per session
  grammarDelta = Math.max(-0.15, Math.min(0.15, grammarDelta))

  // --- Fluency Delta ---
  let fluencyDelta = 0.02 // base positive drift

  fluencyDelta -= (fluencySignals.l1SwitchCount * 0.03) * minuteScale
  fluencyDelta -= (fluencySignals.hesitationCount * 0.005) * minuteScale
  fluencyDelta += (fluencySignals.selfCorrectionCount * 0.01) * minuteScale // positive signal

  // Reward for grammar diversity: using varied patterns signals fluency
  const grammarBonus = Math.min(producedGrammarCount * 0.008, 0.04)
  fluencyDelta += grammarBonus

  // Cap: never move more than +/-0.15 per session
  fluencyDelta = Math.max(-0.15, Math.min(0.15, fluencyDelta))

  return { grammarDelta, fluencyDelta }
}
