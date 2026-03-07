'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { CheckIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { api } from '@/lib/api'
import type { UsageInfo, SubscriptionInfo } from '@lingle/shared/types'
import { cn } from '@/lib/utils'

const FREE_FEATURES = [
  '10 minutes of conversation per day',
  'All conversation modes',
  'Voice mode',
]

const PRO_FEATURES = [
  'Unlimited conversation time',
  'All conversation modes',
  'Voice mode',
  'Session replay & analysis',
  'Priority support',
]

export default function PlanPage() {
  return (
    <Suspense>
      <PlanPageInner />
    </Suspense>
  )
}

function PlanPageInner() {
  const searchParams = useSearchParams()
  const success = searchParams.get('success') === 'true'
  const [usage, setUsage] = useState<UsageInfo | null>(null)
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [managingPortal, setManagingPortal] = useState(false)

  useEffect(() => {
    api.usageGet().then(setUsage).catch(() => {})
    api.subscriptionGet().then(setSubscription).catch(() => {})
  }, [])

  const handleUpgrade = async () => {
    setLoading(true)
    try {
      const { url } = await api.stripeCreateCheckout()
      if (url) window.location.href = url
    } catch (err) {
      console.error('Failed to create checkout session:', err)
      setLoading(false)
    }
  }

  const handleManage = async () => {
    setManagingPortal(true)
    try {
      const { url } = await api.stripePortal()
      if (url) window.location.href = url
    } catch (err) {
      console.error('Failed to open billing portal:', err)
      setManagingPortal(false)
    }
  }

  const isPro = usage?.plan === 'pro'
  const usedMinutes = usage ? Math.floor(usage.usedSeconds / 60) : 0
  const limitMinutes = usage && usage.limitSeconds !== -1 ? Math.floor(usage.limitSeconds / 60) : null
  const percentage = usage && limitMinutes ? Math.min(100, (usage.usedSeconds / usage.limitSeconds) * 100) : 0

  return (
    <div className="max-w-[780px] mx-auto pb-10">
      {success && (
        <div className="mb-6 p-4 rounded-xl bg-green-soft border border-green text-center">
          <p className="text-[15px] font-medium text-text-primary">You're now on Pro! Enjoy unlimited practice.</p>
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-[22px] font-semibold text-text-primary mb-1">Plan</h1>
        <p className="text-[14px] text-text-secondary">Manage your subscription and daily usage.</p>
      </div>

      {/* Status cards row */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {/* Current plan card */}
        <div className="rounded-xl border border-border bg-bg-pure p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className={cn(
              'w-10 h-10 rounded-[10px] flex items-center justify-center shrink-0 shadow-[0_1px_3px_rgba(0,0,0,.2),inset_0_1px_0_rgba(255,255,255,.08)]',
              isPro ? 'bg-green' : 'bg-accent-brand'
            )}>
              <svg width="20" height="20" viewBox="0 0 32 32" fill="none">
                <path d="M24 3 C24 3, 18 5, 14 10 C10 15, 8 21, 8 26 C9 24, 11 19, 14 14 C17 9, 21 5, 24 3 Z" stroke="white" strokeWidth="2" strokeLinejoin="round" fill="none"/>
                <path d="M24 3 C24 3, 26 7, 24 13 C22 19, 17 24, 12 27 C14 23, 17 18, 20 13 C23 8, 25 5, 24 3 Z" stroke="white" strokeWidth="2" strokeLinejoin="round" fill="none"/>
                <path d="M8 26 L7 29" stroke="white" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <div>
              <div className="text-[15px] font-semibold text-text-primary">
                {isPro ? "You're on Pro" : "You're on Free"}
              </div>
              <div className="text-[13px] text-text-muted">
                {isPro ? 'Unlimited practice' : 'Upgrade anytime'}
              </div>
            </div>
          </div>
          {isPro ? (
            <button
              onClick={handleManage}
              disabled={managingPortal}
              className="px-4 py-1.5 rounded-lg border border-border bg-bg-pure text-[13px] font-medium text-text-primary cursor-pointer transition-colors hover:bg-bg-hover disabled:opacity-50"
            >
              {managingPortal ? 'Loading...' : 'Manage'}
            </button>
          ) : (
            <button
              onClick={handleUpgrade}
              disabled={loading}
              className="px-4 py-1.5 rounded-lg bg-accent-brand text-white text-[13px] font-medium border-none cursor-pointer transition-colors hover:bg-accent-brand/90 disabled:opacity-50"
            >
              {loading ? 'Loading...' : 'Upgrade to Pro'}
            </button>
          )}
        </div>

        {/* Usage card */}
        <div className="rounded-xl border border-border bg-bg-pure p-5">
          <div className="flex justify-between items-center mb-3">
            <span className="text-[15px] font-semibold text-text-primary">
              {isPro ? 'Usage today' : 'Daily limit'}
            </span>
            {usage && (
              <span className="text-[13px] text-text-muted">
                {isPro
                  ? `${usedMinutes} min used`
                  : `${usedMinutes} of ${limitMinutes} min`}
              </span>
            )}
          </div>
          {!isPro && usage && (
            <div className="h-2 rounded-full bg-bg-active overflow-hidden mb-3">
              <div
                className={cn(
                  'h-full rounded-full transition-[width] duration-300',
                  usage.isLimitReached ? 'bg-accent-warm' : percentage >= 80 ? 'bg-[#d4a017]' : 'bg-accent-brand'
                )}
                style={{ width: `${percentage}%` }}
              />
            </div>
          )}
          <div className="space-y-2">
            {isPro ? (
              <div className="flex items-center gap-2 text-[13px] text-text-secondary">
                <CheckIcon className="w-3.5 h-3.5 text-green shrink-0" />
                <span>Unlimited conversation time</span>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 text-[13px] text-text-secondary">
                  <XMarkIcon className="w-3.5 h-3.5 text-text-muted shrink-0" />
                  <span>No unused minutes rollover</span>
                </div>
                <div className="flex items-center gap-2 text-[13px] text-text-secondary">
                  <CheckIcon className="w-3.5 h-3.5 text-text-muted shrink-0" />
                  <span>Resets daily at midnight</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Plan comparison cards */}
      <div className="grid grid-cols-2 gap-4">
        {/* Free tier */}
        <div className={cn(
          'rounded-xl border p-6',
          !isPro ? 'border-accent-brand bg-bg-pure' : 'border-border bg-bg-pure'
        )}>
          <div className="mb-5">
            <h2 className="text-[18px] font-semibold text-text-primary mb-1">Free</h2>
            <p className="text-[13px] text-text-secondary mb-4">
              Get started with daily conversation practice.
            </p>
            <div className="flex items-baseline gap-1">
              <span className="text-[36px] font-semibold text-text-primary leading-none">$0</span>
              <span className="text-[14px] text-text-muted">per month</span>
            </div>
          </div>

          {!isPro ? (
            <div className="w-full py-2 px-4 rounded-lg bg-bg-active text-text-muted text-[14px] font-medium text-center">
              Current plan
            </div>
          ) : (
            <div className="w-full py-2 px-4 rounded-lg border border-border text-text-muted text-[14px] font-medium text-center">
              Free tier
            </div>
          )}

          <div className="mt-5 pt-5 border-t border-border-subtle">
            <p className="text-[12px] font-semibold text-text-muted uppercase tracking-wider mb-3">Includes</p>
            <div className="space-y-2.5">
              {FREE_FEATURES.map((feature) => (
                <div key={feature} className="flex items-start gap-2.5">
                  <CheckIcon className="w-[15px] h-[15px] text-text-muted mt-0.5 shrink-0" />
                  <span className="text-[13px] text-text-secondary">{feature}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Pro tier */}
        <div className={cn(
          'rounded-xl border-2 p-6 relative',
          isPro ? 'border-green bg-green-soft' : 'border-accent-brand bg-bg-pure'
        )}>
          {!isPro && (
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-accent-brand text-white text-[11px] font-semibold tracking-wide uppercase px-3 py-1 rounded-full">
              Recommended
            </div>
          )}

          <div className="mb-5">
            <h2 className="text-[18px] font-semibold text-text-primary mb-1">Pro</h2>
            <p className="text-[13px] text-text-secondary mb-4">
              Unlimited practice for serious learners.
            </p>
            <div className="flex items-baseline gap-1">
              <span className="text-[36px] font-semibold text-text-primary leading-none">$8</span>
              <span className="text-[14px] text-text-muted">per month</span>
            </div>
          </div>

          {isPro ? (
            <button
              onClick={handleManage}
              disabled={managingPortal}
              className="w-full py-2 px-4 rounded-lg bg-green text-white text-[14px] font-medium border-none cursor-pointer transition-colors hover:opacity-90 disabled:opacity-50"
            >
              {managingPortal ? 'Loading...' : 'Manage subscription'}
            </button>
          ) : (
            <button
              onClick={handleUpgrade}
              disabled={loading}
              className="w-full py-2 px-4 rounded-lg bg-accent-brand text-white text-[14px] font-medium border-none cursor-pointer transition-colors hover:bg-accent-brand/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Loading...' : 'Upgrade to Pro'}
            </button>
          )}

          <div className="mt-5 pt-5 border-t border-border-subtle">
            <p className="text-[12px] font-semibold text-text-muted uppercase tracking-wider mb-3">Everything in Free, plus</p>
            <div className="space-y-2.5">
              {PRO_FEATURES.filter(f => !FREE_FEATURES.includes(f)).map((feature) => (
                <div key={feature} className="flex items-start gap-2.5">
                  <CheckIcon className="w-[15px] h-[15px] text-green mt-0.5 shrink-0" />
                  <span className="text-[13px] text-text-primary">{feature}</span>
                </div>
              ))}
            </div>
          </div>

          {subscription?.cancelAtPeriodEnd && subscription.currentPeriodEnd && (
            <div className="mt-4 p-3 rounded-lg bg-warm-soft border border-accent-warm/20">
              <p className="text-[13px] text-accent-warm">
                Your plan cancels at the end of the billing period ({new Date(subscription.currentPeriodEnd).toLocaleDateString()}).
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
