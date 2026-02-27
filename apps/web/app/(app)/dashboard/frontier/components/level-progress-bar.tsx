import type { LevelBreakdown } from '@linguist/shared/types'
import { cn } from '@/lib/utils'

interface LevelProgressBarProps {
  level: LevelBreakdown
  isCurrent: boolean
  isFrontier: boolean
  isAboveFrontier: boolean
}

export function LevelProgressBar({
  level,
  isCurrent,
  isFrontier,
  isAboveFrontier,
}: LevelProgressBarProps) {
  const coveragePct = Math.round(level.coverage * 100)
  const productionPct =
    level.totalReferenceItems > 0
      ? Math.round((level.productionReady / level.totalReferenceItems) * 100)
      : 0

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-md',
        isCurrent && 'border border-accent-brand bg-[rgba(47,47,47,.04)]',
        isFrontier && !isCurrent && 'border border-dashed border-border-strong',
        !isCurrent && !isFrontier && 'border border-transparent'
      )}
      style={{ opacity: isAboveFrontier ? 0.4 : 1 }}
    >
      <span className="text-[13px] font-bold w-8 shrink-0">
        {level.level}
      </span>

      <div className="flex-1 relative h-5 rounded-sm">
        <div className="absolute inset-0 bg-bg-active rounded-sm" />
        <div
          className="absolute top-0 left-0 bottom-0 bg-[rgba(47,47,47,.15)] rounded-sm transition-[width] duration-300 ease-in-out"
          style={{ width: `${coveragePct}%` }}
        />
        <div
          className="absolute top-0 left-0 bottom-0 bg-accent-brand rounded-sm transition-[width] duration-300 ease-in-out"
          style={{ width: `${productionPct}%` }}
        />
      </div>

      <span className="text-[11px] text-text-muted w-12 text-right shrink-0">
        {coveragePct}%
      </span>

      <span className="text-[11px] text-text-muted w-[60px] text-right shrink-0">
        {level.knownItems}/{level.totalReferenceItems}
      </span>
    </div>
  )
}
