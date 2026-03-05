'use client'

import { useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useRouter, useSearchParams } from 'next/navigation'
import { MODE_PLACEHOLDERS } from '@/lib/experience-scenarios'
import { api } from '@/lib/api'
import type { SessionPlan } from '@/lib/session-plan'
import { VoiceCentralOrb } from './voice-central-orb'
import { VoiceBeginOverlay } from './voice-begin-overlay'
import { VoiceSessionOverlay } from './voice-session-overlay'
import { Spinner } from '@/components/spinner'

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
  | { type: 'active-direct'; prompt: string; mode: string; sessionId?: string }

export function VoiceConversationView() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const mode = searchParams.get('mode') || 'conversation'
  const existingSessionId = searchParams.get('sessionId')

  const [promptInput, setPromptInput] = useState('')
  const [viewState, setViewState] = useState<ViewState>(
    existingSessionId
      ? { type: 'active-direct', prompt: '', mode, sessionId: existingSessionId }
      : { type: 'prompt' }
  )
  const [error, setError] = useState<string | null>(null)

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

  const handleEnd = useCallback(() => {
    setViewState({ type: 'prompt' })
    setPromptInput('')
    router.push('/conversation')
  }, [router])

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

  // Active session — direct (resume or legacy)
  if (viewState.type === 'active-direct') {
    return (
      <VoiceSessionOverlay
        prompt={viewState.prompt}
        mode={viewState.mode}
        sessionId={viewState.sessionId}
        onEnd={handleEnd}
      />
    )
  }

  // Begin conversation overlay — already uses fixed positioning via framer-motion
  if (viewState.type === 'begin') {
    return (
      <VoiceBeginOverlay
        plan={viewState.plan}
        mode={mode}
        prompt={viewState.prompt}
        onBegin={handleBegin}
        onBack={() => setViewState({ type: 'prompt' })}
      />
    )
  }

  // Loading state — portal to body
  if (viewState.type === 'loading') {
    return createPortal(
      <div className="fixed inset-0 z-[99999] bg-bg flex flex-col items-center justify-center gap-6">
        <VoiceCentralOrb state="THINKING" size={200} />
        <div className="flex items-center gap-2.5">
          <Spinner size={16} />
          <span className="text-[14px] text-text-muted">Generating session plan...</span>
        </div>
        <p className="text-[12px] text-text-placeholder max-w-[300px] text-center">
          The AI is crafting a personalized conversation plan based on your request.
        </p>
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
        className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-accent-brand text-white text-[15px] font-medium border-none cursor-pointer transition-colors hover:opacity-90 disabled:opacity-50"
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
