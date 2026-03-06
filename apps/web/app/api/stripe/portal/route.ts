import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-helpers'
import { prisma } from '@lingle/db'
import { getStripe } from '@/lib/stripe'

export const dynamic = 'force-dynamic'

export const POST = withAuth(async (_request, { userId }) => {
  const subscription = await prisma.subscription.findUnique({ where: { userId } })
  if (!subscription?.stripeCustomerId) {
    return NextResponse.json({ error: 'No billing account' }, { status: 400 })
  }

  const session = await getStripe().billingPortal.sessions.create({
    customer: subscription.stripeCustomerId,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings`,
  })

  return NextResponse.json({ url: session.url })
})
