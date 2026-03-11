'use client'

import { useMemo, useState } from 'react'
import { ChevronDownIcon, LightBulbIcon } from '@heroicons/react/24/outline'
import { cn } from '@/lib/utils'
import { getTargetFontCleanClass } from '@/lib/languages'
import { useLanguage } from '@/hooks/use-language'
import type { TurnAnalysisResult } from '@/lib/session-types'

interface SessionNotesPanelProps {
  analysisResults: Record<number, TurnAnalysisResult>
  highlight?: boolean
}

interface CollapsibleSectionProps {
  title: string
  count: number
  accentClass: string
  defaultOpen?: boolean
  children: React.ReactNode
}

function CollapsibleSection({ title, count, accentClass, defaultOpen = true, children }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="border-b border-border last:border-b-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-3 bg-transparent border-none cursor-pointer hover:bg-bg-hover transition-colors"
      >
        <span className="text-[13px] font-semibold text-text-primary">{title}</span>
        <div className="flex items-center gap-2">
          {count > 0 && (
            <span className={cn('min-w-[20px] h-[20px] inline-flex items-center justify-center rounded-full text-[11px] font-bold px-1', accentClass)}>
              {count}
            </span>
          )}
          <ChevronDownIcon className={cn('w-4 h-4 text-text-secondary transition-transform', open && 'rotate-180')} />
        </div>
      </button>
      {open && count > 0 && (
        <div className="px-5 pb-4">
          {children}
        </div>
      )}
    </div>
  )
}

export function SessionNotesPanel({ analysisResults, highlight }: SessionNotesPanelProps) {
  const { targetLanguage } = useLanguage()
  const fontClean = getTargetFontCleanClass(targetLanguage || 'Japanese')

  // Aggregate data from all turns
  const takeaways = useMemo(() => {
    const items: string[] = []
    const seen = new Set<string>()
    for (const result of Object.values(analysisResults)) {
      for (const t of result.takeaways || []) {
        if (!seen.has(t)) {
          seen.add(t)
          items.push(t)
        }
      }
    }
    return items
  }, [analysisResults])

  const vocab = useMemo(() => {
    const seen = new Set<string>()
    const items: Array<{ word: string; reading?: string; meaning: string; partOfSpeech?: string }> = []
    for (const result of Object.values(analysisResults)) {
      for (const card of result.vocabularyCards) {
        if (!seen.has(card.word)) {
          seen.add(card.word)
          items.push(card)
        }
      }
    }
    return items
  }, [analysisResults])

  const corrections = useMemo(() => {
    const seen = new Set<string>()
    const items: Array<{ original: string; corrected: string; explanation: string }> = []
    for (const result of Object.values(analysisResults)) {
      for (const c of result.corrections) {
        const key = `${c.original}::${c.corrected}`
        if (!seen.has(key)) {
          seen.add(key)
          items.push(c)
        }
      }
    }
    return items
  }, [analysisResults])

  const grammar = useMemo(() => {
    const seen = new Set<string>()
    const items: Array<{ pattern: string; meaning: string }> = []
    for (const result of Object.values(analysisResults)) {
      for (const g of result.grammarNotes) {
        if (!seen.has(g.pattern)) {
          seen.add(g.pattern)
          items.push(g)
        }
      }
    }
    return items
  }, [analysisResults])

  const registerMismatches = useMemo(() => {
    const seen = new Set<string>()
    const items: Array<{ original: string; suggestion: string; expected: string; explanation: string }> = []
    for (const result of Object.values(analysisResults)) {
      for (const r of result.registerMismatches || []) {
        if (!seen.has(r.original)) {
          seen.add(r.original)
          items.push(r)
        }
      }
    }
    return items
  }, [analysisResults])

  const l1Interference = useMemo(() => {
    const seen = new Set<string>()
    const items: Array<{ original: string; issue: string; suggestion: string }> = []
    for (const result of Object.values(analysisResults)) {
      for (const l of result.l1Interference || []) {
        if (!seen.has(l.original)) {
          seen.add(l.original)
          items.push(l)
        }
      }
    }
    return items
  }, [analysisResults])

  const alternatives = useMemo(() => {
    const seen = new Set<string>()
    const items: Array<{ original: string; alternative: string; explanation: string }> = []
    for (const result of Object.values(analysisResults)) {
      for (const a of result.alternativeExpressions || []) {
        if (!seen.has(a.original)) {
          seen.add(a.original)
          items.push(a)
        }
      }
    }
    return items
  }, [analysisResults])

  const totalItems = takeaways.length + vocab.length + corrections.length + grammar.length + registerMismatches.length + l1Interference.length + alternatives.length

  return (
    <div className={cn(
      "fixed right-6 top-[72px] bottom-6 z-[9] w-[280px] flex flex-col bg-bg-pure border rounded-lg shadow-[0_1px_2px_rgba(0,0,0,.04),0_1px_4px_rgba(0,0,0,.03)] overflow-hidden transition-[border-color] duration-500",
      highlight ? 'border-accent-brand' : 'border-border-subtle',
    )}>
      {/* Header */}
      <div className="px-5 pt-5 pb-4 shrink-0">
        <span className="text-[13px] font-medium text-text-secondary">Session Notes</span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:w-[3px] [&::-webkit-scrollbar-thumb]:bg-border-strong [&::-webkit-scrollbar-thumb]:rounded-sm">
        {totalItems === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
            <div className="w-10 h-10 rounded-full bg-bg-secondary flex items-center justify-center mb-3">
              <LightBulbIcon className="w-5 h-5 text-text-secondary" />
            </div>
            <p className="text-[14px] text-text-secondary leading-[1.5]">
              Notes will appear as you practice
            </p>
          </div>
        ) : (
          <>
            {/* Key Takeaways */}
            <CollapsibleSection title="Key Takeaways" count={takeaways.length} accentClass="bg-blue-soft text-accent-brand">
              <div className="flex flex-col gap-2.5">
                {takeaways.map((t, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <LightBulbIcon className="w-4 h-4 text-accent-brand shrink-0 mt-[2px]" />
                    <span className="text-[13px] text-text-primary leading-[1.5]">{t}</span>
                  </div>
                ))}
              </div>
            </CollapsibleSection>

            {/* Vocabulary */}
            <CollapsibleSection title="Vocabulary" count={vocab.length} accentClass="bg-blue-soft text-accent-brand">
              <div className="flex flex-col gap-2">
                {vocab.map((v, i) => (
                  <div key={i} className="px-3 py-2.5 bg-bg-secondary rounded-lg">
                    <div className="flex items-baseline gap-2">
                      <span className={cn('text-[14px] font-medium text-text-primary', fontClean)}>{v.word}</span>
                      {v.reading && v.reading !== v.word && (
                        <span className={cn('text-[12px] text-text-secondary', fontClean)}>{v.reading}</span>
                      )}
                    </div>
                    <div className="text-[13px] text-text-secondary leading-[1.4] mt-1">{v.meaning}</div>
                  </div>
                ))}
              </div>
            </CollapsibleSection>

            {/* Corrections */}
            <CollapsibleSection title="Corrections" count={corrections.length} accentClass="bg-warm-soft text-accent-warm">
              <div className="flex flex-col gap-2.5">
                {corrections.map((c, i) => (
                  <div key={i} className="text-[13px] leading-[1.5]">
                    <div className="flex items-center gap-2">
                      <span className={cn('text-text-secondary line-through', fontClean)}>{c.original}</span>
                      <span className="text-text-secondary">&rarr;</span>
                      <span className={cn('text-text-primary font-medium', fontClean)}>{c.corrected}</span>
                    </div>
                    <div className="text-[12px] text-text-secondary mt-1">{c.explanation}</div>
                  </div>
                ))}
              </div>
            </CollapsibleSection>

            {/* Register Mismatches */}
            <CollapsibleSection title="Register" count={registerMismatches.length} accentClass="bg-warm-soft text-accent-warm">
              <div className="flex flex-col gap-2.5">
                {registerMismatches.map((r, i) => (
                  <div key={i} className="text-[13px] leading-[1.5]">
                    <div className="flex items-center gap-2">
                      <span className={cn('text-text-secondary', fontClean)}>{r.original}</span>
                      <span className="text-text-secondary">&rarr;</span>
                      <span className={cn('text-text-primary font-medium', fontClean)}>{r.suggestion}</span>
                    </div>
                    <div className="text-[12px] text-text-secondary mt-1">{r.explanation}</div>
                  </div>
                ))}
              </div>
            </CollapsibleSection>

            {/* L1 Interference */}
            <CollapsibleSection title="L1 Interference" count={l1Interference.length} accentClass="bg-warm-soft text-accent-warm">
              <div className="flex flex-col gap-2.5">
                {l1Interference.map((l, i) => (
                  <div key={i} className="text-[13px] leading-[1.5]">
                    <div className={cn('text-text-secondary', fontClean)}>{l.original}</div>
                    <div className="text-[12px] text-text-secondary mt-1">{l.issue}</div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-[12px] text-text-secondary">&rarr;</span>
                      <span className={cn('text-[13px] text-text-primary font-medium', fontClean)}>{l.suggestion}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CollapsibleSection>

            {/* Alternative Expressions */}
            <CollapsibleSection title="Better Ways to Say It" count={alternatives.length} accentClass="bg-blue-soft text-accent-brand">
              <div className="flex flex-col gap-2.5">
                {alternatives.map((a, i) => (
                  <div key={i} className="text-[13px] leading-[1.5]">
                    <div className="flex items-center gap-2">
                      <span className={cn('text-text-secondary', fontClean)}>{a.original}</span>
                      <span className="text-text-secondary">&rarr;</span>
                      <span className={cn('text-text-primary font-medium', fontClean)}>{a.alternative}</span>
                    </div>
                    <div className="text-[12px] text-text-secondary mt-1">{a.explanation}</div>
                  </div>
                ))}
              </div>
            </CollapsibleSection>

            {/* Grammar */}
            <CollapsibleSection title="Grammar" count={grammar.length} accentClass="bg-bg-secondary text-text-secondary">
              <div className="flex flex-col gap-2">
                {grammar.map((g, i) => (
                  <div key={i} className="px-3 py-2.5 bg-bg-secondary rounded-lg">
                    <div className={cn('text-[14px] font-medium text-text-primary', fontClean)}>{g.pattern}</div>
                    <div className="text-[13px] text-text-secondary leading-[1.4] mt-1">{g.meaning}</div>
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          </>
        )}
      </div>
    </div>
  )
}
