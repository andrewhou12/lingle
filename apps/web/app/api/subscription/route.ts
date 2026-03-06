import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-helpers'
import { prisma } from '@lingle/db'

export const GET = withAuth(async (_request, { userId }) => {
  const subscription = await prisma.subscription.findUnique({ where: { userId } })

  return NextResponse.json({
    plan: subscription?.plan ?? 'free',
    status: subscription?.status ?? 'active',
    currentPeriodEnd: subscription?.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
  })
})
