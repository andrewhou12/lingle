'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useRouter, useSearchParams } from 'next/navigation'
import { MODE_PLACEHOLDERS } from '@/lib/experience-scenarios'
import { api } from '@/lib/api'
import type { LearnerProfile, UsageInfo } from '@lingle/shared/types'
import type { SessionPlan } from '@/lib/session-plan'
import { VoiceCentralOrb } from './voice-central-orb'
import { BeginOverlay } from '@/components/session/begin-overlay'
import { VoiceSessionOverlay } from './voice-session-overlay'
import { SessionDebrief } from '@/components/session/session-debrief'
import type { SessionEndData } from '@/lib/session-types'
import { Spinner } from '@/components/spinner'

const LOADING_SUBTITLES = [
  'Designing your session...',
  'Writing your conversation plan...',
  'Picking vocabulary targets...',
  'Setting the scene...',
]

function CyclingSubtitle() {
  const [index, setIndex] = useState(0)
  const [fade, setFade] = useState(true)

  useEffect(() => {
    const interval = setInterval(() => {
      setFade(false)
      setTimeout(() => {
        setIndex(i => (i + 1) % LOADING_SUBTITLES.length)
        setFade(true)
      }, 200)
    }, 2800)
    return () => clearInterval(interval)
  }, [])

  return (
    <p
      className="text-[13px] text-text-muted transition-opacity duration-200"
      style={{ opacity: fade ? 1 : 0 }}
    >
      {LOADING_SUBTITLES[index]}
    </p>
  )
}

const MODE_DEFAULTS: Record<string, string> = {
  conversation: "Let's have a casual conversation in Japanese.",
  tutor: "I'd like to practice Japanese with a tutor.",
  immersion: 'Create an immersive Japanese listening exercise.',
  reference: 'I have some questions about Japanese.',
}

type ViewState =
  | { type: 'prompt' }
  | { type: 'loading'; prompt: string }
  | { type: 'begin'; prompt: string; sessionId: string; plan: SessionPlan }
  | { type: 'active'; prompt: string; sessionId: string; plan: SessionPlan; steeringNotes: string[] }
  | { type: 'debrief'; data: SessionEndData }

export function VoiceConversationView() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const mode = searchParams.get('mode') || 'conversation'
  const existingSessionId = searchParams.get('sessionId')
  const promptFromUrl = searchParams.get('prompt')

  const [promptInput, setPromptInput] = useState('')
  const [viewState, setViewState] = useState<ViewState>(
    existingSessionId || promptFromUrl
      ? { type: 'loading', prompt: promptFromUrl || '' }
      : { type: 'prompt' }
  )
  const [error, setError] = useState<string | null>(null)
  const [profile, setProfile] = useState<LearnerProfile | null>(null)
  const [usage, setUsage] = useState<UsageInfo | null>(null)
  const initRef = useRef(false)

  // Fetch learner profile and usage info once
  useEffect(() => {
    api.profileGet().then(setProfile).catch(() => {})
    api.usageGet().then(setUsage).catch(() => {})
  }, [])

  // If we have an existing sessionId or a prompt from URL, auto-start planning
  useEffect(() => {
    if (initRef.current) return
    if (!existingSessionId && !promptFromUrl) return
    initRef.current = true

    async function autoStart() {
      if (existingSessionId) {
        // Load existing session
        try {
          const session = await api.conversationGet(existingSessionId!)
          if (session.sessionPlan) {
            setViewState({
              type: 'begin',
              prompt: '',
              sessionId: existingSessionId!,
              plan: session.sessionPlan as unknown as SessionPlan,
            })
          } else {
            const result = await api.conversationPlan(undefined, mode as 'conversation' | 'tutor' | 'immersion' | 'reference')
            setViewState({
              type: 'begin',
              prompt: '',
              sessionId: result._sessionId,
              plan: result.plan,
            })
          }
        } catch (err) {
          console.error('Failed to load session:', err)
          try {
            const result = await api.conversationPlan(undefined, mode as 'conversation' | 'tutor' | 'immersion' | 'reference')
            setViewState({
              type: 'begin',
              prompt: '',
              sessionId: result._sessionId,
              plan: result.plan,
            })
          } catch {
            setError('Failed to load session')
            setViewState({ type: 'prompt' })
          }
        }
      } else if (promptFromUrl) {
        // Auto-generate plan from URL prompt
        try {
          const result = await api.conversationPlan(promptFromUrl, mode as 'conversation' | 'tutor' | 'immersion' | 'reference')
          setViewState({
            type: 'begin',
            prompt: promptFromUrl,
            sessionId: result._sessionId,
            plan: result.plan,
          })
        } catch (err) {
          console.error('Failed to generate plan:', err)
          setError(err instanceof Error ? err.message : 'Failed to generate session plan')
          setViewState({ type: 'prompt' })
        }
      }
    }
    autoStart()
  }, [existingSessionId, promptFromUrl, mode])

  const handleStartVoice = useCallback(async () => {
    const prompt = promptInput.trim() || MODE_DEFAULTS[mode] || MODE_DEFAULTS.conversation
    setError(null)
    setViewState({ type: 'loading', prompt })

    try {
      const result = await api.conversationPlan(prompt, mode as 'conversation' | 'tutor' | 'immersion' | 'reference')
      setViewState({
        type: 'begin',
        prompt,
        sessionId: result._sessionId,
        plan: result.plan,
      })
    } catch (err) {
      console.error('Failed to generate plan:', err)
      setError(err instanceof Error ? err.message : 'Failed to generate session plan')
      setViewState({ type: 'prompt' })
    }
  }, [promptInput, mode])

  const handleBegin = useCallback((steeringNotes: string[]) => {
    if (viewState.type !== 'begin') return
    setViewState({
      type: 'active',
      prompt: viewState.prompt,
      sessionId: viewState.sessionId,
      plan: viewState.plan,
      steeringNotes,
    })
  }, [viewState])

  const handleEnd = useCallback((data: SessionEndData) => {
    setViewState({ type: 'debrief', data })
  }, [])

  const handleDebriefDone = useCallback(() => {
    router.push('/conversation')
  }, [router])

  // Debrief — session summary
  if (viewState.type === 'debrief') {
    return (
      <SessionDebrief
        duration={viewState.data.duration}
        transcript={viewState.data.transcript}
        analysisResults={viewState.data.analysisResults}
        plan={usage?.plan}
        onDone={handleDebriefDone}
      />
    )
  }

  // Active session — with pre-generated plan
  if (viewState.type === 'active') {
    return (
      <VoiceSessionOverlay
        prompt={viewState.prompt}
        mode={mode}
        sessionId={viewState.sessionId}
        plan={viewState.plan}
        steeringNotes={viewState.steeringNotes}
        onEnd={handleEnd}
      />
    )
  }

  // Begin conversation overlay — already uses fixed positioning via framer-motion
  if (viewState.type === 'begin') {
    return (
      <BeginOverlay
        plan={viewState.plan}
        mode={mode}
        prompt={viewState.prompt}
        profile={profile}
        onBegin={handleBegin}
        onBack={() => router.push('/conversation')}
      />
    )
  }

  // Loading state — portal to body
  if (viewState.type === 'loading') {
    return createPortal(
      <div className="fixed inset-0 z-[99999] bg-bg flex flex-col items-center justify-center">
        <div className="flex flex-col items-center gap-5">
          <Spinner size={22} />
          <div className="flex flex-col items-center gap-1.5">
            <p className="text-[15px] font-medium text-text-primary tracking-[-0.01em]">
              Preparing your session
            </p>
            <CyclingSubtitle />
          </div>
        </div>
      </div>,
      document.body,
    )
  }

  // Prompt input screen — portal to body
  return createPortal(
    <div className="fixed inset-0 z-[99999] bg-bg flex flex-col items-center justify-center gap-6">
      <VoiceCentralOrb state="IDLE" size={200} />
      <div className="text-center">
        <h2 className="text-[20px] font-medium text-text-primary mb-2">Voice Conversation</h2>
        <p className="text-[14px] text-text-secondary max-w-[360px]">
          Start a live voice conversation. Speak naturally — the AI will listen and respond.
        </p>
      </div>
      <div className="w-full max-w-[420px] px-4">
        <textarea
          value={promptInput}
          onChange={e => setPromptInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleStartVoice()
            }
          }}
          placeholder={MODE_PLACEHOLDERS[mode as keyof typeof MODE_PLACEHOLDERS] || MODE_PLACEHOLDERS.conversation}
          rows={2}
          className="w-full resize-none rounded-xl border border-border bg-bg-secondary px-4 py-3 text-[14px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-brand transition-colors"
        />
      </div>

      {error && (
        <p className="text-[13px] text-accent-warm">{error}</p>
      )}

      <button
        onClick={handleStartVoice}
        disabled={false}
        className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-accent-brand text-white text-[15px] font-medium border-none cursor-pointer transition-all duration-150 hover:scale-[1.03] hover:shadow-md active:scale-[0.97] disabled:opacity-50"
      >
        Start Conversation
      </button>
      <button
        onClick={() => router.push('/conversation')}
        className="text-[13px] text-text-muted hover:text-text-primary bg-transparent border-none cursor-pointer"
      >
        Back to text mode
      </button>
    </div>,
    document.body,
  )
}
