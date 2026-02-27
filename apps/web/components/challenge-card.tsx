'use client'

import { Check, Circle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ExpandedSessionPlan } from '@linguist/shared/types'

interface ChallengeCardProps {
  plan: ExpandedSessionPlan
  targetsHit: Set<string>
}

type TagCategory = 'grammar' | 'vocab' | 'stretch'

function CategoryTag({ category }: { category: TagCategory }) {
  const styles: Record<TagCategory, string> = {
    grammar: 'bg-purple-soft text-purple',
    vocab: 'bg-warm-soft text-warm',
    stretch: 'bg-blue-soft text-blue',
  }
  const labels: Record<TagCategory, string> = {
    grammar: 'Grammar',
    vocab: 'Vocab',
    stretch: 'Stretch',
  }
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium', styles[category])}>
      {labels[category]}
    </span>
  )
}

export function ChallengeCard({ plan, targetsHit }: ChallengeCardProps) {
  const vocabTargets = plan.targetVocabulary ?? []
  const grammarTargets = plan.targetGrammar ?? []
  const curriculumItems = plan.curriculumNewItems ?? []

  const allTargets: Array<{ id: string; label: string; category: TagCategory }> = [
    ...vocabTargets.map((id) => ({ id: String(id), label: `Vocab #${id}`, category: 'vocab' as TagCategory })),
    ...grammarTargets.map((id) => ({ id: String(id), label: `Grammar #${id}`, category: 'grammar' as TagCategory })),
    ...curriculumItems.map((c) => ({
      id: c.surfaceForm ?? c.patternId ?? 'unknown',
      label: c.surfaceForm ?? c.patternId ?? 'New item',
      category: (c.itemType === 'grammar' ? 'grammar' : c.reason?.includes('stretch') ? 'stretch' : 'vocab') as TagCategory,
    })),
  ]

  if (allTargets.length === 0) return null

  const hitCount = allTargets.filter((t) => targetsHit.has(t.id)).length

  return (
    <div className="bg-bg-pure rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] border border-border-subtle p-4 my-3">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[13px] font-semibold text-text-primary">
          Today&apos;s Challenges
        </span>
        <span className="text-[11px] text-text-muted">
          {hitCount}/{allTargets.length} completed
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {allTargets.map((target) => {
          const isHit = targetsHit.has(target.id)
          return (
            <div key={target.id} className="flex items-center gap-2.5">
              {isHit ? (
                <div className="w-5 h-5 rounded-full bg-green flex items-center justify-center shrink-0">
                  <Check size={12} className="text-white" />
                </div>
              ) : (
                <div className="w-5 h-5 rounded-full border-2 border-border shrink-0" />
              )}
              <span
                className={cn(
                  'text-[13px] flex-1',
                  isHit ? 'text-text-muted line-through' : 'text-text-primary'
                )}
              >
                {target.label}
              </span>
              <CategoryTag category={target.category} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
