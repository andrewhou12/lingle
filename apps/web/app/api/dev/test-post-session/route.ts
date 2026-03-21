/**
 * DEV ONLY — Test the post-session pipeline with synthetic data.
 *
 * POST /api/dev/test-post-session
 * Body: { fixture?: 'beginner' | 'intermediate' | 'advanced' }
 */
import { NextResponse } from 'next/server'
import { devOnly } from '@/lib/api-helpers'
import { prisma } from '@lingle/db'
import { runPostSessionPipeline } from '@/lib/post-session-pipeline'
import { writeSessionState } from '@/lib/redis'
import { FIXTURES, FIXTURE_NAMES } from '@/lib/dev-fixtures'

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
      targetLanguage: 'ja',
    },
  })

  const fixture = FIXTURES[fixtureName]
  const sessionState = fixture(userId, lesson.id, lesson.id)

  // Write fixture state to Redis so pipeline can read it
  await writeSessionState(sessionState)

  // Run the pipeline
  try {
    const result = await runPostSessionPipeline(lesson.id, sessionState)
    return NextResponse.json({
      _dev: true,
      fixture: fixtureName,
      lessonId: lesson.id,
      errorsCount: result.errors.length,
      summary: result.summary,
    })
  } catch (err) {
    return NextResponse.json({
      _dev: true,
      fixture: fixtureName,
      lessonId: lesson.id,
      error: String(err),
    }, { status: 500 })
  }
})
