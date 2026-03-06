'use client'

import { useRouter } from 'next/navigation'

interface UsageLimitModalProps {
  open: boolean
  onClose: () => void
  usedMinutes: number
  limitMinutes: number
}

export function UsageLimitModal({ open, onClose, usedMinutes, limitMinutes }: UsageLimitModalProps) {
  const router = useRouter()

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-bg-pure rounded-2xl shadow-pop border border-border-subtle max-w-[420px] w-full mx-4 p-8 text-center">
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
          Upgrade to Pro for unlimited practice time.
        </p>

        <div className="flex flex-col gap-2.5">
          <button
            onClick={() => router.push('/upgrade')}
            className="w-full py-2.5 px-4 rounded-lg bg-accent-brand text-white text-[14px] font-medium transition-colors hover:bg-accent-brand/90 cursor-pointer border-none"
          >
            Upgrade to Pro
          </button>
          <button
            onClick={onClose}
            className="w-full py-2.5 px-4 rounded-lg bg-transparent text-text-secondary text-[14px] font-medium transition-colors hover:bg-bg-hover cursor-pointer border-none"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  )
}
