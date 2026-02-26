import type { ItemType, KnowledgeBubble, LevelBreakdown } from '@linguist/shared/types'
import { loadJapaneseReferenceCorpus } from './reference-data'
import { createLogger } from '../logger'

const log = createLogger('core:bubble')

// ── Input types ──

export interface BubbleItemInput {
  id: number
  itemType: ItemType
  surfaceForm?: string
  patternId?: string
  cefrLevel: string | null
  masteryState: string
  productionWeight: number
}

const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const
const KNOWN_THRESHOLD_STATES = new Set([
  'apprentice_3',
  'apprentice_4',
  'journeyman',
  'expert',
  'master',
  'burned',
])
const PRODUCTION_READY_STATES = new Set(['journeyman', 'expert', 'master', 'burned'])
const COVERAGE_THRESHOLD = 0.8

export function computeKnowledgeBubble(items: BubbleItemInput[]): KnowledgeBubble {
  log.debug('Computing knowledge bubble', { totalItems: items.length })
  const corpus = loadJapaneseReferenceCorpus()

  // Count reference items per level (including collocations, chunks, pragmatic formulas)
  const refCountByLevel = new Map<string, number>()
  for (const level of CEFR_LEVELS) {
    const vocabCount = corpus.vocabulary.filter((v) => v.cefrLevel === level).length
    const grammarCount = corpus.grammar.filter((g) => g.cefrLevel === level).length
    const collocationCount = corpus.collocations.filter((c) => c.cefrLevel === level).length
    const chunkCount = corpus.chunks.filter((c) => c.cefrLevel === level).length
    const pragmaticCount = corpus.pragmaticFormulas.filter((p) => p.cefrLevel === level).length
    refCountByLevel.set(level, vocabCount + grammarCount + collocationCount + chunkCount + pragmaticCount)
  }

  // Group learner items by level
  const itemsByLevel = new Map<string, BubbleItemInput[]>()
  for (const item of items) {
    const level = item.cefrLevel ?? 'A1'
    const group = itemsByLevel.get(level) ?? []
    group.push(item)
    itemsByLevel.set(level, group)
  }

  // Build level breakdowns
  const levelBreakdowns: LevelBreakdown[] = CEFR_LEVELS.map((level) => {
    const totalRef = refCountByLevel.get(level) ?? 0
    const levelItems = itemsByLevel.get(level) ?? []
    const known = levelItems.filter((i) => KNOWN_THRESHOLD_STATES.has(i.masteryState)).length
    const productionReady = levelItems.filter((i) =>
      PRODUCTION_READY_STATES.has(i.masteryState)
    ).length
    const coverage = totalRef > 0 ? known / totalRef : 0

    return {
      level,
      totalReferenceItems: totalRef,
      knownItems: known,
      productionReady,
      coverage: Math.round(coverage * 100) / 100,
    }
  })

  // Current level = highest level where coverage >= 0.80
  let currentLevelIdx = 0
  for (let i = 0; i < levelBreakdowns.length; i++) {
    if (levelBreakdowns[i].coverage >= COVERAGE_THRESHOLD) {
      currentLevelIdx = i
    } else {
      break
    }
  }
  const currentLevel = CEFR_LEVELS[currentLevelIdx]
  const frontierLevel = CEFR_LEVELS[Math.min(currentLevelIdx + 1, CEFR_LEVELS.length - 1)]

  // Gaps in current level: items that are unseen, introduced, or weak (apprentice_1/2)
  const weakStates = new Set(['unseen', 'introduced', 'apprentice_1', 'apprentice_2'])
  const currentLevelItems = itemsByLevel.get(currentLevel) ?? []
  const gapsInCurrentLevel = currentLevelItems
    .filter((i) => weakStates.has(i.masteryState))
    .map((i) => ({
      itemType: i.itemType,
      surfaceForm: i.surfaceForm,
      patternId: i.patternId,
      reason:
        i.masteryState === 'unseen'
          ? 'Not yet seen'
          : i.masteryState === 'introduced'
            ? 'Introduced but not in SRS'
            : 'Weak — needs more review',
    }))

  // Also find reference items not in the learner's inventory at all
  const knownSurfaces = new Set(
    items.filter((i) => i.itemType === 'lexical').map((i) => i.surfaceForm)
  )
  const knownPatterns = new Set(
    items.filter((i) => i.itemType === 'grammar').map((i) => i.patternId)
  )

  const missingVocab = corpus.vocabulary
    .filter((v) => v.cefrLevel === currentLevel && !knownSurfaces.has(v.surfaceForm))
    .slice(0, 10)
    .map((v) => ({
      itemType: 'lexical' as ItemType,
      surfaceForm: v.surfaceForm,
      reason: `Missing from vocabulary (freq rank: ${v.frequencyRank})`,
    }))

  const missingGrammar = corpus.grammar
    .filter((g) => g.cefrLevel === currentLevel && !knownPatterns.has(g.patternId))
    .slice(0, 5)
    .map((g) => ({
      itemType: 'grammar' as ItemType,
      patternId: g.patternId,
      reason: `Missing grammar pattern: ${g.name}`,
    }))

  const totalKnown = items.filter((i) => KNOWN_THRESHOLD_STATES.has(i.masteryState)).length
  const totalRef = Array.from(refCountByLevel.values()).reduce((a, b) => a + b, 0)
  const overallCoverage = totalRef > 0 ? Math.round((totalKnown / totalRef) * 100) / 100 : 0

  log.debug('Knowledge bubble computed', {
    currentLevel,
    frontierLevel,
    overallCoverage,
    gapsInCurrentLevel: gapsInCurrentLevel.length + missingVocab.length + missingGrammar.length,
  })

  return {
    levelBreakdowns,
    currentLevel,
    frontierLevel,
    gapsInCurrentLevel: [...gapsInCurrentLevel, ...missingVocab, ...missingGrammar],
    overallCoverage,
  }
}

export function identifyGaps(
  bubble: KnowledgeBubble,
  items: BubbleItemInput[]
): Array<{ itemType: ItemType; surfaceForm?: string; patternId?: string; reason: string; severity: 'high' | 'medium' | 'low' }> {
  const gaps: Array<{ itemType: ItemType; surfaceForm?: string; patternId?: string; reason: string; severity: 'high' | 'medium' | 'low' }> = []

  // High severity: gaps in current level
  for (const gap of bubble.gapsInCurrentLevel) {
    gaps.push({ ...gap, severity: 'high' })
  }

  // Medium severity: items at frontier level that are introduced but stuck
  const frontierItems = items.filter(
    (i) => (i.cefrLevel ?? 'A1') === bubble.frontierLevel
  )
  for (const item of frontierItems) {
    if (item.masteryState === 'introduced') {
      gaps.push({
        itemType: item.itemType,
        surfaceForm: item.surfaceForm,
        patternId: item.patternId,
        reason: 'At frontier level — introduced but not added to SRS',
        severity: 'medium',
      })
    }
  }

  // Low severity: production gaps (items that are apprentice_4 but stuck due to no production)
  for (const item of items) {
    if (item.masteryState === 'apprentice_4' && item.productionWeight < 1.0) {
      gaps.push({
        itemType: item.itemType,
        surfaceForm: item.surfaceForm,
        patternId: item.patternId,
        reason: 'Stuck at apprentice_4 — needs production evidence',
        severity: 'low',
      })
    }
  }

  return gaps
}
