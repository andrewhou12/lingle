'use client'

import { useMemo } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import Link from 'next/link'
import type { TranscriptLine, TurnAnalysisResult } from '@/lib/session-types'
import type { PlanType } from '@/lib/plan-limits'

interface SessionDebriefProps {
  duration: number
  transcript: TranscriptLine[]
  analysisResults: Record<number, TurnAnalysisResult>
  plan?: PlanType
  onDone: () => void
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (m === 0) return `${s}s`
  return `${m}m ${s}s`
}

const MOTIVATION_MESSAGES = [
  'Stay consistent \u2014 every session builds fluency!',
  'Small steps daily lead to big breakthroughs.',
  'You showed up today \u2014 that matters more than perfection.',
  'Consistency beats intensity. See you tomorrow!',
  'Each conversation makes the next one easier.',
]

export function SessionDebrief({
  duration,
  transcript,
  analysisResults,
  plan,
  onDone,
}: SessionDebriefProps) {
  const stats = useMemo(() => {
    const userTurns = transcript.filter(t => t.role === 'user')
    const aiTurns = transcript.filter(t => t.role === 'assistant')
    const exchanges = Math.min(userTurns.length, aiTurns.length)

    let totalCorrections = 0
    let totalVocab = 0
    const allCorrections: Array<{ original: string; corrected: string; explanation: string; grammarPoint?: string }> = []
    const allVocab: Array<{ word: string; reading?: string; meaning: string }> = []

    for (const result of Object.values(analysisResults)) {
      totalCorrections += result.corrections.length
      totalVocab += result.vocabularyCards.length
      allCorrections.push(...result.corrections)
      allVocab.push(...result.vocabularyCards)
    }

    // Dedupe vocab by word
    const seenWords = new Set<string>()
    const uniqueVocab = allVocab.filter(v => {
      if (seenWords.has(v.word)) return false
      seenWords.add(v.word)
      return true
    })

    return {
      exchanges,
      userTurns: userTurns.length,
      totalCorrections,
      totalVocab,
      allCorrections: allCorrections.slice(0, 6),
      uniqueVocab: uniqueVocab.slice(0, 8),
    }
  }, [transcript, analysisResults])

  const statCards = [
    { label: 'Duration', value: formatDuration(duration), icon: '\u23F1' },
    { label: 'Exchanges', value: String(stats.exchanges), icon: '\uD83D\uDCAC' },
    { label: 'Corrections', value: String(stats.totalCorrections), icon: '\u270F\uFE0F' },
    { label: 'New words', value: String(stats.totalVocab), icon: '\uD83D\uDCDA' },
  ]

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="fixed inset-0 z-[99999] bg-bg overflow-y-auto"
    >
      <div className="max-w-[520px] mx-auto px-6 py-12">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.4 }}
          className="text-center mb-8"
        >
          <div className="text-[32px] mb-3">{'\uD83C\uDF89'}</div>
          <h2 className="text-[22px] font-bold text-text-primary tracking-[-0.03em]">
            Session complete
          </h2>
          <p className="text-[14px] text-text-secondary mt-1">
            Here's how your conversation went.
          </p>
        </motion.div>

        {/* Stat cards */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          className="grid grid-cols-4 gap-2 mb-8"
        >
          {statCards.map((s) => (
            <div
              key={s.label}
              className="flex flex-col items-center gap-1 py-3.5 px-2 rounded-xl bg-bg-secondary border border-border"
            >
              <span className="text-[18px]">{s.icon}</span>
              <span className="text-[18px] font-bold text-text-primary tabular-nums">{s.value}</span>
              <span className="text-[11px] text-text-muted">{s.label}</span>
            </div>
          ))}
        </motion.div>

        {/* Corrections */}
        {stats.allCorrections.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.4 }}
            className="mb-6"
          >
            <h3 className="text-[13px] font-semibold text-text-primary mb-3 flex items-center gap-1.5">
              <span className="text-[14px]">{'\u270F\uFE0F'}</span>
              Corrections
            </h3>
            <div className="space-y-2">
              {stats.allCorrections.map((c, i) => (
                <div key={i} className="px-4 py-3 rounded-xl bg-bg-secondary border border-border">
                  <div className="flex items-start gap-2 text-[13px]">
                    <span className="text-accent-warm line-through">{c.original}</span>
                    <span className="text-text-muted">{'\u2192'}</span>
                    <span className="text-green font-medium">{c.corrected}</span>
                  </div>
                  <p className="text-[12px] text-text-secondary mt-1.5">{c.explanation}</p>
                  {c.grammarPoint && (
                    <span className="inline-block mt-1.5 text-[10px] font-medium text-accent-brand bg-accent-brand/8 px-2 py-0.5 rounded-full">
                      {c.grammarPoint}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Vocabulary */}
        {stats.uniqueVocab.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.4 }}
            className="mb-8"
          >
            <h3 className="text-[13px] font-semibold text-text-primary mb-3 flex items-center gap-1.5">
              <span className="text-[14px]">{'\uD83D\uDCDA'}</span>
              Vocabulary encountered
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {stats.uniqueVocab.map((v, i) => (
                <div key={i} className="px-3.5 py-2.5 rounded-xl bg-bg-secondary border border-border">
                  <div className="text-[14px] font-medium text-text-primary font-jp-clean">{v.word}</div>
                  {v.reading && (
                    <div className="text-[11px] text-text-muted font-jp-clean">{v.reading}</div>
                  )}
                  <div className="text-[12px] text-text-secondary mt-0.5">{v.meaning}</div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* No feedback */}
        {stats.allCorrections.length === 0 && stats.uniqueVocab.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.4 }}
            className="text-center py-6 mb-8"
          >
            <p className="text-[14px] text-text-secondary">
              No corrections this session \u2014 nice work!
            </p>
          </motion.div>
        )}

        {/* Upgrade CTA for free users */}
        {plan === 'free' && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45, duration: 0.4 }}
            className="mb-6"
          >
            <Link
              href="/upgrade"
              className="flex items-center gap-3 px-4 py-3.5 rounded-xl border border-accent-brand/20 bg-accent-brand/5 transition-colors hover:bg-accent-brand/10 no-underline"
            >
              <div className="w-8 h-8 rounded-lg bg-accent-brand/10 flex items-center justify-center shrink-0">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M8 1L10.5 6H14L11 9.5L12.5 15L8 11.5L3.5 15L5 9.5L2 6H5.5L8 1Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" className="text-accent-brand" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-text-primary">Upgrade to Pro for detailed analysis</div>
                <div className="text-[12px] text-text-muted">Session replay, in-depth feedback, and unlimited practice</div>
              </div>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-text-muted shrink-0">
                <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          </motion.div>
        )}

        {/* Motivation message */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.4 }}
          className="text-center mb-6"
        >
          <p className="text-[13px] text-text-muted italic">
            {MOTIVATION_MESSAGES[duration % MOTIVATION_MESSAGES.length]}
          </p>
        </motion.div>

        {/* Done button */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55, duration: 0.4 }}
          className="flex justify-center"
        >
          <button
            onClick={onDone}
            className="px-8 py-3 rounded-xl bg-accent-brand text-white text-[14px] font-semibold border-none cursor-pointer transition-all hover:bg-[#111] hover:shadow-[0_6px_20px_rgba(0,0,0,.2)] hover:-translate-y-0.5 active:scale-[0.97]"
          >
            Done
          </button>
        </motion.div>
      </div>
    </motion.div>,
    document.body,
  )
}
