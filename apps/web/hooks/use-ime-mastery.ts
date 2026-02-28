'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import type { DictEntry } from '@/lib/kana-dictionary'

export interface MasteryInfo {
  masteryState: string
  id: number
}

export interface EnrichedCandidate extends DictEntry {
  mastery: MasteryInfo | null
}

/**
 * Bulk-prefetches the learner's entire word bank on mount, then provides
 * synchronous mastery lookups and mastery-aware candidate sorting.
 *
 * Sorting order:
 *   1. Known words (in word bank), sorted by dictionary frequency (lower = more common)
 *   2. Unknown words, sorted by dictionary frequency
 *   3. Kana fallbacks (meaning === '(kana)') always last
 */
export function useIMEMastery(candidates: DictEntry[]): EnrichedCandidate[] {
  const [masteryMap, setMasteryMap] = useState<Map<string, MasteryInfo>>(new Map())
  const [loaded, setLoaded] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const fetchAllMastery = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch('/api/ime/mastery-bulk', { signal: controller.signal })
      if (!res.ok) return
      const data: Record<string, MasteryInfo> = await res.json()
      const map = new Map<string, MasteryInfo>()
      for (const [sf, info] of Object.entries(data)) {
        map.set(sf, info)
      }
      setMasteryMap(map)
      setLoaded(true)
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      // Silently fail — mastery indicators are non-critical
    }
  }, [])

  useEffect(() => {
    fetchAllMastery()
    return () => {
      abortRef.current?.abort()
    }
  }, [fetchAllMastery])

  // Enrich and re-sort candidates synchronously from the prefetched map
  return useMemo(() => {
    const enriched: EnrichedCandidate[] = candidates.map((c) => ({
      ...c,
      mastery: masteryMap.get(c.surface) ?? null,
    }))

    if (!loaded) return enriched

    const known: EnrichedCandidate[] = []
    const unknown: EnrichedCandidate[] = []
    const kana: EnrichedCandidate[] = []

    for (const c of enriched) {
      if (c.meaning === '(kana)') {
        kana.push(c)
      } else if (c.mastery) {
        known.push(c)
      } else {
        unknown.push(c)
      }
    }

    // Within each group, preserve dictionary frequency order (already sorted by freq from lookup)
    return [...known, ...unknown, ...kana]
  }, [candidates, masteryMap, loaded])
}
