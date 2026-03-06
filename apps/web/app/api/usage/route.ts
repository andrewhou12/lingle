import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-helpers'
import { prisma } from '@lingle/db'
import { getDailyLimitSeconds, type PlanType } from '@/lib/plan-limits'

export const GET = withAuth(async (_request, { userId }) => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [usage, subscription, activeSessions] = await Promise.all([
    prisma.dailyUsage.findUnique({
      where: { userId_date: { userId, date: today } },
    }),
    prisma.subscription.findUnique({ where: { userId } }),
    // Find active sessions (no durationSeconds yet = still in progress)
    prisma.conversationSession.findMany({
      where: {
        userId,
        durationSeconds: null,
        timestamp: { gte: today },
      },
      select: { timestamp: true },
    }),
  ])

  const plan: PlanType = subscription?.plan === 'pro' ? 'pro' : 'free'
  const limitSeconds = getDailyLimitSeconds(plan)
  const completedSeconds = usage?.conversationSeconds ?? 0

  // Add live elapsed time from any active sessions
  let liveSeconds = 0
  for (const session of activeSessions) {
    liveSeconds += Math.floor((Date.now() - session.timestamp.getTime()) / 1000)
  }

  const usedSeconds = completedSeconds + liveSeconds

  return NextResponse.json({
    usedSeconds,
    limitSeconds: limitSeconds === Infinity ? -1 : limitSeconds,
    remainingSeconds: limitSeconds === Infinity ? -1 : Math.max(0, limitSeconds - usedSeconds),
    isLimitReached: limitSeconds !== Infinity && usedSeconds >= limitSeconds,
    plan,
  })
})
