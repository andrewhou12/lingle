'use client'

import { cn } from '@/lib/utils'

type MasteryTier = 'new' | 'apprentice' | 'journeyman' | 'expert' | 'master' | 'burned'

interface VocabTokenProps {
  surface: string
  reading?: string
  meaning?: string
  tier?: MasteryTier
  onClick?: () => void
}

const tierStyles: Record<MasteryTier, string> = {
  new: 'border-b-2 border-tier-new',
  apprentice: 'border-b-2 border-tier-app',
  journeyman: 'border-b-[1.5px] border-dotted border-tier-jour',
  expert: 'border-b border-tier-exp',
  master: '',
  burned: '',
}

export function VocabToken({ surface, reading, tier = 'new', onClick }: VocabTokenProps) {
  return (
    <span
      className={cn(
        'inline-block cursor-pointer font-jp group/token relative',
        tierStyles[tier]
      )}
      onClick={onClick}
      role="button"
      tabIndex={0}
    >
      {surface}
      {reading && (
        <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] text-text-muted bg-bg-pure px-1 rounded opacity-0 group-hover/token:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
          {reading}
        </span>
      )}
    </span>
  )
}
