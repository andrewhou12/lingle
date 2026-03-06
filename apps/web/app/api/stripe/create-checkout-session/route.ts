import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-helpers'
import { prisma } from '@lingle/db'
import { getStripe } from '@/lib/stripe'

export const dynamic = 'force-dynamic'

export const POST = withAuth(async (_request, { userId }) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
  let subscription = await prisma.subscription.findUnique({ where: { userId } })

  // Lazy Stripe customer creation
  let customerId = subscription?.stripeCustomerId
  if (!customerId) {
    const customer = await getStripe().customers.create({
      email: user.email ?? undefined,
      metadata: { userId },
    })
    customerId = customer.id

    subscription = await prisma.subscription.upsert({
      where: { userId },
      create: { userId, stripeCustomerId: customerId },
      update: { stripeCustomerId: customerId },
    })
  }

  const session = await getStripe().checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: process.env.STRIPE_PRO_PRICE_ID!, quantity: 1 }],
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/upgrade?success=true`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/upgrade`,
    metadata: { userId },
  })

  return NextResponse.json({ url: session.url })
})
