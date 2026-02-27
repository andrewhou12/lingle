'use client'

import Link from 'next/link'
import { Check, X, ArrowRight, LayoutDashboard } from 'lucide-react'
import type { ExpandedSessionPlan, PostSessionAnalysis } from '@linguist/shared/types'

interface SessionSummaryProps {
  plan: ExpandedSessionPlan
  analysis: PostSessionAnalysis | null
  durationSeconds: number
  onNewSession: () => void
}

export function SessionSummary({
  plan,
  analysis,
  durationSeconds,
  onNewSession,
}: SessionSummaryProps) {
  const minutes = Math.max(1, Math.round(durationSeconds / 60))

  const plannedVocab = plan.targetVocabulary ?? []
  const plannedGrammar = plan.targetGrammar ?? []
  const allPlanned = [...plannedVocab, ...plannedGrammar]
  const targetsHit = new Set(analysis?.targetsHit ?? [])

  return (
    <div className="max-w-[640px] mx-auto">
      <h1 className="text-[28px] font-bold mb-2">
        Session Complete
      </h1>
      <p className="text-sm text-text-muted mb-6">
        Duration: {minutes} minute{minutes !== 1 ? 's' : ''}
      </p>

      {allPlanned.length > 0 && (
        <div className="rounded-xl border border-border bg-bg p-4 mb-4">
          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-medium text-text-muted">
              Targets
            </span>
            <hr className="border-t border-border m-0" />
            {allPlanned.map((id) => (
              <div key={id} className="flex items-center gap-2 py-1">
                {targetsHit.has(id) ? (
                  <Check size={16} className="text-[#16a34a]" />
                ) : (
                  <X size={16} className="text-accent-warm" />
                )}
                <span className="text-[13px]">
                  Item #{id} {targetsHit.has(id) ? '— produced in context' : '— not encountered'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {analysis?.errorsLogged && analysis.errorsLogged.length > 0 && (
        <div className="rounded-xl border border-border bg-bg p-4 mb-4">
          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-medium text-text-muted">
              Errors
            </span>
            <hr className="border-t border-border m-0" />
            {analysis.errorsLogged.map((err, i) => (
              <span key={i} className="text-[13px] text-accent-warm">
                {err.contextQuote || `Error on item #${err.itemId}: ${err.errorType}`}
              </span>
            ))}
          </div>
        </div>
      )}

      {analysis?.newItemsEncountered && analysis.newItemsEncountered.length > 0 && (
        <div className="rounded-xl border border-border bg-bg p-4 mb-4">
          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-medium text-text-muted">
              New Items Encountered
            </span>
            <hr className="border-t border-border m-0" />
            {analysis.newItemsEncountered.map((item, i) => (
              <span key={i} className="text-[13px]">
                {item.surfaceForm}
                {item.contextQuote && (
                  <span className="text-text-muted"> — {item.contextQuote}</span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {analysis?.overallAssessment && (
        <div className="rounded-xl border border-border bg-bg p-4 mb-6">
          <span className="text-[13px] text-text-muted">
            {analysis.overallAssessment}
          </span>
        </div>
      )}

      <div className="flex gap-3 justify-end">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 py-2 px-4 rounded-md bg-bg-secondary text-text-secondary text-[13px] font-medium no-underline transition-colors duration-150 hover:bg-bg-hover"
        >
          <LayoutDashboard size={14} />
          Dashboard
        </Link>
        <button
          onClick={onNewSession}
          className="inline-flex items-center gap-1.5 py-2 px-4 rounded-md bg-accent-brand text-white text-[13px] font-medium border-none cursor-pointer"
        >
          Start New Session
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  )
}
