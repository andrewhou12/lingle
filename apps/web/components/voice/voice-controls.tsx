'use client'

import { useEffect, useRef } from 'react'
import { ArrowPathIcon, BookOpenIcon } from '@heroicons/react/24/outline'
import { cn } from '@/lib/utils'
import type { VoiceState } from '@/hooks/use-voice-conversation'

interface VoiceControlsProps {
  voiceState: VoiceState
  isTalking: boolean
  onTalkStart: () => void
  onTalkEnd: () => void
  onTalkCancel: () => void
  vocabCount: number
  onOpenVocab: () => void
  onReplay: () => void
  className?: string
}

const CIRC = 2 * Math.PI * 33 // ring circumference for r=33
const SPEAK_DUR = 15000 // max ring fill duration

export function VoiceControls({
  voiceState, isTalking, onTalkStart, onTalkEnd, onTalkCancel,
  vocabCount, onOpenVocab, onReplay, className,
}: VoiceControlsProps) {
  const ringRef = useRef<SVGCircleElement>(null)
  const startTimeRef = useRef<number>(0)
  const animRef = useRef<number>(0)
  const canTalk = voiceState === 'IDLE' || voiceState === 'SPEAKING' || voiceState === 'THINKING'
  const isLocked = !canTalk && !isTalking

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

      // Escape while talking → cancel and discard
      if (e.key === 'Escape' && isTalking) {
        e.preventDefault()
        e.stopPropagation() // Prevent the session-level Escape handler from closing
        onTalkCancel()
      }
    }
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return
      e.preventDefault()
      onTalkEnd()
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [canTalk, isTalking, onTalkStart, onTalkEnd, onTalkCancel])

  const holdHint = isTalking ? 'Esc to cancel · release to send'
    : voiceState === 'IDLE' ? 'Hold space and speak · tap again to continue'
    : voiceState === 'THINKING' || voiceState === 'SPEAKING' ? 'Space to interrupt'
    : 'Hold space to speak'

  return (
    <div className={cn('flex flex-col items-center gap-2.5 px-6 py-3 bg-[rgba(255,255,255,.9)] backdrop-blur-[20px] border-t border-[rgba(228,224,217,.55)]', className)}>
      <div className="flex items-center justify-center gap-4">
        {/* Replay */}
        <button
          onClick={onReplay}
          className="flex flex-col items-center gap-[3px] bg-transparent border-none cursor-pointer p-1 rounded-[10px] transition-all hover:bg-bg-hover group"
          title="Replay last line"
        >
          <div className="w-[38px] h-[38px] rounded-[11px] flex items-center justify-center bg-bg-secondary border-[1.5px] border-border transition-all group-hover:bg-bg-hover group-hover:border-border-strong">
            <ArrowPathIcon className="w-4 h-4 text-text-secondary" />
          </div>
          <span className="text-[10px] text-text-muted">Replay</span>
        </button>

        {/* Main speak button */}
        <button
          onMouseDown={canTalk ? onTalkStart : undefined}
          onMouseUp={onTalkEnd}
          onMouseLeave={isTalking ? onTalkEnd : undefined}
          onTouchStart={canTalk ? (e) => { e.preventDefault(); onTalkStart() } : undefined}
          onTouchEnd={(e) => { e.preventDefault(); onTalkEnd() }}
          className={cn(
            'flex flex-col items-center gap-1 bg-transparent border-none cursor-pointer p-1 select-none',
            isLocked && 'pointer-events-none',
          )}
        >
          <div className="relative w-[72px] h-[72px] flex items-center justify-center">
            {/* SVG ring */}
            <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 72 72">
              <circle cx="36" cy="36" r="33" fill="none" stroke="var(--border)" strokeWidth="1.5" />
              <circle
                ref={ringRef}
                cx="36" cy="36" r="33"
                fill="none" stroke="var(--accent-warm)" strokeWidth="1.5"
                strokeLinecap="round"
                strokeDasharray={CIRC}
                strokeDashoffset={CIRC}
                className={cn('transition-none', !isTalking && 'opacity-0', isTalking && 'opacity-100')}
              />
            </svg>

            {/* Core button */}
            <div className={cn(
              'w-[56px] h-[56px] rounded-[17px] flex items-center justify-center transition-all',
              isTalking
                ? 'bg-accent-warm shadow-[0_4px_20px_rgba(200,87,42,.45),0_0_0_10px_rgba(200,87,42,.1)]'
                : 'bg-accent-brand shadow-[0_3px_10px_rgba(47,47,47,.22)] hover:bg-[#111] hover:scale-105 hover:shadow-[0_6px_20px_rgba(47,47,47,.3)]',
              isLocked && 'opacity-30',
            )}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                <line x1="12" y1="19" x2="12" y2="23"/>
                <line x1="8" y1="23" x2="16" y2="23"/>
              </svg>
            </div>
          </div>
          <span className={cn(
            'text-[10.5px] tracking-[.02em] mt-0.5 transition-colors',
            isTalking ? 'text-accent-warm' : 'text-text-muted',
          )}>
            {isTalking ? 'Release when done' : 'Hold to speak'}
          </span>
        </button>

        {/* Vocab */}
        <button
          onClick={onOpenVocab}
          className="flex flex-col items-center gap-[3px] bg-transparent border-none cursor-pointer p-1 rounded-[10px] transition-all hover:bg-bg-hover group"
          title="Vocabulary"
        >
          <div className="w-[38px] h-[38px] rounded-[11px] flex items-center justify-center bg-bg-secondary border-[1.5px] border-border transition-all group-hover:bg-bg-hover group-hover:border-border-strong relative">
            <BookOpenIcon className="w-4 h-4 text-text-secondary" />
            {vocabCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] bg-accent-warm text-white text-[8px] font-bold rounded-[7px] flex items-center justify-center px-[3px]">
                {vocabCount}
              </span>
            )}
          </div>
          <span className="text-[10px] text-text-muted">
            Vocab {vocabCount > 0 && <span className="text-accent-warm font-semibold">{vocabCount}</span>}
          </span>
        </button>
      </div>

      {/* Hold hint */}
      <div className="h-[18px] flex items-center justify-center">
        <span className="text-[11px] text-text-muted tracking-[.04em] italic transition-opacity">
          {holdHint}
        </span>
      </div>
    </div>
  )
}
