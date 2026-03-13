'use client'

import { useEffect, useRef } from 'react'
import {
  ChatBubbleLeftRightIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline'
import { cn } from '@/lib/utils'
import { useOnboarding } from '@/hooks/use-onboarding'
import { CoachMark } from '@/components/onboarding/coach-mark'
import type { VoiceState, InputMode } from '@/hooks/use-voice-conversation'

export type ActivePanel = 'transcript' | 'feedback' | 'help' | null

interface VoiceControlsProps {
  voiceState: VoiceState
  isTalking: boolean
  onTalkStart: () => void
  onTalkEnd: () => void
  onTalkCancel: () => void
  correctionsCount: number
  activePanel: ActivePanel
  onTogglePanel: (panel: ActivePanel) => void
  onToggleChat?: () => void
  onRetry?: () => void
  canRetry?: boolean
  newFeedbackFlash?: boolean
  className?: string
  /** Input mode: 'ptt' for push-to-talk, 'vad' for voice activity detection */
  inputMode?: InputMode
  /** Whether mic is muted (used in VAD mode) */
  isMuted?: boolean
  /** Toggle mute (used in VAD mode) */
  onToggleMute?: () => void
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
  newFeedbackFlash,
  onToggleChat,
  className,
  inputMode = 'ptt',
  isMuted = false,
  onToggleMute,
}: VoiceControlsProps) {
  const ringRef = useRef<SVGCircleElement>(null)
  const startTimeRef = useRef<number>(0)
  const animRef = useRef<number>(0)
  const cancelledRef = useRef(false)
  const isTalkingRef = useRef(false)
  isTalkingRef.current = isTalking
  const canTalk = voiceState === 'IDLE' || voiceState === 'SPEAKING' || voiceState === 'THINKING'
  const isLocked = !canTalk && !isTalking

  const isVAD = inputMode === 'vad'

  // ── Onboarding hints ──
  const { isDismissed, dismiss } = useOnboarding()

  // Ring fill animation while holding (PTT only)
  useEffect(() => {
    if (isVAD) return
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
  }, [isTalking, isVAD])

  // Spacebar push-to-talk + Escape to cancel (PTT only)
  // In VAD mode: M to mute/unmute, Space to interrupt
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return

      if (isVAD) {
        // M to toggle mute
        if (e.key === 'm' || e.key === 'M') {
          e.preventDefault()
          onToggleMute?.()
        }
        return
      }

      // PTT mode
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault()
        if (canTalk) {
          isTalkingRef.current = true
          onTalkStart()
        }
      }

      if (e.key === 'Escape' && isTalkingRef.current) {
        e.preventDefault()
        e.stopPropagation()
        cancelledRef.current = true
        isTalkingRef.current = false
        onTalkCancel()
      }
    }
    const handleKeyUp = (e: KeyboardEvent) => {
      if (isVAD) return
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
  }, [canTalk, isTalking, onTalkStart, onTalkEnd, onTalkCancel, isVAD, onToggleMute])

  const chips: Array<{
    id: ActivePanel & string | 'chat'
    label: string
    badge: number | null
    icon: React.ReactNode
    isChat?: boolean
  }> = [
    {
      id: 'chat',
      label: 'Chat',
      badge: correctionsCount || null,
      icon: <ChatBubbleLeftRightIcon className="w-4 h-4" />,
      isChat: true,
    },
  ]

  const coachMarkContent = isVAD
    ? 'Just speak naturally. Press M to mute/unmute your mic.'
    : 'Hold spacebar or press the mic button to speak. Release to send.'

  return (
    <CoachMark
      hintId="hint_voice_spacebar"
      content={coachMarkContent}
      side="top"
      autoDismissMs={10000}
      show={voiceState === 'IDLE' && !isDismissed('hint_voice_spacebar')}
      onDismiss={() => dismiss('hint_voice_spacebar')}
    >
    <div className={cn('flex flex-col items-center gap-3 px-6 pb-6 pt-3 shrink-0', className)}>
      {/* Keyboard hints */}
      <div className="h-5 flex items-center gap-1.5 text-[12px] text-text-secondary">
        {isVAD ? (
          // VAD mode hints
          <>
            {isMuted ? (
              <>
                <span>Mic muted</span>
                <span className="mx-0.5 text-border-strong">&middot;</span>
                <kbd className="font-mono text-[11px] font-medium px-1.5 py-0.5 rounded-md bg-bg-pure border border-border text-text-secondary shadow-[0_1px_0_rgba(0,0,0,.06)]">M</kbd>
                <span>to unmute</span>
              </>
            ) : voiceState === 'IDLE' ? (
              <>
                <span>Speak naturally</span>
                <span className="mx-0.5 text-border-strong">&middot;</span>
                <kbd className="font-mono text-[11px] font-medium px-1.5 py-0.5 rounded-md bg-bg-pure border border-border text-text-secondary shadow-[0_1px_0_rgba(0,0,0,.06)]">M</kbd>
                <span>to mute</span>
                <span className="mx-0.5 text-border-strong">&middot;</span>
                <kbd className="font-mono text-[11px] font-medium px-1.5 py-0.5 rounded-md bg-bg-pure border border-border text-text-secondary shadow-[0_1px_0_rgba(0,0,0,.06)]">F</kbd>
                <span>for help</span>
              </>
            ) : voiceState === 'LISTENING' ? (
              <span>Listening...</span>
            ) : (voiceState === 'SPEAKING' || voiceState === 'THINKING') ? (
              <>
                <span>Speak to interrupt</span>
                <span className="mx-0.5 text-border-strong">&middot;</span>
                <kbd className="font-mono text-[11px] font-medium px-1.5 py-0.5 rounded-md bg-bg-pure border border-border text-text-secondary shadow-[0_1px_0_rgba(0,0,0,.06)]">M</kbd>
                <span>to mute</span>
              </>
            ) : null}
          </>
        ) : (
          // PTT mode hints
          <>
            {voiceState === 'IDLE' && !isTalking && (
              <>
                <kbd className="font-mono text-[11px] font-medium px-1.5 py-0.5 rounded-md bg-bg-pure border border-border text-text-secondary shadow-[0_1px_0_rgba(0,0,0,.06)]">Space</kbd>
                <span>to talk</span>
                <span className="mx-0.5 text-border-strong">&middot;</span>
                <kbd className="font-mono text-[11px] font-medium px-1.5 py-0.5 rounded-md bg-bg-pure border border-border text-text-secondary shadow-[0_1px_0_rgba(0,0,0,.06)]">F</kbd>
                <span>for help</span>
              </>
            )}
            {isTalking && (
              <>
                <span>Release or</span>
                <kbd className="font-mono text-[11px] font-medium px-1.5 py-0.5 rounded-md bg-bg-pure border border-border text-text-secondary shadow-[0_1px_0_rgba(0,0,0,.06)]">Space</kbd>
                <span>to send</span>
                <span className="mx-0.5 text-border-strong">&middot;</span>
                <kbd className="font-mono text-[11px] font-medium px-1.5 py-0.5 rounded-md bg-bg-pure border border-border text-text-secondary shadow-[0_1px_0_rgba(0,0,0,.06)]">Esc</kbd>
                <span>to cancel</span>
              </>
            )}
            {!isTalking && (voiceState === 'SPEAKING' || voiceState === 'THINKING') && (
              <>
                <kbd className="font-mono text-[11px] font-medium px-1.5 py-0.5 rounded-md bg-bg-pure border border-border text-text-secondary shadow-[0_1px_0_rgba(0,0,0,.06)]">Esc</kbd>
                <span>to interrupt</span>
              </>
            )}
          </>
        )}
      </div>

      {/* Main button — PTT hold button or VAD mute toggle */}
      {isVAD ? (
        <button
          onClick={onToggleMute}
          className={cn(
            'relative w-16 h-16 rounded-full cursor-pointer flex items-center justify-center select-none transition-all active:scale-[0.94]',
            isMuted
              ? 'bg-red-500/80 shadow-[0_3px_10px_rgba(239,68,68,.25)] hover:bg-red-500 hover:shadow-[0_6px_20px_rgba(239,68,68,.3)]'
              : 'bg-accent-brand shadow-[0_3px_10px_rgba(47,47,47,.22)] hover:bg-[#111] hover:scale-105 hover:shadow-[0_6px_20px_rgba(47,47,47,.3)]',
          )}
        >
          {isMuted ? (
            /* Mic off icon */
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.7" strokeLinecap="round">
              <path d="M1 1l22 22" />
              <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
              <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .76-.13 1.49-.35 2.17" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          ) : (
            /* Mic on icon */
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.7" strokeLinecap="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          )}
        </button>
      ) : (
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
      )}

      {/* Chip buttons */}
      <CoachMark
        hintId="hint_voice_feedback"
        content="Look up words, ask for help, or check your feedback here."
        side="top"
        show={isDismissed('hint_voice_spacebar') && !isDismissed('hint_voice_feedback')}
        onDismiss={() => dismiss('hint_voice_feedback')}
      >
      <div className="flex gap-2">
        {canRetry && (
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border text-[13px] font-sans cursor-pointer transition-colors bg-bg-pure border-border text-text-secondary hover:bg-bg-hover hover:text-text-primary hover:border-border-strong"
          >
            <ArrowPathIcon className="w-4 h-4" />
            Retry
          </button>
        )}
        {chips.map(({ id, label, badge, icon, isChat }) => {
          const isActive = isChat ? false : activePanel === id
          return (
            <button
              key={id}
              onClick={() => isChat ? onToggleChat?.() : onTogglePanel(isActive ? null : id as ActivePanel)}
              className={cn(
                'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border text-[13px] font-sans cursor-pointer transition-all duration-150',
                isActive
                  ? 'bg-bg-active border-border-strong text-text-primary font-medium'
                  : 'bg-bg-pure border-border text-text-secondary hover:bg-bg-hover hover:text-text-primary hover:border-border-strong',
                id === 'feedback' && newFeedbackFlash && 'scale-[1.08] shadow-[0_0_8px_rgba(200,87,42,.3)]',
              )}
            >
              {icon}
              {label}
              {badge != null && badge > 0 && (
                <span
                  className={cn(
                    'min-w-[18px] h-[18px] inline-flex items-center justify-center rounded-full text-[11px] font-bold px-1',
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
