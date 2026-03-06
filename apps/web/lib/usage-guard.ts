import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@lingle/db'
import { getDailyLimitSeconds, type PlanType } from './plan-limits'

type AuthContext = { userId: string }
type AuthHandler = (
  request: NextRequest,
  context: AuthContext
) => Promise<NextResponse | Response>

export function withUsageCheck(handler: AuthHandler): AuthHandler {
  return async (request, context) => {
    const { userId } = context

    // Read the body to get sessionId, then reconstruct for downstream handler
    const body = await request.clone().json().catch(() => ({}))
    const sessionId: string | undefined = body.sessionId

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const [usage, subscription, session] = await Promise.all([
      prisma.dailyUsage.findUnique({
        where: { userId_date: { userId, date: today } },
      }),
      prisma.subscription.findUnique({ where: { userId } }),
      sessionId
        ? prisma.conversationSession.findUnique({
            where: { id: sessionId },
            select: { timestamp: true, durationSeconds: true },
          })
        : null,
    ])

    const plan: PlanType = subscription?.plan === 'pro' ? 'pro' : 'free'
    const limitSeconds = getDailyLimitSeconds(plan)
    const completedSeconds = usage?.conversationSeconds ?? 0

    // Compute live elapsed time for the current active session
    let liveSessionSeconds = 0
    if (session && session.durationSeconds === null) {
      // Session is still active (no durationSeconds yet)
      liveSessionSeconds = Math.floor(
        (Date.now() - session.timestamp.getTime()) / 1000
      )
    }

    const totalUsedSeconds = completedSeconds + liveSessionSeconds

    if (totalUsedSeconds >= limitSeconds) {
      return NextResponse.json(
        {
          error: 'usage_limit_exceeded',
          usedSeconds: totalUsedSeconds,
          limitSeconds,
          plan,
        },
        { status: 403 }
      )
    }

    return handler(request, context)
  }
}
