'use client'

import { useState } from 'react'
import { Skeleton } from '@/components/skeleton'
import { useFrontier } from '@/hooks/use-frontier'
import { ViewToggle, type FrontierView } from './view-toggle'
import { LevelBarsView } from './level-bars-view'
import { DotMapView } from './dot-map-view'
import { RadarLevelsView } from './radar-levels-view'

export function FrontierContainer() {
  const { data, isLoading } = useFrontier()
  const [view, setView] = useState<FrontierView>('levels')

  if (isLoading) {
    return (
      <div className="mt-5 rounded-xl border border-border bg-bg p-4">
        <div className="flex flex-col gap-3">
          <Skeleton width={160} height={18} />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex gap-3 items-center">
              <Skeleton width={32} height={14} />
              <Skeleton width="100%" height={20} borderRadius={4} />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="mt-5 rounded-xl border border-border bg-bg p-4">
        <span className="text-[13px] text-text-muted">
          Complete onboarding to see your learning frontier.
        </span>
      </div>
    )
  }

  return (
    <div className="mt-5 rounded-xl border border-border bg-bg p-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold">Learning Frontier</h3>
        <ViewToggle value={view} onChange={setView} />
      </div>

      <div>
        {view === 'levels' && <LevelBarsView data={data} />}
        {view === 'map' && <DotMapView data={data} />}
        {view === 'skills' && <RadarLevelsView data={data} />}
      </div>
    </div>
  )
}
