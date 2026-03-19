'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useLiveKitVoice } from '@/hooks/use-livekit-voice'
import { LiveKitBridge } from '@/components/voice/livekit-bridge'
import { VoiceAuraOrb, VoiceAuraOrbStandalone } from '@/components/voice/voice-aura-orb'
import { LingleControlBar } from '@/components/voice/lingle-control-bar'
import { LingleChatTranscript, type LingleTranscriptEntry } from '@/components/voice/lingle-chat-transcript'
import { VoiceLiveSubtitles } from '@/components/voice/voice-live-subtitles'
import { Whiteboard } from '@/components/voice/whiteboard'
import { toAgentState } from '@/components/voice/voice-aura-orb'
import { SessionSummary } from './session-summary'
import { UsageLimitError } from '@/lib/api'
import { cn } from '@/lib/utils'

type SessionPhase = 'planning' | 'active' | 'ending' | 'summary' | 'error'

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function SessionView() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const topic = searchParams.get('topic') || 'Free conversation'
  const mode = searchParams.get('mode') || 'conversation'

  const [phase, setPhase] = useState<SessionPhase>('planning')
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [usageLimitError, setUsageLimitError] = useState<UsageLimitError | null>(null)
  const finalDurationRef = useRef(0)

  const voice = useLiveKitVoice({})

  // ── Planning phase: start session on mount ──
  useEffect(() => {
    if (phase !== 'planning') return

    let cancelled = false

    const start = async () => {
      try {
        // Unlock audio context for Safari/mobile
        try { new AudioContext().resume() } catch {}
        new Audio().play().catch(() => {})

        await voice.startNewSession(topic, mode)
        if (!cancelled) setPhase('active')
      } catch (err) {
        if (cancelled) return
        if (err instanceof UsageLimitError) {
          setUsageLimitError(err)
          setPhase('error')
        } else {
          console.error('[SessionView] Planning failed:', err)
          setPhase('error')
        }
      }
    }

    start()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Only run once on mount

  // ── End session handler ──
  const handleEnd = useCallback(async () => {
    finalDurationRef.current = voice.duration
    setPhase('ending')
    await voice.endSession()
    setPhase('summary')
  }, [voice])

  // ── Practice again ──
  const handlePracticeAgain = useCallback(() => {
    // Reload the page to start fresh
    window.location.reload()
  }, [])

  // ── Done → go to dashboard ──
  const handleDone = useCallback(() => {
    router.push('/dashboard')
  }, [router])

  // ── Transcript entries for chat panel ──
  const transcriptEntries: LingleTranscriptEntry[] = useMemo(() => {
    return voice.transcript.map((line) => ({
      ...line,
      formattedTime: new Date(line.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }))
  }, [voice.transcript])

  // ── Latest lines for subtitles ──
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
      {/* Whiteboard overlay */}
      <Whiteboard
        isOpen={voice.whiteboard.isOpen}
        onClose={() => voice.whiteboard.setIsOpen(false)}
        content={voice.whiteboard.content}
      />

      {/* LiveKit bridge — only when room exists */}
      {voice.connectedRoom && (
        <LiveKitBridge
          room={voice.connectedRoom}
          onAgentState={voice.handleAgentStateChange}
          onAgentIdentity={voice.handleAgentIdentity}
        />
      )}

      {/* ── Planning phase ── */}
      {phase === 'planning' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6">
          <VoiceAuraOrbStandalone voiceState="THINKING" className="w-[160px] h-[160px]" />
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-center"
          >
            <div className="text-[14px] text-text-secondary">Preparing your session...</div>
            <div className="text-[13px] text-text-muted mt-1">{topic}</div>
          </motion.div>
        </div>
      )}

      {/* ── Active phase ── */}
      {phase === 'active' && (
        <>
          {/* Top bar */}
          <div className="w-full flex items-center justify-between px-6 py-4">
            <div className="text-[13px] text-text-secondary font-medium truncate max-w-[60%]">
              {topic}
            </div>
            <span className="text-[12px] text-text-muted tabular-nums">
              {formatDuration(voice.duration)}
            </span>
          </div>

          {/* Center: Orb + state + subtitles */}
          <div className="flex-1 flex flex-col items-center justify-center gap-6">
            <div className="w-[200px] h-[200px]">
              <VoiceAuraOrb voiceState={voice.voiceState} room={voice.room} className="w-[200px] h-[200px]" />
            </div>

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

          {/* Transcript panel */}
          <AnimatePresence>
            {isChatOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 280, opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className="w-full max-w-lg mx-auto px-4 overflow-hidden shrink-0"
              >
                <div className="h-[280px] rounded-xl border border-border bg-bg-pure overflow-hidden">
                  <LingleChatTranscript
                    agentState={toAgentState(voice.voiceState)}
                    entries={transcriptEntries}
                    className="h-full"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Bottom control bar */}
          <div className="flex flex-col items-center gap-3 px-6 pb-8 pt-3 w-full max-w-md shrink-0">
            {voice.error && (
              <div className="text-[13px] text-red-500">{voice.error}</div>
            )}

            <LingleControlBar
              variant="livekit"
              voiceState={voice.voiceState}
              isMuted={voice.isMuted}
              onToggleMute={voice.toggleMute}
              onEnd={handleEnd}
              isConnected={voice.isActive}
              isChatOpen={isChatOpen}
              onToggleChat={() => setIsChatOpen((v) => !v)}
              onSendText={voice.sendTextMessage}
              inputMode={voice.inputMode}
            />
          </div>
        </>
      )}

      {/* ── Ending phase ── */}
      {phase === 'ending' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6">
          <VoiceAuraOrbStandalone voiceState="THINKING" className="w-[120px] h-[120px]" />
          <div className="text-[14px] text-text-secondary">Wrapping up...</div>
        </div>
      )}

      {/* ── Summary phase ── */}
      {phase === 'summary' && (
        <div className="flex-1 flex items-center justify-center px-6">
          <SessionSummary
            duration={finalDurationRef.current}
            result={voice.postSessionResult ?? { errorsCount: 0, correctionsCount: 0 }}
            onPracticeAgain={handlePracticeAgain}
            onDone={handleDone}
          />
        </div>
      )}

      {/* ── Error phase ── */}
      {phase === 'error' && (
        <div className="flex-1 flex items-center justify-center px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-[380px] text-center"
          >
            {usageLimitError ? (
              <>
                <div className="text-[15px] font-medium text-text-primary mb-2">
                  Daily limit reached
                </div>
                <div className="text-[13px] text-text-secondary mb-6 leading-relaxed">
                  You&apos;ve used {Math.floor(usageLimitError.usedSeconds / 60)} of your {Math.floor(usageLimitError.limitSeconds / 60)} daily minutes.
                  Upgrade for unlimited practice.
                </div>
                <div className="flex gap-3">
                  <Link
                    href="/upgrade"
                    className="flex-1 py-2.5 rounded-lg bg-accent-brand text-white text-[14px] font-medium no-underline text-center hover:opacity-90 transition-opacity"
                  >
                    Upgrade
                  </Link>
                  <button
                    onClick={() => router.push('/')}
                    className="flex-1 py-2.5 rounded-lg bg-bg-pure border border-border text-text-secondary text-[14px] font-medium cursor-pointer hover:bg-bg-hover transition-colors"
                  >
                    Go back
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="text-[15px] font-medium text-text-primary mb-2">
                  Something went wrong
                </div>
                <div className="text-[13px] text-text-secondary mb-6">
                  {voice.error || 'Failed to start session. Please try again.'}
                </div>
                <div className="flex gap-3 justify-center">
                  <button
                    onClick={() => window.location.reload()}
                    className="px-6 py-2.5 rounded-lg bg-accent-brand text-white text-[14px] font-medium cursor-pointer border-none hover:opacity-90 transition-opacity"
                  >
                    Try again
                  </button>
                  <button
                    onClick={() => router.push('/')}
                    className="px-6 py-2.5 rounded-lg bg-bg-pure border border-border text-text-secondary text-[14px] font-medium cursor-pointer hover:bg-bg-hover transition-colors"
                  >
                    Go back
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </div>
      )}
    </div>
  )
}
