'use client'

import { useRef, useEffect } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { cn } from '@/lib/utils'
import type { TurnAnalysisResult } from '@/lib/session-types'

interface VoiceCorrectionsPanelProps {
  isOpen: boolean
  turnResults: Record<number, TurnAnalysisResult>
  onClose: () => void
}

type Grade = 'good' | 'ok' | 'fix'

function gradeForResult(r: TurnAnalysisResult): Grade {
  if (r.corrections.length > 0) return 'fix'
  if (r.naturalnessFeedback.length > 0) return 'ok'
  return 'good'
}

const GRADE_DOT: Record<Grade, string> = {
  good: 'bg-green',
  ok: 'bg-blue',
  fix: 'bg-accent-warm',
}

const GRADE_TEXT: Record<Grade, string> = {
  good: 'text-green',
  ok: 'text-blue',
  fix: 'text-accent-warm',
}

export function VoiceCorrectionsPanel({ isOpen, turnResults, onClose }: VoiceCorrectionsPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const entries = Object.entries(turnResults).sort(([a], [b]) => Number(a) - Number(b))

  const totalCorrections = entries.reduce((sum, [, r]) => sum + r.corrections.length, 0)
  const totalNaturalness = entries.reduce((sum, [, r]) => sum + r.naturalnessFeedback.length, 0)
  const totalItems = totalCorrections + totalNaturalness

  useEffect(() => {
    if (scrollRef.current && isOpen) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [turnResults, isOpen])

  return (
    <div
      className={cn(
        'fixed right-0 top-0 bottom-0 w-[380px] z-[100] flex flex-col transition-transform duration-[400ms] ease-[cubic-bezier(.76,0,.24,1)]',
        'bg-bg-pure border-l border-border',
        isOpen ? 'translate-x-0' : 'translate-x-full',
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border shrink-0">
        <div>
          <div className="text-[15px] font-semibold text-text-primary tracking-[-0.02em]">Feedback</div>
          <div className="text-[13px] text-text-muted mt-0.5">
            {totalItems > 0
              ? `${totalCorrections} correction${totalCorrections !== 1 ? 's' : ''}, ${totalNaturalness} tip${totalNaturalness !== 1 ? 's' : ''}`
              : 'All good so far'
            }
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-lg flex items-center justify-center bg-transparent border-none text-text-muted cursor-pointer transition-colors hover:bg-bg-hover hover:text-text-primary"
        >
          <XMarkIcon className="w-[18px] h-[18px]" />
        </button>
      </div>

      {/* Turn-by-turn feedback */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-0 [&::-webkit-scrollbar]:w-[3px] [&::-webkit-scrollbar-thumb]:bg-border-strong [&::-webkit-scrollbar-thumb]:rounded-sm">
        {entries.length === 0 ? (
          <div className="text-center py-10 text-text-muted text-[14px] leading-[1.7]">
            No feedback yet — keep talking!
          </div>
        ) : (
          entries.map(([turnIdx, result]) => {
            const grade = gradeForResult(result)
            const hasContent = result.corrections.length > 0 || result.naturalnessFeedback.length > 0

            return (
              <div key={turnIdx} className="py-3.5 border-b border-border/60 last:border-b-0">
                {/* Turn header */}
                <div className="flex items-center gap-2 mb-2">
                  <div className={cn('w-[6px] h-[6px] rounded-full shrink-0', GRADE_DOT[grade])} />
                  <span className="text-[13px] text-text-muted font-sans">Turn {Number(turnIdx) + 1}</span>
                  <span className="text-[13px] text-text-muted font-sans">·</span>
                  <span className={cn('text-[13px] font-medium font-sans', GRADE_TEXT[grade])}>
                    {grade === 'good' ? 'Good' : grade === 'ok' ? 'Tip' : 'Needs fix'}
                  </span>
                </div>

                {/* Corrections */}
                {result.corrections.map((c, i) => (
                  <div key={`c-${i}`} className="ml-4 py-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[14px] font-jp-clean text-text-muted line-through decoration-accent-warm/40">{c.original}</span>
                      <svg width="12" height="12" viewBox="0 0 12 12" className="text-text-placeholder shrink-0">
                        <path d="M1 6h9M7 3l3 3-3 3" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <span className="text-[14px] font-jp-clean font-medium text-text-primary">{c.corrected}</span>
                    </div>
                    <div className="flex items-baseline gap-2 mt-1.5">
                      {c.grammarPoint && (
                        <span className="text-[11px] font-medium text-accent-warm bg-warm-soft rounded px-2 py-0.5 shrink-0 font-sans">{c.grammarPoint}</span>
                      )}
                      <span className="text-[13px] text-text-muted leading-[1.6] font-sans">{c.explanation}</span>
                    </div>
                  </div>
                ))}

                {/* Naturalness */}
                {result.naturalnessFeedback.map((n, i) => (
                  <div key={`n-${i}`} className="ml-4 py-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[14px] font-jp-clean text-text-secondary">{n.original}</span>
                      <svg width="12" height="12" viewBox="0 0 12 12" className="text-text-placeholder shrink-0">
                        <path d="M1 6h9M7 3l3 3-3 3" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <span className="text-[14px] font-jp-clean font-medium text-text-primary">{n.suggestion}</span>
                    </div>
                    <span className="text-[13px] text-text-muted leading-[1.6] font-sans block mt-1.5">{n.explanation}</span>
                  </div>
                ))}

                {!hasContent && (
                  <div className="ml-4 text-[13px] text-text-muted py-1 font-sans">No issues</div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
