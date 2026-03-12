import { NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth'
import { prisma } from '@lingle/db'
import { getStripe } from '@/lib/stripe'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const userId = await getUserId()
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

    const priceId = process.env.STRIPE_EARLY_ADOPTER_PRICE_ID || process.env.STRIPE_PRO_PRICE_ID
    if (!priceId) {
      return NextResponse.json({ error: 'Stripe price ID not configured' }, { status: 500 })
    }

    const session = await getStripe().checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/upgrade?success=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/upgrade`,
      metadata: { userId },
    })

    return NextResponse.json({ url: session.url })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[create-checkout-session]', message, err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
