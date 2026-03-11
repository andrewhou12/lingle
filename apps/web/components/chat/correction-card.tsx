'use client'

interface CorrectionCardProps {
  original: string
  corrected: string
  explanation: string
  grammarPoint?: string
  onRetry?: (correctedText: string) => void
}

export function CorrectionCard({ original, corrected, explanation, grammarPoint, onRetry }: CorrectionCardProps) {
  return (
    <div className="my-2 bg-bg-pure border border-border rounded-xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      {/* Before → After */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[13.5px] font-jp-clean text-text-muted line-through decoration-text-placeholder/40">{original}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" className="text-text-placeholder shrink-0">
          <path d="M1 6h9M7 3l3 3-3 3" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="text-[13.5px] font-jp-clean font-semibold text-text-primary">{corrected}</span>
      </div>

      {/* Grammar point badge + explanation + retry */}
      <div className="flex items-baseline gap-2 mt-2">
        {grammarPoint && (
          <span className="text-[10.5px] font-medium text-text-secondary bg-bg-secondary rounded-full px-2 py-0.5 shrink-0">{grammarPoint}</span>
        )}
        <span className="text-[12px] text-text-muted leading-[1.5] flex-1">{explanation}</span>
        {onRetry && (
          <button
            onClick={() => onRetry(corrected)}
            className="text-[11.5px] font-medium text-accent-brand hover:text-accent-brand/80 transition-colors shrink-0 ml-1"
          >
            Try this →
          </button>
        )}
      </div>
    </div>
  )
}

export function CorrectionCardSkeleton() {
  return (
    <div className="my-2 bg-bg-pure border border-border rounded-xl p-4 animate-pulse shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="flex items-center gap-2">
        <div className="h-4 w-20 bg-bg-hover rounded" />
        <div className="h-4 w-24 bg-bg-hover rounded" />
      </div>
      <div className="h-3 w-40 bg-bg-hover rounded mt-2" />
    </div>
  )
}
