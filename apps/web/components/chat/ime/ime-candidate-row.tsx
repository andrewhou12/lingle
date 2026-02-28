'use client'

import { cn } from '@/lib/utils'
import { MASTERY_HEX, MASTERY_LABELS } from '@/constants/mastery'
import type { EnrichedCandidate } from '@/hooks/use-ime-mastery'

interface IMECandidateRowProps {
  candidate: EnrichedCandidate
  index: number
  isSelected: boolean
  onClick: () => void
}

export function IMECandidateRow({ candidate, index, isSelected, onClick }: IMECandidateRowProps) {
  const inWordBank = candidate.mastery !== null
  const masteryColor = inWordBank ? MASTERY_HEX[candidate.mastery!.masteryState] : undefined
  const masteryLabel = inWordBank ? MASTERY_LABELS[candidate.mastery!.masteryState] : undefined
  const isKanaOnly = candidate.meaning === '(kana)'

  return (
    <button
      className={cn(
        'flex items-center gap-2.5 w-full px-3 py-1.5 text-left border-none cursor-pointer transition-colors',
        isSelected ? 'bg-accent-brand/8' : 'bg-transparent hover:bg-bg-hover',
        !inWordBank && !isKanaOnly && 'opacity-60'
      )}
      onClick={onClick}
      data-index={index}
    >
      {/* Index number */}
      <span className="text-[11px] text-text-muted w-4 shrink-0 text-right font-mono">
        {index + 1}
      </span>

      {/* Mastery dot */}
      <span className="w-2 h-2 rounded-full shrink-0" style={{
        backgroundColor: inWordBank ? masteryColor : 'transparent',
      }} />

      {/* Surface form */}
      <span className={cn(
        'text-[14px] font-jp shrink-0',
        inWordBank ? 'text-text-primary' : 'text-text-muted'
      )}>
        {candidate.surface}
      </span>

      {/* Meaning */}
      <span className={cn(
        'text-[12px] truncate flex-1 min-w-0',
        inWordBank ? 'text-text-secondary' : 'text-text-muted'
      )}>
        {isKanaOnly ? '' : candidate.meaning}
      </span>

      {/* Mastery badge or "new to you" label */}
      <span className={cn(
        'text-[10px] font-medium shrink-0 rounded-full px-1.5 py-0.5',
        inWordBank
          ? 'border'
          : isKanaOnly
            ? 'text-text-muted'
            : 'text-text-muted'
      )} style={inWordBank ? {
        color: masteryColor,
        borderColor: masteryColor ? `${masteryColor}40` : undefined,
        backgroundColor: masteryColor ? `${masteryColor}10` : undefined,
      } : undefined}>
        {isKanaOnly ? 'kana' : inWordBank ? masteryLabel : 'new to you'}
      </span>
    </button>
  )
}
