'use client'

import { MessageSquare, Square, FileText, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SessionPlan } from '@/lib/session-plan'

interface VoiceNavBarProps {
  plan: SessionPlan | null
  duration: number
  transcriptCount: number
  isPlanOpen: boolean
  onTogglePlan: () => void
  onOpenTranscript: () => void
  onEnd: () => void
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function getScenarioInfo(plan: SessionPlan | null): { icon: string; name: string; jp: string } {
  if (!plan) return { icon: '💬', name: 'Voice Conversation', jp: '会話' }
  if (plan.mode === 'conversation') {
    return { icon: '💬', name: plan.topic?.slice(0, 30) || 'Conversation', jp: '会話練習' }
  }
  if (plan.mode === 'tutor') {
    return { icon: '📚', name: plan.topic?.slice(0, 30) || 'Tutor Session', jp: 'レッスン' }
  }
  return { icon: '🎧', name: 'focus' in plan ? (plan as { focus: string }).focus.slice(0, 30) : 'Session', jp: '練習' }
}

export function VoiceNavBar({
  plan, duration, transcriptCount,
  isPlanOpen, onTogglePlan, onOpenTranscript, onEnd,
}: VoiceNavBarProps) {
  const scenario = getScenarioInfo(plan)

  return (
    <nav className="flex items-center justify-between px-5 h-[54px] bg-[rgba(255,255,255,.93)] backdrop-blur-[24px] saturate-150 border-b border-[rgba(228,224,217,.7)] z-20 relative shrink-0">
      {/* Left */}
      <div className="flex items-center gap-2">
        <button
          onClick={onTogglePlan}
          className={cn(
            'inline-flex items-center gap-[5px] text-[12px] font-medium text-text-secondary bg-bg-secondary border-[1.5px] border-border rounded-[10px] px-2.5 py-[5px] cursor-pointer transition-all font-sans hover:bg-bg-hover hover:border-border-strong hover:text-text-primary',
            isPlanOpen && 'bg-bg-active border-border-strong text-text-primary',
          )}
        >
          <FileText size={13} />
          Session Plan
          <ChevronDown size={10} className={cn('transition-transform', isPlanOpen && 'rotate-180')} />
        </button>

        <div className="w-px h-[18px] bg-border shrink-0" />

        <div className="flex items-center gap-1.5">
          <span className="text-[14px]">{scenario.icon}</span>
          <span className="text-[13px] font-medium text-text-primary">{scenario.name}</span>
          <span className="font-jp text-[10px] text-text-muted tracking-[.12em]">{scenario.jp}</span>
        </div>
      </div>

      {/* Center */}
      <div className="absolute left-1/2 -translate-x-1/2">
        <div className="flex items-center gap-1.5 text-[11.5px] text-text-secondary bg-bg-secondary border border-border px-3 py-1 rounded-full">
          <div className="w-[7px] h-[7px] rounded-full bg-green" />
          {plan?.mode === 'tutor' ? 'Lesson' : 'Conversation'}
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-[7px]">
        <button
          onClick={onOpenTranscript}
          className="inline-flex items-center gap-[5px] text-[12.5px] font-medium text-text-secondary bg-bg-secondary border-[1.5px] border-border rounded-[10px] px-2.5 py-[5px] cursor-pointer transition-all font-sans hover:bg-bg-hover hover:border-border-strong hover:text-text-primary"
        >
          <MessageSquare size={13} />
          Transcript
          {transcriptCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[15px] h-[15px] px-[3px] bg-accent-warm text-white text-[9px] font-bold rounded-[8px]">
              {transcriptCount}
            </span>
          )}
        </button>

        <span className="font-mono text-[12.5px] text-text-muted tracking-[.04em] tabular-nums">
          {formatDuration(duration)}
        </span>

        <button
          onClick={onEnd}
          className="inline-flex items-center gap-[5px] text-[12px] font-medium text-white bg-red border-none rounded-[10px] px-3 py-1.5 cursor-pointer transition-all shadow-[0_1px_3px_rgba(220,53,69,.3)] hover:brightness-90 hover:-translate-y-px"
        >
          <Square size={9} fill="currentColor" />
          End
        </button>
      </div>
    </nav>
  )
}
