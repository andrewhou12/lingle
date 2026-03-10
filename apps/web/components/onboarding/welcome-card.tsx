'use client'

import { XMarkIcon } from '@heroicons/react/24/outline'

interface WelcomeCardProps {
  targetLanguage: string
  onDismiss: () => void
  onStart: () => void
}

export function WelcomeCard({ targetLanguage, onDismiss, onStart }: WelcomeCardProps) {
  return (
    <div className="w-full idle-entrance mb-8">
      <div className="relative bg-bg-pure border border-border rounded-xl p-6 shadow-[0_1px_2px_rgba(0,0,0,.04),0_1px_4px_rgba(0,0,0,.03)]">
        {/* Dismiss */}
        <button
          onClick={onDismiss}
          className="absolute top-3 right-3 w-6 h-6 rounded-md flex items-center justify-center bg-transparent border-none cursor-pointer text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors duration-100"
          aria-label="Dismiss"
        >
          <XMarkIcon className="w-4 h-4" />
        </button>

        <h2 className="text-[18px] font-semibold text-text-primary tracking-[-0.02em] mb-1">
          Welcome to Lingle
        </h2>
        <p className="text-[14px] text-text-secondary mb-4 leading-[1.6]">
          Here&apos;s everything you need to start your first conversation:
        </p>

        <ul className="space-y-2.5 mb-5">
          <li className="flex items-start gap-2.5 text-[13.5px] text-text-secondary leading-[1.5]">
            <span className="mt-[2px] w-5 h-5 rounded-full bg-accent-brand/10 flex items-center justify-center shrink-0 text-[11px] font-bold text-accent-brand">1</span>
            <span><strong className="text-text-primary font-medium">Pick a scenario</strong> below, or just jump in with no topic</span>
          </li>
          <li className="flex items-start gap-2.5 text-[13.5px] text-text-secondary leading-[1.5]">
            <span className="mt-[2px] w-5 h-5 rounded-full bg-accent-brand/10 flex items-center justify-center shrink-0 text-[11px] font-bold text-accent-brand">2</span>
            <span><strong className="text-text-primary font-medium">Chat or Voice</strong> &mdash; switch between typing and speaking anytime</span>
          </li>
          <li className="flex items-start gap-2.5 text-[13.5px] text-text-secondary leading-[1.5]">
            <span className="mt-[2px] w-5 h-5 rounded-full bg-accent-brand/10 flex items-center justify-center shrink-0 text-[11px] font-bold text-accent-brand">3</span>
            {targetLanguage === 'Japanese' ? (
              <span>Tap <strong className="text-text-primary font-medium font-jp">あ</strong> to type in Japanese with the built-in keyboard</span>
            ) : (
              <span>Switch your keyboard to <strong className="text-text-primary font-medium">{targetLanguage}</strong> when typing in the target language</span>
            )}
          </li>
        </ul>

        <button
          onClick={onStart}
          className="w-full py-2.5 rounded-lg bg-accent-brand text-white text-[14px] font-semibold border-none cursor-pointer transition-all duration-150 hover:scale-[1.01] hover:shadow-md active:scale-[0.99]"
          style={{ fontFamily: 'inherit' }}
        >
          Start my first session
        </button>
      </div>
    </div>
  )
}
