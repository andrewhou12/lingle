'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface UsageLimitModalProps {
  open: boolean
  onClose: () => void
  usedMinutes: number
  limitMinutes: number
}

export function UsageLimitModal({ open, onClose, usedMinutes, limitMinutes }: UsageLimitModalProps) {
  const router = useRouter()
  const [showHeartfelt, setShowHeartfelt] = useState(false)

  useEffect(() => {
    if (open && !localStorage.getItem('lingle:seen-limit-message')) {
      setShowHeartfelt(true)
    }
  }, [open])

  const dismissHeartfelt = () => {
    localStorage.setItem('lingle:seen-limit-message', '1')
    setShowHeartfelt(false)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-bg-pure rounded-2xl shadow-pop border border-border-subtle max-w-[480px] w-full mx-4 overflow-hidden">
        {showHeartfelt ? (
          <div className="p-8">
            <p className="text-[14px] text-text-secondary leading-[1.75] mb-4">
              Hey — you just hit the daily free limit, and I know that&apos;s frustrating. I&apos;m sorry about that!
            </p>
            <p className="text-[14px] text-text-secondary leading-[1.75] mb-4">
              I want to be honest with you. Lingle is really early — it&apos;s just me and a tiny team, and we&apos;re building this because we genuinely believe language learning can be so much better than what&apos;s out there right now. We want to build something that learners actually <em>want</em> to use every day.
            </p>
            <p className="text-[14px] text-text-secondary leading-[1.75] mb-4">
              We&apos;re shipping improvements every week, and we&apos;re extremely responsive — if something feels off or you have ideas, please tell us. We genuinely want to hear it. This is your product as much as ours.
            </p>
            <p className="text-[14px] text-text-secondary leading-[1.75] mb-4">
              If you become an early adopter, you lock in $5/mo forever — even as the product gets better. That&apos;s our promise to the people who believed in us early. And if you can&apos;t pay, that&apos;s totally fine too — we have a free option where you help us build Lingle instead!
            </p>
            <p className="text-[14px] text-text-primary font-medium leading-[1.75] mb-1">
              Either way, thank you for being here. It means a lot.
            </p>
            <p className="text-[13px] text-text-muted mb-6">— Andrew & the Lingle team</p>
            <button
              onClick={dismissHeartfelt}
              className="w-full py-2.5 px-4 rounded-lg bg-accent-brand text-white text-[14px] font-medium transition-colors hover:bg-accent-brand/90 cursor-pointer border-none"
            >
              See my options
            </button>
          </div>
        ) : (
          <div className="p-8 text-center">
            <div className="w-12 h-12 rounded-full bg-warm-soft flex items-center justify-center mx-auto mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent-warm">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>

            <h2 className="text-[18px] font-semibold text-text-primary mb-2">
              Daily limit reached
            </h2>
            <p className="text-[14px] text-text-secondary mb-6 leading-relaxed">
              You&apos;ve used all {limitMinutes} minutes of free conversation today.
              Come back tomorrow, or become an early adopter for unlimited practice!
            </p>

            <div className="flex flex-col gap-2.5">
              <button
                onClick={() => router.push('/upgrade')}
                className="w-full py-2.5 px-4 rounded-lg bg-accent-brand text-white text-[14px] font-medium transition-colors hover:bg-accent-brand/90 cursor-pointer border-none"
              >
                Become an Early Adopter — $5/mo
              </button>
              <button
                onClick={onClose}
                className="w-full py-2.5 px-4 rounded-lg bg-transparent text-text-secondary text-[14px] font-medium transition-colors hover:bg-bg-hover cursor-pointer border-none"
              >
                Maybe later
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
