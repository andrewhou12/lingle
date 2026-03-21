/**
 * CEFR Score Updater — runs after each session.
 *
 * Evaluates the session's errors, strengths, and latency data to
 * adjust the learner's decimal CEFR scores (1.0–6.0).
 *
 * Hard rules (from research doc):
 * - Max ±0.3 per session
 * - Min ±0.05 if any data exists
 * - Grammar driven by error rate only
 * - Fluency driven by latency/flow
 */
import { generateObject } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'
import { prisma } from '@lingle/db'
import type { SessionState } from '@lingle/shared'

const cefrUpdateSchema = z.object({
  grammarDelta: z.number().describe('Change to grammar CEFR score. Positive = improvement, negative = regression. Range: -0.3 to +0.3'),
  fluencyDelta: z.number().describe('Change to fluency CEFR score. Range: -0.3 to +0.3'),
  grammarRationale: z.string().describe('Brief explanation for grammar score change'),
  fluencyRationale: z.string().describe('Brief explanation for fluency score change'),
})

function clampDelta(delta: number): number {
  // Enforce ±0.3 max, ±0.05 min (if non-zero)
  const clamped = Math.max(-0.3, Math.min(0.3, delta))
  if (clamped !== 0 && Math.abs(clamped) < 0.05) {
    return clamped > 0 ? 0.05 : -0.05
  }
  return Math.round(clamped * 100) / 100
}

function clampCefr(score: number): number {
  return Math.max(1.0, Math.min(6.0, Math.round(score * 100) / 100))
}

export async function updateCefrScores(
  userId: string,
  sessionState: SessionState,
): Promise<{ grammarDelta: number; fluencyDelta: number }> {
  const learnerModel = await prisma.learnerModel.findUnique({
    where: { userId },
  })
  if (!learnerModel) return { grammarDelta: 0, fluencyDelta: 0 }

  const errorCount = sessionState.errorsLogged.length
  const strengthCount = sessionState.strengthsNoted.length
  const avgLatency = sessionState.avgResponseLatencySec
  const elapsedMin = sessionState.elapsedMinutes

  // Skip if session was too short to evaluate
  if (elapsedMin < 2 && errorCount === 0 && strengthCount === 0) {
    return { grammarDelta: 0, fluencyDelta: 0 }
  }

  // Summarize errors by type
  const errorsByType = new Map<string, number>()
  for (const e of sessionState.errorsLogged) {
    errorsByType.set(e.errorType, (errorsByType.get(e.errorType) ?? 0) + 1)
  }
  const errorSummary = [...errorsByType.entries()]
    .map(([type, count]) => `${type}: ${count}`)
    .join(', ') || 'none'

  const strengthSummary = sessionState.strengthsNoted.slice(0, 5).join('; ') || 'none noted'

  try {
    const { object } = await generateObject({
      model: anthropic('claude-haiku-4-5-20251001'),
      schema: cefrUpdateSchema,
      prompt: `Evaluate this language learning session and determine CEFR score adjustments.

Current scores: Grammar ${learnerModel.cefrGrammar.toFixed(1)}, Fluency ${learnerModel.cefrFluency.toFixed(1)}
Session duration: ${elapsedMin} minutes
Total errors: ${errorCount} (${errorSummary})
Strengths noted: ${strengthSummary}
Average response latency: ${avgLatency.toFixed(1)}s
Difficulty level: ${sessionState.difficultyLevel}/5
Lesson phase reached: ${sessionState.lessonPhase}

Rules:
- Grammar delta: based on error rate and type. Many grammar errors = negative. Few errors at current level = slight positive.
- Fluency delta: based on response latency and session flow. Fast responses (< 2s) = positive. Slow (> 5s) = negative.
- Range: -0.3 to +0.3. Use small adjustments (±0.05 to ±0.1) for typical sessions.
- Only use larger adjustments (±0.2 to ±0.3) for clearly exceptional or poor performance.
- If insufficient data, return 0 for that dimension.`,
    })

    const grammarDelta = clampDelta(object.grammarDelta)
    const fluencyDelta = clampDelta(object.fluencyDelta)

    const newGrammar = clampCefr(learnerModel.cefrGrammar + grammarDelta)
    const newFluency = clampCefr(learnerModel.cefrFluency + fluencyDelta)

    await prisma.learnerModel.update({
      where: { id: learnerModel.id },
      data: {
        cefrGrammar: newGrammar,
        cefrFluency: newFluency,
        sessionsCompleted: { increment: 1 },
        avgResponseLatencySec: avgLatency || learnerModel.avgResponseLatencySec,
      },
    })

    console.log(`[cefr-updater] ${userId}: grammar ${learnerModel.cefrGrammar.toFixed(1)} → ${newGrammar.toFixed(1)} (${grammarDelta > 0 ? '+' : ''}${grammarDelta}), fluency ${learnerModel.cefrFluency.toFixed(1)} → ${newFluency.toFixed(1)} (${fluencyDelta > 0 ? '+' : ''}${fluencyDelta})`)

    return { grammarDelta, fluencyDelta }
  } catch (err) {
    console.error('[cefr-updater] Failed:', err)
    // Fallback: simple heuristic
    const grammarDelta = clampDelta(errorCount > 5 ? -0.1 : errorCount === 0 ? 0.05 : 0)
    const fluencyDelta = clampDelta(avgLatency < 3 ? 0.05 : avgLatency > 6 ? -0.1 : 0)

    if (grammarDelta !== 0 || fluencyDelta !== 0) {
      await prisma.learnerModel.update({
        where: { id: learnerModel.id },
        data: {
          cefrGrammar: clampCefr(learnerModel.cefrGrammar + grammarDelta),
          cefrFluency: clampCefr(learnerModel.cefrFluency + fluencyDelta),
          sessionsCompleted: { increment: 1 },
        },
      })
    }

    return { grammarDelta, fluencyDelta }
  }
}
