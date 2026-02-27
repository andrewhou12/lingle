'use client'

import { Check, X, AlertTriangle, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PostSessionAnalysis } from '@linguist/shared/types'

interface SessionSummaryCardProps {
  analysis: PostSessionAnalysis
  durationSeconds: number
  totalTargets: number
}

export function SessionSummaryCard({
  analysis,
  durationSeconds,
  totalTargets,
}: SessionSummaryCardProps) {
  const minutes = Math.max(1, Math.round(durationSeconds / 60))
  const hitCount = analysis.targetsHit?.length ?? 0
  const errorCount = analysis.errorsLogged?.length ?? 0
  const newCount = analysis.newItemsEncountered?.length ?? 0

  return (
    <div className="my-3 max-w-[520px] rounded-xl border border-border bg-bg p-4">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-accent-warm" />
          <span className="text-[15px] font-bold">Session Summary</span>
        </div>

        <div className="flex gap-4 flex-wrap">
          <div className="flex flex-col items-center gap-1">
            <span className="text-xl font-bold">{minutes}</span>
            <span className="text-[11px] text-text-muted">min</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="text-xl font-bold text-green-600">{hitCount}/{totalTargets}</span>
            <span className="text-[11px] text-text-muted">challenges</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <span
              className={cn(
                'text-xl font-bold',
                errorCount > 0 ? 'text-accent-warm' : 'text-text-muted'
              )}
            >
              {errorCount}
            </span>
            <span className="text-[11px] text-text-muted">errors</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="text-xl font-bold text-text-primary">{newCount}</span>
            <span className="text-[11px] text-text-muted">new items</span>
          </div>
        </div>

        {analysis.targetsHit && analysis.targetsHit.length > 0 && (
          <>
            <hr className="border-t border-border m-0" />
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-text-muted">Targets Hit</span>
              {analysis.targetsHit.map((id) => (
                <div key={id} className="flex items-center gap-2">
                  <Check size={12} className="text-green-600" />
                  <span className="text-[13px]">Item #{id}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {errorCount > 0 && (
          <>
            <hr className="border-t border-border m-0" />
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-text-muted">Errors</span>
              {analysis.errorsLogged.map((err, i) => (
                <div key={i} className="flex items-center gap-2">
                  <X size={12} className="text-accent-warm" />
                  <span className="text-[13px]">{err.contextQuote || `${err.errorType} on item #${err.itemId}`}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {analysis.avoidanceEvents && analysis.avoidanceEvents.length > 0 && (
          <>
            <hr className="border-t border-border m-0" />
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-text-muted">Avoidance Detected</span>
              {analysis.avoidanceEvents.map((ev, i) => (
                <div key={i} className="flex items-center gap-2">
                  <AlertTriangle size={12} className="text-amber-500" />
                  <span className="text-[13px]">{ev.contextQuote || `Item #${ev.itemId}`}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {analysis.overallAssessment && (
          <>
            <hr className="border-t border-border m-0" />
            <span className="text-[13px] text-text-muted italic">
              {analysis.overallAssessment}
            </span>
          </>
        )}
      </div>
    </div>
  )
}
