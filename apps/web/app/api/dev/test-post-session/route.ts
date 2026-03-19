/**
 * DEV ONLY — Test the post-session pipeline with synthetic data.
 *
 * POST /api/dev/test-post-session
 * Body: { fixture?: 'beginner' | 'intermediate' | 'advanced' }
 *
 * Creates a lesson record, runs the full post-session pipeline
 * (CEFR scoring, error patterns, memory extraction) with fixture data,
 * and returns the results.
 */
import { NextResponse } from 'next/server'
import { devOnly } from '@/lib/api-helpers'
import { prisma } from '@lingle/db'
import { updateCefrScores } from '@/lib/cefr-updater'
import { updateErrorPatterns } from '@/lib/error-patterns'
import { addMemories } from '@/lib/memory'
import { FIXTURES, FIXTURE_NAMES } from '@/lib/dev-fixtures'
import type { Prisma } from '@prisma/client'

export const POST = devOnly(async (request, { userId }) => {
  let fixtureName = 'intermediate'
  try {
    const body = await request.json()
    if (body.fixture && FIXTURE_NAMES.includes(body.fixture)) {
      fixtureName = body.fixture
    }
  } catch {}

  // Create a temporary lesson record
  const lesson = await prisma.lesson.create({
    data: {
      userId,
      targetLanguage: 'Japanese',
      lessonGoal: `[DEV TEST] ${fixtureName} fixture`,
      lessonPlan: { _dev: true, fixture: fixtureName } as unknown as Prisma.InputJsonValue,
      systemPrompt: 'dev-test',
    },
  })

  const fixture = FIXTURES[fixtureName]
  const sessionState = fixture(userId, lesson.id, lesson.id)

  // Run the pipeline (same functions as conversation/end)
  const [cefrResult] = await Promise.all([
    updateCefrScores(userId, sessionState),
    updateErrorPatterns(userId, sessionState),
  ])

  // Bulk-write error logs
  if (sessionState.errorsLogged.length > 0) {
    await prisma.errorLog.createMany({
      data: sessionState.errorsLogged.map((e) => ({
        userId,
        lessonId: lesson.id,
        errorType: e.errorType,
        phrase: e.phrase,
        correction: e.correction,
        rule: e.rule,
      })),
    }).catch((err) => console.error('[dev] Error logs failed:', err))
  }

  // Generate corrections doc
  let correctionsDoc: string | undefined
  if (sessionState.corrections.length > 0) {
    correctionsDoc = sessionState.corrections
      .map((c, i) => {
        let entry = `${i + 1}. "${c.phrase}" → "${c.correction}" (${c.rule})`
        if (c.explanation) entry += `\n   ${c.explanation}`
        return entry
      })
      .join('\n\n')
  }

  // Update lesson record
  await prisma.lesson.update({
    where: { id: lesson.id },
    data: {
      endedAt: new Date(),
      durationMinutes: sessionState.elapsedMinutes,
      errorsCount: sessionState.errorsLogged.length,
      topicsCovered: sessionState.topicsCovered,
      vocabIntroduced: sessionState.vocabIntroduced,
      correctionsDoc,
      summary: `[DEV] ${fixtureName} test session`,
    },
  })

  // Memory extraction
  let memoriesResult = null
  if (sessionState.memoriesQueued.length > 0) {
    try {
      memoriesResult = await addMemories(userId, sessionState)
    } catch (err) {
      memoriesResult = { error: String(err) }
    }
  }

  return NextResponse.json({
    _dev: true,
    fixture: fixtureName,
    lessonId: lesson.id,
    cefrDelta: cefrResult,
    errorsCount: sessionState.errorsLogged.length,
    correctionsCount: sessionState.corrections.length,
    correctionsDoc: correctionsDoc || null,
    memoriesQueued: sessionState.memoriesQueued.length,
    memoriesResult,
    sessionState,
  })
})
