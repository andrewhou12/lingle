import Stripe from 'stripe'
import { prisma } from '@lingle/db'
import { getStripe } from '@/lib/stripe'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const body = await request.text()
  const sig = request.headers.get('stripe-signature')

  if (!sig) {
    return new Response('Missing stripe-signature header', { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err) {
    console.error('[stripe/webhook] Signature verification failed:', err)
    return new Response('Webhook signature verification failed', { status: 400 })
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const userId = session.metadata?.userId
      if (userId && session.subscription) {
        const sub = await getStripe().subscriptions.retrieve(
          session.subscription as string
        )
        const firstItem = sub.items.data[0]
        await prisma.subscription.upsert({
          where: { userId },
          create: {
            userId,
            plan: 'pro',
            stripeCustomerId: session.customer as string,
            stripeSubscriptionId: sub.id,
            stripePriceId: firstItem?.price.id,
            status: 'active',
            currentPeriodStart: firstItem ? new Date(firstItem.current_period_start * 1000) : null,
            currentPeriodEnd: firstItem ? new Date(firstItem.current_period_end * 1000) : null,
          },
          update: {
            plan: 'pro',
            stripeSubscriptionId: sub.id,
            stripePriceId: firstItem?.price.id,
            status: 'active',
            currentPeriodStart: firstItem ? new Date(firstItem.current_period_start * 1000) : null,
            currentPeriodEnd: firstItem ? new Date(firstItem.current_period_end * 1000) : null,
          },
        })
      }
      break
    }

    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      const customerId = sub.customer as string
      const dbSub = await prisma.subscription.findUnique({
        where: { stripeCustomerId: customerId },
      })
      if (dbSub) {
        const isCanceled = sub.status === 'canceled'
        const firstItem = sub.items.data[0]
        await prisma.subscription.update({
          where: { stripeCustomerId: customerId },
          data: {
            plan: isCanceled ? 'free' : 'pro',
            status: sub.status,
            currentPeriodStart: firstItem ? new Date(firstItem.current_period_start * 1000) : null,
            currentPeriodEnd: firstItem ? new Date(firstItem.current_period_end * 1000) : null,
            cancelAtPeriodEnd: sub.cancel_at_period_end,
          },
        })
      }
      break
    }
  }

  return new Response('ok', { status: 200 })
}
