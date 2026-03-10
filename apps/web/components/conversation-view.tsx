'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { UsageLimitError } from '@/lib/api'
import type { SessionPlan } from '@/lib/session-plan'
import type { ViewState, SessionEndData } from '@/lib/session-types'
import type { ScenarioMode } from '@/lib/experience-scenarios'
import type { LearnerProfile, UsageInfo } from '@lingle/shared/types'
import { useLanguage } from '@/hooks/use-language'
import { PromptScreen } from '@/components/session/prompt-screen'
import { LoadingScreen } from '@/components/session/loading-screen'
import { BeginOverlay } from '@/components/session/begin-overlay'
import { SessionDebrief } from '@/components/session/session-debrief'
import { ChatSessionOverlay } from '@/components/chat/chat-session-overlay'
import { UsageLimitModal } from '@/components/usage-limit-modal'

export function ConversationView() {
  return <ConversationViewInner />
}

function ConversationViewInner() {
  const router = useRouter()
  const { targetLanguage } = useLanguage()
  const [viewState, setViewState] = useState<ViewState>({ type: 'prompt' })
  const [profile, setProfile] = useState<LearnerProfile | null>(null)
  const [usage, setUsage] = useState<UsageInfo | null>(null)
  const [activeMode, setActiveMode] = useState<ScenarioMode>('conversation')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [showUsageLimitModal, setShowUsageLimitModal] = useState(false)
  const [usageLimitMinutes, setUsageLimitMinutes] = useState(10)

  // Fetch profile + usage on mount
  useEffect(() => {
    api.profileGet().then(setProfile).catch(() => {})
    api.usageGet().then(setUsage).catch(() => {})
  }, [])

  const handleStart = useCallback(async (prompt: string, mode: ScenarioMode, inputMode: 'chat' | 'voice') => {
    setError(null)

    // Voice mode — redirect
    if (inputMode === 'voice') {
      const params = new URLSearchParams({ mode })
      if (prompt) params.set('prompt', prompt)
      router.push(`/conversation/voice?${params.toString()}`)
      return
    }

    // Chat mode — plan then begin
    setIsLoading(true)
    setViewState({ type: 'loading', prompt })

    try {
      // Refresh usage
      const [usageInfo] = await Promise.all([
        api.usageGet().catch(() => null),
      ])
      if (usageInfo) setUsage(usageInfo)

      if (usageInfo && usageInfo.isLimitReached) {
        setUsageLimitMinutes(usageInfo.limitSeconds === -1 ? 10 : Math.floor(usageInfo.limitSeconds / 60))
        setShowUsageLimitModal(true)
        setIsLoading(false)
        setViewState({ type: 'prompt' })
        return
      }

      const result = await api.conversationPlan(prompt, mode)
      setActiveMode(mode)
      setViewState({
        type: 'begin',
        prompt,
        sessionId: result._sessionId,
        plan: result.plan,
      })
    } catch (err) {
      if (err instanceof UsageLimitError) {
        setUsageLimitMinutes(Math.floor(err.limitSeconds / 60))
        setShowUsageLimitModal(true)
      } else {
        console.error('Failed to start session:', err)
        setError(err instanceof Error ? err.message : 'Failed to start session. Please try again.')
      }
      setViewState({ type: 'prompt' })
    }
    setIsLoading(false)
  }, [router])

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
    setViewState({ type: 'prompt' })
  }, [])

  // Debrief
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

  // Active session
  if (viewState.type === 'active') {
    return (
      <ChatSessionOverlay
        prompt={viewState.prompt}
        mode={activeMode}
        sessionId={viewState.sessionId}
        plan={viewState.plan}
        steeringNotes={viewState.steeringNotes}
        usage={usage}
        onEnd={handleEnd}
      />
    )
  }

  // Begin overlay
  if (viewState.type === 'begin') {
    return (
      <BeginOverlay
        plan={viewState.plan}
        mode={activeMode}
        prompt={viewState.prompt}
        profile={profile}
        onBegin={handleBegin}
        onBack={() => setViewState({ type: 'prompt' })}
        hintText="Type to chat \u00B7 Corrections appear inline"
      />
    )
  }

  // Loading
  if (viewState.type === 'loading') {
    return <LoadingScreen />
  }

  // Prompt
  return (
    <>
      <PromptScreen
        targetLanguage={targetLanguage}
        error={error}
        isLoading={isLoading}
        onStart={handleStart}
      />
      <UsageLimitModal
        open={showUsageLimitModal}
        onClose={() => setShowUsageLimitModal(false)}
        usedMinutes={usageLimitMinutes}
        limitMinutes={usageLimitMinutes}
      />
    </>
  )
}
