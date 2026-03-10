'use client'

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { SpeakerWaveIcon, SpeakerXMarkIcon, Bars3Icon, MicrophoneIcon } from '@heroicons/react/24/outline'
import { useRouter } from 'next/navigation'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { api } from '@/lib/api'
import { getToolZone } from '@/lib/tool-zones'
import { validateDifficulty, type DifficultyViolation } from '@/lib/difficulty-validator'
import type { SessionPlan } from '@/lib/session-plan'
import { isConversationPlan } from '@/lib/session-plan'
import type { TurnAnalysisResult, SessionEndData } from '@/lib/session-types'
import { useRomaji, useAnnotatedTexts } from '@/hooks/use-romaji'
import { useTTS } from '@/hooks/use-tts'
import { useStreamingTTS } from '@/hooks/use-streaming-tts'
import { PanelProvider, usePanel } from '@/hooks/use-panel'
import { UIMessageRenderer } from '@/components/chat/ui-message-renderer'
import { ChatInput } from '@/components/chat/chat-input'
import { EscapeHatch } from '@/components/chat/escape-hatch'
import { SuggestionChips } from '@/components/chat/suggestion-chips'
import { SessionNavBar } from '@/components/session/session-nav-bar'
import { SessionPlanSidebar } from '@/components/session/session-plan-sidebar'
import { EndConfirmation } from '@/components/session/end-confirmation'
import { LearningPanel } from '@/components/panels/learning-panel'
import { Spinner } from '@/components/spinner'
import { UsageLimitModal } from '@/components/usage-limit-modal'
import { cn } from '@/lib/utils'
import type { UsageInfo } from '@lingle/shared/types'
import { MODE_LABELS, type ScenarioMode } from '@/lib/experience-scenarios'

const CHAT_DEFAULT_SUGGESTIONS = [
  'Hello!',
  'What should we talk about?',
  'Can you repeat that?',
]

interface ChatSessionOverlayProps {
  prompt: string
  mode: string
  sessionId: string
  plan: SessionPlan | null
  steeringNotes?: string[]
  usage?: UsageInfo | null
  onEnd: (data: SessionEndData) => void
}

export function ChatSessionOverlay(props: ChatSessionOverlayProps) {
  return (
    <PanelProvider>
      <ChatSessionOverlayInner {...props} />
    </PanelProvider>
  )
}

function ChatSessionOverlayInner({
  prompt,
  mode,
  sessionId,
  plan: initialPlan,
  steeringNotes,
  usage: initialUsage,
  onEnd,
}: ChatSessionOverlayProps) {
  const router = useRouter()
  const panel = usePanel()
  const { showRomaji, toggle: toggleRomaji } = useRomaji()
  const tts = useTTS()

  // ── State ──
  const [input, setInput] = useState('')
  const [sessionPlan, setSessionPlan] = useState<SessionPlan | null>(initialPlan)
  const [chosenChoiceIds, setChosenChoiceIds] = useState<Set<string>>(new Set())
  const [difficultyLevel, setDifficultyLevel] = useState(3)
  const [difficultyViolations, setDifficultyViolations] = useState<Map<string, DifficultyViolation[]>>(new Map())
  const [analysisResults, setAnalysisResults] = useState<Record<number, TurnAnalysisResult>>({})
  const [planOpen, setPlanOpen] = useState(false)
  const [showEndConfirm, setShowEndConfirm] = useState(false)
  const [showUsageLimitModal, setShowUsageLimitModal] = useState(false)
  const [usageLimitMinutes, setUsageLimitMinutes] = useState(10)
  const [usageRemainingSeconds, setUsageRemainingSeconds] = useState<number | null>(null)
  const [sessionDuration, setSessionDuration] = useState(0)

  // ── Steering ──
  const [steeringMessages, setSteeringMessages] = useState<Array<{ text: string; time: string }>>(
    steeringNotes?.map(text => ({ text, time: '0:00' })) || [],
  )

  // ── Refs ──
  const sessionIdRef = useRef(sessionId)
  const turnCounterRef = useRef(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const startTimeRef = useRef(Date.now())
  const panelAutoOpenedRef = useRef(false)
  const endingRef = useRef(false)
  const sentFirstMessageRef = useRef(false)

  // ── Duration timer ──
  useEffect(() => {
    const interval = setInterval(() => {
      setSessionDuration(Math.floor((Date.now() - startTimeRef.current) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // ── Usage timer ──
  useEffect(() => {
    if (!initialUsage || initialUsage.plan === 'pro' || initialUsage.limitSeconds === -1) return
    const tick = () => {
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000)
      const remaining = Math.max(0, initialUsage.remainingSeconds - elapsed)
      setUsageRemainingSeconds(remaining)
      if (remaining <= 0) setShowUsageLimitModal(true)
    }
    tick()
    const interval = setInterval(tick, 15_000)
    return () => clearInterval(interval)
  }, [initialUsage])

  // ── Fetch difficulty ──
  useEffect(() => {
    api.profileGet().then((p) => {
      if (p?.difficultyLevel) setDifficultyLevel(p.difficultyLevel)
    }).catch(() => {})
  }, [])

  // ── Chat transport ──
  const transport = useMemo(
    () => new DefaultChatTransport({
      api: '/api/conversation/send',
      body: () => (sessionIdRef.current ? { sessionId: sessionIdRef.current } : {}),
    }),
    []
  )

  const {
    messages,
    sendMessage,
    status,
    setMessages,
    error: chatError,
  } = useChat({
    transport,
    onError: (err) => {
      console.error('[useChat] error:', err)
      if (err?.message?.includes('403') || err?.message?.includes('usage_limit_exceeded')) {
        setShowUsageLimitModal(true)
      }
    },
  })

  const isSending = status === 'streaming' || status === 'submitted'

  // ── Send first message on mount ──
  useEffect(() => {
    if (sentFirstMessageRef.current) return
    sentFirstMessageRef.current = true
    requestAnimationFrame(() => {
      sendMessage({ text: prompt })
    })
  }, [prompt, sendMessage])

  // ── Streaming TTS ──
  const latestAssistantText = useMemo(() => {
    if (!isSending) return null
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (msg.role === 'assistant') {
        return msg.parts
          .filter((p) => p.type === 'text')
          .map((p) => (p as { type: 'text'; text: string }).text)
          .join('')
      }
    }
    return null
  }, [messages, isSending])
  const streamingTts = useStreamingTTS(latestAssistantText, isSending)

  // ── Romaji annotations ──
  const assistantTexts = useMemo(
    () => messages
      .filter((m) => m.role === 'assistant')
      .map((m) => m.parts.filter((p) => p.type === 'text').map((p) => (p as { type: 'text'; text: string }).text).join('')),
    [messages]
  )
  const { getAnnotated } = useAnnotatedTexts(assistantTexts, showRomaji)

  // ── Dynamic suggestions ──
  const dynamicSuggestions = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (msg.role !== 'assistant') continue
      for (const part of msg.parts) {
        const partType = (part as { type: string }).type
        if (partType === 'tool-suggestActions') {
          const toolPart = part as { type: string; state: string; output?: unknown }
          if (toolPart.state === 'output-available' && toolPart.output) {
            const output = toolPart.output as { suggestions: string[] }
            if (output.suggestions?.length > 0) return output.suggestions
          }
        }
      }
      break
    }
    return null
  }, [messages])

  // ── Auto-open panel on first panel-zone tool ──
  const hasPanelTools = useMemo(() => {
    for (const msg of messages) {
      if (msg.role !== 'assistant') continue
      for (const part of msg.parts) {
        const partType = (part as { type: string }).type
        if (partType.startsWith('tool-')) {
          const toolName = partType.replace('tool-', '')
          if (getToolZone(toolName) === 'panel') return true
        }
      }
    }
    return false
  }, [messages])

  useEffect(() => {
    if (hasPanelTools && !panelAutoOpenedRef.current) {
      panelAutoOpenedRef.current = true
      panel.open()
    }
  }, [hasPanelTools, panel])

  // ── Update plan from updateSessionPlan tool ──
  useEffect(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (msg.role !== 'assistant') continue
      for (const part of msg.parts) {
        const partType = (part as { type: string }).type
        if (partType === 'tool-updateSessionPlan') {
          const toolPart = part as { type: string; state: string; output?: unknown }
          if (toolPart.state === 'output-available' && toolPart.output) {
            const output = toolPart.output as { updated: boolean; plan: SessionPlan }
            if (output.updated && output.plan) {
              setSessionPlan(output.plan)
            }
          }
        }
      }
      break
    }
  }, [messages])

  // ── Scroll to bottom ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Difficulty validation after streaming ends ──
  const prevIsSendingRef = useRef(false)
  useEffect(() => {
    if (prevIsSendingRef.current && !isSending) {
      const lastMsg = messages[messages.length - 1]
      if (lastMsg?.role === 'assistant' && !difficultyViolations.has(lastMsg.id)) {
        const text = lastMsg.parts
          .filter((p) => p.type === 'text')
          .map((p) => (p as { type: 'text'; text: string }).text)
          .join('')
        if (text.trim()) {
          validateDifficulty(text, difficultyLevel).then((violations) => {
            if (violations.length > 0) {
              setDifficultyViolations((prev) => {
                const next = new Map(prev)
                next.set(lastMsg.id, violations)
                return next
              })
            }
          })
        }
      }

      // ── Per-turn analysis ──
      const turnIdx = turnCounterRef.current++
      if (turnIdx > 0) {
        // Find last user + assistant text
        const lastAssistant = messages[messages.length - 1]
        const lastUser = [...messages].reverse().find(m => m.role === 'user')
        if (lastAssistant?.role === 'assistant' && lastUser) {
          const userText = lastUser.parts
            .filter(p => p.type === 'text')
            .map(p => (p as { type: 'text'; text: string }).text)
            .join('')
          const assistantText = lastAssistant.parts
            .filter(p => p.type === 'text')
            .map(p => (p as { type: 'text'; text: string }).text)
            .join('')

          const recentHistory = messages.slice(-6).map(m => ({
            role: m.role,
            content: m.parts
              .filter(p => p.type === 'text')
              .map(p => (p as { type: 'text'; text: string }).text)
              .join(''),
          }))

          fetch('/api/conversation/voice-analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId: sessionIdRef.current,
              userMessage: userText,
              assistantMessage: assistantText,
              recentHistory,
            }),
          })
            .then(res => res.ok ? res.json() : null)
            .then(result => {
              if (result) {
                setAnalysisResults(prev => ({
                  ...prev,
                  [turnIdx]: {
                    corrections: result.corrections || [],
                    vocabularyCards: result.vocabularyCards || [],
                    grammarNotes: result.grammarNotes || [],
                    naturalnessFeedback: result.naturalnessFeedback || [],
                    sectionTracking: result.sectionTracking || undefined,
                  },
                }))
              }
            })
            .catch(err => console.error('[chat] Turn analysis failed:', err))
        }
      }
    }
    prevIsSendingRef.current = isSending
  }, [isSending, messages, difficultyLevel, difficultyViolations])

  // ── Section tracking from latest analysis ──
  const currentSectionLabel = useMemo(() => {
    const plan = sessionPlan
    if (!plan || !isConversationPlan(plan) || !plan.sections?.length) return undefined
    const keys = Object.keys(analysisResults).map(Number)
    if (keys.length === 0) return undefined
    const latest = analysisResults[Math.max(...keys)]
    if (!latest?.sectionTracking) return undefined
    const section = plan.sections.find(s => s.id === latest.sectionTracking!.currentSectionId)
    return section?.label
  }, [sessionPlan, analysisResults])

  const sectionTracking = useMemo(() => {
    const keys = Object.keys(analysisResults).map(Number)
    if (keys.length === 0) return undefined
    return analysisResults[Math.max(...keys)]?.sectionTracking
  }, [analysisResults])

  // ── Handlers ──
  const handleSend = useCallback(async () => {
    if (!input.trim() || isSending) return
    const text = input.trim()
    setInput('')
    await sendMessage({ text })
  }, [input, isSending, sendMessage])

  const handleSuggestionSelect = useCallback((text: string) => {
    setInput(text)
  }, [])

  const handleChoiceSelect = useCallback((text: string, blockId: string) => {
    setChosenChoiceIds((prev) => new Set(prev).add(blockId))
    sendMessage({ text })
  }, [sendMessage])

  const handleVoiceTranscript = useCallback((text: string) => {
    if (isSending) return
    sendMessage({ text })
  }, [isSending, sendMessage])

  const handleEscapeHatch = useCallback(() => {
    setInput("I'd like to switch to English for a moment: ")
  }, [])

  const handlePlanUpdate = useCallback(async (updates: Partial<SessionPlan>) => {
    try {
      const result = await api.conversationPlanUpdate(sessionId, updates)
      setSessionPlan(result.plan)
    } catch (err) {
      console.error('Failed to update plan:', err)
    }
  }, [sessionId])

  const formatTime = useCallback((seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }, [])

  const handleSteer = useCallback((text: string) => {
    setSteeringMessages(prev => [...prev, { text, time: formatTime(sessionDuration) }])
    sendMessage({ text: `[Learner instruction: ${text}]` })
  }, [sessionDuration, sendMessage, formatTime])

  const handlePlanSave = useCallback((planText: string) => {
    sendMessage({ text: `[Plan updated by learner: ${planText}]` })
    setSteeringMessages(prev => [...prev, { text: 'Plan edited', time: formatTime(sessionDuration) }])
  }, [sendMessage, sessionDuration, formatTime])

  // ── End flow ──
  const requestEnd = useCallback(() => {
    setShowEndConfirm(true)
  }, [])

  const handleEndConfirm = useCallback(async () => {
    if (endingRef.current) return
    endingRef.current = true
    setShowEndConfirm(false)

    // Build transcript from messages
    const transcript = messages.map(m => ({
      role: m.role as 'user' | 'assistant',
      text: m.parts
        .filter(p => p.type === 'text')
        .map(p => (p as { type: 'text'; text: string }).text)
        .join(''),
      isFinal: true,
      timestamp: Date.now(),
    }))

    const endData: SessionEndData = {
      duration: sessionDuration,
      transcript,
      analysisResults,
    }

    try { await api.conversationEnd(sessionId) } catch {}
    onEnd(endData)
  }, [messages, sessionDuration, analysisResults, sessionId, onEnd])

  const handleEndCancel = useCallback(() => {
    setShowEndConfirm(false)
  }, [])

  // ── Escape key ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !showEndConfirm) requestEnd()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [requestEnd, showEndConfirm])

  // ── Feedback count for nav ──
  const transcriptCount = messages.length

  return createPortal(
    <div className="fixed inset-0 z-[99999] overflow-hidden bg-bg">
      {/* Session Plan sidebar (left) */}
      <SessionPlanSidebar
        isOpen={planOpen}
        plan={sessionPlan}
        onCollapse={() => setPlanOpen(false)}
        onSteer={handleSteer}
        onPlanSave={handlePlanSave}
        steeringMessages={steeringMessages}
        currentSectionId={sectionTracking?.currentSectionId}
        completedSectionIds={sectionTracking?.completedSectionIds}
      />

      {/* Main layout */}
      <div
        className={cn(
          'relative z-[1] h-screen flex flex-col transition-[padding-left,padding-right] duration-[380ms] ease-[cubic-bezier(.76,0,.24,1)]',
          planOpen ? 'pl-[290px]' : 'pl-0',
          panel.isOpen ? 'pr-[340px]' : 'pr-0',
        )}
      >
        {/* Nav bar */}
        <SessionNavBar
          plan={sessionPlan}
          duration={sessionDuration}
          transcriptCount={transcriptCount}
          isPlanOpen={planOpen}
          isTranscriptOpen={false}
          isSubtitlesOn={false}
          showSubtitlesToggle={false}
          onTogglePlan={() => setPlanOpen(p => !p)}
          onToggleTranscript={() => {}}
          onToggleSubtitles={() => {}}
          onEnd={requestEnd}
          currentSectionLabel={currentSectionLabel}
          rightSlot={
            <>
              <button
                className={cn(
                  'w-8 h-8 flex items-center justify-center rounded-lg transition-colors',
                  streamingTts.voiceEnabled
                    ? 'bg-accent-brand/10 text-accent-brand'
                    : 'text-text-muted hover:text-text-primary hover:bg-bg-hover'
                )}
                onClick={streamingTts.toggleVoice}
                title={streamingTts.voiceEnabled ? 'Disable voice mode' : 'Enable voice mode'}
              >
                {streamingTts.voiceEnabled ? <SpeakerWaveIcon className="w-4 h-4" /> : <SpeakerXMarkIcon className="w-4 h-4" />}
              </button>
              <button
                className={cn(
                  'w-8 h-8 flex items-center justify-center rounded-lg transition-colors',
                  panel.isOpen
                    ? 'bg-accent-brand/10 text-accent-brand'
                    : 'text-text-muted hover:text-text-primary hover:bg-bg-hover'
                )}
                onClick={panel.toggle}
                title="Toggle session panel"
              >
                <Bars3Icon className="w-4 h-4" />
              </button>
              <button
                className="inline-flex items-center gap-1.5 rounded-lg bg-bg-secondary px-3 py-1.5 text-[13px] font-medium text-text-secondary border border-border cursor-pointer transition-colors hover:border-accent-brand hover:text-accent-brand"
                onClick={() => router.push(`/conversation/voice?sessionId=${sessionId}`)}
                title="Switch to voice mode"
              >
                <MicrophoneIcon className="w-3 h-3" />
                Voice
              </button>
            </>
          }
        />

        {/* Chat area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Messages column */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex-1 overflow-auto">
              <div className="max-w-3xl mx-auto px-6 py-4">
                {messages.map((msg) => (
                  <UIMessageRenderer
                    key={msg.id}
                    message={msg}
                    showRomaji={showRomaji}
                    getAnnotated={getAnnotated}
                    chosenChoiceIds={chosenChoiceIds}
                    onChoiceSelect={handleChoiceSelect}
                    onPlay={
                      msg.role === 'assistant' && msg.parts.some((p) => p.type === 'text' && (p as { type: 'text'; text: string }).text.trim())
                        ? () => {
                            const textContent = msg.parts
                              .filter((p) => p.type === 'text')
                              .map((p) => (p as { type: 'text'; text: string }).text)
                              .join('')
                            tts.play(msg.id, textContent)
                          }
                        : undefined
                    }
                    onStop={msg.role === 'assistant' && msg.parts.some((p) => p.type === 'text' && (p as { type: 'text'; text: string }).text.trim()) ? tts.stop : undefined}
                    isPlayingAudio={tts.playingId === msg.id}
                    isStreaming={isSending && msg === messages[messages.length - 1] && msg.role === 'assistant'}
                    panelOpen={panel.isOpen}
                    violations={difficultyViolations.get(msg.id)}
                  />
                ))}

                {/* Chat error */}
                {chatError && (
                  <div className="mx-10 my-2 p-3 bg-red-soft rounded-lg">
                    <span className="text-[13px] text-red">{chatError.message}</span>
                  </div>
                )}

                {/* Loading indicator */}
                {isSending && messages.length > 0 && messages[messages.length - 1].role === 'user' && (
                  <div className="flex items-center gap-2.5 py-3 pl-10">
                    <Spinner size={14} />
                    <span className="text-[13px] text-text-muted">Thinking...</span>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Bottom area */}
            <div className="px-6 pt-2 pb-4 flex flex-col gap-3">
              <div className="max-w-3xl mx-auto w-full flex flex-col gap-3">
                {/* Escape hatch */}
                {messages.length > 0 && !isSending && mode !== 'reference' && mode !== 'immersion' && (
                  <EscapeHatch onUse={handleEscapeHatch} />
                )}

                {/* Suggestion chips */}
                {(messages.length === 0 || (messages.length > 0 && messages[messages.length - 1].role === 'assistant' && !isSending)) && (
                  <SuggestionChips
                    suggestions={dynamicSuggestions ?? CHAT_DEFAULT_SUGGESTIONS}
                    onSelect={handleSuggestionSelect}
                  />
                )}

                {/* Chat input */}
                <ChatInput
                  value={input}
                  onChange={setInput}
                  onSend={handleSend}
                  onVoiceTranscript={handleVoiceTranscript}
                  disabled={isSending || showUsageLimitModal}
                  placeholder={showUsageLimitModal ? 'Daily limit reached' : 'Type your message...'}
                  showRomaji={showRomaji}
                  onToggleRomaji={toggleRomaji}
                />

                {/* Usage countdown */}
                {usageRemainingSeconds !== null && usageRemainingSeconds > 0 && usageRemainingSeconds <= 120 && (
                  <div className="flex items-center justify-center gap-1.5 py-1.5 text-[12px] text-accent-warm">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    {Math.floor(usageRemainingSeconds / 60)}:{String(usageRemainingSeconds % 60).padStart(2, '0')} remaining today
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Side panel */}
          {panel.isOpen && (
            <div className="w-[340px] border-l border-border shrink-0">
              <LearningPanel
                messages={messages}
                plan={sessionPlan}
                sessionId={sessionId}
                mode={mode as ScenarioMode}
                onPlanUpdate={handlePlanUpdate}
              />
            </div>
          )}
        </div>
      </div>

      {/* End confirmation dialog */}
      <EndConfirmation
        isOpen={showEndConfirm}
        onConfirm={handleEndConfirm}
        onCancel={handleEndCancel}
        duration={sessionDuration}
        turnsCount={transcriptCount}
      />

      <UsageLimitModal
        open={showUsageLimitModal}
        onClose={() => setShowUsageLimitModal(false)}
        usedMinutes={usageLimitMinutes}
        limitMinutes={usageLimitMinutes}
      />
    </div>,
    document.body,
  )
}
