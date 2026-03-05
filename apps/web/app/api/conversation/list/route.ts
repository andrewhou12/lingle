import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-helpers'
import { prisma } from '@lingle/db'

export const GET = withAuth(async (_request, { userId }) => {
  const sessions = await prisma.conversationSession.findMany({
    where: { userId },
    orderBy: { timestamp: 'desc' },
    take: 50,
  })

  return NextResponse.json(
    sessions.map((s) => {
      const plan = (s.sessionPlan ?? {}) as Record<string, unknown>
      // Prefer AI-generated title, then topic (conversation/tutor), then focus (immersion/reference)
      const title = (plan.generatedTitle as string)
        || (plan.topic as string)
        || (plan.focus as string)
        || ''
      return {
        id: s.id,
        timestamp: s.timestamp.toISOString(),
        durationSeconds: s.durationSeconds,
        mode: s.mode ?? 'conversation',
        sessionFocus: title,
      }
    })
  )
})
