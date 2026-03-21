import { NextResponse } from 'next/server'
import { generateText } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { withAuth } from '@/lib/api-helpers'
import { prisma } from '@lingle/db'
import { getSessionState, deleteSessionState } from '@/lib/redis'
import { updateCefrScores } from '@/lib/cefr-updater'
import { updateErrorPatterns } from '@/lib/error-patterns'
import { runLongitudinalAnalysis } from '@/lib/longitudinal-analysis'
import { addMemories } from '@/lib/memory'

export const maxDuration = 120

export const POST = withAuth(async (request, { userId }) => {
  void userId // used implicitly via dbLesson.userId
  const { sessionId } = await request.json()

  const dbLesson = await prisma.lesson.findUnique({ where: { id: sessionId } })
  if (!dbLesson) return NextResponse.json(null)

  const duration = Math.floor((Date.now() - dbLesson.startedAt.getTime()) / 1000)
  const durationMinutes = Math.floor(duration / 60)

  // ── Step 1: Read session state from Redis ──
  const sessionState = await getSessionState(sessionId)

  // ── Step 2: Generate title ──
  const titlePromise = (async () => {
    if (!dbLesson.lessonGoal) return undefined
    try {
      const { text } = await generateText({
        model: anthropic('claude-haiku-4-5-20251001'),
        prompt: `Generate a very short title (3-7 words, English) for a language lesson about: "${dbLesson.lessonGoal}". Do NOT use quotes.\n\nTitle:`,
        maxOutputTokens: 30,
      })
      return text.trim().replace(/^["']|["']$/g, '')
    } catch (err) {
      console.error('[end] Failed to generate session title:', err)
      return undefined
    }
  })()

  // ── Step 3: Run post-session analysis (in parallel where possible) ──
  const cefrPromise = sessionState
    ? updateCefrScores(dbLesson.userId, sessionState)
    : Promise.resolve({ grammarDelta: 0, fluencyDelta: 0 })

  const errorPatternsPromise = sessionState
    ? updateErrorPatterns(dbLesson.userId, sessionState)
    : Promise.resolve()

  const [generatedTitle, cefrResult] = await Promise.all([
    titlePromise,
    cefrPromise,
    errorPatternsPromise,
  ])

  // ── Step 4: Bulk-write error logs ──
  if (sessionState && sessionState.errorsLogged.length > 0) {
    await prisma.errorLog.createMany({
      data: sessionState.errorsLogged.map((e) => ({
        userId: dbLesson.userId,
        lessonId: sessionId,
        errorType: e.errorType,
        phrase: e.phrase,
        correction: e.correction,
        rule: e.rule,
      })),
    }).catch((err) => console.error('[end] Failed to write error logs:', err))
  }

  // ── Step 5: Generate corrections doc ──
  let correctionsDoc: string | undefined
  if (sessionState && sessionState.corrections.length > 0) {
    correctionsDoc = sessionState.corrections
      .map((c, i) => {
        let entry = `${i + 1}. "${c.phrase}" → "${c.correction}" (${c.rule})`
        if (c.explanation) entry += `\n   ${c.explanation}`
        return entry
      })
      .join('\n\n')
  }

  // ── Step 6: Update lesson record ──
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  await Promise.all([
    prisma.lesson.update({
      where: { id: sessionId },
      data: {
        endedAt: new Date(),
        durationMinutes,
        summary: generatedTitle ?? undefined,
        errorsCount: sessionState?.errorsLogged.length ?? 0,
        topicsCovered: sessionState?.topicsCovered ?? [],
        vocabIntroduced: sessionState?.vocabIntroduced ?? [],
        phasesCompleted: sessionState?.phasesCompleted?.length
          ? [...sessionState.phasesCompleted, sessionState.lessonPhase]
          : sessionState
            ? [sessionState.lessonPhase]
            : [],
        difficultyFinal: sessionState?.difficultyLevel,
        correctionsDoc,
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

  // ── Step 6b: Persist between-session data for next planner ──
  if (sessionState && (sessionState.deferredTopics?.length || sessionState.nextSessionPriority?.length)) {
    const existingPlan = dbLesson.lessonPlan as Record<string, unknown> | null
    prisma.lesson.update({
      where: { id: sessionId },
      data: {
        lessonPlan: {
          ...(existingPlan ?? {}),
          deferredTopics: sessionState.deferredTopics ?? [],
          nextSessionPriority: sessionState.nextSessionPriority ?? [],
        },
      },
    }).catch((err) => console.error('[end] Failed to persist between-session data:', err))
  }

  // ── Step 7: Memory extraction + Longitudinal analysis ──
  if (sessionState) {
    // Fire and forget — don't block the response
    addMemories(dbLesson.userId, sessionState)
      .catch((err) => console.error('[end] Memory extraction failed:', err))
  }

  const learnerModel = await prisma.learnerModel.findUnique({
    where: { userId: dbLesson.userId },
    select: { sessionsCompleted: true },
  })
  if (learnerModel) {
    runLongitudinalAnalysis(dbLesson.userId, learnerModel.sessionsCompleted)
      .catch((err) => console.error('[end] Longitudinal analysis failed:', err))
  }

  // ── Step 8: Clean up Redis ──
  if (sessionState) {
    deleteSessionState(sessionId)
      .catch((err) => console.error('[end] Redis cleanup failed:', err))
  }

  return NextResponse.json({
    cefrDelta: cefrResult,
    errorsCount: sessionState?.errorsLogged.length ?? 0,
    correctionsCount: sessionState?.corrections.length ?? 0,
    correctionsDoc: correctionsDoc || null,
  })
})
