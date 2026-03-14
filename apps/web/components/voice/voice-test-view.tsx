'use client'

import { useEffect, useRef, useMemo, useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLiveKitVoice } from '@/hooks/use-livekit-voice'
import { VoiceCentralOrb } from './voice-central-orb'
import { VoiceStateRing } from './voice-state-ring'
import { VoiceLiveSubtitles } from './voice-live-subtitles'
import { cn } from '@/lib/utils'

const TEST_PROMPTS: Record<string, string> = {
  Japanese:
    'You are a friendly Japanese conversation partner. Have a casual chat in Japanese. ' +
    'Keep your responses short and natural. Use simple Japanese appropriate for an intermediate learner. ' +
    'Start by greeting the user in Japanese.',
  English:
    'You are a friendly English conversation partner. Have a casual chat in English. ' +
    'Keep your responses short and natural. Start by greeting the user.',
}

const STATE_LABELS: Record<string, string> = {
  IDLE: 'Ready',
  LISTENING: 'Listening...',
  THINKING: 'Thinking...',
  SPEAKING: 'Speaking...',
}

export function VoiceTestView() {
  const router = useRouter()
  const startedRef = useRef(false)
  const [lang, setLang] = useState<'Japanese' | 'English'>('Japanese')

  const voice = useLiveKitVoice({})

  // Auto-connect on mount
  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    voice.startDirect({
      sessionMode: 'conversation',
      basePrompt: TEST_PROMPTS[lang],
      targetLanguage: lang,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const switchLanguage = useCallback(async (newLang: 'Japanese' | 'English') => {
    setLang(newLang)
    await voice.endSession()
    // Wait for room to fully disconnect before reconnecting
    await new Promise((r) => setTimeout(r, 1000))
    startedRef.current = true
    voice.startDirect({
      sessionMode: 'conversation',
      basePrompt: TEST_PROMPTS[newLang],
      targetLanguage: newLang,
    })
  }, [voice])

  const handleEnd = useCallback(async () => {
    await voice.endSession()
    router.push('/conversation')
  }, [voice, router])

  // M key to toggle mute
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'm' || e.key === 'M') {
        e.preventDefault()
        voice.toggleMute()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [voice.toggleMute])

  // Get latest transcript lines for subtitles
  const lastUserLine = useMemo(() => {
    for (let i = voice.transcript.length - 1; i >= 0; i--) {
      if (voice.transcript[i].role === 'user' && voice.transcript[i].isFinal) return voice.transcript[i]
    }
    return null
  }, [voice.transcript])

  const lastAiLine = useMemo(() => {
    for (let i = voice.transcript.length - 1; i >= 0; i--) {
      if (voice.transcript[i].role === 'assistant') return voice.transcript[i]
    }
    return null
  }, [voice.transcript])

  return (
    <div className="fixed inset-0 bg-bg flex flex-col items-center justify-between z-50">
      {/* Top bar */}
      <div className="w-full flex items-center justify-between px-6 py-4">
        <div className="text-[13px] text-text-secondary font-medium">
          Voice Test
        </div>
        <div className="flex items-center gap-3">
          {/* Language toggle */}
          <div className="flex items-center rounded-full border border-border bg-bg-pure p-0.5">
            {(['Japanese', 'English'] as const).map((l) => (
              <button
                key={l}
                onClick={() => lang !== l && switchLanguage(l)}
                className={cn(
                  'px-3 py-1 rounded-full text-[12px] font-medium transition-colors cursor-pointer',
                  lang === l
                    ? 'bg-accent-brand text-white'
                    : 'text-text-muted hover:text-text-primary',
                )}
              >
                {l === 'Japanese' ? 'JP' : 'EN'}
              </button>
            ))}
          </div>
          <span className="text-[12px] text-text-muted tabular-nums">
            {formatDuration(voice.duration)}
          </span>
          <button
            onClick={handleEnd}
            className="px-4 py-1.5 rounded-full border border-border text-[13px] text-text-secondary hover:bg-bg-hover hover:text-text-primary hover:border-border-strong transition-colors cursor-pointer"
          >
            End
          </button>
        </div>
      </div>

      {/* Center: Orb + state label */}
      <div className="flex-1 flex flex-col items-center justify-center gap-6">
        <div className="relative">
          <VoiceCentralOrb state={voice.voiceState} size={200} />
          <VoiceStateRing state={voice.voiceState} isTalking={voice.isTalking} size={200} />
        </div>

        <div className="text-[14px] text-text-secondary h-5">
          {STATE_LABELS[voice.voiceState] || ''}
        </div>

        {/* Subtitles */}
        <VoiceLiveSubtitles
          partialText={voice.partialText}
          userLine={lastUserLine}
          aiLine={lastAiLine}
          correction={null}
          visible
          voiceState={voice.voiceState}
          isTalking={voice.isTalking}
        />
      </div>

      {/* Bottom: Mute button */}
      <div className="flex flex-col items-center gap-3 px-6 pb-8 pt-3">
        <div className="h-5 flex items-center gap-1.5 text-[12px] text-text-secondary">
          {voice.isMuted ? (
            <>
              <span>Mic muted</span>
              <span className="mx-0.5 text-border-strong">&middot;</span>
              <kbd className="font-mono text-[11px] font-medium px-1.5 py-0.5 rounded-md bg-bg-pure border border-border text-text-secondary shadow-[0_1px_0_rgba(0,0,0,.06)]">M</kbd>
              <span>to unmute</span>
            </>
          ) : (
            <>
              <span>Speak naturally</span>
              <span className="mx-0.5 text-border-strong">&middot;</span>
              <kbd className="font-mono text-[11px] font-medium px-1.5 py-0.5 rounded-md bg-bg-pure border border-border text-text-secondary shadow-[0_1px_0_rgba(0,0,0,.06)]">M</kbd>
              <span>to mute</span>
            </>
          )}
        </div>

        <button
          onClick={voice.toggleMute}
          className={cn(
            'relative w-16 h-16 rounded-full cursor-pointer flex items-center justify-center select-none transition-all active:scale-[0.94]',
            voice.isMuted
              ? 'bg-red-500/80 shadow-[0_3px_10px_rgba(239,68,68,.25)] hover:bg-red-500 hover:shadow-[0_6px_20px_rgba(239,68,68,.3)]'
              : 'bg-accent-brand shadow-[0_3px_10px_rgba(47,47,47,.22)] hover:bg-[#111] hover:scale-105 hover:shadow-[0_6px_20px_rgba(47,47,47,.3)]',
          )}
        >
          {voice.isMuted ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.7" strokeLinecap="round">
              <path d="M1 1l22 22" />
              <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
              <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .76-.13 1.49-.35 2.17" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.7" strokeLinecap="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          )}
        </button>

        {voice.error && (
          <div className="text-[13px] text-red-500 mt-2">{voice.error}</div>
        )}
      </div>
    </div>
  )
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}
