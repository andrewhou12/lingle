'use client'

import { useState, useEffect } from 'react'
import { Check } from 'lucide-react'
import { api } from '@/lib/api'
import type { UsageInfo } from '@lingle/shared/types'
import { cn } from '@/lib/utils'

const FREE_FEATURES = [
  '10 minutes of conversation per day',
  'All conversation modes',
  'Session planning & analysis',
  'Vocabulary tracking',
]

const PRO_FEATURES = [
  'Unlimited conversation time',
  'All conversation modes',
  'Session planning & analysis',
  'Vocabulary tracking',
  'Voice mode',
  'Priority support',
]

export default function UpgradePage() {
  const [usage, setUsage] = useState<UsageInfo | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.usageGet().then(setUsage).catch(() => {})
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

  const isPro = usage?.plan === 'pro'

  return (
    <div className="max-w-[720px] mx-auto py-8">
      <div className="text-center mb-10">
        <h1 className="text-[28px] font-semibold text-text-primary mb-2">
          {isPro ? 'You\'re on Pro' : 'Upgrade to Pro'}
        </h1>
        <p className="text-[15px] text-text-secondary">
          {isPro
            ? 'You have unlimited access to all features.'
            : 'Remove daily limits and unlock unlimited conversation practice.'}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Free tier */}
        <div className="rounded-xl border border-border-subtle bg-bg-pure p-6">
          <div className="mb-6">
            <h2 className="text-[16px] font-semibold text-text-primary mb-1">Free</h2>
            <div className="flex items-baseline gap-1">
              <span className="text-[32px] font-semibold text-text-primary">$0</span>
              <span className="text-[14px] text-text-muted">/month</span>
            </div>
          </div>

          <div className="space-y-3">
            {FREE_FEATURES.map((feature) => (
              <div key={feature} className="flex items-start gap-2.5">
                <Check size={16} className="text-text-muted mt-0.5 shrink-0" />
                <span className="text-[14px] text-text-secondary">{feature}</span>
              </div>
            ))}
          </div>

          <button
            disabled
            className="w-full mt-6 py-2.5 px-4 rounded-lg bg-bg-active text-text-muted text-[14px] font-medium border-none cursor-default"
          >
            Current plan
          </button>
        </div>

        {/* Pro tier */}
        <div className={cn(
          'rounded-xl border-2 p-6 relative',
          isPro ? 'border-green bg-green-soft/30' : 'border-accent-brand bg-bg-pure'
        )}>
          {!isPro && (
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-accent-brand text-white text-[11px] font-semibold tracking-wide uppercase px-3 py-1 rounded-full">
              Recommended
            </div>
          )}

          <div className="mb-6">
            <h2 className="text-[16px] font-semibold text-text-primary mb-1">Pro</h2>
            <div className="flex items-baseline gap-1">
              <span className="text-[32px] font-semibold text-text-primary">$12</span>
              <span className="text-[14px] text-text-muted">/month</span>
            </div>
          </div>

          <div className="space-y-3">
            {PRO_FEATURES.map((feature) => (
              <div key={feature} className="flex items-start gap-2.5">
                <Check size={16} className="text-green mt-0.5 shrink-0" />
                <span className="text-[14px] text-text-primary">{feature}</span>
              </div>
            ))}
          </div>

          {isPro ? (
            <button
              disabled
              className="w-full mt-6 py-2.5 px-4 rounded-lg bg-green text-white text-[14px] font-medium border-none cursor-default"
            >
              Active
            </button>
          ) : (
            <button
              onClick={handleUpgrade}
              disabled={loading}
              className="w-full mt-6 py-2.5 px-4 rounded-lg bg-accent-brand text-white text-[14px] font-medium border-none cursor-pointer transition-colors hover:bg-accent-brand/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Loading...' : 'Upgrade to Pro'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
