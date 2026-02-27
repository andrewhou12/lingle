'use client'

import { Target, X, AlertTriangle, BarChart3 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SessionAnalysisPanelProps {
  targetsPlanned: { vocabulary: number[]; grammar: number[] }
  targetsHit: number[]
  errorsLogged: Array<{ itemId: number; errorType: string; contextQuote: string }>
  avoidanceEvents: Array<{ itemId: number; contextQuote: string }>
  durationSeconds: number | null
}

export function SessionAnalysisPanel({
  targetsPlanned,
  targetsHit,
  errorsLogged,
  avoidanceEvents,
  durationSeconds,
}: SessionAnalysisPanelProps) {
  const plannedCount = (targetsPlanned.vocabulary?.length ?? 0) + (targetsPlanned.grammar?.length ?? 0)
  const hitSet = new Set(targetsHit)
  const minutes = durationSeconds ? Math.max(1, Math.round(durationSeconds / 60)) : null

  return (
    <div className="mt-4 rounded-xl border border-border bg-bg p-5">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <BarChart3 size={16} className="text-accent-warm" />
          <span className="text-[15px] font-bold">Session Analysis</span>
        </div>

        <div className="flex gap-4 flex-wrap">
          {minutes && (
            <div className="flex flex-col gap-0.5">
              <span className="text-[11px] text-text-muted">Duration</span>
              <span className="text-[15px] font-medium">{minutes}m</span>
            </div>
          )}
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] text-text-muted">Challenges</span>
            <span className="text-[15px] font-medium text-green-600">{targetsHit.length}/{plannedCount}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] text-text-muted">Errors</span>
            <span
              className={cn(
                'text-[15px] font-medium',
                errorsLogged.length > 0 ? 'text-accent-warm' : 'text-text-muted'
              )}
            >
              {errorsLogged.length}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] text-text-muted">Avoidance</span>
            <span
              className={cn(
                'text-[15px] font-medium',
                avoidanceEvents.length > 0 ? 'text-amber-500' : 'text-text-muted'
              )}
            >
              {avoidanceEvents.length}
            </span>
          </div>
        </div>

        {plannedCount > 0 && (
          <>
            <hr className="border-t border-border m-0" />
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-text-muted">Targets</span>
              {[...targetsPlanned.vocabulary, ...targetsPlanned.grammar].map((id) => (
                <div key={id} className="flex items-center gap-2">
                  {hitSet.has(id) ? (
                    <span className="inline-flex items-center gap-1 px-1.5 py-px rounded-full bg-green-600/[.08] text-[11px] font-medium text-green-600">
                      <Target size={10} /> Hit
                    </span>
                  ) : (
                    <span className="inline-flex px-1.5 py-px rounded-full bg-bg-secondary text-[11px] font-medium text-text-muted">Missed</span>
                  )}
                  <span className="text-[13px]">Item #{id}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {errorsLogged.length > 0 && (
          <>
            <hr className="border-t border-border m-0" />
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-text-muted">Errors</span>
              {errorsLogged.map((err, i) => (
                <div key={i} className="flex items-start gap-2">
                  <X size={12} className="text-accent-warm mt-[3px] shrink-0" />
                  <span className="text-[13px]">{err.contextQuote || `${err.errorType} on item #${err.itemId}`}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {avoidanceEvents.length > 0 && (
          <>
            <hr className="border-t border-border m-0" />
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-text-muted">Avoidance Events</span>
              {avoidanceEvents.map((ev, i) => (
                <div key={i} className="flex items-start gap-2">
                  <AlertTriangle size={12} className="text-amber-500 mt-[3px] shrink-0" />
                  <span className="text-[13px]">{ev.contextQuote || `Item #${ev.itemId}`}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
