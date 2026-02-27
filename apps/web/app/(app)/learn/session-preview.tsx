'use client'

import { useState } from 'react'
import { X, RefreshCw, ArrowRight } from 'lucide-react'
import type { KnowledgeBubble, CurriculumRecommendation } from '@linguist/shared/types'
import { Spinner } from '@/components/spinner'
import { cn } from '@/lib/utils'

interface SessionPreviewProps {
  bubble: KnowledgeBubble | null
  recommendations: CurriculumRecommendation[]
  isLoading: boolean
  onSkip: (id: number) => void
  onRefresh: () => void
  onStart: () => void
}

export function SessionPreview({
  bubble,
  recommendations,
  isLoading,
  onSkip,
  onRefresh,
  onStart,
}: SessionPreviewProps) {
  const [skippedIds, setSkippedIds] = useState<Set<number>>(new Set())

  const handleSkip = (id: number) => {
    setSkippedIds((prev) => new Set(prev).add(id))
    onSkip(id)
  }

  const visibleRecs = recommendations.filter((r) => r.id != null && !skippedIds.has(r.id))
  const vocabRecs = visibleRecs.filter((r) => r.itemType === 'lexical')
  const grammarRecs = visibleRecs.filter((r) => r.itemType === 'grammar')

  return (
    <div className="max-w-[640px] mx-auto">
      <h1 className="text-[28px] font-bold mb-6">
        Learn
      </h1>

      {bubble && (
        <div className="rounded-xl border border-border bg-bg p-4 mb-6">
          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-medium text-text-muted">
              Knowledge Frontier
            </span>
            <div className="flex flex-col gap-1">
              {bubble.levelBreakdowns
                .filter((lb) => lb.totalReferenceItems > 0)
                .map((lb) => (
                  <div key={lb.level} className="flex items-center gap-3 py-1 px-2">
                    <span className="text-[13px] font-bold w-8">{lb.level}</span>
                    <div className="flex-1 h-4 rounded bg-bg-active relative overflow-hidden">
                      <div className="absolute top-0 left-0 bottom-0 rounded bg-accent-brand/15" style={{ width: `${Math.round(lb.coverage * 100)}%` }} />
                      <div className="absolute top-0 left-0 bottom-0 rounded bg-accent-brand" style={{ width: `${lb.totalReferenceItems > 0 ? Math.round((lb.productionReady / lb.totalReferenceItems) * 100) : 0}%` }} />
                    </div>
                    <span className="text-[11px] text-text-muted w-10 text-right">{Math.round(lb.coverage * 100)}%</span>
                  </div>
                ))}
            </div>
            <div className="flex gap-3 items-center">
              <div className="flex gap-2 items-center">
                <div className="w-2.5 h-2.5 rounded-sm bg-accent-brand" />
                <span className="text-[11px] text-text-muted">production</span>
              </div>
              <div className="flex gap-2 items-center">
                <div className="w-2.5 h-2.5 rounded-sm bg-accent-brand/15" />
                <span className="text-[11px] text-text-muted">recognition</span>
              </div>
            </div>
            {bubble.gapsInCurrentLevel.length > 0 && (
              <span className="text-[13px] text-text-muted">
                Gaps: {bubble.gapsInCurrentLevel.length} items in {bubble.currentLevel} remaining
              </span>
            )}
          </div>
        </div>
      )}

      <h2 className="text-lg font-bold mb-3">
        Today&apos;s Targets
      </h2>

      {isLoading ? (
        <div className="flex items-center gap-3 mb-6">
          <Spinner size={16} />
          <span className="text-text-muted text-[13px]">Loading recommendations...</span>
        </div>
      ) : visibleRecs.length === 0 ? (
        <span className="text-text-muted text-[13px]">No recommendations available. Try refreshing.</span>
      ) : (
        <div className="flex flex-col gap-3 mb-6">
          {vocabRecs.length > 0 && (
            <div className="flex gap-3 flex-wrap">
              {vocabRecs.map((rec) => (
                <div key={rec.id} className="min-w-[180px] flex-[1_1_180px] max-w-[280px] rounded-xl border border-border bg-bg p-4">
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between items-start">
                      <span className="text-lg font-bold">{rec.surfaceForm}</span>
                      <button
                        className="shrink-0 bg-transparent border-none cursor-pointer text-text-muted p-1"
                        onClick={() => handleSkip(rec.id!)}
                      >
                        <X size={14} />
                      </button>
                    </div>
                    {rec.reading && <span className="text-[13px] text-text-muted">{rec.reading}</span>}
                    <span className="text-[13px]">{rec.meaning}</span>
                    <div className="flex gap-2">
                      <span className="inline-flex py-0.5 px-2 rounded-full bg-bg-secondary text-[11px] font-medium text-text-secondary">Vocab</span>
                      {rec.cefrLevel && <span className="inline-flex py-0.5 px-2 rounded-full border border-border text-[11px] text-text-muted">{rec.cefrLevel}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {grammarRecs.length > 0 && (
            <div className="flex gap-3 flex-wrap">
              {grammarRecs.map((rec) => (
                <div key={rec.id} className="min-w-[180px] flex-[1_1_180px] max-w-[280px] rounded-xl border border-border bg-bg p-4">
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between items-start">
                      <span className="text-lg font-bold">{rec.surfaceForm ?? rec.patternId}</span>
                      <button
                        className="shrink-0 bg-transparent border-none cursor-pointer text-text-muted p-1"
                        onClick={() => handleSkip(rec.id!)}
                      >
                        <X size={14} />
                      </button>
                    </div>
                    {rec.meaning && <span className="text-[13px]">{rec.meaning}</span>}
                    <div className="flex gap-2">
                      <span className="inline-flex py-0.5 px-2 rounded-full bg-[rgba(139,92,246,.08)] text-[11px] font-medium text-[#8b5cf6]">Grammar</span>
                      {rec.cefrLevel && <span className="inline-flex py-0.5 px-2 rounded-full border border-border text-[11px] text-text-muted">{rec.cefrLevel}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex gap-3 justify-end">
        <button
          className={cn(
            "inline-flex items-center gap-1.5 py-2 px-4 rounded-md bg-bg-secondary text-text-secondary text-[13px] font-medium border-none cursor-pointer transition-colors duration-150 hover:bg-bg-hover",
            isLoading && "opacity-50"
          )}
          onClick={onRefresh}
          disabled={isLoading}
        >
          <RefreshCw size={14} />
          Refresh
        </button>
        <button
          className={cn(
            "inline-flex items-center gap-1.5 py-2 px-4 rounded-md bg-accent-brand text-white text-[13px] font-medium border-none cursor-pointer",
            (isLoading || visibleRecs.length === 0) && "opacity-50"
          )}
          onClick={onStart}
          disabled={isLoading || visibleRecs.length === 0}
        >
          Start Session
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  )
}
