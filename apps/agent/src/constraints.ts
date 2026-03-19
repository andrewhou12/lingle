/**
 * Difficulty constraint derivation from CEFR scores.
 *
 * Maps decimal CEFR scores (1.0–6.0) to operational constraints
 * that are injected into the system prompt every turn. This prevents
 * the LLM from drifting above or below the learner's level.
 *
 * Language-agnostic: grammar structures in scope are loaded from
 * the session's learner model, not hardcoded per language.
 */
import type { DifficultyConstraints } from '@lingle/shared'

/** CEFR labels for display */
export function cefrLabel(score: number): string {
  if (score < 1.5) return 'A1'
  if (score < 2.5) return 'A2'
  if (score < 3.5) return 'B1'
  if (score < 4.5) return 'B2'
  if (score < 5.5) return 'C1'
  return 'C2'
}

/**
 * Derive operational difficulty constraints from CEFR scores.
 * These are hard rules injected into the system prompt.
 */
export function deriveConstraints(
  cefrGrammar: number,
  cefrFluency: number,
  grammarStructuresInScope?: string[],
): DifficultyConstraints {
  // Use the lower of the two scores for safety
  const effective = Math.min(cefrGrammar, cefrFluency)

  let maxSentenceComplexity: DifficultyConstraints['maxSentenceComplexity']
  let vocabularyTier: DifficultyConstraints['vocabularyTier']
  let allowL1Support: boolean

  if (effective < 2.0) {
    // A1: simple sentences, high-frequency vocab, L1 support allowed
    maxSentenceComplexity = 'simple'
    vocabularyTier = 'high_frequency'
    allowL1Support = true
  } else if (effective < 3.0) {
    // A2: simple sentences, high-frequency vocab, L1 for vocab only
    maxSentenceComplexity = 'simple'
    vocabularyTier = 'high_frequency'
    allowL1Support = true
  } else if (effective < 4.0) {
    // B1: compound sentences, intermediate vocab, limited L1
    maxSentenceComplexity = 'compound'
    vocabularyTier = 'intermediate'
    allowL1Support = true
  } else if (effective < 5.0) {
    // B2: complex sentences, intermediate-advanced vocab, no L1
    maxSentenceComplexity = 'complex'
    vocabularyTier = 'intermediate_advanced'
    allowL1Support = false
  } else {
    // C1/C2: complex sentences, advanced vocab, no L1
    maxSentenceComplexity = 'complex'
    vocabularyTier = 'advanced'
    allowL1Support = false
  }

  return {
    grammarStructuresInScope: grammarStructuresInScope ?? [],
    maxSentenceComplexity,
    vocabularyTier,
    allowL1Support,
  }
}
