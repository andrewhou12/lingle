'use client'

import { useEffect, useRef } from 'react'
import {
  MagnifyingGlassIcon,
  QuestionMarkCircleIcon,
  PencilSquareIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline'
import { cn } from '@/lib/utils'
import { useOnboarding } from '@/hooks/use-onboarding'
import { CoachMark } from '@/components/onboarding/coach-mark'
import type { VoiceState } from '@/hooks/use-voice-conversation'

export type ActivePanel = 'transcript' | 'feedback' | 'help' | 'lookup' | null

interface VoiceControlsProps {
  voiceState: VoiceState
  isTalking: boolean
  onTalkStart: () => void
  onTalkEnd: () => void
  onTalkCancel: () => void
  correctionsCount: number
  activePanel: ActivePanel
  onTogglePanel: (panel: ActivePanel) => void
  onRetry?: () => void
  canRetry?: boolean
  className?: string
}

const CIRC = 2 * Math.PI * 33
const SPEAK_DUR = 15000

export function VoiceControls({
  voiceState,
  isTalking,
  onTalkStart,
  onTalkEnd,
  onTalkCancel,
  correctionsCount,
  activePanel,
  onTogglePanel,
  onRetry,
  canRetry,
  className,
}: VoiceControlsProps) {
  const ringRef = useRef<SVGCircleElement>(null)
  const startTimeRef = useRef<number>(0)
  const animRef = useRef<number>(0)
  const cancelledRef = useRef(false)
  const canTalk = voiceState === 'IDLE' || voiceState === 'SPEAKING' || voiceState === 'THINKING'
  const isLocked = !canTalk && !isTalking

  // ── Onboarding hints ──
  const { isDismissed, dismiss } = useOnboarding()

  // Ring fill animation while holding
  useEffect(() => {
    if (isTalking) {
      startTimeRef.current = Date.now()
      const tick = () => {
        const progress = Math.min((Date.now() - startTimeRef.current) / SPEAK_DUR, 1)
        if (ringRef.current) {
          ringRef.current.style.strokeDashoffset = String(CIRC * (1 - progress))
        }
        if (progress < 1) animRef.current = requestAnimationFrame(tick)
      }
      animRef.current = requestAnimationFrame(tick)
    } else {
      cancelAnimationFrame(animRef.current)
      if (ringRef.current) {
        ringRef.current.style.strokeDashoffset = String(CIRC)
      }
    }
    return () => cancelAnimationFrame(animRef.current)
  }, [isTalking])

  // Spacebar push-to-talk + Escape to cancel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return

      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault()
        if (canTalk) onTalkStart()
      }

      if (e.key === 'Escape' && isTalking) {
        e.preventDefault()
        e.stopPropagation()
        cancelledRef.current = true
        onTalkCancel()
      }
    }
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return
      e.preventDefault()
      if (cancelledRef.current) {
        cancelledRef.current = false
        return
      }
      onTalkEnd()
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [canTalk, isTalking, onTalkStart, onTalkEnd, onTalkCancel])

  const chips: Array<{
    id: ActivePanel & string
    label: string
    badge: number | null
    icon: React.ReactNode
  }> = [
    {
      id: 'lookup',
      label: 'Look up',
      badge: null,
      icon: <MagnifyingGlassIcon className="w-3.5 h-3.5" />,
    },
    {
      id: 'help',
      label: 'Stuck?',
      badge: null,
      icon: <QuestionMarkCircleIcon className="w-3.5 h-3.5" />,
    },
    {
      id: 'feedback',
      label: 'Feedback',
      badge: correctionsCount || null,
      icon: <PencilSquareIcon className="w-3.5 h-3.5" />,
    },
  ]

  return (
    <CoachMark
      hintId="hint_voice_spacebar"
      content="Hold spacebar or press the mic button to speak. Release to send."
      side="top"
      autoDismissMs={10000}
      show={voiceState === 'IDLE' && !isDismissed('hint_voice_spacebar')}
      onDismiss={() => dismiss('hint_voice_spacebar')}
    >
    <div className={cn('flex flex-col items-center gap-3 px-6 pb-6 pt-3 shrink-0', className)}>
      {/* Keyboard hints — uses app's standard text sizing */}
      <div className="h-5 flex items-center gap-1.5 text-[11px] text-text-muted">
        {voiceState === 'IDLE' && !isTalking && (
          <>
            <kbd className="font-mono text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-bg-pure border border-border text-text-secondary shadow-[0_1px_0_rgba(0,0,0,.06)]">Space</kbd>
            <span>to talk</span>
          </>
        )}
        {isTalking && (
          <>
            <span className="text-text-secondary">Release or</span>
            <kbd className="font-mono text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-bg-pure border border-border text-text-secondary shadow-[0_1px_0_rgba(0,0,0,.06)]">Space</kbd>
            <span>to send</span>
            <span className="mx-0.5 text-border-strong">&middot;</span>
            <kbd className="font-mono text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-bg-pure border border-border text-text-secondary shadow-[0_1px_0_rgba(0,0,0,.06)]">Esc</kbd>
            <span>to cancel</span>
          </>
        )}
        {!isTalking && (voiceState === 'SPEAKING' || voiceState === 'THINKING') && (
          <>
            <kbd className="font-mono text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-bg-pure border border-border text-text-secondary shadow-[0_1px_0_rgba(0,0,0,.06)]">Esc</kbd>
            <span>to interrupt</span>
          </>
        )}
      </div>

      {/* PTT button — matches primary CTA pattern */}
      <button
        onMouseDown={canTalk ? onTalkStart : undefined}
        onMouseUp={onTalkEnd}
        onMouseLeave={isTalking ? onTalkEnd : undefined}
        onTouchStart={canTalk ? (e) => { e.preventDefault(); onTalkStart() } : undefined}
        onTouchEnd={(e) => { e.preventDefault(); onTalkEnd() }}
        className={cn(
          'relative w-16 h-16 rounded-full cursor-pointer flex items-center justify-center select-none transition-all active:scale-[0.94]',
          isTalking
            ? 'bg-accent-warm shadow-[0_4px_20px_rgba(200,87,42,.35)]'
            : 'bg-accent-brand shadow-[0_3px_10px_rgba(47,47,47,.22)] hover:bg-[#111] hover:scale-105 hover:shadow-[0_6px_20px_rgba(47,47,47,.3)]',
          isLocked && 'opacity-30 pointer-events-none',
        )}
      >
        {/* Ring progress */}
        <svg className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none" viewBox="0 0 72 72">
          <circle cx="36" cy="36" r="33" fill="none" stroke="rgba(255,255,255,.15)" strokeWidth="1.5" />
          <circle
            ref={ringRef}
            cx="36" cy="36" r="33"
            fill="none" stroke="white" strokeWidth="1.5"
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={CIRC}
            className={cn('transition-none', !isTalking && 'opacity-0', isTalking && 'opacity-60')}
          />
        </svg>

        {/* Mic icon */}
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.7" strokeLinecap="round">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="8" y1="23" x2="16" y2="23" />
        </svg>
      </button>

      {/* Chip buttons — matches suggestion chip pattern from the app */}
      <CoachMark
        hintId="hint_voice_feedback"
        content="Look up words, ask for help, or check your feedback here."
        side="top"
        show={isDismissed('hint_voice_spacebar') && !isDismissed('hint_voice_feedback')}
        onDismiss={() => dismiss('hint_voice_feedback')}
      >
      <div className="flex gap-1.5">
        {canRetry && (
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[12px] font-sans cursor-pointer transition-colors bg-bg-pure border-border text-text-secondary hover:bg-bg-hover hover:text-text-primary hover:border-border-strong"
          >
            <ArrowPathIcon className="w-3.5 h-3.5" />
            Retry
          </button>
        )}
        {chips.map(({ id, label, badge, icon }) => {
          const isActive = activePanel === id
          return (
            <button
              key={id}
              onClick={() => onTogglePanel(isActive ? null : id)}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[12px] font-sans cursor-pointer transition-colors',
                isActive
                  ? 'bg-bg-active border-border-strong text-text-primary font-medium'
                  : 'bg-bg-pure border-border text-text-secondary hover:bg-bg-hover hover:text-text-primary hover:border-border-strong',
              )}
            >
              {icon}
              {label}
              {badge != null && badge > 0 && (
                <span
                  className={cn(
                    'min-w-[16px] h-[16px] inline-flex items-center justify-center rounded-full text-[10px] font-bold px-1',
                    isActive
                      ? 'bg-accent-warm/15 text-accent-warm'
                      : 'bg-warm-soft text-accent-warm',
                  )}
                >
                  {badge}
                </span>
              )}
            </button>
          )
        })}
      </div>
      </CoachMark>
    </div>
    </CoachMark>
  )
}
