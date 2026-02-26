import {
  getAssessmentCandidates,
  loadJapaneseReferenceCorpus,
  type ReferenceVocabItem,
  type ReferenceGrammarItem,
} from '../curriculum/reference-data'

export interface AssessmentItemDef {
  surfaceForm: string
  reading: string
  meaning: string
  partOfSpeech: string
  level: string // JLPT level (N5, N4, etc.)
  type: 'vocabulary' | 'grammar'
  patternId?: string
}

/**
 * Build assessment items from the master corpus.
 * Returns items tagged as assessmentCandidate, mapped to the AssessmentItemDef interface.
 */
function buildAssessmentItems(): AssessmentItemDef[] {
  const { vocabulary, grammar } = getAssessmentCandidates()

  const vocabItems: AssessmentItemDef[] = vocabulary.map((v) => ({
    surfaceForm: v.surfaceForm,
    reading: v.reading,
    meaning: v.meaning,
    partOfSpeech: v.partOfSpeech,
    level: v.jlptLevel,
    type: 'vocabulary' as const,
  }))

  const grammarItems: AssessmentItemDef[] = grammar.map((g) => ({
    surfaceForm: g.name,
    reading: g.name,
    meaning: g.description,
    partOfSpeech: 'grammar',
    level: g.jlptLevel,
    type: 'grammar' as const,
    patternId: g.patternId,
  }))

  return [...vocabItems, ...grammarItems]
}

let _cachedAssessmentItems: AssessmentItemDef[] | null = null

/**
 * Lazily-built assessment items from the corpus.
 * Replaces the old hardcoded ASSESSMENT_ITEMS array.
 */
export function getCorpusAssessmentItems(): AssessmentItemDef[] {
  if (!_cachedAssessmentItems) {
    _cachedAssessmentItems = buildAssessmentItems()
  }
  return _cachedAssessmentItems
}

/**
 * Backward-compatible export — same shape as the old hardcoded array.
 * Now backed by the corpus.
 */
export const ASSESSMENT_ITEMS: AssessmentItemDef[] = buildAssessmentItems()

// ── Comprehension challenge items (sentence → native language translation) ──

export interface ComprehensionItemDef {
  sentence: string
  translation: string
  keywords: string[]
  level: string
}

export const COMPREHENSION_ITEMS: ComprehensionItemDef[] = [
  // N5
  { sentence: '私は毎日学校に行きます。', translation: 'I go to school every day.', keywords: ['school', 'go', 'every'], level: 'N5' },
  { sentence: 'この水はとても冷たいです。', translation: 'This water is very cold.', keywords: ['water', 'cold'], level: 'N5' },
  { sentence: '友達と一緒に映画を見ました。', translation: 'I watched a movie with a friend.', keywords: ['friend', 'movie', 'watch'], level: 'N5' },
  // N4
  { sentence: '将来の夢について友達と話しました。', translation: 'I talked with my friend about my future dream.', keywords: ['future', 'dream', 'friend', 'talk'], level: 'N4' },
  { sentence: '趣味を変えることは難しくありません。', translation: "Changing hobbies isn't difficult.", keywords: ['hobby', 'change', 'difficult'], level: 'N4' },
  { sentence: '予約しないとレストランに入れません。', translation: "You can't get into the restaurant without a reservation.", keywords: ['reservation', 'restaurant'], level: 'N4' },
  // N3
  { sentence: '環境問題は私たちの生活に大きな影響を与えています。', translation: 'Environmental problems are having a big impact on our lives.', keywords: ['environment', 'life', 'impact', 'influence', 'effect'], level: 'N3' },
  { sentence: '状況に応じて適切な判断をすることが大切です。', translation: 'It is important to make appropriate judgments depending on the situation.', keywords: ['situation', 'appropriate', 'judgment', 'decision', 'important'], level: 'N3' },
  // N2
  { sentence: '抽象的な概念を把握するには具体的な例が必要だ。', translation: 'Concrete examples are necessary to grasp abstract concepts.', keywords: ['abstract', 'concept', 'grasp', 'understand', 'example', 'concrete'], level: 'N2' },
  { sentence: '妥協せずに品質を維持することが重要です。', translation: 'It is important to maintain quality without compromising.', keywords: ['compromise', 'quality', 'maintain', 'important'], level: 'N2' },
  // N1
  { sentence: '彼の顕著な業績にもかかわらず、その貢献は十分に評価されていない。', translation: 'Despite his remarkable achievements, his contributions have not been adequately evaluated.', keywords: ['remarkable', 'achievement', 'despite', 'contribution', 'evaluate'], level: 'N1' },
  { sentence: '蓋然性の高い仮説を踏襲することで研究の効率が上がる。', translation: 'Research efficiency improves by following hypotheses with high probability.', keywords: ['probability', 'hypothesis', 'follow', 'research', 'efficiency'], level: 'N1' },
]

const LEVEL_ORDER = ['N5', 'N4', 'N3', 'N2', 'N1']

export function getAssessmentItemsForLevel(selfReportedLevel: string): AssessmentItemDef[] {
  const items = getCorpusAssessmentItems()

  if (selfReportedLevel === 'beginner') {
    return items.filter((item) => item.level === 'N5')
  }

  const levelIdx = LEVEL_ORDER.indexOf(selfReportedLevel)
  if (levelIdx === -1) {
    return items.filter((item) => item.level === 'N5')
  }

  // Show items from one level below through one level above the reported level
  const minIdx = Math.max(0, levelIdx - 1)
  const maxIdx = Math.min(LEVEL_ORDER.length - 1, levelIdx + 1)
  const targetLevels = LEVEL_ORDER.slice(minIdx, maxIdx + 1)

  return items.filter((item) => targetLevels.includes(item.level))
}

export function getReadingChallengeItems(selfReportedLevel: string): AssessmentItemDef[] {
  const items = getAssessmentItemsForLevel(selfReportedLevel)
  return items.filter((i) => i.type === 'vocabulary').slice(0, 5)
}

export function getComprehensionItemsForLevel(selfReportedLevel: string): ComprehensionItemDef[] {
  if (selfReportedLevel === 'beginner') {
    return COMPREHENSION_ITEMS.filter((i) => i.level === 'N5')
  }

  const levelIdx = LEVEL_ORDER.indexOf(selfReportedLevel)
  if (levelIdx === -1) return COMPREHENSION_ITEMS.filter((i) => i.level === 'N5')

  const minIdx = Math.max(0, levelIdx - 1)
  const maxIdx = Math.min(LEVEL_ORDER.length - 1, levelIdx)
  const targetLevels = LEVEL_ORDER.slice(minIdx, maxIdx + 1)
  return COMPREHENSION_ITEMS.filter((i) => targetLevels.includes(i.level))
}

export function computeLevelFromChallenges(
  selfReportedLevel: string,
  readingResults: Array<{ level: string; correct: boolean }>,
  comprehensionResults: Array<{ level: string; keywordMatchRate: number }>,
): string {
  const scoreByLevel = new Map<string, { readingCorrect: number; readingTotal: number; compScore: number; compTotal: number }>()

  for (const r of readingResults) {
    const entry = scoreByLevel.get(r.level) ?? { readingCorrect: 0, readingTotal: 0, compScore: 0, compTotal: 0 }
    entry.readingTotal++
    if (r.correct) entry.readingCorrect++
    scoreByLevel.set(r.level, entry)
  }

  for (const c of comprehensionResults) {
    const entry = scoreByLevel.get(c.level) ?? { readingCorrect: 0, readingTotal: 0, compScore: 0, compTotal: 0 }
    entry.compTotal++
    entry.compScore += c.keywordMatchRate
    scoreByLevel.set(c.level, entry)
  }

  let evidenceLevel = 'beginner'
  for (const level of LEVEL_ORDER) {
    const s = scoreByLevel.get(level)
    if (!s) continue
    const readingRate = s.readingTotal > 0 ? s.readingCorrect / s.readingTotal : 0
    const compRate = s.compTotal > 0 ? s.compScore / s.compTotal : 0
    if (readingRate >= 0.5 || compRate >= 0.4) {
      evidenceLevel = level
    }
  }

  const selfIdx = LEVEL_ORDER.indexOf(selfReportedLevel)
  const evidenceIdx = LEVEL_ORDER.indexOf(evidenceLevel)
  const finalIdx = Math.max(selfIdx, evidenceIdx)
  return finalIdx >= 0 ? LEVEL_ORDER[finalIdx] : selfReportedLevel
}

export function getLevelCefrMapping(level: string): string {
  switch (level) {
    case 'beginner': return 'A1'
    case 'N5': return 'A1'
    case 'N4': return 'A2'
    case 'N3': return 'B1'
    case 'N2': return 'B2'
    case 'N1': return 'C1'
    default: return 'A1'
  }
}

/**
 * Get all corpus vocabulary items for a given JLPT level.
 * Used by onboarding to seed the full corpus for a level.
 */
export function getCorpusVocabForLevel(jlptLevel: string): ReferenceVocabItem[] {
  const corpus = loadJapaneseReferenceCorpus()
  return corpus.vocabulary.filter((v) => v.jlptLevel === jlptLevel)
}

/**
 * Get all corpus grammar items for a given JLPT level.
 * Used by onboarding to seed the full corpus for a level.
 */
export function getCorpusGrammarForLevel(jlptLevel: string): ReferenceGrammarItem[] {
  const corpus = loadJapaneseReferenceCorpus()
  return corpus.grammar.filter((g) => g.jlptLevel === jlptLevel)
}
