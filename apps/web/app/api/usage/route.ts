import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-helpers'
import { prisma } from '@lingle/db'
import { getDailyLimitSeconds, type PlanType } from '@/lib/plan-limits'

export const GET = withAuth(async (_request, { userId }) => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [usage, subscription, activeLessons] = await Promise.all([
    prisma.dailyUsage.findUnique({
      where: { userId_date: { userId, date: today } },
    }),
    prisma.subscription.findUnique({ where: { userId } }),
    // Find active lessons (no endedAt yet = still in progress)
    prisma.lesson.findMany({
      where: {
        userId,
        endedAt: null,
        startedAt: { gte: today },
      },
      select: { startedAt: true },
    }),
  ])

  const plan: PlanType = subscription?.plan === 'pro' ? 'pro' : 'free'
  const limitSeconds = getDailyLimitSeconds(plan)
  const completedSeconds = usage?.conversationSeconds ?? 0

  // Add live elapsed time from any active lessons
  let liveSeconds = 0
  for (const lesson of activeLessons) {
    liveSeconds += Math.floor((Date.now() - lesson.startedAt.getTime()) / 1000)
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
