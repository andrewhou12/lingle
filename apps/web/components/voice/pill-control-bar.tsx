'use client'

import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react'
import { RoomEvent, type Room } from 'livekit-client'
import { cn } from '@/lib/utils'

/**
 * Hook that tracks the local participant's audio level from a LiveKit Room.
 * Returns a normalized value 0-1 representing mic input intensity.
 */
export function useMicLevel(room: Room | null): number {
  const [level, setLevel] = useState(0)
  const smoothRef = useRef(0)
  const rafRef = useRef<number | null>(null)

  const onSpeakers = useCallback(() => {
    if (!room) return
    const local = room.localParticipant
    // audioLevel is 0-1 on the participant
    const raw = local.audioLevel ?? 0
    // Smooth: rise fast, decay slow
    smoothRef.current = raw > smoothRef.current
      ? raw * 0.7 + smoothRef.current * 0.3
      : raw * 0.2 + smoothRef.current * 0.8
    setLevel(smoothRef.current)
  }, [room])

  useEffect(() => {
    if (!room) { setLevel(0); return }

    room.on(RoomEvent.ActiveSpeakersChanged, onSpeakers)

    // Also poll at 30fps for smoother updates
    const poll = () => {
      onSpeakers()
      rafRef.current = requestAnimationFrame(poll)
    }
    rafRef.current = requestAnimationFrame(poll)

    return () => {
      room.off(RoomEvent.ActiveSpeakersChanged, onSpeakers)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [room, onSpeakers])

  return level
}

// ── Icons (16px) ──

const IcMicOn = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="22" />
  </svg>
)

const IcMicOff = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <line x1="2" y1="2" x2="22" y2="22" />
    <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" />
    <path d="M5 10v2a7 7 0 0 0 12 5" />
    <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />
    <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
    <line x1="12" y1="19" x2="12" y2="22" />
  </svg>
)

const IcVid = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="m22 8-6 4 6 4V8Z" />
    <rect x="2" y="6" width="14" height="12" rx="2" />
  </svg>
)

const IcVidOff = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.66 6H14a2 2 0 0 1 2 2v2.5l5.248-3.062A.5.5 0 0 1 22 7.87v8.196" />
    <path d="M16 16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2" />
    <line x1="2" y1="2" x2="22" y2="22" />
  </svg>
)

const IcPhone = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07" />
    <path d="M14.69 9.31A16 16 0 0 0 11.28 5.9a2 2 0 0 0-1.9-.9 12.84 12.84 0 0 0-.7-2.81 2 2 0 0 0-2-1.72H3A2 2 0 0 0 1 2.45 19.79 19.79 0 0 0 4.07 11" />
    <line x1="2" y1="2" x2="22" y2="22" />
  </svg>
)

const IcSettings = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

const IcBook = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
  </svg>
)

const IcSub = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 13h4m-4 4h8M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />
  </svg>
)

const IcNotes = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <line x1="10" y1="9" x2="8" y2="9" />
  </svg>
)

// ── PillBtn ──

interface PillBtnProps {
  icon: ReactNode
  label: string
  onClick: () => void
  active?: boolean
  /** 0-1 mic input level — renders dynamic ring */
  micLevel?: number
  danger?: boolean
}

function PillBtn({ icon, label, onClick, active = false, micLevel, danger = false }: PillBtnProps) {
  const [hovered, setHovered] = useState(false)
  const hasAudio = micLevel !== undefined && micLevel > 0.01

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={label}
      className={cn(
        'flex flex-col items-center justify-center gap-1 min-w-[52px] h-[52px] px-2',
        'border-none rounded-lg cursor-pointer shrink-0 transition-all duration-[120ms]',
        active && 'bg-bg-secondary outline outline-1 outline-border',
        danger && hovered && 'bg-red-soft',
        !active && !danger && hovered && 'bg-bg-secondary',
        !active && !danger && !hovered && 'bg-transparent',
      )}
    >
      <div className="relative flex items-center">
        {/* Dynamic mic level ring */}
        {hasAudio && (
          <div
            className="absolute rounded-full pointer-events-none"
            style={{
              inset: -4 - (micLevel! * 4),
              border: `1.5px solid rgba(34, 163, 85, ${0.3 + micLevel! * 0.6})`,
              transition: 'inset 60ms ease-out, border-color 60ms ease-out',
            }}
          />
        )}
        {icon}
      </div>
      <span
        className={cn(
          'text-[10px] font-normal tracking-[0.01em] font-sans leading-none whitespace-nowrap',
          active && 'text-text-primary',
          danger && 'text-red',
          hasAudio && !active && !danger && 'text-green',
          !active && !danger && !hasAudio && 'text-text-muted',
        )}
      >
        {label}
      </span>
    </button>
  )
}

const Sep = () => <div className="w-px h-6 bg-border shrink-0 mx-0.5" />

// ── Main ──

export interface PillControlBarProps {
  isMuted: boolean
  onToggleMute: () => void
  /** 0-1 mic input audio level for dynamic indicator */
  micLevel: number
  isCamOff: boolean
  onToggleCam: () => void
  isLessonMode: boolean
  onToggleLesson: () => void
  isTranscriptVisible: boolean
  onToggleTranscript: () => void
  isNotesOpen: boolean
  onToggleNotes: () => void
  isSettingsOpen: boolean
  onToggleSettings: () => void
  onEnd: () => void
  isConnected: boolean
}

export function PillControlBar({
  isMuted,
  onToggleMute,
  micLevel,
  isCamOff,
  onToggleCam,
  isLessonMode,
  onToggleLesson,
  isTranscriptVisible,
  onToggleTranscript,
  isNotesOpen,
  onToggleNotes,
  isSettingsOpen,
  onToggleSettings,
  onEnd,
  isConnected,
}: PillControlBarProps) {
  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return

      if (e.key === 'm' || e.key === 'M') {
        e.preventDefault()
        onToggleMute()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onToggleMute])

  return (
    <footer className="fixed bottom-0 left-0 right-0 h-[68px] flex items-center justify-center z-[400] bg-bg-pure border-t border-border">
      <div className="flex items-center gap-0.5 p-1 bg-bg-pure border border-border rounded-xl shadow-sm">
        <PillBtn
          icon={isMuted ? <IcMicOff /> : <IcMicOn />}
          label={isMuted ? 'Unmute' : 'Mute'}
          active={isMuted}
          micLevel={isMuted ? 0 : micLevel}
          onClick={onToggleMute}
        />
        <PillBtn
          icon={isCamOff ? <IcVidOff /> : <IcVid />}
          label={isCamOff ? 'Start Video' : 'Stop Video'}
          active={isCamOff}
          onClick={onToggleCam}
        />

        <Sep />

        <PillBtn
          icon={<IcBook />}
          label={isLessonMode ? 'End Lesson' : 'Lesson'}
          active={isLessonMode}
          onClick={onToggleLesson}
        />
        <PillBtn
          icon={<IcSub />}
          label="Transcript"
          active={isTranscriptVisible}
          onClick={onToggleTranscript}
        />
        <PillBtn
          icon={<IcNotes />}
          label="Notes"
          active={isNotesOpen}
          onClick={onToggleNotes}
        />

        <Sep />

        <PillBtn
          icon={<IcSettings />}
          label="Settings"
          active={isSettingsOpen}
          onClick={onToggleSettings}
        />

        <Sep />

        <PillBtn
          icon={<IcPhone />}
          label="End"
          danger
          onClick={onEnd}
        />
      </div>
    </footer>
  )
}
