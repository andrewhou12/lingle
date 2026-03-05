import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-helpers'
import { prisma } from '@lingle/db'
import type { Prisma } from '@prisma/client'
import type { SessionPlan } from '@/lib/session-plan'

export const POST = withAuth(async (request) => {
  const { sessionId, updates } = await request.json()

  if (!sessionId || typeof sessionId !== 'string') {
    return NextResponse.json({ error: 'sessionId is required' }, { status: 400 })
  }

  const session = await prisma.conversationSession.findUniqueOrThrow({
    where: { id: sessionId },
    select: { sessionPlan: true },
  })

  const plan = (session.sessionPlan ?? {}) as unknown as SessionPlan

  // Merge updates
  if (updates.focus) plan.focus = updates.focus
  if (updates.goals) plan.goals = updates.goals
  if (updates.approach) plan.approach = updates.approach
  if (updates.milestones) plan.milestones = updates.milestones
  if (updates.targetVocabulary) plan.targetVocabulary = updates.targetVocabulary
  if (updates.targetGrammar) plan.targetGrammar = updates.targetGrammar
  if (updates.scenario) plan.scenario = updates.scenario

  await prisma.conversationSession.update({
    where: { id: sessionId },
    data: { sessionPlan: plan as unknown as Prisma.InputJsonValue },
  })

  return NextResponse.json({ plan })
})
