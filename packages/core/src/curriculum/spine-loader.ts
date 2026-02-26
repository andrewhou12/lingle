import type {
  SpineUnit,
  SpineItemRef,
  ChunkTrigger,
  MasteryState,
  UnitProgress,
  ChunkTriggerResult,
} from '@linguist/shared/types'
import type { BubbleItemInput } from './bubble'
import spineData from './data/curriculum-spine.json'
import { createLogger } from '../logger'

const log = createLogger('core:spine-loader')

// ── Types ──

interface CurriculumSpine {
  units: SpineUnit[]
}

// ── Cache ──

let cachedSpine: CurriculumSpine | null = null

/**
 * Load and cache the curriculum spine JSON.
 */
export function loadCurriculumSpine(): CurriculumSpine {
  if (cachedSpine) return cachedSpine
  cachedSpine = { units: spineData as unknown as SpineUnit[] }
  log.debug('Curriculum spine loaded', { unitCount: cachedSpine.units.length })
  return cachedSpine
}

/**
 * Get a single unit by ID.
 */
export function getUnitById(unitId: string): SpineUnit | undefined {
  const spine = loadCurriculumSpine()
  return spine.units.find((u) => u.unitId === unitId)
}

/**
 * Determine which unit the learner should work on next.
 * Returns the first unit whose prerequisites are all completed
 * and is not itself fully completed.
 */
export function getNextUnit(
  completedUnitIds: string[],
  learnerItems?: BubbleItemInput[]
): SpineUnit | undefined {
  const spine = loadCurriculumSpine()
  const completedSet = new Set(completedUnitIds)

  for (const unit of spine.units) {
    // Skip already completed units
    if (completedSet.has(unit.unitId)) continue

    // Check prerequisites
    const prereqsMet = unit.prerequisites.every((p) => completedSet.has(p))
    if (!prereqsMet) continue

    // If we have learner items, check if unit is actually incomplete
    if (learnerItems) {
      const progress = getUnitProgress(unit.unitId, learnerItems)
      if (progress && progress.completionPercent >= 100) {
        continue
      }
    }

    return unit
  }

  return undefined
}

/**
 * Find which unit contains a given reference ID (vocab, grammar, collocation, chunk, or pragmatic formula).
 */
export function getUnitForItem(refId: string): SpineUnit | undefined {
  const spine = loadCurriculumSpine()

  for (const unit of spine.units) {
    const allItems: SpineItemRef[] = [
      ...unit.vocabulary,
      ...unit.grammar,
      ...unit.collocations,
      ...unit.chunks,
      ...unit.pragmaticFormulas,
    ]
    if (allItems.some((item) => item.refId === refId)) {
      return unit
    }
  }

  return undefined
}

// Mastery states considered "known" for unit progress
const KNOWN_STATES = new Set<string>([
  'apprentice_3',
  'apprentice_4',
  'journeyman',
  'expert',
  'master',
  'burned',
])

/**
 * Compute completion percentage for a unit.
 * Only counts core items for the "complete" threshold.
 */
export function getUnitProgress(
  unitId: string,
  learnerItems: BubbleItemInput[]
): UnitProgress | undefined {
  const unit = getUnitById(unitId)
  if (!unit) return undefined

  // Build lookup sets from learner items
  const knownSurfaces = new Set<string>()
  const knownPatterns = new Set<string>()
  for (const item of learnerItems) {
    if (KNOWN_STATES.has(item.masteryState)) {
      if (item.surfaceForm) knownSurfaces.add(item.surfaceForm)
      if (item.patternId) knownPatterns.add(item.patternId)
    }
  }

  // Count all items and known items
  const allItems: SpineItemRef[] = [
    ...unit.vocabulary,
    ...unit.grammar,
    ...unit.collocations,
    ...unit.chunks,
    ...unit.pragmaticFormulas,
  ]
  const coreItems = allItems.filter((i) => i.role === 'core')

  let knownCount = 0
  let coreKnownCount = 0

  for (const item of allItems) {
    const isKnown = isItemKnown(item, knownSurfaces, knownPatterns)
    if (isKnown) knownCount++
    if (isKnown && item.role === 'core') coreKnownCount++
  }

  const completionPercent =
    allItems.length > 0 ? Math.round((knownCount / allItems.length) * 100) : 0
  const coreComplete = coreItems.length > 0 ? coreKnownCount >= coreItems.length : true

  return {
    unitId: unit.unitId,
    unitNumber: unit.unitNumber,
    title: unit.title,
    totalItems: allItems.length,
    knownItems: knownCount,
    completionPercent,
    coreItemsComplete: coreComplete,
  }
}

function isItemKnown(
  item: SpineItemRef,
  knownSurfaces: Set<string>,
  knownPatterns: Set<string>
): boolean {
  // Check by surfaceForm (vocabulary, collocations, chunks, pragmatic formulas)
  if (item.surfaceForm && knownSurfaces.has(item.surfaceForm)) return true
  if (item.phrase && knownSurfaces.has(item.phrase)) return true
  // Check by name/refId for grammar
  if (item.refId.startsWith('n5_') || item.refId.startsWith('n4_') || item.refId.startsWith('n3_')) {
    if (knownPatterns.has(item.refId)) return true
  }
  return false
}

/**
 * Evaluate which chunks are ready to be introduced based on the learner's current knowledge.
 * A chunk is "ready" when all its required component items meet the mastery threshold.
 */
export function evaluateChunkTriggers(
  learnerItems: BubbleItemInput[]
): ChunkTriggerResult[] {
  const spine = loadCurriculumSpine()
  const results: ChunkTriggerResult[] = []

  // Build mastery lookup
  const masteryBySurface = new Map<string, string>()
  const masteryByPattern = new Map<string, string>()
  for (const item of learnerItems) {
    if (item.surfaceForm) masteryBySurface.set(item.surfaceForm, item.masteryState)
    if (item.patternId) masteryByPattern.set(item.patternId, item.masteryState)
  }

  const MASTERY_ORDER: MasteryState[] = [
    'unseen' as MasteryState,
    'introduced' as MasteryState,
    'apprentice_1' as MasteryState,
    'apprentice_2' as MasteryState,
    'apprentice_3' as MasteryState,
    'apprentice_4' as MasteryState,
    'journeyman' as MasteryState,
    'expert' as MasteryState,
    'master' as MasteryState,
    'burned' as MasteryState,
  ]

  function meetsThreshold(currentState: string | undefined, threshold: MasteryState): boolean {
    if (!currentState) return false
    const currentIdx = MASTERY_ORDER.indexOf(currentState as MasteryState)
    const thresholdIdx = MASTERY_ORDER.indexOf(threshold)
    return currentIdx >= thresholdIdx
  }

  for (const unit of spine.units) {
    for (const trigger of unit.chunkTriggers) {
      const missingComponents: string[] = []

      for (const reqId of trigger.requiredItems) {
        // Check if it's a grammar pattern or vocabulary item
        const grammarMastery = masteryByPattern.get(reqId)
        const vocabMastery = masteryBySurface.get(reqId)
        const mastery = grammarMastery ?? vocabMastery

        if (!meetsThreshold(mastery, trigger.masteryThreshold)) {
          missingComponents.push(reqId)
        }
      }

      // Find the chunk's phrase from the unit
      const chunkRef = [...unit.chunks, ...unit.collocations].find(
        (c) => c.refId === trigger.chunkRefId
      )

      results.push({
        referenceId: trigger.chunkRefId,
        phrase: chunkRef?.phrase ?? trigger.chunkRefId,
        itemKind: trigger.chunkRefId.startsWith('coll-')
          ? 'collocation'
          : trigger.chunkRefId.startsWith('prag-')
            ? 'pragmatic_formula'
            : 'chunk',
        ready: missingComponents.length === 0,
        reason:
          missingComponents.length === 0
            ? 'All component items meet mastery threshold'
            : `Missing: ${missingComponents.join(', ')}`,
        missingComponents,
      })
    }
  }

  log.debug('Chunk triggers evaluated', {
    total: results.length,
    ready: results.filter((r) => r.ready).length,
  })

  return results
}

/**
 * Get all items from the current unit that should get a score boost in recommendations.
 * Returns a map of refId -> boost value (1.0 for core, 0.5 for supporting).
 */
export function getSpineBoosts(
  currentUnitId: string
): Map<string, number> {
  const unit = getUnitById(currentUnitId)
  if (!unit) return new Map()

  const boosts = new Map<string, number>()
  const allItems: SpineItemRef[] = [
    ...unit.vocabulary,
    ...unit.grammar,
    ...unit.collocations,
    ...unit.chunks,
    ...unit.pragmaticFormulas,
  ]

  for (const item of allItems) {
    boosts.set(item.refId, item.role === 'core' ? 1.0 : 0.5)
    // Also boost by surfaceForm for vocabulary matching
    if (item.surfaceForm) {
      boosts.set(item.surfaceForm, item.role === 'core' ? 1.0 : 0.5)
    }
    if (item.phrase) {
      boosts.set(item.phrase, item.role === 'core' ? 1.0 : 0.5)
    }
  }

  return boosts
}
