import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-helpers'
import { prisma } from '@lingle/db'
import type { Prisma } from '@prisma/client'
import {
  normalizePlan,
  isConversationPlan,
  isTutorPlan,
  type SessionPlan,
  type ConversationPlan,
  type TutorPlan,
} from '@/lib/session-plan'

export const POST = withAuth(async (request) => {
  const { sessionId, updates } = await request.json()

  if (!sessionId || typeof sessionId !== 'string') {
    return NextResponse.json({ error: 'sessionId is required' }, { status: 400 })
  }

  const session = await prisma.conversationSession.findUniqueOrThrow({
    where: { id: sessionId },
    select: { sessionPlan: true, mode: true },
  })

  const plan = normalizePlan(session.sessionPlan, session.mode)

  let updated: SessionPlan

  if (isConversationPlan(plan)) {
    // Conversation: update scene fields
    const p: ConversationPlan = { ...plan }
    if (updates.topic) p.topic = updates.topic
    if (updates.register) p.register = updates.register
    if (updates.tone) p.tone = updates.tone
    if (updates.setting !== undefined) p.setting = updates.setting || undefined
    if (updates.tension !== undefined) p.tension = updates.tension || undefined
    if (updates.dynamic !== undefined) p.dynamic = updates.dynamic || undefined
    if (updates.culturalContext !== undefined) p.culturalContext = updates.culturalContext || undefined
    if (updates.persona) p.persona = { ...p.persona, ...updates.persona }
    updated = p
  } else if (isTutorPlan(plan)) {
    // Tutor: update lesson fields
    const p: TutorPlan = { ...plan, steps: plan.steps.map((s) => ({ ...s })), concepts: [...plan.concepts] }
    if (updates.topic) p.topic = updates.topic
    if (updates.objective) p.objective = updates.objective
    if (updates.steps) p.steps = updates.steps
    if (updates.concepts) p.concepts = updates.concepts
    if (updates.exerciseTypes) p.exerciseTypes = updates.exerciseTypes
    updated = p
  } else {
    // Immersion/reference: legacy merge
    const p = { ...plan } as SessionPlan & Record<string, unknown>
    if (updates.focus) (p as { focus: string }).focus = updates.focus
    if (updates.goals) (p as { goals: string[] }).goals = updates.goals
    if (updates.approach) (p as { approach: string }).approach = updates.approach
    if (updates.milestones) (p as { milestones: Array<{ description: string; completed: boolean }> }).milestones = updates.milestones
    if (updates.targetVocabulary && 'targetVocabulary' in p) {
      (p as { targetVocabulary?: string[] }).targetVocabulary = updates.targetVocabulary
    }
    updated = p as SessionPlan
  }

  await prisma.conversationSession.update({
    where: { id: sessionId },
    data: { sessionPlan: updated as unknown as Prisma.InputJsonValue },
  })

  return NextResponse.json({ plan: updated })
})
