'use client'

import { useEffect } from 'react'
import { Check, X, AlertTriangle, Clock, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PostSessionAnalysis, ExpandedSessionPlan } from '@linguist/shared/types'

interface SessionSummaryModalProps {
  isOpen: boolean
  onClose: () => void
  analysis: PostSessionAnalysis
  plan: ExpandedSessionPlan
  durationSeconds: number
}

export function SessionSummaryModal({ isOpen, onClose, analysis, plan, durationSeconds }: SessionSummaryModalProps) {
  // Escape key closes
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const minutes = Math.max(1, Math.round(durationSeconds / 60))
  const hitCount = analysis.targetsHit?.length ?? 0
  const totalTargets = (plan.targetVocabulary?.length ?? 0) + (plan.targetGrammar?.length ?? 0) + (plan.curriculumNewItems?.length ?? 0)
  const errorCount = analysis.errorsLogged?.length ?? 0
  const newCount = analysis.newItemsEncountered?.length ?? 0
  const sessionNumber = plan._sessionId ? '#' + plan._sessionId.slice(0, 4) : ''

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Modal card */}
      <div className="relative max-w-[480px] w-full mx-4 bg-bg-pure rounded-2xl shadow-[var(--shadow-pop)] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles size={18} className="text-accent-warm" />
            <h2 className="text-[20px] font-bold text-text-primary">
              Session {sessionNumber} Complete
            </h2>
          </div>
          <div className="flex items-center gap-1.5 text-[13px] text-text-muted">
            <Clock size={13} />
            <span>{minutes} min</span>
          </div>
        </div>

        <div className="px-6 pb-6 flex flex-col gap-4 max-h-[60vh] overflow-auto">
          {/* Stats row */}
          <div className="flex gap-3">
            <StatBadge label="Challenges" value={`${hitCount}/${totalTargets}`} color="text-green" />
            <StatBadge label="Errors" value={String(errorCount)} color={errorCount > 0 ? 'text-red' : 'text-text-muted'} />
            <StatBadge label="New words" value={String(newCount)} color="text-blue" />
          </div>

          {/* Challenges list */}
          {totalTargets > 0 && (
            <Section title="Challenges">
              {[
                ...(plan.targetVocabulary ?? []).map((id) => ({
                  id: String(id),
                  label: `Vocab #${id}`,
                })),
                ...(plan.targetGrammar ?? []).map((id) => ({
                  id: String(id),
                  label: `Grammar #${id}`,
                })),
                ...(plan.curriculumNewItems ?? []).map((c) => ({
                  id: c.surfaceForm ?? c.patternId ?? 'unknown',
                  label: c.surfaceForm ?? c.patternId ?? 'New item',
                })),
              ].map((target) => {
                const isHit = analysis.targetsHit?.map(String).includes(target.id) ?? false
                return (
                  <div key={target.id} className="flex items-center gap-2">
                    {isHit ? (
                      <div className="w-4 h-4 rounded-full bg-green flex items-center justify-center">
                        <Check size={10} className="text-white" />
                      </div>
                    ) : (
                      <div className="w-4 h-4 rounded-full bg-red-soft flex items-center justify-center">
                        <X size={10} className="text-red" />
                      </div>
                    )}
                    <span className={cn('text-[13px]', isHit ? 'text-text-primary' : 'text-text-muted')}>
                      {target.label}
                    </span>
                  </div>
                )
              })}
            </Section>
          )}

          {/* Errors */}
          {errorCount > 0 && (
            <Section title="Errors">
              {analysis.errorsLogged.map((err, i) => (
                <div key={i} className="flex items-start gap-2">
                  <AlertTriangle size={13} className="text-warm shrink-0 mt-0.5" />
                  <div className="flex flex-col">
                    <span className="text-[13px] text-text-primary">{err.contextQuote || `Item #${err.itemId}`}</span>
                    <span className="text-[11px] text-text-muted">{err.errorType}</span>
                  </div>
                </div>
              ))}
            </Section>
          )}

          {/* New words encountered */}
          {newCount > 0 && (
            <Section title="Words Encountered">
              <div className="flex flex-wrap gap-1.5">
                {analysis.newItemsEncountered.map((item, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center px-2.5 py-1 rounded-full bg-blue-soft text-[12px] font-jp text-blue font-medium"
                  >
                    {item.surfaceForm}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {/* Overall assessment */}
          {analysis.overallAssessment && (
            <Section title="Tomorrow&apos;s Session">
              <p className="text-[13px] text-text-secondary leading-relaxed italic">
                {analysis.overallAssessment}
              </p>
            </Section>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 px-6 py-4 border-t border-border">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-accent-brand text-white text-[14px] font-medium border-none cursor-pointer transition-opacity hover:opacity-90"
          >
            Close
          </button>
          <button className="py-2.5 px-4 rounded-xl bg-bg-secondary text-text-secondary text-[14px] font-medium border border-border cursor-pointer transition-colors hover:bg-bg-hover">
            See Full Report
          </button>
        </div>
      </div>
    </div>
  )
}

function StatBadge({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl bg-bg-secondary">
      <span className={cn('text-[18px] font-bold', color)}>{value}</span>
      <span className="text-[11px] text-text-muted">{label}</span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">{title}</span>
      {children}
    </div>
  )
}
