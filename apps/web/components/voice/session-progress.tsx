'use client'

import { cn } from '@/lib/utils'
import { type SessionPlan, isTutorPlan } from '@/lib/session-plan'

interface SessionProgressProps {
  plan: SessionPlan | null
  className?: string
}

export function SessionProgress({ plan, className }: SessionProgressProps) {
  // Tutor: show step progress
  if (plan && isTutorPlan(plan) && plan.steps.length > 0) {
    const completed = plan.steps.filter((s) => s.status === 'completed').length
    const total = plan.steps.length
    return (
      <div className={cn('flex items-center gap-1.5', className)}>
        {plan.steps.map((s, i) => (
          <div
            key={i}
            className={cn(
              'w-2 h-2 rounded-full transition-colors',
              s.status === 'completed' ? 'bg-accent-brand' :
              s.status === 'active' ? 'bg-accent-brand animate-pulse' :
              s.status === 'skipped' ? 'bg-border-strong' :
              'bg-border',
            )}
            title={`${s.type}: ${s.title}`}
          />
        ))}
        <span className="text-[11px] text-text-muted ml-1">
          {completed}/{total}
        </span>
      </div>
    )
  }

  // Immersion/reference: show milestone progress
  if (!plan || !('milestones' in plan) || !Array.isArray(plan.milestones) || plan.milestones.length === 0) return null

  const milestones = plan.milestones as Array<{ description: string; completed: boolean }>
  const completed = milestones.filter((m) => m.completed).length
  const total = milestones.length

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      {milestones.map((m, i) => (
        <div
          key={i}
          className={cn(
            'w-2 h-2 rounded-full transition-colors',
            m.completed ? 'bg-accent-brand' : 'bg-border',
          )}
          title={m.description}
        />
      ))}
      <span className="text-[11px] text-text-muted ml-1">
        {completed}/{total}
      </span>
    </div>
  )
}
