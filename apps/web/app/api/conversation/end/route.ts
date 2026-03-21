/**
 * POST /api/conversation/end
 *
 * Called when a voice session ends. Reads final Redis state,
 * runs the 5-step post-session pipeline, updates the lesson record,
 * and cleans up Redis.
 */
import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-helpers'
import { prisma } from '@lingle/db'
import { getSessionState, deleteSessionState } from '@/lib/redis'
import { runPostSessionPipeline } from '@/lib/post-session-pipeline'

export const maxDuration = 120

export const POST = withAuth(async (request, { userId }) => {
  void userId
  const { sessionId } = await request.json()

  const dbLesson = await prisma.lesson.findUnique({ where: { id: sessionId } })
  if (!dbLesson) return NextResponse.json(null)

  const duration = Math.floor((Date.now() - dbLesson.startedAt.getTime()) / 1000)
  const durationMinutes = Math.floor(duration / 60)

  // ── Read session state from Redis ──
  const sessionState = await getSessionState(sessionId)

  // ── Update lesson timing ──
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  await Promise.all([
    prisma.lesson.update({
      where: { id: sessionId },
      data: {
        endedAt: new Date(),
        durationMinutes,
      },
    }),
    prisma.dailyUsage.upsert({
      where: { userId_date: { userId: dbLesson.userId, date: today } },
      create: {
        userId: dbLesson.userId,
        date: today,
        conversationSeconds: duration,
      },
      update: {
        conversationSeconds: { increment: duration },
      },
    }),
    prisma.user.update({
      where: { id: dbLesson.userId },
      data: {
        totalMinutes: { increment: durationMinutes },
      },
    }),
  ])

  // ── Run post-session pipeline ──
  let pipelineResult = null
  if (sessionState) {
    try {
      pipelineResult = await runPostSessionPipeline(sessionId, sessionState)
    } catch (err) {
      console.error('[end] Pipeline failed:', err)
      // Mark pipeline as failed
      await prisma.lesson.update({
        where: { id: sessionId },
        data: { pipelineStage: 'error_classification' },
      }).catch(() => {})
    }
  }

  // ── Clean up Redis ──
  if (sessionState) {
    deleteSessionState(sessionId)
      .catch((err) => console.error('[end] Redis cleanup failed:', err))
  }

  return NextResponse.json({
    cefrDelta: pipelineResult
      ? {
          grammarDelta: pipelineResult.summary.cefrUpdate.grammar.after - pipelineResult.summary.cefrUpdate.grammar.before,
          fluencyDelta: pipelineResult.summary.cefrUpdate.fluency.after - pipelineResult.summary.cefrUpdate.fluency.before,
        }
      : { grammarDelta: 0, fluencyDelta: 0 },
    errorsCount: pipelineResult?.errors.length ?? 0,
    correctionsDoc: pipelineResult?.errors
      .filter((e) => e.severity === 'major' || e.severity === 'minor')
      .map((e, i) => `${i + 1}. "${e.userUtterance}" → "${e.correction}"\n   ${e.errorDetail}`)
      .join('\n\n') || null,
    sessionSummary: pipelineResult?.summary ?? null,
  })
})
