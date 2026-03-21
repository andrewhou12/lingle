'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion } from 'motion/react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useLiveKitVoice } from '@/hooks/use-livekit-voice'
import { VoiceSessionLayout } from '@/components/voice/session-layout'
import { AIOrb, voiceStateToOrbState } from '@/components/voice/ai-orb'
import { SessionSummary } from './session-summary'
import { UsageLimitError } from '@/lib/api'

type SessionPhase = 'planning' | 'active' | 'ending' | 'summary' | 'error'

export function SessionView() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const topic = searchParams.get('topic') || 'Free conversation'
  const mode = searchParams.get('mode') || 'conversation'

  const [phase, setPhase] = useState<SessionPhase>('planning')
  const [usageLimitError, setUsageLimitError] = useState<UsageLimitError | null>(null)
  const finalDurationRef = useRef(0)

  const voice = useLiveKitVoice({})

  // Planning phase: start session on mount
  useEffect(() => {
    if (phase !== 'planning') return

    let cancelled = false

    const start = async () => {
      try {
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
  }, [])

  // End session handler
  const handleEnd = useCallback(async () => {
    finalDurationRef.current = voice.duration
    setPhase('ending')
    await voice.endSession()
    setPhase('summary')
  }, [voice])

  const handlePracticeAgain = useCallback(() => {
    window.location.reload()
  }, [])

  const handleDone = useCallback(() => {
    router.push('/dashboard')
  }, [router])

  return (
    <>
      {/* Planning phase */}
      {phase === 'planning' && (
        <div className="fixed inset-0 bg-bg-pure flex flex-col items-center justify-center gap-6 z-50">
          <AIOrb state="thinking" size={160} />
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

      {/* Active phase — new layout */}
      {phase === 'active' && (
        <VoiceSessionLayout
          voice={voice}
          onEnd={handleEnd}
          isConnected={voice.isActive}
          sessionTitle={topic}
        />
      )}

      {/* Ending phase */}
      {phase === 'ending' && (
        <div className="fixed inset-0 bg-bg-pure flex flex-col items-center justify-center gap-6 z-50">
          <AIOrb state="thinking" size={120} />
          <div className="text-[14px] text-text-secondary">Wrapping up...</div>
        </div>
      )}

      {/* Summary phase */}
      {phase === 'summary' && (
        <div className="fixed inset-0 bg-bg-pure flex items-center justify-center px-6 z-50">
          <SessionSummary
            duration={finalDurationRef.current}
            result={voice.postSessionResult ?? { errorsCount: 0, correctionsCount: 0 }}
            onPracticeAgain={handlePracticeAgain}
            onDone={handleDone}
          />
        </div>
      )}

      {/* Error phase */}
      {phase === 'error' && (
        <div className="fixed inset-0 bg-bg-pure flex items-center justify-center px-6 z-50">
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
    </>
  )
}
