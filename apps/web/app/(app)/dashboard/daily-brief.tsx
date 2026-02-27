'use client'

import { useEffect, useState } from 'react'
import type { FrontierData, TomBrief } from '@linguist/shared/types'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

function getCacheKey(): string {
  const today = new Date().toISOString().slice(0, 10)
  return `daily-brief-${today}`
}

export function DailyBrief({ frontier }: { frontier: FrontierData }) {
  const [text, setText] = useState<string>('')
  const [isPolished, setIsPolished] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      let brief: TomBrief | null = null
      try {
        brief = await api.tomGetBrief()
      } catch {
        // ToM brief unavailable
      }

      const draft = await api.narrativeBuildDraft(frontier, brief)
      if (cancelled) return

      setText(draft.templateText)

      const cacheKey = getCacheKey()
      const cached = localStorage.getItem(cacheKey)
      if (cached) {
        setText(cached)
        setIsPolished(true)
        return
      }

      try {
        const polished = await api.narrativePolish(draft)
        if (cancelled) return
        if (polished && polished !== draft.templateText) {
          setText(polished)
          setIsPolished(true)
          localStorage.setItem(cacheKey, polished)
        }
      } catch {
        // API unavailable
      }
    }

    load()
    return () => { cancelled = true }
  }, [frontier])

  if (!text) return null

  return (
    <div className="mt-5 rounded-xl border border-border bg-bg p-4 border-l-[3px] border-l-accent-brand">
      <div className="flex flex-col gap-2">
        <span className="text-[11px] text-text-muted font-medium">
          {isPolished ? 'AI summary' : 'Summary'}
        </span>
        <p className={cn('text-[13px] leading-[1.6] m-0', isPolished ? 'italic' : 'not-italic')}>
          {text}
        </p>
      </div>
    </div>
  )
}
