import { LANGUAGE_DIFFICULTY_INSERTS } from './language-difficulty-configs'

export interface DifficultyLevelInfo {
  level: number
  label: string
  shortDescription: string
}

export interface DifficultyLevel extends DifficultyLevelInfo {
  behaviorBlock: string
}

/** Universal behavior scaffolds — language-agnostic guidance per level */
const UNIVERSAL_SCAFFOLDS: Record<number, string> = {
  1: `VOCABULARY: Use only the most basic ~800 words. Greetings, numbers, colors, family, food, daily objects.
GRAMMAR: Present tense only. Simple sentence structures. No compound sentences.
ENGLISH: Provide English translations for all key phrases. Narration can be mostly in English with target language highlighted.
COMPLEXITY: Short sentences (5-10 words). One idea per sentence. Avoid subordinate clauses.`,
  2: `VOCABULARY: ~1,500 common words. Basic verb forms, common counters, time expressions, common adverbs.
GRAMMAR: Past tense, basic conjunctions (because, but), progressive forms, basic potential/ability expressions.
ENGLISH: Provide English hints for key phrases and new vocabulary. Brief English gloss after complex sentences.
COMPLEXITY: Medium sentences. Two clauses connected with basic conjunctions. Simple compound sentences OK.`,
  3: `VOCABULARY: ~3,500 words. Abstract concepts, opinions, descriptions, workplace basics.
GRAMMAR: Passive, causative, conditional, relative clauses, purpose/result expressions.
ENGLISH: Minimal English. Use for cultural context notes or grammar explanations only. All conversation in target language.
COMPLEXITY: Natural sentence length. Subordinate clauses, relative clauses, quoted speech. Multiple ideas per turn.`,
  4: `VOCABULARY: ~6,000 words. Idiomatic expressions, set phrases, colloquial vocabulary.
GRAMMAR: Complex conditionals, formal expressions, contracted spoken forms.
ENGLISH: No English in conversation or narration. English only for very brief metalinguistic asides when the learner explicitly asks.
COMPLEXITY: Native-like sentence structure. Complex nested clauses, ellipsis, natural conversation flow.`,
  5: `VOCABULARY: Unrestricted active vocabulary including literary, academic, and specialized terms. Proverbs and idioms.
GRAMMAR: All grammar patterns. Literary forms where appropriate.
ENGLISH: Never use English. All explanations in the target language.
COMPLEXITY: Full native complexity. Long compound sentences, literary devices, implicit meaning, cultural allusions.`,
  6: `VOCABULARY: Completely unrestricted. Use any word that fits the context, including archaic, dialectal, slang, jargon.
GRAMMAR: Unrestricted. Classical forms, literary constructions, dialect-specific patterns all fair game.
ENGLISH: Never. Under no circumstances.
COMPLEXITY: No ceiling. Write as you would for a native reader.`,
}

export const DIFFICULTY_LEVELS: DifficultyLevelInfo[] = [
  { level: 1, label: 'Beginner (A1)', shortDescription: 'Basic greetings, core vocabulary, full native-language support' },
  { level: 2, label: 'Elementary (A2)', shortDescription: 'Simple sentences, everyday topics, native-language hints' },
  { level: 3, label: 'Intermediate (B1)', shortDescription: 'Mixed target/native language, varied register, selective annotations' },
  { level: 4, label: 'Upper-Intermediate (B2)', shortDescription: 'Mostly target language, natural forms, idiomatic speech' },
  { level: 5, label: 'Advanced (C1)', shortDescription: 'Full target language, complex topics, minimal annotations' },
  { level: 6, label: 'Near-Native (C2)', shortDescription: 'Unrestricted, literary, full native complexity' },
]

export function getDifficultyLevel(level: number, targetLanguage?: string): DifficultyLevel {
  const base = DIFFICULTY_LEVELS.find((d) => d.level === level) ?? DIFFICULTY_LEVELS[1]
  const universal = UNIVERSAL_SCAFFOLDS[level] ?? UNIVERSAL_SCAFFOLDS[3]

  // Look up language-specific insert
  const langInsert = targetLanguage
    ? LANGUAGE_DIFFICULTY_INSERTS[targetLanguage]?.[level] ?? ''
    : ''

  const behaviorBlock = langInsert
    ? `${universal}\n${langInsert}`
    : universal

  return { ...base, behaviorBlock }
}
