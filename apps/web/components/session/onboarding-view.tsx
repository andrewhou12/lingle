'use client'

import { useState, useCallback, useMemo } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useRouter } from 'next/navigation'
import { useLiveKitVoice } from '@/hooks/use-livekit-voice'
import { LiveKitBridge } from '@/components/voice/livekit-bridge'
import { VoiceAuraOrb, VoiceAuraOrbStandalone } from '@/components/voice/voice-aura-orb'
import { LingleControlBar } from '@/components/voice/lingle-control-bar'
import { LingleChatTranscript, type LingleTranscriptEntry } from '@/components/voice/lingle-chat-transcript'
import { VoiceLiveSubtitles } from '@/components/voice/voice-live-subtitles'
import { Whiteboard } from '@/components/voice/whiteboard'
import { toAgentState } from '@/components/voice/voice-aura-orb'
import { api } from '@/lib/api'
import { SUPPORTED_LANGUAGES } from '@/lib/languages'
import { cn } from '@/lib/utils'

type OnboardingPhase = 'language-select' | 'connecting' | 'voice-session' | 'complete'

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function OnboardingView() {
  const router = useRouter()
  const [phase, setPhase] = useState<OnboardingPhase>('language-select')
  const [targetLanguage, setTargetLanguage] = useState('Japanese')
  const [nativeLanguage] = useState('English')
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const voice = useLiveKitVoice({})

  const handleStartOnboarding = useCallback(async () => {
    setPhase('connecting')
    setError(null)
    try {
      // Unlock audio
      try { new AudioContext().resume() } catch {}
      new Audio().play().catch(() => {})

      const result = await api.onboardingPlan(targetLanguage, nativeLanguage)
      await voice.startWithExistingPlan(
        result._sessionId,
        result.plan,
        result.basePrompt,
      )
      setPhase('voice-session')
    } catch (err) {
      console.error('[Onboarding] Failed to start:', err)
      setError(err instanceof Error ? err.message : 'Failed to start onboarding')
      setPhase('language-select')
    }
  }, [targetLanguage, nativeLanguage, voice])

  const handleEndSession = useCallback(async () => {
    await voice.endSession()
    setPhase('complete')
  }, [voice])

  const handleFinish = useCallback(() => {
    router.push('/dashboard')
  }, [router])

  // Transcript for chat panel
  const transcriptEntries: LingleTranscriptEntry[] = useMemo(() => {
    return voice.transcript.map((line) => ({
      ...line,
      formattedTime: new Date(line.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }))
  }, [voice.transcript])

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

      {voice.connectedRoom && (
        <LiveKitBridge
          room={voice.connectedRoom}
          onAgentState={voice.handleAgentStateChange}
          onAgentIdentity={voice.handleAgentIdentity}
        />
      )}

      {/* ── Language Select ── */}
      {phase === 'language-select' && (
        <div className="flex-1 flex items-center justify-center px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-[400px] text-center"
          >
            <h1 className="text-[24px] font-semibold text-text-primary tracking-tight mb-2">
              Welcome to Lingle
            </h1>
            <p className="text-[14px] text-text-muted mb-8">
              Let&apos;s set up your learning experience with a short conversation.
            </p>

            <div className="text-left mb-6">
              <label className="text-[13px] font-medium text-text-secondary mb-2 block">
                What language are you learning?
              </label>
              <div className="grid grid-cols-2 gap-2">
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <button
                    key={lang.id}
                    onClick={() => setTargetLanguage(lang.id)}
                    className={cn(
                      'flex items-center gap-2.5 px-4 py-3 rounded-xl border text-left cursor-pointer transition-all',
                      targetLanguage === lang.id
                        ? 'border-accent-brand bg-accent-brand/5 shadow-sm'
                        : 'border-border bg-bg-pure hover:border-border-strong hover:bg-bg-hover',
                    )}
                  >
                    <span className="text-[18px]">{lang.flag}</span>
                    <div>
                      <div className="text-[14px] font-medium text-text-primary">{lang.label}</div>
                      <div className="text-[12px] text-text-muted">{lang.nativeLabel}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="text-[13px] text-red-500 mb-4">{error}</div>
            )}

            <button
              onClick={handleStartOnboarding}
              className="w-full py-3 rounded-xl bg-accent-brand text-white text-[15px] font-medium cursor-pointer border-none hover:opacity-90 transition-opacity"
            >
              Continue
            </button>
          </motion.div>
        </div>
      )}

      {/* ── Connecting ── */}
      {phase === 'connecting' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6">
          <VoiceAuraOrbStandalone voiceState="THINKING" className="w-[160px] h-[160px]" />
          <div className="text-[14px] text-text-secondary">Setting things up...</div>
        </div>
      )}

      {/* ── Voice Session ── */}
      {phase === 'voice-session' && (
        <>
          <div className="w-full flex items-center justify-between px-6 py-4">
            <div className="text-[13px] text-text-secondary font-medium">
              Getting to know you
            </div>
            <span className="text-[12px] text-text-muted tabular-nums">
              {formatDuration(voice.duration)}
            </span>
          </div>

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

          <div className="flex flex-col items-center gap-3 px-6 pb-8 pt-3 w-full max-w-md shrink-0">
            {voice.error && (
              <div className="text-[13px] text-red-500">{voice.error}</div>
            )}
            <LingleControlBar
              variant="livekit"
              voiceState={voice.voiceState}
              isMuted={voice.isMuted}
              onToggleMute={voice.toggleMute}
              onEnd={handleEndSession}
              isConnected={voice.isActive}
              isChatOpen={isChatOpen}
              onToggleChat={() => setIsChatOpen((v) => !v)}
              onSendText={voice.sendTextMessage}
              inputMode={voice.inputMode}
            />
          </div>
        </>
      )}

      {/* ── Complete ── */}
      {phase === 'complete' && (
        <div className="flex-1 flex items-center justify-center px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-[400px] text-center"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.4 }}
              className="w-16 h-16 rounded-full bg-green-soft flex items-center justify-center mx-auto mb-6"
            >
              <svg className="w-8 h-8 text-green" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </motion.div>

            <h2 className="text-[22px] font-semibold text-text-primary tracking-tight mb-2">
              You&apos;re all set!
            </h2>
            <p className="text-[14px] text-text-muted mb-8 leading-relaxed">
              Your learning profile has been created. Start a session to begin practicing.
            </p>

            <button
              onClick={handleFinish}
              className="w-full py-3 rounded-xl bg-accent-brand text-white text-[15px] font-medium cursor-pointer border-none hover:opacity-90 transition-opacity"
            >
              Start your first lesson
            </button>
          </motion.div>
        </div>
      )}
    </div>
  )
}
