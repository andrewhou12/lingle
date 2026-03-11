'use client'

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  SpeakerWaveIcon,
  SpeakerXMarkIcon,
  MagnifyingGlassIcon,
  QuestionMarkCircleIcon,
  PencilSquareIcon,
  LanguageIcon,
  LightBulbIcon,
} from '@heroicons/react/24/outline'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { api } from '@/lib/api'
import { validateDifficulty, type DifficultyViolation } from '@/lib/difficulty-validator'
import type { SessionPlan } from '@/lib/session-plan'
import { isConversationPlan } from '@/lib/session-plan'
import type { TurnAnalysisResult, SessionEndData } from '@/lib/session-types'
import { useTTS } from '@/hooks/use-tts'
import { useStreamingTTS } from '@/hooks/use-streaming-tts'
import { UIMessageRenderer } from '@/components/chat/ui-message-renderer'
import { ChatInput } from '@/components/chat/chat-input'
import { SessionNavBar } from '@/components/session/session-nav-bar'
import { SessionPlanSidebar } from '@/components/session/session-plan-sidebar'
import { ConversationFlowPanel } from '@/components/session/conversation-flow-panel'
import { SessionNotesPanel } from '@/components/session/session-notes-panel'
import { EndConfirmation } from '@/components/session/end-confirmation'
import { VoiceHelpPanel } from '@/components/voice/voice-help-panel'
import { VoiceLookupPanel } from '@/components/voice/voice-lookup-panel'
import { VoiceCorrectionsPanel } from '@/components/voice/voice-corrections-panel'
import { Spinner } from '@/components/spinner'
import { UsageLimitModal } from '@/components/usage-limit-modal'
import { extractTextFromMessage } from '@/lib/message-utils'
import { cn } from '@/lib/utils'
import { useOnboarding } from '@/hooks/use-onboarding'
import { CoachMark } from '@/components/onboarding/coach-mark'
import type { UsageInfo } from '@lingle/shared/types'

type ActivePanel = 'feedback' | 'help' | 'lookup' | null

interface ChatSessionOverlayProps {
  prompt: string
  mode: string
  sessionId: string
  plan: SessionPlan | null
  steeringNotes?: string[]
  usage?: UsageInfo | null
  onEnd: (data: SessionEndData) => void
}

export function ChatSessionOverlay({
  prompt,
  mode,
  sessionId,
  plan: initialPlan,
  steeringNotes,
  usage: initialUsage,
  onEnd,
}: ChatSessionOverlayProps) {
  const tts = useTTS()

  // ── State ──
  const [input, setInput] = useState('')
  const [sessionPlan, setSessionPlan] = useState<SessionPlan | null>(initialPlan)
  const [chosenChoiceIds, setChosenChoiceIds] = useState<Set<string>>(new Set())
  const [difficultyLevel, setDifficultyLevel] = useState(3)
  const [difficultyViolations, setDifficultyViolations] = useState<Map<string, DifficultyViolation[]>>(new Map())
  const [analysisResults, setAnalysisResults] = useState<Record<number, TurnAnalysisResult>>({})
  const [planOpen, setPlanOpen] = useState(false)
  const [activePanel, setActivePanel] = useState<ActivePanel>(null)
  const [showEndConfirm, setShowEndConfirm] = useState(false)
  const [showUsageLimitModal, setShowUsageLimitModal] = useState(false)
  const [usageLimitMinutes, setUsageLimitMinutes] = useState(10)
  const [usageRemainingSeconds, setUsageRemainingSeconds] = useState<number | null>(null)
  const [sessionDuration, setSessionDuration] = useState(0)

  // ── Help panel state ──
  const [helpMessages, setHelpMessages] = useState<Array<{ role: 'user' | 'ai'; text: string }>>([
    { role: 'ai', text: "Need help? Describe what you're trying to say and I'll guide you." },
  ])
  const [helpInput, setHelpInput] = useState('')
  const [helpLoading, setHelpLoading] = useState(false)

  // ── Lookup state ──
  const [lookupResult, setLookupResult] = useState<{
    word: string; reading?: string; meaning: string; partOfSpeech?: string; exampleSentence?: string; notes?: string
  } | null>(null)
  const [lookupLoading, setLookupLoading] = useState(false)
  // ── Translation state ──
  const [translation, setTranslation] = useState<string | null>(null)

  // ── Suggestion state ──
  const [suggestion, setSuggestion] = useState<string | null>(null)
  const [suggestionLoading, setSuggestionLoading] = useState(false)

  // ── Steering ──
  const [steeringMessages, setSteeringMessages] = useState<Array<{ text: string; time: string }>>(
    steeringNotes?.map(text => ({ text, time: '0:00' })) || [],
  )

  // ── Refs ──
  const sessionIdRef = useRef(sessionId)
  const turnCounterRef = useRef(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const startTimeRef = useRef(Date.now())
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
        return extractTextFromMessage(msg)
      }
    }
    return null
  }, [messages, isSending])
  const streamingTts = useStreamingTTS(latestAssistantText, isSending)

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
        const text = extractTextFromMessage(lastMsg)
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
          const userText = extractTextFromMessage(lastUser)
          const assistantText = extractTextFromMessage(lastAssistant)

          const recentHistory = messages.slice(-6).map(m => ({
            role: m.role,
            content: extractTextFromMessage(m),
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
                    takeaways: result.takeaways || [],
                    sectionTracking: result.sectionTracking || undefined,
                  },
                }))
              }
            })
            .catch(err => console.error('[chat] Turn analysis failed:', err))
        }
      }

      // Clear translate/suggestion on new assistant message
      setTranslation(null)
      setSuggestion(null)
    }
    prevIsSendingRef.current = isSending
  }, [isSending, messages, difficultyLevel, difficultyViolations])

  // ── Extract showCorrection tool outputs into analysisResults ──
  useEffect(() => {
    const toolCorrections: Array<{ original: string; corrected: string; explanation: string; grammarPoint?: string }> = []
    for (const msg of messages) {
      if (msg.role !== 'assistant') continue
      for (const part of msg.parts) {
        const partType = (part as { type: string }).type
        if (partType === 'tool-showCorrection') {
          const toolPart = part as { type: string; state: string; output?: unknown }
          if (toolPart.state === 'output-available' && toolPart.output) {
            const output = toolPart.output as { original: string; corrected: string; explanation: string; grammarPoint?: string }
            toolCorrections.push(output)
          }
        }
      }
    }
    if (toolCorrections.length === 0) return

    setAnalysisResults(prev => {
      // Collect all existing corrections across all turns for dedup
      const existingSet = new Set<string>()
      for (const result of Object.values(prev)) {
        for (const c of result.corrections) {
          existingSet.add(`${c.original}::${c.corrected}`)
        }
      }

      // Find new corrections not already in analysisResults
      const newCorrections = toolCorrections.filter(c => !existingSet.has(`${c.original}::${c.corrected}`))
      if (newCorrections.length === 0) return prev

      // Merge into turn 0 (tool-based corrections bucket)
      const existing = prev[0] || { corrections: [], vocabularyCards: [], grammarNotes: [], naturalnessFeedback: [] }
      // Dedup within the tool bucket too
      const bucketSet = new Set(existing.corrections.map(c => `${c.original}::${c.corrected}`))
      const toAdd = newCorrections.filter(c => !bucketSet.has(`${c.original}::${c.corrected}`))
      if (toAdd.length === 0) return prev

      return {
        ...prev,
        [0]: {
          ...existing,
          corrections: [...existing.corrections, ...toAdd],
        },
      }
    })
  }, [messages])

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

  // ── Feedback count ──
  const feedbackCount = useMemo(() => {
    let count = 0
    for (const result of Object.values(analysisResults)) {
      count += result.corrections.length + (result.naturalnessFeedback?.length || 0)
    }
    return count
  }, [analysisResults])

  // ── Helper: get last assistant message text ──
  const getLastAssistantText = useCallback(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') {
        return extractTextFromMessage(messages[i])
      }
    }
    return null
  }, [messages])

  // ── Help panel handler ──
  const handleHelpSend = useCallback(async () => {
    if (!helpInput.trim() || helpLoading) return
    const query = helpInput.trim()
    setHelpMessages(m => [...m, { role: 'user', text: query }])
    setHelpInput('')
    setHelpLoading(true)

    try {
      const recentHistory = messages.slice(-6).map(m => ({
        role: m.role,
        content: extractTextFromMessage(m),
      }))
      const res = await fetch('/api/conversation/help', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, recentHistory }),
      })
      if (res.ok) {
        const data = await res.json()
        setHelpMessages(m => [...m, { role: 'ai', text: data.suggestion }])
      } else {
        setHelpMessages(m => [...m, { role: 'ai', text: "Sorry, I couldn't get a suggestion right now." }])
      }
    } catch {
      setHelpMessages(m => [...m, { role: 'ai', text: 'Something went wrong. Try again.' }])
    } finally {
      setHelpLoading(false)
    }
  }, [helpInput, helpLoading, messages])

  // ── Translate last message (in help panel) ──
  const handleTranslateLastMessage = useCallback(async () => {
    const text = getLastAssistantText()
    if (!text) return
    setHelpLoading(true)
    try {
      const res = await fetch('/api/conversation/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (res.ok) {
        const data = await res.json()
        setHelpMessages(m => [...m, { role: 'ai', text: data.translation }])
      }
    } catch {
      setHelpMessages(m => [...m, { role: 'ai', text: 'Translation failed.' }])
    } finally {
      setHelpLoading(false)
    }
  }, [getLastAssistantText])

  // ── Lookup handler ──
  const handleLookup = useCallback(async (word: string) => {
    if (!word.trim()) return
    setLookupLoading(true)
    setLookupResult(null)
    try {
      const context = getLastAssistantText() || ''
      const res = await fetch('/api/conversation/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word: word.trim(), context }),
      })
      if (res.ok) {
        const data = await res.json()
        setLookupResult(data)
      }
    } catch (err) {
      console.error('[lookup] Failed:', err)
    } finally {
      setLookupLoading(false)
    }
  }, [getLastAssistantText])

  // ── Translate handler (toggle) ──
  const handleTranslate = useCallback(async () => {
    if (translation) {
      setTranslation(null)
      return
    }
    const text = getLastAssistantText()
    if (!text) return
    try {
      const res = await fetch('/api/conversation/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (res.ok) {
        const data = await res.json()
        setTranslation(data.translation)
      }
    } catch (err) {
      console.error('[translate] Failed:', err)
    }
  }, [translation, getLastAssistantText])

  // ── Suggestion handler (toggle) ──
  const handleSuggest = useCallback(async () => {
    if (suggestion) {
      setSuggestion(null)
      return
    }
    setSuggestionLoading(true)
    try {
      const recentHistory = messages.slice(-6).map(m => ({
        role: m.role,
        content: extractTextFromMessage(m),
      }))
      const res = await fetch('/api/conversation/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recentHistory }),
      })
      if (res.ok) {
        const data = await res.json()
        setSuggestion(data.suggestion)
      }
    } catch {
      // silent fail
    } finally {
      setSuggestionLoading(false)
    }
  }, [suggestion, messages])

  // ── Handlers ──
  const handleSend = useCallback(async () => {
    if (!input.trim() || isSending) return
    const text = input.trim()
    setInput('')
    await sendMessage({ text })
  }, [input, isSending, sendMessage])

  const handleChoiceSelect = useCallback((text: string, blockId: string) => {
    setChosenChoiceIds((prev) => new Set(prev).add(blockId))
    sendMessage({ text })
  }, [sendMessage])

  const handleRetry = useCallback((correctedText: string) => {
    setInput(correctedText)
  }, [])

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
      text: extractTextFromMessage(m),
      isFinal: true,
      timestamp: Date.now(),
    }))

    const endData: SessionEndData = {
      duration: sessionDuration,
      transcript,
      analysisResults,
    }

    api.conversationEnd(sessionId).catch(() => {})
    onEnd(endData)
  }, [messages, sessionDuration, analysisResults, sessionId, onEnd])

  const handleEndCancel = useCallback(() => {
    setShowEndConfirm(false)
  }, [])

  // ── Feedback count for nav ──
  const transcriptCount = messages.length

  // ── Has assistant messages (for helper features) ──
  const hasAssistantMessages = messages.some(m => m.role === 'assistant')

  // ── Onboarding hints ──
  const { isDismissed, dismiss } = useOnboarding()

  return createPortal(
    <div className="fixed inset-0 z-[99999] overflow-hidden bg-bg">
      {/* Persistent flow panel (left) */}
      <ConversationFlowPanel
        plan={sessionPlan}
        currentSectionId={sectionTracking?.currentSectionId}
        completedSectionIds={sectionTracking?.completedSectionIds}
        duration={sessionDuration}
        onOpenFullPlan={() => setPlanOpen(true)}
      />

      {/* Full Session Plan sidebar overlay (left, on top of flow panel) */}
      <SessionPlanSidebar
        isOpen={planOpen}
        plan={sessionPlan}
        onCollapse={() => setPlanOpen(false)}
        onSteer={handleSteer}
        onPlanSave={handlePlanSave}
        steeringMessages={steeringMessages}
        currentSectionId={sectionTracking?.currentSectionId}
        completedSectionIds={sectionTracking?.completedSectionIds}
        className="z-[15]"
      />

      {/* Persistent session notes (right) */}
      <SessionNotesPanel analysisResults={analysisResults} />

      {/* Main layout */}
      <div
        className="relative z-[1] h-screen flex flex-col"
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
          inputMode="chat"
          rightSlot={
            <button
              className={cn(
                'w-8 h-8 flex items-center justify-center rounded-lg transition-colors',
                streamingTts.voiceEnabled
                  ? 'bg-accent-brand/10 text-accent-brand'
                  : 'text-text-muted hover:text-text-primary hover:bg-bg-hover'
              )}
              onClick={streamingTts.toggleVoice}
              title={streamingTts.voiceEnabled ? 'Disable TTS' : 'Enable TTS'}
            >
              {streamingTts.voiceEnabled ? <SpeakerWaveIcon className="w-4 h-4" /> : <SpeakerXMarkIcon className="w-4 h-4" />}
            </button>
          }
        />

        {/* Chat area */}
        <div className="flex-1 flex overflow-hidden pl-[310px] pr-[310px]">
          {/* Messages column */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex-1 overflow-auto">
              <div className="max-w-3xl mx-auto px-6 py-4">
                {messages.map((msg) => (
                  <UIMessageRenderer
                    key={msg.id}
                    message={msg}
                    chosenChoiceIds={chosenChoiceIds}
                    onChoiceSelect={handleChoiceSelect}
                    onPlay={
                      msg.role === 'assistant' && extractTextFromMessage(msg).trim()
                        ? () => tts.play(msg.id, extractTextFromMessage(msg))
                        : undefined
                    }
                    onStop={msg.role === 'assistant' && extractTextFromMessage(msg).trim() ? tts.stop : undefined}
                    isPlayingAudio={tts.playingId === msg.id}
                    isStreaming={isSending && msg === messages[messages.length - 1] && msg.role === 'assistant'}
                    violations={difficultyViolations.get(msg.id)}
                    onRetry={handleRetry}
                  />
                ))}

                {/* Inline translation */}
                {translation && (
                  <div className="ml-0 my-1.5 px-3 py-2 bg-bg-secondary border border-border rounded-lg">
                    <div className="text-[11px] font-medium text-text-muted mb-0.5 flex items-center gap-1">
                      <LanguageIcon className="w-3 h-3" />
                      Translation
                    </div>
                    <div className="text-[14px] text-text-secondary leading-[1.6]">{translation}</div>
                  </div>
                )}

                {/* Inline suggestion */}
                {(suggestion || suggestionLoading) && (
                  <div className="ml-0 my-1.5 px-3 py-2 bg-bg-secondary border border-border rounded-lg">
                    <div className="text-[11px] font-medium text-text-muted mb-0.5 flex items-center gap-1">
                      <LightBulbIcon className="w-3 h-3" />
                      Suggestion
                    </div>
                    {suggestionLoading ? (
                      <div className="flex items-center gap-2 py-1.5">
                        <Spinner size={14} />
                        <span className="text-[12px] text-text-muted">Thinking of a response...</span>
                      </div>
                    ) : suggestion && (
                      <div className="text-[14px] text-text-secondary leading-[1.6] font-jp-clean whitespace-pre-wrap">{suggestion}</div>
                    )}
                  </div>
                )}

                {/* Chat error */}
                {chatError && (
                  <div className="mx-10 my-2 p-3 bg-red-soft rounded-lg">
                    <span className="text-[13px] text-red">{chatError.message}</span>
                  </div>
                )}

                {/* Loading indicator */}
                {isSending && messages.length > 0 && messages[messages.length - 1].role === 'user' && (
                  <div className="flex items-center gap-2.5 py-3 pl-2">
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
                {/* Helper chip buttons */}
                {hasAssistantMessages && (
                  <CoachMark
                    hintId="hint_chat_tools"
                    content="Use these tools anytime — look up words, get translations, or see your feedback."
                    side="top"
                    show={isDismissed('hint_chat_suggestions') && !isDismissed('hint_chat_tools')}
                    onDismiss={() => dismiss('hint_chat_tools')}
                  >
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => setActivePanel(p => p === 'lookup' ? null : 'lookup')}
                      className={cn(
                        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[12px] font-sans cursor-pointer transition-colors',
                        activePanel === 'lookup'
                          ? 'bg-bg-active border-border-strong text-text-primary font-medium'
                          : 'bg-bg-pure border-border text-text-secondary hover:bg-bg-hover hover:text-text-primary hover:border-border-strong',
                      )}
                    >
                      <MagnifyingGlassIcon className="w-3.5 h-3.5" />
                      Look up
                    </button>
                    <button
                      onClick={() => setActivePanel(p => p === 'help' ? null : 'help')}
                      className={cn(
                        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[12px] font-sans cursor-pointer transition-colors',
                        activePanel === 'help'
                          ? 'bg-bg-active border-border-strong text-text-primary font-medium'
                          : 'bg-bg-pure border-border text-text-secondary hover:bg-bg-hover hover:text-text-primary hover:border-border-strong',
                      )}
                    >
                      <QuestionMarkCircleIcon className="w-3.5 h-3.5" />
                      Stuck?
                    </button>
                    <button
                      onClick={handleTranslate}
                      className={cn(
                        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[12px] font-sans cursor-pointer transition-colors',
                        translation
                          ? 'bg-bg-active border-border-strong text-text-primary font-medium'
                          : 'bg-bg-pure border-border text-text-secondary hover:bg-bg-hover hover:text-text-primary hover:border-border-strong',
                      )}
                    >
                      <LanguageIcon className="w-3.5 h-3.5" />
                      Translate
                    </button>
                    <button
                      onClick={handleSuggest}
                      disabled={suggestionLoading}
                      className={cn(
                        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[12px] font-sans cursor-pointer transition-colors',
                        suggestion || suggestionLoading
                          ? 'bg-bg-active border-border-strong text-text-primary font-medium'
                          : 'bg-bg-pure border-border text-text-secondary hover:bg-bg-hover hover:text-text-primary hover:border-border-strong',
                      )}
                    >
                      <LightBulbIcon className="w-3.5 h-3.5" />
                      Suggest
                    </button>
                    <button
                      onClick={() => setActivePanel(p => p === 'feedback' ? null : 'feedback')}
                      className={cn(
                        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[12px] font-sans cursor-pointer transition-colors',
                        activePanel === 'feedback'
                          ? 'bg-bg-active border-border-strong text-text-primary font-medium'
                          : 'bg-bg-pure border-border text-text-secondary hover:bg-bg-hover hover:text-text-primary hover:border-border-strong',
                      )}
                    >
                      <PencilSquareIcon className="w-3.5 h-3.5" />
                      Feedback
                      {feedbackCount > 0 && (
                        <span
                          className={cn(
                            'min-w-[16px] h-[16px] inline-flex items-center justify-center rounded-full text-[10px] font-bold px-1',
                            activePanel === 'feedback'
                              ? 'bg-accent-warm/15 text-accent-warm'
                              : 'bg-warm-soft text-accent-warm',
                          )}
                        >
                          {feedbackCount}
                        </span>
                      )}
                    </button>
                  </div>
                  </CoachMark>
                )}

                {/* Chat input */}
                <ChatInput
                  value={input}
                  onChange={setInput}
                  onSend={handleSend}
                  disabled={isSending || showUsageLimitModal}
                  placeholder={showUsageLimitModal ? 'Daily limit reached' : 'Type your message...'}
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
        </div>
      </div>

      {/* Help panel (right slide) */}
      <VoiceHelpPanel
        isOpen={activePanel === 'help'}
        messages={helpMessages}
        input={helpInput}
        loading={helpLoading}
        hasAiMessages={hasAssistantMessages}
        onInputChange={setHelpInput}
        onSend={handleHelpSend}
        onTranslateLastMessage={handleTranslateLastMessage}
        onClose={() => setActivePanel(null)}
      />

      {/* Lookup panel (right slide) */}
      <VoiceLookupPanel
        isOpen={activePanel === 'lookup'}
        result={lookupResult}
        loading={lookupLoading}
        onClose={() => { setActivePanel(null); setLookupResult(null) }}
        onLookup={handleLookup}
      />

      {/* Feedback panel (right slide) */}
      <VoiceCorrectionsPanel
        isOpen={activePanel === 'feedback'}
        turnResults={analysisResults}
        onClose={() => setActivePanel(null)}
      />

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
