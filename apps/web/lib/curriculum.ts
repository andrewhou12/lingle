/**
 * Curriculum query helpers for lesson planning.
 *
 * Language-agnostic: all queries are parameterized by language (ISO 639-1).
 * Adding a new language = seeding curriculum data, no code changes.
 */
import { prisma } from '@lingle/db'

/** CEFR score → label */
function cefrLabel(score: number): string {
  if (score < 1.5) return 'A1'
  if (score < 2.5) return 'A2'
  if (score < 3.5) return 'B1'
  if (score < 4.5) return 'B2'
  if (score < 5.5) return 'C1'
  return 'C2'
}

/** CEFR label one level above */
function cefrLabelAbove(score: number): string {
  if (score < 1.5) return 'A2'
  if (score < 2.5) return 'B1'
  if (score < 3.5) return 'B2'
  if (score < 4.5) return 'C1'
  return 'C1'
}

/**
 * Select vocabulary targets for a session.
 * Prioritizes in_progress items, then new items at the learner's level.
 * Excludes already-mastered items.
 */
export async function getVocabTargets(
  userId: string,
  language: string,
  cefrGrammar: number,
  count: number = 5,
): Promise<string[]> {
  const level = cefrLabel(cefrGrammar)
  const nextLevel = cefrLabelAbove(cefrGrammar)

  // Get learner model to find their vocabulary items
  const learnerModel = await prisma.learnerModel.findUnique({
    where: { userId },
    select: { id: true },
  })

  // Get words already mastered or in progress
  const knownWords = learnerModel
    ? await prisma.vocabularyItem.findMany({
        where: { learnerModelId: learnerModel.id, language },
        select: { word: true, state: true },
      })
    : []

  const masteredWords = new Set(
    knownWords.filter((w) => w.state === 'mastered').map((w) => w.word),
  )
  const inProgressWords = knownWords
    .filter((w) => w.state === 'in_progress')
    .map((w) => w.word)

  // Return in-progress words first (review), then fill with new curriculum items
  const reviewTargets = inProgressWords.slice(0, Math.floor(count / 2))
  const remaining = count - reviewTargets.length

  const newVocab = await prisma.curriculumVocab.findMany({
    where: {
      language,
      cefrLevel: { in: [level, nextLevel] },
      word: { notIn: [...masteredWords, ...inProgressWords] },
    },
    orderBy: { frequencyRank: 'asc' },
    take: remaining,
    select: { word: true },
  })

  return [...reviewTargets, ...newVocab.map((v) => v.word)]
}

/**
 * Get the next grammar pattern to focus on.
 * Follows the sequence position, skipping patterns the learner has already worked on.
 */
export async function getNextGrammarFocus(
  userId: string,
  language: string,
  cefrGrammar: number,
): Promise<{ pattern: string; displayName: string } | null> {
  const level = cefrLabel(cefrGrammar)
  const nextLevel = cefrLabelAbove(cefrGrammar)

  // Get grammar patterns at or just above the learner's level
  const candidates = await prisma.curriculumGrammar.findMany({
    where: {
      language,
      cefrLevel: { in: [level, nextLevel] },
    },
    orderBy: { sequencePosition: 'asc' },
    select: { pattern: true, displayName: true },
  })

  if (candidates.length === 0) return null

  // Check which patterns have been covered in recent lessons
  const recentLessons = await prisma.lesson.findMany({
    where: { userId },
    orderBy: { startedAt: 'desc' },
    take: 10,
    select: { lessonPlan: true },
  })

  const recentPatterns = new Set<string>()
  for (const lesson of recentLessons) {
    const plan = lesson.lessonPlan as Record<string, unknown> | null
    if (plan?.grammarFocus && Array.isArray(plan.grammarFocus)) {
      for (const p of plan.grammarFocus) {
        if (typeof p === 'string') recentPatterns.add(p)
      }
    }
  }

  // Return the first pattern not recently covered
  const next = candidates.find((c) => !recentPatterns.has(c.pattern))
  return next ?? candidates[0]
}

/**
 * Select the next domain to rotate through.
 * Cycles through domains, preferring those least recently visited.
 */
const ALL_DOMAINS = [
  'food', 'travel', 'work', 'health', 'relationships',
  'hobbies', 'general', 'culture', 'technology', 'nature',
]

export function selectNextDomain(domainsVisited: string[]): string {
  // Find domain least recently visited
  for (const domain of ALL_DOMAINS) {
    if (!domainsVisited.includes(domain)) return domain
  }
  // All visited — restart rotation with the least recent
  return domainsVisited[0] || ALL_DOMAINS[0]
}

/**
 * Get grammar structures in scope for the learner's CEFR level.
 * Used by the constraint derivation system.
 */
export async function getGrammarStructuresInScope(
  language: string,
  cefrGrammar: number,
): Promise<string[]> {
  const level = cefrLabel(cefrGrammar)

  // Get all levels up to and including the learner's level
  const levelsInScope: string[] = []
  const allLevels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
  for (const l of allLevels) {
    levelsInScope.push(l)
    if (l === level) break
  }

  const patterns = await prisma.curriculumGrammar.findMany({
    where: {
      language,
      cefrLevel: { in: levelsInScope },
    },
    orderBy: { sequencePosition: 'asc' },
    select: { displayName: true },
  })

  return patterns.map((p) => p.displayName)
}
