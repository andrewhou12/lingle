import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-helpers'
import { prisma } from '@linguist/db'

export const GET = withAuth(async (_request, { userId }) => {
  const sessions = await prisma.conversationSession.findMany({
    where: { userId },
    orderBy: { timestamp: 'desc' },
    take: 50,
  })

  return NextResponse.json(
    sessions.map((s) => {
      const planned = s.targetsPlanned as { vocabulary?: number[]; grammar?: number[] } | null
      const plannedCount = (planned?.vocabulary?.length ?? 0) + (planned?.grammar?.length ?? 0)
      const hitArr = s.targetsHit as number[] | null
      const errArr = s.errorsLogged as unknown[] | null
      return {
        id: s.id,
        timestamp: s.timestamp.toISOString(),
        durationSeconds: s.durationSeconds,
        sessionFocus: (s.sessionPlan as { sessionFocus?: string })?.sessionFocus ?? '',
        targetsPlannedCount: plannedCount,
        targetsHitCount: Array.isArray(hitArr) ? hitArr.length : 0,
        errorsLoggedCount: Array.isArray(errArr) ? errArr.length : 0,
      }
    })
  )
})
