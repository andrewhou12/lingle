'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import type { VoiceAnalysisResult } from '@/lib/voice/voice-session-fsm'

type Grade = 'good' | 'ok' | 'fix'

function computeGrade(result: VoiceAnalysisResult): Grade {
  if (result.corrections.length > 0) return 'fix'
  if (result.naturalnessFeedback.length > 0) return 'ok'
  return 'good'
}

const GRADE_CONFIG: Record<Grade, { label: string; dot: string; text: string }> = {
  good: { label: 'Good', dot: 'bg-green', text: 'text-green' },
  ok: { label: 'Tip', dot: 'bg-blue', text: 'text-blue' },
  fix: { label: 'Fix', dot: 'bg-accent-warm', text: 'text-accent-warm' },
}

interface VoiceTurnGradeProps {
  latestResult: VoiceAnalysisResult | null
  latestTurnIdx: number | null
  onOpenFeedback: () => void
  className?: string
}

export function VoiceTurnGrade({
  latestResult,
  latestTurnIdx,
  onOpenFeedback,
  className,
}: VoiceTurnGradeProps) {
  const [expanded, setExpanded] = useState(false)
  const [visible, setVisible] = useState(false)
  const prevTurnRef = useRef<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (latestTurnIdx === null || latestTurnIdx === prevTurnRef.current) return
    prevTurnRef.current = latestTurnIdx

    setVisible(true)
    setExpanded(false)

    if (timerRef.current) clearTimeout(timerRef.current)
    if (latestResult && computeGrade(latestResult) === 'good') {
      timerRef.current = setTimeout(() => setVisible(false), 3000)
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [latestTurnIdx, latestResult])

  const grade = useMemo(() => latestResult ? computeGrade(latestResult) : null, [latestResult])
  const config = grade ? GRADE_CONFIG[grade] : null

  if (!visible || !latestResult || !config) return null

  const hasDetails = latestResult.corrections.length > 0 || latestResult.naturalnessFeedback.length > 0

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 6 }}
          transition={{ duration: 0.2, ease: [0.2, 0.85, 0.4, 1] }}
          className={cn(
            'fixed bottom-[180px] right-[18px] z-[60] w-[220px]',
            className,
          )}
        >
          {/* Grade pill */}
          <button
            onClick={() => {
              if (hasDetails) {
                setExpanded(e => !e)
                if (timerRef.current) clearTimeout(timerRef.current)
              }
            }}
            className={cn(
              'w-full flex items-center gap-2 px-3 py-[7px] rounded-lg border border-border bg-bg-pure transition-all',
              hasDetails && 'cursor-pointer hover:border-border-strong',
              !hasDetails && 'cursor-default',
            )}
          >
            <div className={cn('w-[5px] h-[5px] rounded-full shrink-0', config.dot)} />
            <span className={cn('text-[12px] font-medium', config.text)}>{config.label}</span>
            {grade === 'good' && (
              <span className="text-[11px] text-text-muted">No corrections</span>
            )}
            {grade === 'ok' && (
              <span className="text-[11px] text-text-muted">
                {latestResult.naturalnessFeedback.length} tip{latestResult.naturalnessFeedback.length !== 1 ? 's' : ''}
              </span>
            )}
            {grade === 'fix' && (
              <span className="text-[11px] text-text-muted">
                {latestResult.corrections.length} correction{latestResult.corrections.length !== 1 ? 's' : ''}
              </span>
            )}
            {hasDetails && (
              <svg width="10" height="10" viewBox="0 0 12 12" className={cn('ml-auto text-text-muted transition-transform', expanded && 'rotate-180')}>
                <path d="M3 5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>

          {/* Expanded details */}
          <AnimatePresence>
            {expanded && hasDetails && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.18, ease: [0.2, 0.85, 0.4, 1] }}
                className="overflow-hidden"
              >
                <div className="mt-1 rounded-lg border border-border bg-bg-pure px-3 py-2 flex flex-col gap-1.5">
                  {latestResult.corrections.map((c, i) => (
                    <div key={`c-${i}`} className="flex flex-col gap-px">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[12px] font-jp-clean text-text-muted line-through decoration-accent-warm/40">{c.original}</span>
                        <svg width="10" height="10" viewBox="0 0 12 12" className="text-text-placeholder shrink-0">
                          <path d="M1 6h9M7 3l3 3-3 3" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <span className="text-[12px] font-jp-clean font-medium text-text-primary">{c.corrected}</span>
                      </div>
                      <span className="text-[11px] text-text-muted leading-[1.4]">{c.explanation}</span>
                    </div>
                  ))}

                  {latestResult.naturalnessFeedback.map((n, i) => (
                    <div key={`n-${i}`} className="flex flex-col gap-px">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[12px] font-jp-clean text-text-secondary">{n.original}</span>
                        <svg width="10" height="10" viewBox="0 0 12 12" className="text-text-placeholder shrink-0">
                          <path d="M1 6h9M7 3l3 3-3 3" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <span className="text-[12px] font-jp-clean font-medium text-text-primary">{n.suggestion}</span>
                      </div>
                      <span className="text-[11px] text-text-muted leading-[1.4]">{n.explanation}</span>
                    </div>
                  ))}

                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onOpenFeedback()
                      setExpanded(false)
                    }}
                    className="text-[11px] text-text-muted hover:text-text-secondary transition-colors text-left cursor-pointer bg-transparent border-none p-0 font-sans mt-0.5"
                  >
                    View all feedback &rarr;
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
