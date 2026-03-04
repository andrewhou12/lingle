import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-helpers'
import { prisma } from '@lingle/db'
import { buildSystemPrompt } from '@/lib/experience-prompt'
import type { Prisma } from '@prisma/client'

export const POST = withAuth(async (request, { userId }) => {
  let prompt: string | undefined
  let mode: string | undefined
  try {
    const body = await request.json()
    if (body.prompt && typeof body.prompt === 'string') {
      prompt = body.prompt
    }
    if (body.mode && typeof body.mode === 'string') {
      mode = body.mode
    }
  } catch {
    // No body or invalid JSON
  }

  const profile = await prisma.learnerProfile.findUniqueOrThrow({ where: { userId } })

  const sessionFocus = prompt || 'Free conversation'

  const systemPrompt = buildSystemPrompt({
    userPrompt: sessionFocus,
    mode: mode || 'conversation',
    difficultyLevel: profile.difficultyLevel,
    nativeLanguage: profile.nativeLanguage,
    targetLanguage: profile.targetLanguage,
  })

  const session = await prisma.conversationSession.create({
    data: {
      userId,
      transcript: [],
      targetsPlanned: {},
      targetsHit: [],
      errorsLogged: [],
      avoidanceEvents: [],
      sessionPlan: { sessionFocus } as unknown as Prisma.InputJsonValue,
      systemPrompt,
    },
  })

  await prisma.learnerProfile.update({
    where: { userId },
    data: { totalSessions: { increment: 1 } },
  })

  return NextResponse.json({ _sessionId: session.id, sessionFocus })
})
