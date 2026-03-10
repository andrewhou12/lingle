'use client'

import {
  StopIcon,
  DocumentTextIcon,
  ChatBubbleLeftIcon,
} from '@heroicons/react/24/outline'
import { cn } from '@/lib/utils'
import type { SessionPlan } from '@/lib/session-plan'
interface VoiceNavBarProps {
  plan: SessionPlan | null
  duration: number
  transcriptCount: number
  isPlanOpen: boolean
  isTranscriptOpen: boolean
  isSubtitlesOn: boolean
  onTogglePlan: () => void
  onToggleTranscript: () => void
  onToggleSubtitles: () => void
  onEnd: () => void
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function SegmentBtn({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'relative inline-flex items-center gap-1.5 px-3 py-[5px] rounded-md text-[12px] font-medium font-sans cursor-pointer transition-all duration-150',
        active
          ? 'bg-[var(--toggle-active-bg)] text-[var(--toggle-text-active)] shadow-[var(--toggle-active-shadow)]'
          : 'bg-transparent text-[var(--toggle-text)] hover:text-[var(--toggle-text-active)]',
      )}
    >
      {icon}
      {label}
    </button>
  )
}

export function VoiceNavBar({
  plan,
  duration,
  isPlanOpen,
  isTranscriptOpen,
  isSubtitlesOn,
  onTogglePlan,
  onToggleTranscript,
  onToggleSubtitles,
  onEnd,
}: VoiceNavBarProps) {
  return (
    <nav className="flex items-center px-5 h-[54px] z-20 relative shrink-0">
      {/* Left — Mode + timer */}
      <div className="flex-1 flex items-center gap-2.5">
        <span className="px-2 py-0.5 rounded-md bg-[var(--toggle-bg)] text-[11px] font-medium text-text-muted capitalize">
          {plan?.mode || 'voice'}
        </span>
        <div className="w-px h-[14px] bg-border shrink-0" />
        <span className="font-sans text-[12px] text-text-muted tabular-nums">
          {formatDuration(duration)}
        </span>
      </div>

      {/* Center — Segmented toggle */}
      <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-0.5 p-[3px] rounded-lg bg-[var(--toggle-bg)]">
        <SegmentBtn
          active={isPlanOpen}
          onClick={onTogglePlan}
          label="Plan"
          icon={<DocumentTextIcon className="w-3.5 h-3.5" />}
        />
        <SegmentBtn
          active={isTranscriptOpen}
          onClick={onToggleTranscript}
          label="Transcript"
          icon={<ChatBubbleLeftIcon className="w-3.5 h-3.5" />}
        />
        <SegmentBtn
          active={isSubtitlesOn}
          onClick={onToggleSubtitles}
          label="Subtitles"
          icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <rect x="2" y="7" width="20" height="14" rx="2" />
              <line x1="6" y1="12" x2="10" y2="12" />
              <line x1="6" y1="16" x2="14" y2="16" />
              <line x1="12" y1="12" x2="18" y2="12" />
            </svg>
          }
        />
      </div>

      {/* Right — End session */}
      <div className="flex-1 flex justify-end">
        <button
          onClick={onEnd}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-warm-soft border border-warm-med text-[13px] font-medium text-accent-warm cursor-pointer transition-colors hover:bg-warm-med"
        >
          <StopIcon className="w-3.5 h-3.5" />
          End
        </button>
      </div>
    </nav>
  )
}
