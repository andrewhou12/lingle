'use client'

import { useState } from 'react'
import { motion } from 'motion/react'
import { ChevronDownIcon } from '@heroicons/react/24/outline'
import { cn } from '@/lib/utils'
import type { PostSessionResult } from '@/lib/api'

interface SessionSummaryProps {
  duration: number
  result: PostSessionResult
  onPracticeAgain: () => void
  onDone: () => void
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

function DeltaIndicator({ value, label }: { value: number; label: string }) {
  const isPositive = value > 0
  const isNegative = value < 0
  const display = isPositive ? `+${value.toFixed(2)}` : value.toFixed(2)

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[11px] uppercase tracking-[0.08em] text-text-muted font-medium">
        {label}
      </span>
      <span
        className={cn(
          'text-[15px] font-semibold tabular-nums',
          isPositive && 'text-green',
          isNegative && 'text-accent-warm',
          !isPositive && !isNegative && 'text-text-secondary',
        )}
      >
        {isPositive && <span className="text-[12px]">&#9650; </span>}
        {isNegative && <span className="text-[12px]">&#9660; </span>}
        {display}
      </span>
    </div>
  )
}

function StatCell({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[11px] uppercase tracking-[0.08em] text-text-muted font-medium">
        {label}
      </span>
      <span className="text-[15px] font-semibold text-text-primary tabular-nums">{value}</span>
    </div>
  )
}

export function SessionSummary({ duration, result, onPracticeAgain, onDone }: SessionSummaryProps) {
  const [correctionsOpen, setCorrectionsOpen] = useState(false)
  const hasDeltas = result.cefrDelta && (result.cefrDelta.grammarDelta !== 0 || result.cefrDelta.fluencyDelta !== 0)
  const hasCorrections = !!result.correctionsDoc

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="w-full max-w-[400px] mx-auto"
    >
      {/* Duration header */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15, duration: 0.4 }}
        className="text-center mb-8"
      >
        <div className="text-[13px] text-text-muted mb-1">Session complete</div>
        <div className="text-[32px] font-light text-text-primary tabular-nums tracking-tight">
          {formatDuration(duration)}
        </div>
      </motion.div>

      {/* Stats grid */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3, duration: 0.4 }}
        className="bg-bg-pure border border-border-subtle rounded-xl px-6 py-5 shadow-sm"
      >
        <div className={cn(
          'grid gap-4',
          hasDeltas ? 'grid-cols-4' : 'grid-cols-2',
        )}>
          {hasDeltas && result.cefrDelta && (
            <>
              <DeltaIndicator value={result.cefrDelta.grammarDelta} label="Grammar" />
              <DeltaIndicator value={result.cefrDelta.fluencyDelta} label="Fluency" />
            </>
          )}
          <StatCell value={result.errorsCount ?? 0} label="Errors" />
          <StatCell value={result.correctionsCount ?? 0} label="Corrections" />
        </div>

        {/* Corrections doc — expandable */}
        {hasCorrections && (
          <div className="mt-4 pt-4 border-t border-border-subtle">
            <button
              onClick={() => setCorrectionsOpen(!correctionsOpen)}
              className="flex items-center justify-between w-full bg-transparent border-none cursor-pointer p-0 group"
            >
              <span className="text-[13px] font-medium text-text-secondary group-hover:text-text-primary transition-colors">
                Review corrections
              </span>
              <ChevronDownIcon
                className={cn(
                  'w-4 h-4 text-text-muted transition-transform duration-200',
                  correctionsOpen && 'rotate-180',
                )}
              />
            </button>
            {correctionsOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                transition={{ duration: 0.25 }}
                className="mt-3 overflow-hidden"
              >
                <div className="text-[13px] leading-[1.7] text-text-secondary whitespace-pre-wrap">
                  {result.correctionsDoc}
                </div>
              </motion.div>
            )}
          </div>
        )}
      </motion.div>

      {/* CTAs */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.4 }}
        className="flex gap-3 mt-6"
      >
        <button
          onClick={onPracticeAgain}
          className="flex-1 py-2.5 rounded-lg bg-accent-brand text-white text-[14px] font-medium cursor-pointer border-none hover:opacity-90 transition-opacity"
        >
          Practice again
        </button>
        <button
          onClick={onDone}
          className="flex-1 py-2.5 rounded-lg bg-bg-pure border border-border text-text-secondary text-[14px] font-medium cursor-pointer hover:bg-bg-hover hover:text-text-primary transition-colors"
        >
          Done
        </button>
      </motion.div>
    </motion.div>
  )
}
