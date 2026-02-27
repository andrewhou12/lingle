'use client'

import { useState } from 'react'
import { BookOpen, Languages, HelpCircle } from 'lucide-react'
import type { MessageSegment } from '@/lib/message-parser'

interface CardProps {
  segment: MessageSegment
}

export function VocabCard({ segment }: CardProps) {
  const d = segment.data ?? {}
  return (
    <div className="my-2 max-w-[480px] rounded-xl border border-border bg-bg p-4 border-l-[3px] border-l-blue-500">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <BookOpen size={14} className="text-blue-500" />
          <span className="inline-flex items-center rounded-full bg-blue-500/[.08] px-2 py-0.5 text-[11px] font-medium text-blue-800">
            Vocabulary
          </span>
        </div>
        <div className="flex items-baseline gap-3">
          <span className="text-xl font-bold font-jp">{d.surface ?? ''}</span>
          {d.reading && <span className="text-[13px] text-text-muted">{d.reading}</span>}
        </div>
        <span className="text-sm text-text-secondary">{d.meaning ?? ''}</span>
        {d.example && (
          <div className="mt-1 p-2 bg-bg-secondary rounded-md">
            <span className="text-[13px] block font-jp">{d.example}</span>
            {d.example_translation && (
              <span className="text-xs text-text-muted block mt-1">{d.example_translation}</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export function GrammarCard({ segment }: CardProps) {
  const d = segment.data ?? {}
  return (
    <div className="my-2 max-w-[480px] rounded-xl border border-border bg-bg p-4 border-l-[3px] border-l-violet-500">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Languages size={14} className="text-violet-500" />
          <span className="inline-flex items-center rounded-full bg-violet-500/[.08] px-2 py-0.5 text-[11px] font-medium text-violet-700">
            Grammar
          </span>
        </div>
        <span className="text-lg font-bold font-jp">{d.pattern ?? ''}</span>
        <span className="text-sm text-text-secondary">{d.meaning ?? ''}</span>
        {d.formation && (
          <span className="text-xs text-text-muted">Formation: {d.formation}</span>
        )}
        {d.example && (
          <div className="mt-1 p-2 bg-bg-secondary rounded-md">
            <span className="text-[13px] block font-jp">{d.example}</span>
            {d.example_translation && (
              <span className="text-xs text-text-muted block mt-1">{d.example_translation}</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export function CorrectionCard({ segment }: CardProps) {
  const d = segment.data ?? {}
  const badgeType = d.error_type || d.badge || 'Grammar'

  const badgeColors: Record<string, string> = {
    'Style tip': 'bg-blue-soft text-blue',
    'Grammar': 'bg-purple-soft text-purple',
    'Vocabulary': 'bg-warm-soft text-warm',
    'Spelling': 'bg-red-soft text-red',
  }
  const badgeStyle = badgeColors[badgeType] || badgeColors['Grammar']

  return (
    <div className="my-3 max-w-[480px] rounded-xl bg-bg-pure border border-border shadow-[var(--shadow-sm)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border-subtle bg-bg-secondary/50">
        <span className="text-[12px] font-medium text-text-secondary">✦ Note</span>
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${badgeStyle}`}>
          {badgeType}
        </span>
      </div>
      {/* Diff */}
      <div className="px-4 py-3 flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <span className="text-[14px] text-red line-through font-jp">{d.incorrect ?? ''}</span>
          <span className="text-text-muted text-[12px]">&rarr;</span>
          <span className="text-[14px] font-bold text-green font-jp px-1.5 py-0.5 rounded-md border border-green-med bg-green-soft">{d.correct ?? ''}</span>
        </div>
        {d.explanation && (
          <span className="text-[12px] text-text-secondary leading-relaxed">{d.explanation}</span>
        )}
      </div>
    </div>
  )
}

export function ReviewPromptCard({ segment }: CardProps) {
  const [showAnswer, setShowAnswer] = useState(false)
  const d = segment.data ?? {}
  return (
    <div className="my-2 max-w-[480px] rounded-xl border border-border bg-bg p-4 border-l-[3px] border-l-[var(--accent-brand)]">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <HelpCircle size={14} className="text-accent-brand" />
          <span className="inline-flex items-center rounded-full bg-bg-secondary px-2 py-0.5 text-[11px] font-medium text-text-secondary">
            Review
          </span>
        </div>
        <span className="text-[15px] font-medium">{d.prompt ?? ''}</span>
        {!showAnswer && (
          <button
            className="self-start rounded-md bg-bg-secondary border border-border px-3 py-1 text-xs font-medium text-text-secondary cursor-pointer transition-colors duration-100 hover:bg-bg-hover"
            onClick={() => setShowAnswer(true)}
          >
            Show Answer
          </button>
        )}
      </div>
    </div>
  )
}
