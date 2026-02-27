'use client'

import { useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

type MasteryTier = 'new' | 'apprentice' | 'journeyman' | 'expert' | 'master' | 'burned'

interface VocabPopoverProps {
  surface: string
  reading?: string
  meaning?: string
  partOfSpeech?: string
  tier?: MasteryTier
  example?: string
  children: React.ReactNode
}

const MASTERY_STAGES = ['unseen', 'app1', 'app2', 'app3', 'app4', 'jour', 'exp'] as const
const tierToIndex: Record<MasteryTier, number> = {
  new: 0,
  apprentice: 2,
  journeyman: 5,
  expert: 6,
  master: 6,
  burned: 6,
}

function MasteryTrack({ tier }: { tier: MasteryTier }) {
  const current = tierToIndex[tier]
  return (
    <div className="flex gap-0.5">
      {MASTERY_STAGES.map((_, i) => (
        <div
          key={i}
          className={cn(
            'h-1.5 flex-1 rounded-full',
            i < current ? 'bg-green' : i === current ? 'bg-accent-brand' : 'bg-bg-active'
          )}
        />
      ))}
    </div>
  )
}

export function VocabPopover({ surface, reading, meaning, partOfSpeech, tier = 'new', example, children }: VocabPopoverProps) {
  const [saved, setSaved] = useState(false)

  return (
    <Popover>
      <PopoverTrigger asChild>
        {children}
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-[280px] p-0">
        <div className="p-4 flex flex-col gap-3">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex flex-col gap-1">
              <span className="text-2xl font-jp font-bold text-text-primary">{surface}</span>
              {reading && <span className="text-[13px] text-text-muted">{reading}</span>}
            </div>
            {partOfSpeech && (
              <span className="inline-flex items-center rounded-full bg-bg-secondary px-2 py-0.5 text-[10px] font-medium text-text-muted uppercase">
                {partOfSpeech}
              </span>
            )}
          </div>

          {/* Meaning */}
          <span className="text-[14px] text-text-secondary">{meaning}</span>

          {/* Mastery track */}
          <MasteryTrack tier={tier} />

          {/* Example */}
          {example && (
            <div className="p-2.5 bg-bg-secondary rounded-lg">
              <span className="text-[13px] font-jp text-text-primary">{example}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => setSaved(!saved)}
              className={cn(
                'flex-1 py-1.5 rounded-lg text-[12px] font-medium border cursor-pointer transition-colors',
                saved
                  ? 'bg-green-soft border-green text-green'
                  : 'bg-bg-pure border-border text-text-secondary hover:bg-bg-hover'
              )}
            >
              {saved ? '✓ Saved' : 'Add to deck'}
            </button>
            <button className="py-1.5 px-3 rounded-lg text-[12px] border border-border bg-bg-pure text-text-muted cursor-default hover:bg-bg-hover transition-colors">
              🔊
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
