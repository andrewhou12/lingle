/**
 * Longitudinal Analysis — runs after session 3+.
 *
 * Computes error density trends, persistent patterns, and speech profile
 * by analyzing the learner's full history. Writes results to LearnerModel
 * for use in future session planning.
 */
import { generateObject } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'
import { prisma } from '@lingle/db'

const analysisSchema = z.object({
  speechProfile: z.string().describe('2-3 sentence description of the learner\'s speaking style, strengths, and tendencies'),
  priorityFocus: z.string().describe('The single most important area to focus on next (e.g., "て-form conjugation" or "response speed")'),
  errorDensityTrend: z.enum(['improving', 'stable', 'declining', 'insufficient_data']),
})

export async function runLongitudinalAnalysis(
  userId: string,
  sessionsCompleted: number,
): Promise<void> {
  // Only run from session 3 onwards
  if (sessionsCompleted < 3) return

  const learnerModel = await prisma.learnerModel.findUnique({
    where: { userId },
    include: {
      errorPatterns: {
        orderBy: { occurrenceCount: 'desc' },
        take: 15,
      },
    },
  })
  if (!learnerModel) return

  // Get recent lessons for trend analysis
  const recentLessons = await prisma.lesson.findMany({
    where: { userId, endedAt: { not: null } },
    orderBy: { startedAt: 'desc' },
    take: 10,
    select: {
      durationMinutes: true,
      errorsCount: true,
      topicsCovered: true,
      vocabIntroduced: true,
      startedAt: true,
    },
  })

  if (recentLessons.length < 3) return

  // Calculate error density (errors per estimated 100 words)
  // Rough heuristic: ~15 words per minute of conversation
  const densities = recentLessons
    .filter((l) => l.durationMinutes && l.durationMinutes > 0)
    .map((l) => {
      const estimatedWords = (l.durationMinutes ?? 1) * 15
      return (l.errorsCount / estimatedWords) * 100
    })
  const avgDensity = densities.length > 0
    ? densities.reduce((a, b) => a + b, 0) / densities.length
    : null

  const errorPatternSummary = learnerModel.errorPatterns
    .map((ep) => `${ep.rule}: ${ep.occurrenceCount}x across ${ep.sessionsSeen.length} sessions`)
    .join('\n') || 'No patterns recorded yet'

  const lessonSummary = recentLessons
    .map((l, i) => `Session ${i + 1}: ${l.durationMinutes ?? '?'}min, ${l.errorsCount} errors, topics: ${l.topicsCovered.join(', ') || 'unknown'}`)
    .join('\n')

  try {
    const { object } = await generateObject({
      model: anthropic('claude-haiku-4-5-20251001'),
      schema: analysisSchema,
      prompt: `Analyze this learner's progress across ${sessionsCompleted} sessions.

CEFR scores: Grammar ${learnerModel.cefrGrammar.toFixed(1)}, Fluency ${learnerModel.cefrFluency.toFixed(1)}
Average error density: ${avgDensity?.toFixed(1) ?? 'unknown'} per 100 words

Error patterns (most frequent):
${errorPatternSummary}

Recent sessions:
${lessonSummary}

Based on this data:
1. Write a brief speech profile (strengths, tendencies, style)
2. Identify the single highest-priority focus area
3. Determine if error density is improving, stable, or declining`,
    })

    await prisma.learnerModel.update({
      where: { id: learnerModel.id },
      data: {
        speechProfile: object.speechProfile,
        priorityFocus: object.priorityFocus,
        errorDensityTrend: object.errorDensityTrend,
        errorDensityPer100Words: avgDensity,
      },
    })

    console.log(`[longitudinal] ${userId}: trend=${object.errorDensityTrend}, focus="${object.priorityFocus}"`)
  } catch (err) {
    console.error('[longitudinal] Analysis failed:', err)
    // Still update the density metric even if LLM fails
    if (avgDensity !== null) {
      await prisma.learnerModel.update({
        where: { id: learnerModel.id },
        data: { errorDensityPer100Words: avgDensity },
      }).catch(() => {})
    }
  }
}
