import type {
  CurriculumRecommendation,
  KnowledgeBubble,
  ItemType,
  UnitProgress,
  ChunkTriggerResult,
} from '@linguist/shared/types'
import type { BubbleItemInput } from './bubble'
import type { ExpandedBriefInput } from '../tom/analyzer'
import { generateRecommendations } from './recommender'
import { generateExpandedDailyBrief } from '../tom/analyzer'
import { loadJapaneseReferenceCorpus } from './reference-data'
import {
  loadCurriculumSpine,
  getNextUnit,
  getUnitProgress,
  evaluateChunkTriggers,
  getSpineBoosts,
} from './spine-loader'
import { createLogger } from '../logger'

const log = createLogger('core:planner')

// ── Types ──

export interface CurriculumPlan {
  newItems: CurriculumRecommendation[] // items to introduce today
  reviewFocus: number[] // item IDs needing extra review attention
  pacing: {
    dailyNewTarget: number // adjusted from base limit
    reason: string // why it was adjusted
  }
  levelUpReady: boolean // whether to seed next level items
  frontierLevel: string // the next level to seed from
  currentUnit?: UnitProgress // progress in current spine unit
  readyChunks?: ChunkTriggerResult[] // chunks ready to be introduced
}

export interface PlannerInput {
  bubble: KnowledgeBubble
  items: BubbleItemInput[] // all learner items
  knownSurfaceForms: Set<string>
  knownPatternIds: Set<string>
  dailyNewItemLimit: number
  dueReviewCount: number // how many reviews are due today
  recentAccuracy: number // accuracy over last 50 reviews (0-1)
  tomBriefInput: ExpandedBriefInput | null
}

// ── Mastery state helpers ──

const APPRENTICE_3_PLUS = new Set([
  'apprentice_3',
  'apprentice_4',
  'journeyman',
  'expert',
  'master',
  'burned',
])

// ── Pacing control ──

function computePacing(
  dailyNewItemLimit: number,
  dueReviewCount: number,
  recentAccuracy: number
): { dailyNewTarget: number; reason: string } {
  if (dueReviewCount > 50) {
    return {
      dailyNewTarget: 3,
      reason: 'High review debt - focusing on reviews',
    }
  }

  if (dueReviewCount > 20) {
    return {
      dailyNewTarget: Math.min(dailyNewItemLimit, 5),
      reason: 'Moderate review debt',
    }
  }

  if (dueReviewCount < 10 && recentAccuracy > 0.85) {
    return {
      dailyNewTarget: Math.min(Math.floor(dailyNewItemLimit * 1.5), 15),
      reason: 'Low debt + high accuracy - increasing pace',
    }
  }

  return {
    dailyNewTarget: dailyNewItemLimit,
    reason: 'Normal pacing',
  }
}

// ── Prerequisite gating ──

function filterByPrerequisites(
  recommendations: CurriculumRecommendation[],
  items: BubbleItemInput[]
): CurriculumRecommendation[] {
  // Build a map of patternId -> masteryState for quick lookup
  const patternMasteryMap = new Map<string, string>()
  for (const item of items) {
    if (item.itemType === 'grammar' && item.patternId) {
      patternMasteryMap.set(item.patternId, item.masteryState)
    }
  }

  // Load reference corpus to check prerequisite IDs for grammar items
  const corpus = loadJapaneseReferenceCorpus()
  const grammarPrereqMap = new Map<string, string[]>()
  for (const g of corpus.grammar) {
    grammarPrereqMap.set(g.patternId, g.prerequisiteIds)
  }

  return recommendations.filter((rec) => {
    // Vocabulary items have no prerequisites — always pass
    if (rec.itemType === 'lexical') return true

    // Grammar items: check that all prerequisiteIds are at apprentice_3+
    if (!rec.patternId) return true
    const prereqs = grammarPrereqMap.get(rec.patternId) ?? []
    if (prereqs.length === 0) return true

    const allMet = prereqs.every((prereqId) => {
      const state = patternMasteryMap.get(prereqId)
      return state !== undefined && APPRENTICE_3_PLUS.has(state)
    })

    if (!allMet) {
      log.debug('Filtered out grammar item due to unmet prerequisites', {
        patternId: rec.patternId,
        prereqs,
      })
    }

    return allMet
  })
}

// ── Variety balancing ──

function balanceVariety(
  recommendations: CurriculumRecommendation[]
): CurriculumRecommendation[] {
  if (recommendations.length <= 1) return recommendations

  const result: CurriculumRecommendation[] = []
  const remaining = [...recommendations]

  // Track consecutive same-partOfSpeech runs
  // partOfSpeech is not directly on CurriculumRecommendation, but we can
  // approximate by using itemType + meaning patterns. For lexical items,
  // we look at the reason field and group by itemType primarily.
  // Since CurriculumRecommendation doesn't carry partOfSpeech, we group
  // by itemType as a proxy and ensure interleaving.

  // Separate into lexical and grammar buckets
  const lexical = remaining.filter((r) => r.itemType === 'lexical')
  const grammar = remaining.filter((r) => r.itemType === 'grammar')

  // Interleave: pick from the larger bucket first, alternating
  let li = 0
  let gi = 0

  while (li < lexical.length || gi < grammar.length) {
    // Add up to 3 lexical items before inserting a grammar item
    let lexicalRun = 0
    while (li < lexical.length && lexicalRun < 3) {
      result.push(lexical[li])
      li++
      lexicalRun++
    }

    // Add 1 grammar item if available
    if (gi < grammar.length) {
      result.push(grammar[gi])
      gi++
    }
  }

  return result
}

// ── Grammar cap ──

function applyGrammarCap(
  recommendations: CurriculumRecommendation[],
  maxGrammar: number = 2
): CurriculumRecommendation[] {
  let grammarCount = 0
  return recommendations.filter((rec) => {
    if (rec.itemType === 'grammar') {
      grammarCount++
      if (grammarCount > maxGrammar) {
        log.debug('Grammar cap reached, filtering out', {
          patternId: rec.patternId,
          grammarCount,
        })
        return false
      }
    }
    return true
  })
}

// ── Review focus identification ──

function identifyReviewFocus(
  items: BubbleItemInput[],
  tomBriefInput: ExpandedBriefInput | null
): number[] {
  const focusIds: Set<number> = new Set()

  // Items at apprentice_4 with productionWeight < 0.5 (stuck without production)
  for (const item of items) {
    if (item.masteryState === 'apprentice_4' && item.productionWeight < 0.5) {
      focusIds.add(item.id)
    }
  }

  // Items flagged as regression in ToM brief
  if (tomBriefInput) {
    const tomBrief = generateExpandedDailyBrief(tomBriefInput)
    for (const regression of tomBrief.regressions) {
      focusIds.add(regression.itemId)
    }
  }

  return Array.from(focusIds)
}

// ── Level progression check ──

function checkLevelProgression(
  bubble: KnowledgeBubble,
  items: BubbleItemInput[]
): { levelUpReady: boolean; frontierLevel: string } {
  const frontierLevel = bubble.frontierLevel

  // Find coverage for the current level
  const currentLevelBreakdown = bubble.levelBreakdowns.find(
    (lb) => lb.level === bubble.currentLevel
  )
  const currentCoverage = currentLevelBreakdown?.coverage ?? 0

  if (currentCoverage < 0.8) {
    return { levelUpReady: false, frontierLevel }
  }

  // Check if frontier level items exist in the reference corpus but not all
  // are already in the learner's DB
  const corpus = loadJapaneseReferenceCorpus()
  const frontierVocab = corpus.vocabulary.filter(
    (v) => v.cefrLevel === frontierLevel
  )
  const frontierGrammar = corpus.grammar.filter(
    (g) => g.cefrLevel === frontierLevel
  )
  const totalFrontierInCorpus = frontierVocab.length + frontierGrammar.length

  if (totalFrontierInCorpus === 0) {
    return { levelUpReady: false, frontierLevel }
  }

  // Count how many frontier items are already in the learner's items
  const learnerFrontierItems = items.filter(
    (i) => (i.cefrLevel ?? 'A1') === frontierLevel
  )

  const allInDb = learnerFrontierItems.length >= totalFrontierInCorpus
  const levelUpReady = !allInDb

  log.debug('Level progression check', {
    currentLevel: bubble.currentLevel,
    currentCoverage,
    frontierLevel,
    totalFrontierInCorpus,
    learnerFrontierItems: learnerFrontierItems.length,
    levelUpReady,
  })

  return { levelUpReady, frontierLevel }
}

// ── Spine-aware planning ──

/**
 * Determine the current spine unit and generate spine-aware recommendations.
 * Falls back to frequency-based scoring if no spine exists for the level.
 */
function generateSpineAwarePlan(
  input: PlannerInput,
  pacing: { dailyNewTarget: number; reason: string }
): {
  recommendations: CurriculumRecommendation[]
  currentUnit?: UnitProgress
  readyChunks?: ChunkTriggerResult[]
} {
  const { bubble, items, knownSurfaceForms, knownPatternIds, tomBriefInput } = input

  try {
    const spine = loadCurriculumSpine()
    if (spine.units.length === 0) {
      log.debug('No spine units available, falling back to frequency scoring')
      return { recommendations: generateFrequencyRecommendations(input, pacing) }
    }

    // Find completed units
    const completedUnitIds: string[] = []
    for (const unit of spine.units) {
      const progress = getUnitProgress(unit.unitId, items)
      if (progress && progress.coreItemsComplete) {
        completedUnitIds.push(unit.unitId)
      }
    }

    // Get next unit
    const nextUnit = getNextUnit(completedUnitIds, items)
    if (!nextUnit) {
      log.debug('All spine units complete, falling back to frequency scoring')
      return { recommendations: generateFrequencyRecommendations(input, pacing) }
    }

    log.debug('Spine-aware planning', {
      currentUnit: nextUnit.unitId,
      title: nextUnit.title,
      completedUnits: completedUnitIds.length,
    })

    // Get spine boosts for recommender
    const spineBoosts = getSpineBoosts(nextUnit.unitId)

    // Generate recommendations with spine boosts
    const recommendations = generateRecommendations({
      bubble,
      knownSurfaceForms,
      knownPatternIds,
      dailyNewItemLimit: pacing.dailyNewTarget,
      tomBriefInput,
      spineBoosts,
    })

    // Evaluate chunk triggers
    const allTriggers = evaluateChunkTriggers(items)
    const readyChunks = allTriggers.filter((t) => t.ready)

    // Compute unit progress
    const currentUnit = getUnitProgress(nextUnit.unitId, items)

    return { recommendations, currentUnit: currentUnit ?? undefined, readyChunks }
  } catch (e) {
    log.debug('Spine loading failed, falling back to frequency scoring', { error: String(e) })
    return { recommendations: generateFrequencyRecommendations(input, pacing) }
  }
}

function generateFrequencyRecommendations(
  input: PlannerInput,
  pacing: { dailyNewTarget: number; reason: string }
): CurriculumRecommendation[] {
  return generateRecommendations({
    bubble: input.bubble,
    knownSurfaceForms: input.knownSurfaceForms,
    knownPatternIds: input.knownPatternIds,
    dailyNewItemLimit: pacing.dailyNewTarget,
    tomBriefInput: input.tomBriefInput,
  })
}

// ── Main planner function ──

export function generateCurriculumPlan(input: PlannerInput): CurriculumPlan {
  const {
    bubble,
    items,
    knownSurfaceForms,
    knownPatternIds,
    dailyNewItemLimit,
    dueReviewCount,
    recentAccuracy,
    tomBriefInput,
  } = input

  log.info('Generating curriculum plan', {
    currentLevel: bubble.currentLevel,
    frontierLevel: bubble.frontierLevel,
    dueReviewCount,
    recentAccuracy,
    dailyNewItemLimit,
    totalItems: items.length,
  })

  const elapsed = log.timer()

  // Step 1: Compute pacing
  const pacing = computePacing(dailyNewItemLimit, dueReviewCount, recentAccuracy)
  log.debug('Pacing computed', {
    dailyNewTarget: pacing.dailyNewTarget,
    reason: pacing.reason,
  })

  // Step 2: Generate spine-aware recommendations (falls back to frequency if no spine)
  const { recommendations: baseRecs, currentUnit, readyChunks } =
    generateSpineAwarePlan(input, pacing)

  let recommendations = baseRecs
  log.debug('Base recommendations generated', {
    count: recommendations.length,
    spineUnit: currentUnit?.unitId,
  })

  // Step 3: Prerequisite gating — filter out grammar with unmet prereqs
  recommendations = filterByPrerequisites(recommendations, items)
  log.debug('After prerequisite gating', { count: recommendations.length })

  // Step 4: Grammar cap — max 2 grammar items per daily plan
  recommendations = applyGrammarCap(recommendations, 2)
  log.debug('After grammar cap', { count: recommendations.length })

  // Step 5: Variety balancing — don't stack too many of the same type
  recommendations = balanceVariety(recommendations)
  log.debug('After variety balancing', { count: recommendations.length })

  // Step 6: Identify review focus items
  const reviewFocus = identifyReviewFocus(items, tomBriefInput)
  log.debug('Review focus identified', { count: reviewFocus.length })

  // Step 7: Check level progression readiness
  const { levelUpReady, frontierLevel } = checkLevelProgression(bubble, items)

  const plan: CurriculumPlan = {
    newItems: recommendations,
    reviewFocus,
    pacing,
    levelUpReady,
    frontierLevel,
    currentUnit,
    readyChunks,
  }

  log.info('Curriculum plan generated', {
    newItems: plan.newItems.length,
    reviewFocusItems: plan.reviewFocus.length,
    dailyNewTarget: plan.pacing.dailyNewTarget,
    pacingReason: plan.pacing.reason,
    levelUpReady: plan.levelUpReady,
    frontierLevel: plan.frontierLevel,
    currentUnit: plan.currentUnit?.unitId,
    readyChunks: plan.readyChunks?.length,
    elapsedMs: elapsed(),
  })

  return plan
}
