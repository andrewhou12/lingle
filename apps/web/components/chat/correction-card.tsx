'use client'

interface CorrectionCardProps {
  original: string
  corrected: string
  explanation: string
  grammarPoint?: string
}

export function CorrectionCard({ original, corrected, explanation, grammarPoint }: CorrectionCardProps) {
  return (
    <div className="my-2 flex flex-col gap-1.5">
      {/* Before → After on one visual line */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[13.5px] font-jp-clean text-text-muted line-through decoration-accent-warm/40">{original}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" className="text-text-placeholder shrink-0">
          <path d="M1 6h9M7 3l3 3-3 3" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="text-[13.5px] font-jp-clean font-medium text-text-primary">{corrected}</span>
      </div>

      {/* Explanation — compact */}
      <div className="flex items-baseline gap-1.5">
        {grammarPoint && (
          <span className="text-[10.5px] font-medium text-accent-warm bg-warm-soft rounded px-1.5 py-px shrink-0">{grammarPoint}</span>
        )}
        <span className="text-[12px] text-text-secondary leading-[1.5]">{explanation}</span>
      </div>
    </div>
  )
}

export function CorrectionCardSkeleton() {
  return (
    <div className="my-2 flex flex-col gap-1.5 animate-pulse">
      <div className="flex items-center gap-2">
        <div className="h-4 w-20 bg-bg-hover rounded" />
        <div className="h-4 w-24 bg-bg-hover rounded" />
      </div>
      <div className="h-3 w-40 bg-bg-hover rounded" />
    </div>
  )
}
