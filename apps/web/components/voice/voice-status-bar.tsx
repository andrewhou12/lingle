'use client'

import { StopIcon } from '@heroicons/react/24/outline'
import { cn } from '@/lib/utils'
import { type SessionPlan, isTutorPlan } from '@/lib/session-plan'

interface VoiceStatusBarProps {
  title: string
  duration: number
  onEnd: () => void
  plan?: SessionPlan | null
  className?: string
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function PlanProgressDots({ plan }: { plan: SessionPlan }) {
  // Tutor: step progress dots
  if (isTutorPlan(plan) && plan.steps.length > 0) {
    return (
      <div className="flex items-center gap-1.5">
        {plan.steps.map((s, i) => (
          <div
            key={i}
            className={cn(
              'w-2.5 h-2.5 rounded-full transition-colors',
              s.status === 'completed' ? 'bg-accent-brand' :
              s.status === 'active' ? 'bg-accent-brand animate-pulse' :
              s.status === 'skipped' ? 'bg-border-strong' :
              'bg-border',
            )}
            title={`${s.type}: ${s.title}`}
          />
        ))}
      </div>
    )
  }

  // Immersion/reference: milestone dots
  if ('milestones' in plan && Array.isArray(plan.milestones) && plan.milestones.length > 0) {
    const milestones = plan.milestones as Array<{ description: string; completed: boolean }>
    return (
      <div className="flex items-center gap-1.5">
        {milestones.map((m, i) => (
          <div
            key={i}
            className={cn(
              'w-2.5 h-2.5 rounded-full transition-colors',
              m.completed ? 'bg-accent-brand' : 'bg-border',
            )}
            title={m.description}
          />
        ))}
      </div>
    )
  }

  // Conversation: no progress dots
  return null
}

export function VoiceStatusBar({ title, duration, onEnd, plan, className }: VoiceStatusBarProps) {
  return (
    <div className={cn('flex items-center justify-between px-6 h-12 shrink-0', className)}>
      {/* Left: title + timer */}
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-[14px] font-medium text-text-primary truncate max-w-[300px]">
          {title}
        </span>
        <span className="text-[13px] text-text-muted font-mono tabular-nums">
          {formatDuration(duration)}
        </span>
      </div>

      {/* Center: progress dots */}
      {plan && <PlanProgressDots plan={plan} />}

      {/* Right: end button */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={onEnd}
          className="inline-flex items-center gap-1.5 rounded-lg bg-warm-soft px-3 py-1.5 text-[13px] font-medium text-accent-warm border-none cursor-pointer transition-colors hover:bg-warm-med"
        >
          <StopIcon className="w-3 h-3" />
          End
        </button>
      </div>
    </div>
  )
}
