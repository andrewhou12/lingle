/**
 * Error Pattern Tracker — cross-session error frequency map.
 *
 * After each session, upserts error patterns from the session state
 * into the persistent ErrorPattern table. This allows the system to
 * identify recurring errors across sessions and target them in future
 * lesson plans.
 */
import { prisma } from '@lingle/db'
import type { SessionState } from '@lingle/shared'

export async function updateErrorPatterns(
  userId: string,
  sessionState: SessionState,
): Promise<void> {
  const { errorsLogged, sessionId } = sessionState
  if (errorsLogged.length === 0) return

  const learnerModel = await prisma.learnerModel.findUnique({
    where: { userId },
    select: { id: true },
  })
  if (!learnerModel) return

  // Group errors by rule
  const ruleMap = new Map<string, number>()
  for (const error of errorsLogged) {
    ruleMap.set(error.rule, (ruleMap.get(error.rule) ?? 0) + 1)
  }

  // Upsert each error pattern
  for (const [rule, count] of ruleMap) {
    await prisma.errorPattern.upsert({
      where: { userId_rule: { userId, rule } },
      create: {
        userId,
        learnerModelId: learnerModel.id,
        rule,
        language: sessionState.targetLanguage,
        occurrenceCount: count,
        lastSeenAt: new Date(),
        sessionsSeen: [sessionId],
      },
      update: {
        occurrenceCount: { increment: count },
        lastSeenAt: new Date(),
        sessionsSeen: {
          push: sessionId,
        },
      },
    })
  }

  console.log(`[error-patterns] ${userId}: upserted ${ruleMap.size} patterns from ${errorsLogged.length} errors`)
}

/**
 * Get active (unresolved) error patterns sorted by frequency.
 */
export async function getActivePatterns(
  userId: string,
  limit: number = 10,
) {
  return prisma.errorPattern.findMany({
    where: { userId },
    orderBy: { occurrenceCount: 'desc' },
    take: limit,
  })
}
