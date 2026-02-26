import type {
  CurriculumRecommendation,
  ItemType,
  KnowledgeBubble,
} from '@linguist/shared/types'
import {
  loadJapaneseReferenceCorpus,
  type ReferenceVocabItem,
  type ReferenceGrammarItem,
} from './reference-data'
import type { ExpandedBriefInput } from '../tom/analyzer'
import { generateExpandedDailyBrief } from '../tom/analyzer'
import { createLogger } from '../logger'

const log = createLogger('core:recommender')

// ── Input types ──

export interface RecommendationInput {
  bubble: KnowledgeBubble
  knownSurfaceForms: Set<string>
  knownPatternIds: Set<string>
  dailyNewItemLimit: number
  tomBriefInput: ExpandedBriefInput | null
  spineBoosts?: Map<string, number> // refId/surfaceForm -> boost value from spine
}

// ── Scoring ──

function frequencyScore(rank: number): number {
  return 1.0 / Math.log2(rank + 2)
}

interface ScoredCandidate {
  itemType: ItemType
  surfaceForm?: string
  reading?: string
  meaning?: string
  patternId?: string
  cefrLevel: string
  frequencyRank: number
  score: number
  reason: string
  prerequisitesMet: boolean
}

export function generateRecommendations(
  input: RecommendationInput
): CurriculumRecommendation[] {
  const { bubble, knownSurfaceForms, knownPatternIds, dailyNewItemLimit, tomBriefInput, spineBoosts } = input
  log.debug('Generating recommendations', {
    currentLevel: bubble.currentLevel,
    frontierLevel: bubble.frontierLevel,
    knownVocab: knownSurfaceForms.size,
    knownGrammar: knownPatternIds.size,
    dailyLimit: dailyNewItemLimit,
  })
  const corpus = loadJapaneseReferenceCorpus()

  // Get ToM brief for scoring
  const tomBrief = tomBriefInput ? generateExpandedDailyBrief(tomBriefInput) : null

  // Build regression item set for scoring
  const regressionItemIds = new Set(
    tomBrief?.regressions.map((r) => r.itemId) ?? []
  )
  const avoidanceItemIds = new Set(
    tomBrief?.avoidancePatterns.map((a) => a.itemId) ?? []
  )

  // Candidate pool: items from frontier level + gap items from current level
  const candidates: ScoredCandidate[] = []

  // Vocabulary candidates from frontier + current level gaps
  const targetLevels = [bubble.frontierLevel, bubble.currentLevel]
  for (const level of targetLevels) {
    const levelVocab = corpus.vocabulary.filter(
      (v) => v.cefrLevel === level && !knownSurfaceForms.has(v.surfaceForm)
    )
    for (const vocab of levelVocab) {
      candidates.push(scoreVocabCandidate(vocab, bubble, level === bubble.currentLevel))
    }
  }

  // Grammar candidates
  const prerequisiteMap = buildPrerequisiteMap(corpus.grammar)
  for (const level of targetLevels) {
    const levelGrammar = corpus.grammar.filter(
      (g) => g.cefrLevel === level && !knownPatternIds.has(g.patternId)
    )
    for (const grammar of levelGrammar) {
      candidates.push(
        scoreGrammarCandidate(grammar, bubble, knownPatternIds, prerequisiteMap, level === bubble.currentLevel)
      )
    }
  }

  // Apply ToM-based score adjustments
  for (const candidate of candidates) {
    // Penalize areas with active regression
    if (regressionItemIds.size > 0) {
      candidate.score -= 0.3
    }

    // Boost if fills avoidance gap
    if (avoidanceItemIds.size > 0 && candidate.itemType === 'grammar') {
      candidate.score += 0.2
    }

    // Apply spine boost: items in the current curriculum unit get a priority bump
    if (spineBoosts) {
      const surfaceBoost = candidate.surfaceForm ? spineBoosts.get(candidate.surfaceForm) : undefined
      const patternBoost = candidate.patternId ? spineBoosts.get(candidate.patternId) : undefined
      const boost = surfaceBoost ?? patternBoost ?? 0
      if (boost > 0) {
        candidate.score += boost
        candidate.reason += '; in current curriculum unit'
      }
    }
  }

  // Sort by score descending, filter out unmet prerequisites, take limit
  candidates.sort((a, b) => b.score - a.score)

  const results = candidates.slice(0, dailyNewItemLimit)
  log.debug('Recommendations generated', {
    totalCandidates: candidates.length,
    returned: results.length,
    topScore: results[0]?.score ?? 0,
  })

  return results.map((c) => ({
    itemType: c.itemType,
    surfaceForm: c.surfaceForm,
    reading: c.reading,
    meaning: c.meaning,
    patternId: c.patternId,
    cefrLevel: c.cefrLevel,
    frequencyRank: c.frequencyRank,
    priority: Math.round(c.score * 100) / 100,
    reason: c.reason,
    prerequisitesMet: c.prerequisitesMet,
  }))
}

function scoreVocabCandidate(
  vocab: ReferenceVocabItem,
  bubble: KnowledgeBubble,
  isCurrentLevel: boolean
): ScoredCandidate {
  let score = frequencyScore(vocab.frequencyRank)
  const reasons: string[] = []

  if (isCurrentLevel) {
    score += 0.5
    reasons.push('fills gap in current level')
  } else {
    reasons.push('frontier level (i+1)')
  }

  // Context score: higher frequency items tend to have more contextual connections
  if (vocab.frequencyRank <= 100) {
    score += 0.1
    reasons.push('high frequency')
  }

  return {
    itemType: 'lexical',
    surfaceForm: vocab.surfaceForm,
    reading: vocab.reading,
    meaning: vocab.meaning,
    cefrLevel: vocab.cefrLevel,
    frequencyRank: vocab.frequencyRank,
    score,
    reason: reasons.join('; '),
    prerequisitesMet: true, // vocab has no prerequisites
  }
}

function scoreGrammarCandidate(
  grammar: ReferenceGrammarItem,
  bubble: KnowledgeBubble,
  knownPatternIds: Set<string>,
  prerequisiteMap: Map<string, string[]>,
  isCurrentLevel: boolean
): ScoredCandidate {
  let score = frequencyScore(grammar.frequencyRank)
  const reasons: string[] = []

  if (isCurrentLevel) {
    score += 0.5
    reasons.push('fills gap in current level')
  } else {
    reasons.push('frontier level (i+1)')
  }

  // Dependency score
  const { met, missing } = checkPrerequisites(
    grammar.patternId,
    knownPatternIds,
    prerequisiteMap
  )

  if (met) {
    score += 0.3
    reasons.push('all prerequisites met')
  } else {
    score -= 2.0
    reasons.push(`missing prerequisites: ${missing.join(', ')}`)
  }

  return {
    itemType: 'grammar',
    patternId: grammar.patternId,
    meaning: grammar.description,
    cefrLevel: grammar.cefrLevel,
    frequencyRank: grammar.frequencyRank,
    score,
    reason: reasons.join('; '),
    prerequisitesMet: met,
  }
}

// ── Prerequisites ──

function buildPrerequisiteMap(
  grammarItems: ReferenceGrammarItem[]
): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const item of grammarItems) {
    map.set(item.patternId, item.prerequisiteIds)
  }
  return map
}

export function checkPrerequisites(
  patternId: string,
  knownPatternIds: Set<string>,
  prerequisiteMap: Map<string, string[]>
): { met: boolean; missing: string[] } {
  const prerequisites = prerequisiteMap.get(patternId) ?? []
  if (prerequisites.length === 0) {
    return { met: true, missing: [] }
  }

  const missing = prerequisites.filter((p) => !knownPatternIds.has(p))
  return { met: missing.length === 0, missing }
}
