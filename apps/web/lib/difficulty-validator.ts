import { tokenizeJapanese, type TokenResult } from './kuromoji-tokenizer'
import { getJLPTLevel } from './jlpt-vocabulary'

export interface DifficultyViolation {
  surface: string
  baseForm: string
  jlptLevel: number
  position: number
}

/**
 * Maps app difficulty level (1-6) to the maximum JLPT level allowed.
 * Difficulty 1 (Beginner) → only N5 words (JLPT 5)
 * Difficulty 2 (Elementary) → N5+N4 words (JLPT 4+)
 * etc.
 */
function difficultyToMaxJLPT(difficulty: number): number {
  switch (difficulty) {
    case 1: return 5 // N5 only
    case 2: return 4 // N5 + N4
    case 3: return 3 // N5 + N4 + N3
    case 4: return 2 // N5 + N4 + N3 + N2
    case 5: return 1 // All levels
    case 6: return 0 // No restrictions
    default: return 3
  }
}

/**
 * Validate that a response stays within the specified difficulty level.
 * Returns violations: words that are above the learner's level.
 */
export async function validateDifficulty(
  text: string,
  difficulty: number,
  targetLanguage?: string
): Promise<DifficultyViolation[]> {
  // JLPT-based validation only works for Japanese — skip for other languages
  if (targetLanguage && targetLanguage !== 'Japanese') return []
  if (difficulty >= 6) return [] // No restrictions at near-native level

  const maxJLPT = difficultyToMaxJLPT(difficulty)
  const violations: DifficultyViolation[] = []

  let tokens: TokenResult[]
  try {
    tokens = await tokenizeJapanese(text)
  } catch {
    return [] // Tokenizer not ready, skip validation
  }

  let position = 0
  for (const token of tokens) {
    if (!token.isContentWord) {
      position += token.surface.length
      continue
    }

    const lookup = token.baseForm || token.surface
    const jlptLevel = getJLPTLevel(lookup)

    // Only flag if the word is in our dictionary AND above the allowed level
    // Words not in the dictionary are unknown — don't flag them
    if (jlptLevel !== undefined && jlptLevel < maxJLPT) {
      violations.push({
        surface: token.surface,
        baseForm: lookup,
        jlptLevel,
        position,
      })
    }

    position += token.surface.length
  }

  return violations
}
