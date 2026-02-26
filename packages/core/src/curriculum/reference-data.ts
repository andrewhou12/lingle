import vocabularyCorpus from './data/vocabulary.json'
import grammarCorpus from './data/grammar.json'
import collocationsCorpus from './data/collocations.json'
import chunksCorpus from './data/chunks.json'
import pragmaticFormulasCorpus from './data/pragmatic-formulas.json'

// ── Corpus item types (match the JSON shape) ──

export interface ReferenceVocabItem {
  id: string
  surfaceForm: string
  reading: string
  meaning: string
  partOfSpeech: string
  cefrLevel: string
  jlptLevel: string
  frequencyRank: number
  tags: string[]
  assessmentCandidate: boolean
  senseId: string
  senseGroup: string
  senseIndex: number
  senseGloss: string
}

export interface ReferenceGrammarItem {
  patternId: string
  name: string
  description: string
  cefrLevel: string
  jlptLevel: string
  frequencyRank: number
  prerequisiteIds: string[]
  assessmentCandidate: boolean
}

export interface ReferenceCollocation {
  id: string
  phrase: string
  reading: string
  meaning: string
  componentSurfaceForms: string[]
  particleFrame: string
  cefrLevel: string
  jlptLevel: string
  frequencyRank: number
  domain: string
  tags: string[]
}

export interface ReferenceChunk {
  id: string
  phrase: string
  reading: string
  meaning: string
  componentSurfaceForms: string[]
  grammarDependencies: string[]
  cefrLevel: string
  jlptLevel: string
  frequencyRank: number
  domain: string
  templatePattern: string
  tags: string[]
}

export interface ReferencePragmaticFormula {
  id: string
  phrase: string
  reading: string
  meaning: string
  register: string
  usageContext: string[]
  casualEquivalent: string | null
  cefrLevel: string
  jlptLevel: string
  frequencyRank: number
  domain: string
  tags: string[]
}

export interface ReferenceCorpus {
  vocabulary: ReferenceVocabItem[]
  grammar: ReferenceGrammarItem[]
  collocations: ReferenceCollocation[]
  chunks: ReferenceChunk[]
  pragmaticFormulas: ReferencePragmaticFormula[]
}

// ── Cache ──

let cachedCorpus: ReferenceCorpus | null = null

export function loadJapaneseReferenceCorpus(): ReferenceCorpus {
  if (cachedCorpus) return cachedCorpus
  cachedCorpus = {
    vocabulary: vocabularyCorpus as ReferenceVocabItem[],
    grammar: grammarCorpus as ReferenceGrammarItem[],
    collocations: collocationsCorpus as ReferenceCollocation[],
    chunks: chunksCorpus as ReferenceChunk[],
    pragmaticFormulas: pragmaticFormulasCorpus as ReferencePragmaticFormula[],
  }
  return cachedCorpus
}

// ── Existing query APIs (used by bubble.ts and recommender.ts) ──

export function getReferenceItemsByLevel(level: string): {
  vocabulary: ReferenceVocabItem[]
  grammar: ReferenceGrammarItem[]
} {
  const corpus = loadJapaneseReferenceCorpus()
  return {
    vocabulary: corpus.vocabulary.filter((v) => v.cefrLevel === level),
    grammar: corpus.grammar.filter((g) => g.cefrLevel === level),
  }
}

export function getReferenceItemsByFrequencyRange(
  min: number,
  max: number
): {
  vocabulary: ReferenceVocabItem[]
  grammar: ReferenceGrammarItem[]
} {
  const corpus = loadJapaneseReferenceCorpus()
  return {
    vocabulary: corpus.vocabulary.filter(
      (v) => v.frequencyRank >= min && v.frequencyRank <= max
    ),
    grammar: corpus.grammar.filter(
      (g) => g.frequencyRank >= min && g.frequencyRank <= max
    ),
  }
}

// ── New query APIs ──

/**
 * Returns assessment candidate items filtered by JLPT level range.
 * If no level specified, returns all assessment candidates.
 */
export function getAssessmentCandidates(jlptLevel?: string): {
  vocabulary: ReferenceVocabItem[]
  grammar: ReferenceGrammarItem[]
} {
  const corpus = loadJapaneseReferenceCorpus()
  let vocab = corpus.vocabulary.filter((v) => v.assessmentCandidate)
  let grammar = corpus.grammar.filter((g) => g.assessmentCandidate)

  if (jlptLevel) {
    vocab = vocab.filter((v) => v.jlptLevel === jlptLevel)
    grammar = grammar.filter((g) => g.jlptLevel === jlptLevel)
  }

  return { vocabulary: vocab, grammar }
}

/**
 * Look up a vocabulary item by its surface form.
 */
export function getItemBySurfaceForm(surfaceForm: string): ReferenceVocabItem | undefined {
  const corpus = loadJapaneseReferenceCorpus()
  return corpus.vocabulary.find((v) => v.surfaceForm === surfaceForm)
}

/**
 * Look up a grammar item by its pattern ID.
 */
export function getItemByPatternId(patternId: string): ReferenceGrammarItem | undefined {
  const corpus = loadJapaneseReferenceCorpus()
  return corpus.grammar.find((g) => g.patternId === patternId)
}

/**
 * Get all items for a specific CEFR level, optionally filtered by type.
 */
export function getItemsForLevel(
  level: string,
  type?: 'vocabulary' | 'grammar'
): {
  vocabulary: ReferenceVocabItem[]
  grammar: ReferenceGrammarItem[]
} {
  const corpus = loadJapaneseReferenceCorpus()
  return {
    vocabulary: type === 'grammar' ? [] : corpus.vocabulary.filter((v) => v.cefrLevel === level),
    grammar: type === 'vocabulary' ? [] : corpus.grammar.filter((g) => g.cefrLevel === level),
  }
}

/**
 * Get all corpus items at or below a given CEFR level.
 * Used during onboarding seeding to bulk-seed lower-level items.
 */
export function getItemsAtOrBelowLevel(cefrLevel: string): {
  vocabulary: ReferenceVocabItem[]
  grammar: ReferenceGrammarItem[]
} {
  const CEFR_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1']
  const levelIdx = CEFR_ORDER.indexOf(cefrLevel)
  if (levelIdx === -1) return { vocabulary: [], grammar: [] }

  const validLevels = new Set(CEFR_ORDER.slice(0, levelIdx + 1))
  const corpus = loadJapaneseReferenceCorpus()

  return {
    vocabulary: corpus.vocabulary.filter((v) => validLevels.has(v.cefrLevel)),
    grammar: corpus.grammar.filter((g) => validLevels.has(g.cefrLevel)),
  }
}

/**
 * Get all corpus items strictly below a given CEFR level.
 * Used for seeding lower-level items as 'introduced' during onboarding.
 */
export function getItemsBelowLevel(cefrLevel: string): {
  vocabulary: ReferenceVocabItem[]
  grammar: ReferenceGrammarItem[]
} {
  const CEFR_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1']
  const levelIdx = CEFR_ORDER.indexOf(cefrLevel)
  if (levelIdx <= 0) return { vocabulary: [], grammar: [] }

  const validLevels = new Set(CEFR_ORDER.slice(0, levelIdx))
  const corpus = loadJapaneseReferenceCorpus()

  return {
    vocabulary: corpus.vocabulary.filter((v) => validLevels.has(v.cefrLevel)),
    grammar: corpus.grammar.filter((g) => validLevels.has(g.cefrLevel)),
  }
}

// ── Multi-word unit query APIs ──

/**
 * Get collocations filtered by CEFR level.
 */
export function getCollocationsByLevel(level: string): ReferenceCollocation[] {
  const corpus = loadJapaneseReferenceCorpus()
  return corpus.collocations.filter((c) => c.cefrLevel === level)
}

/**
 * Get chunks filtered by CEFR level.
 */
export function getChunksByLevel(level: string): ReferenceChunk[] {
  const corpus = loadJapaneseReferenceCorpus()
  return corpus.chunks.filter((c) => c.cefrLevel === level)
}

/**
 * Get pragmatic formulas filtered by CEFR level.
 */
export function getPragmaticFormulasByLevel(level: string): ReferencePragmaticFormula[] {
  const corpus = loadJapaneseReferenceCorpus()
  return corpus.pragmaticFormulas.filter((p) => p.cefrLevel === level)
}

/**
 * Get all senses for a given surface form (for polysemous entries).
 */
export function getSenseGroup(surfaceForm: string): ReferenceVocabItem[] {
  const corpus = loadJapaneseReferenceCorpus()
  return corpus.vocabulary.filter((v) => v.senseGroup === surfaceForm)
}

/**
 * Look up a collocation by its reference ID.
 */
export function getCollocationById(id: string): ReferenceCollocation | undefined {
  const corpus = loadJapaneseReferenceCorpus()
  return corpus.collocations.find((c) => c.id === id)
}

/**
 * Look up a chunk by its reference ID.
 */
export function getChunkById(id: string): ReferenceChunk | undefined {
  const corpus = loadJapaneseReferenceCorpus()
  return corpus.chunks.find((c) => c.id === id)
}

/**
 * Look up a pragmatic formula by its reference ID.
 */
export function getPragmaticFormulaById(id: string): ReferencePragmaticFormula | undefined {
  const corpus = loadJapaneseReferenceCorpus()
  return corpus.pragmaticFormulas.find((p) => p.id === id)
}
