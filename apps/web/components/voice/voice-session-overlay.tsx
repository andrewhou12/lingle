'use client'

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

import { useVoiceConversation, type UseVoiceConversationReturn } from '@/hooks/use-voice-conversation'
import { useLiveKitVoice } from '@/hooks/use-livekit-voice'
import { getVoiceProvider } from '@/lib/voice/voice-provider-config'
import type { SessionPlan } from '@/lib/session-plan'
import { isConversationPlan } from '@/lib/session-plan'
import { VoiceCentralOrb } from './voice-central-orb'
import { VoiceStateRing } from './voice-state-ring'
import { SessionNavBar } from '@/components/session/session-nav-bar'
import { SessionPlanSidebar } from '@/components/session/session-plan-sidebar'
import { ConversationFlowPanel } from '@/components/session/conversation-flow-panel'
import { SessionNotesPanel } from '@/components/session/session-notes-panel'
import { VoiceLiveSubtitles } from './voice-live-subtitles'
import { VoiceTranscriptPanel } from './voice-transcript-panel'
import { UnifiedChatOverlay } from './unified-chat-overlay'
import { SessionSettingsPanel } from './session-settings-panel'
import { VoiceControls, type ActivePanel } from './voice-controls'
import { VoiceFallbackInput } from './voice-fallback-input'
import { motion, AnimatePresence } from 'framer-motion'
import { EndConfirmation } from '@/components/session/end-confirmation'
import { FeedbackCardFlipper } from './feedback-card-flipper'
import { Cog6ToothIcon } from '@heroicons/react/24/outline'
import { useLanguage } from '@/hooks/use-language'
import { Spinner } from '@/components/spinner'
import { cn } from '@/lib/utils'
export type { SessionEndData } from '@/lib/session-types'
import type { SessionEndData } from '@/lib/session-types'

interface VoiceSessionOverlayProps {
  prompt: string
  mode: string
  sessionId?: string | null
  plan?: SessionPlan | null
  steeringNotes?: string[]
  onEnd: (data: SessionEndData) => void
}

export function VoiceSessionOverlay(props: VoiceSessionOverlayProps) {
  const provider = useMemo(() => getVoiceProvider(), [])

  if (provider === 'livekit') {
    return <LiveKitVoiceSession {...props} />
  }

  return <DefaultVoiceSession {...props} />
}

function DefaultVoiceSession(props: VoiceSessionOverlayProps) {
  const { prompt, mode, sessionId: existingSessionId, plan: existingPlan, steeringNotes, onEnd } = props

  const voice = useVoiceConversation({
    sessionId: existingSessionId,
    autoEndpoint: false,
  })

  return (
    <SessionOverlayInner
      voice={voice}
      prompt={prompt}
      mode={mode}
      existingSessionId={existingSessionId}
      existingPlan={existingPlan}
      steeringNotes={steeringNotes}
      onEnd={onEnd}
    />
  )
}

function LiveKitVoiceSession(props: VoiceSessionOverlayProps) {
  const { prompt, mode, sessionId: existingSessionId, plan: existingPlan, steeringNotes, onEnd } = props

  const voice = useLiveKitVoice({
    sessionId: existingSessionId,
    sessionPlan: existingPlan,
  })

  return (
    <SessionOverlayInner
      voice={voice}
      prompt={prompt}
      mode={mode}
      existingSessionId={existingSessionId}
      existingPlan={existingPlan}
      steeringNotes={steeringNotes}
      onEnd={onEnd}
    />
  )
}

/** Shared session overlay layout */
function SessionOverlayInner({
  voice,
  prompt,
  mode,
  existingSessionId,
  existingPlan,
  steeringNotes,
  onEnd,
}: {
  voice: UseVoiceConversationReturn
  prompt: string
  mode: string
  existingSessionId?: string | null
  existingPlan?: SessionPlan | null
  steeringNotes?: string[]
  onEnd: (data: SessionEndData) => void
}) {
  const { targetLanguage } = useLanguage()

  // ── Panel state ──
  const [joined, setJoined] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const [planOpen, setPlanOpen] = useState(false)
  const [rightPanel, setRightPanel] = useState<ActivePanel>(null)
  const [showSubtitles, setShowSubtitles] = useState(true)
  const [showKeyboard, setShowKeyboard] = useState(false)
  const [notesHighlight, setNotesHighlight] = useState(false)
  const [showRetryFeedback, setShowRetryFeedback] = useState(false)
  const retryFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [newFeedbackFlash, setNewFeedbackFlash] = useState(false)
  const feedbackFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [showChat, setShowChat] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [viewedFeedbackCount, setViewedFeedbackCount] = useState(0)
  const [chatLookupWord, setChatLookupWord] = useState<string | null>(null)
  const [showHelpNudge, setShowHelpNudge] = useState(false)
  const helpNudgeShownRef = useRef(false)

  // Help panel state removed — now in UnifiedChatOverlay

  // ── Lookup state ──
  const [lookupResult, setLookupResult] = useState<{
    word: string; reading?: string; meaning: string; partOfSpeech?: string; exampleSentence?: string; notes?: string
  } | null>(null)
  const [lookupLoading, setLookupLoading] = useState(false)

  // ── Translation state ──
  const [translation, setTranslation] = useState<string | null>(null)
  const [precachedTranslation, setPrecachedTranslation] = useState<string | null>(null)

  // ── Suggestion state ──
  const [suggestion, setSuggestion] = useState<string | null>(null)
  const [suggestionLoading, setSuggestionLoading] = useState(false)
  const [precachedSuggestion, setPrecachedSuggestion] = useState<string | null>(null)

  // ── Session settings ──
  const [sessionSettings, setSessionSettings] = useState<{ vocabCards: boolean; introduceNewItems: boolean; autoTranslate: boolean; autoSuggest: boolean }>({ vocabCards: true, introduceNewItems: false, autoTranslate: false, autoSuggest: false })

  // ── Steering ──
  const [steeringMessages, setSteeringMessages] = useState<Array<{ text: string; time: string }>>(
    steeringNotes?.map(text => ({ text, time: '0:00' })) || [],
  )

  // Send steering message when introduceNewItems setting changes (skip initial render)
  const introduceNewItemsMounted = useRef(false)
  useEffect(() => {
    if (!introduceNewItemsMounted.current) {
      introduceNewItemsMounted.current = true
      return
    }
    // Only send a message when toggling — the default (OFF) is baked into the system prompt
    if (sessionSettings.introduceNewItems) {
      handleSteer('Feel free to introduce new vocabulary and grammar slightly above my level.')
    } else {
      handleSteer('Stay within my current level. Don\'t introduce new vocabulary or grammar above my level.')
    }
  }, [sessionSettings.introduceNewItems])

  const handleJoin = useCallback(async () => {
    // Unlock AudioContext synchronously while still in the user gesture.
    // room.startAudio() is called later (after awaits), but the browser
    // considers audio unlocked once any AudioContext is created+resumed in a gesture.
    try { new AudioContext().resume() } catch {}
    setJoined(true)
    setIsStarting(true)
    try {
      if (existingPlan && existingSessionId) {
        await voice.startWithExistingPlan(existingSessionId, existingPlan, prompt, steeringNotes)
      } else if (existingSessionId) {
        await voice.startSession()
      } else {
        await voice.startNewSession(prompt, mode)
      }
    } catch (err) {
      console.error('Failed to start voice session:', err)
    }
    setIsStarting(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingPlan, existingSessionId, prompt, mode])

  // Format duration
  const formatTime = useCallback((seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }, [])

  // Steering handler — sends silently (not shown in transcript/subtitles)
  const handleSteer = useCallback((text: string) => {
    setSteeringMessages(prev => [...prev, { text, time: formatTime(voice.duration) }])
    voice.sendSilentMessage(`[Learner instruction: ${text}]`)
  }, [voice.duration, voice.sendSilentMessage, formatTime])

  // Plan save handler — sends silently
  const handlePlanSave = useCallback((planText: string) => {
    voice.sendSilentMessage(`[Plan updated by learner: ${planText}]`)
    setSteeringMessages(prev => [...prev, { text: 'Plan edited', time: formatTime(voice.duration) }])
  }, [voice.sendSilentMessage, voice.duration, formatTime])

  // ── Feedback aggregation (from analysis results) ──
  const feedbackCount = useMemo(() => {
    let count = 0
    for (const result of Object.values(voice.analysisResults)) {
      count += result.corrections.length
        + (result.naturalnessFeedback?.length || 0)
        + (result.alternativeExpressions?.length || 0)
        + (result.registerMismatches?.length || 0)
        + (result.conversationalTips?.length || 0)
    }
    return count
  }, [voice.analysisResults])

  // Latest turn result for the grade indicator
  const latestTurnIdx = useMemo(() => {
    const keys = Object.keys(voice.analysisResults).map(Number)
    return keys.length > 0 ? Math.max(...keys) : null
  }, [voice.analysisResults])

  const latestResult = latestTurnIdx !== null ? voice.analysisResults[latestTurnIdx] : null

  // Latest correction for subtitles
  const latestCorrection = useMemo(() => {
    if (!latestResult || latestResult.corrections.length === 0) return null
    const c = latestResult.corrections[latestResult.corrections.length - 1]
    return { original: c.original, corrected: c.corrected, explanation: c.explanation, grammarPoint: c.grammarPoint }
  }, [latestResult])

  const openCorrectionsPanel = useCallback(() => {
    setShowChat(true)
  }, [])

  // Retry with visual feedback — clear subtitles so user sees a fresh slate
  const handleRetry = useCallback(() => {
    voice.retryLast()
    setExchangeUserLine(null)
    setExchangeAILine(null)
    setShowRetryFeedback(true)
    if (retryFeedbackTimerRef.current) clearTimeout(retryFeedbackTimerRef.current)
    retryFeedbackTimerRef.current = setTimeout(() => setShowRetryFeedback(false), 1500)
  }, [voice.retryLast])

  // Flash the feedback chip when new analysis results arrive
  const prevCorrectionTurnRef = useRef<number | null>(null)
  useEffect(() => {
    if (latestTurnIdx === null || latestTurnIdx === prevCorrectionTurnRef.current) return
    prevCorrectionTurnRef.current = latestTurnIdx

    setNewFeedbackFlash(true)
    if (feedbackFlashTimerRef.current) clearTimeout(feedbackFlashTimerRef.current)
    feedbackFlashTimerRef.current = setTimeout(() => setNewFeedbackFlash(false), 600)

    return () => {
      if (feedbackFlashTimerRef.current) clearTimeout(feedbackFlashTimerRef.current)
    }
  }, [latestTurnIdx])

  // Flash the Session Notes panel when new analysis items arrive
  const prevAnalysisCountRef = useRef(0)
  useEffect(() => {
    const count = Object.keys(voice.analysisResults).length
    if (count > prevAnalysisCountRef.current) {
      setNotesHighlight(true)
      const timer = setTimeout(() => setNotesHighlight(false), 1500)
      return () => clearTimeout(timer)
    }
    prevAnalysisCountRef.current = count
  }, [voice.analysisResults])

  // Mark feedback as viewed when chat overlay is open
  useEffect(() => {
    if (showChat) {
      setViewedFeedbackCount(feedbackCount)
    }
  }, [showChat, feedbackCount])

  const unviewedFeedbackCount = feedbackCount - viewedFeedbackCount

  // Help/feedback handled by UnifiedChatOverlay

  // ── Lookup handler ──
  const handleLookup = useCallback(async (word: string, context: string) => {
    setLookupLoading(true)
    setLookupResult(null)
    try {
      const res = await fetch('/api/conversation/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word, context, targetLanguage }),
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
  }, [])

  // ── Translate handler (checks pre-cache first) ──
  const handleTranslate = useCallback(async (text: string) => {
    // Toggle off if already showing
    if (translation) {
      setTranslation(null)
      return
    }
    // Check pre-cache
    if (precachedTranslation) {
      setTranslation(precachedTranslation)
      return
    }
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
  }, [translation, precachedTranslation])

  // Translation help now handled in UnifiedChatOverlay

  // ── Suggestion handler (toggle, checks pre-cache) ──
  const handleSuggest = useCallback(async () => {
    if (suggestion) {
      setSuggestion(null)
      return
    }
    if (precachedSuggestion) {
      setSuggestion(precachedSuggestion)
      return
    }
    setSuggestionLoading(true)
    try {
      const recentHistory = voice.transcript.slice(-6).map(t => ({
        role: t.role,
        content: t.text,
      }))
      const res = await fetch('/api/conversation/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recentHistory, targetLanguage }),
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
  }, [suggestion, precachedSuggestion, voice.transcript])

  // ── End session (with confirmation) ──
  const [showEndConfirm, setShowEndConfirm] = useState(false)
  const endingRef = useRef(false)

  const requestEnd = useCallback(() => {
    setShowEndConfirm(true)
  }, [])

  const handleEndConfirm = useCallback(async () => {
    if (endingRef.current) return
    endingRef.current = true
    setShowEndConfirm(false)
    const endData: SessionEndData = {
      duration: voice.duration,
      transcript: [...voice.transcript],
      analysisResults: { ...voice.analysisResults },
    }
    try { await voice.endSession() } catch {}
    onEnd(endData)
  }, [voice.endSession, voice.duration, voice.transcript, voice.analysisResults, onEnd])

  const handleEndCancel = useCallback(() => {
    setShowEndConfirm(false)
  }, [])


  // Cleanup
  useEffect(() => {
    return () => {
      if (voice.isActive) voice.endSession().catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Inactivity detector ──
  const INACTIVITY_WARNING_MS = 2 * 60 * 1000  // 2 minutes: show warning
  const INACTIVITY_KICK_MS = 3 * 60 * 1000     // 3 minutes: auto-end
  const [inactivityWarning, setInactivityWarning] = useState(false)
  const lastActivityRef = useRef(Date.now())
  const inactivityTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Reset activity timestamp on any user action
  const resetActivity = useCallback(() => {
    lastActivityRef.current = Date.now()
    setInactivityWarning(false)
  }, [])

  // Track activity from voice state changes
  useEffect(() => { resetActivity() }, [voice.voiceState, voice.isTalking, voice.transcript.length, resetActivity])

  // Track activity from panel/UI interactions
  useEffect(() => { resetActivity() }, [rightPanel, planOpen, resetActivity])

  // Inactivity check interval
  useEffect(() => {
    if (isStarting) return
    inactivityTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - lastActivityRef.current
      if (elapsed >= INACTIVITY_KICK_MS && !endingRef.current) {
        handleEndConfirm()
      } else if (elapsed >= INACTIVITY_WARNING_MS) {
        setInactivityWarning(true)
      }
    }, 5000)
    return () => {
      if (inactivityTimerRef.current) clearInterval(inactivityTimerRef.current)
    }
  }, [isStarting, handleEndConfirm, INACTIVITY_WARNING_MS, INACTIVITY_KICK_MS])

  // ── Current exchange tracking ──
  // Tracks the user line + AI line for the current turn pair.
  // Clears when the user starts a new turn.
  const [exchangeUserLine, setExchangeUserLine] = useState<typeof voice.transcript[0] | null>(null)
  const [exchangeAILine, setExchangeAILine] = useState<typeof voice.transcript[0] | null>(null)
  const prevTranscriptLenRef = useRef(0)

  // When user starts talking, clear the exchange lines (but NOT suggestion/translation — those stay visible)
  const hasPartial = !!voice.partialText
  useEffect(() => {
    if (voice.isTalking || hasPartial) {
      setExchangeUserLine(null)
      setExchangeAILine(null)
    }
  }, [voice.isTalking, hasPartial])

  // Clear translation + suggestion only when a NEW AI response arrives (not when cleared to null)
  const exchangeAITimestamp = exchangeAILine?.timestamp
  useEffect(() => {
    if (exchangeAITimestamp) {
      setTranslation(null)
      setPrecachedTranslation(null)
      setSuggestion(null)
      setPrecachedSuggestion(null)
    }
  }, [exchangeAITimestamp])

  // Pre-cache translation + suggestion when AI line finalizes
  useEffect(() => {
    if (!exchangeAILine?.isFinal || !exchangeAILine.text) return
    fetch('/api/conversation/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: exchangeAILine.text }),
    })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.translation) {
          setPrecachedTranslation(data.translation)
          if (sessionSettings.autoTranslate) setTranslation(data.translation)
        }
      })
      .catch(() => {})

    // Pre-cache suggestion
    const recentHistory = voice.transcript.slice(-6).map(t => ({
      role: t.role,
      content: t.text,
    }))
    fetch('/api/conversation/suggest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recentHistory, targetLanguage }),
    })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.suggestion) {
          setPrecachedSuggestion(data.suggestion)
          if (sessionSettings.autoSuggest) setSuggestion(data.suggestion)
        }
      })
      .catch(() => {})
  }, [exchangeAILine?.isFinal, exchangeAILine?.text, sessionSettings.autoTranslate, sessionSettings.autoSuggest])

  // When new transcript lines appear, update the exchange
  useEffect(() => {
    const len = voice.transcript.length
    if (len > prevTranscriptLenRef.current) {
      for (let i = prevTranscriptLenRef.current; i < len; i++) {
        const line = voice.transcript[i]
        if (line.role === 'user') {
          setExchangeUserLine(line)
          setExchangeAILine(null) // new user line clears old AI line
        } else if (line.role === 'assistant') {
          setExchangeAILine(line)
        }
      }
    }
    // Also update existing lines if text changed (streaming updates)
    if (len > 0) {
      const lastLine = voice.transcript[len - 1]
      if (lastLine.role === 'assistant') {
        setExchangeAILine(prev => prev && prev.timestamp === lastLine.timestamp ? lastLine : prev ?? lastLine)
      } else if (lastLine.role === 'user') {
        setExchangeUserLine(prev => prev && prev.timestamp === lastLine.timestamp ? lastLine : prev ?? lastLine)
      }
    }
    prevTranscriptLenRef.current = len
  }, [voice.transcript])

  const transcriptEntries = useMemo(() => {
    return voice.transcript.map((line, i) => ({
      ...line,
      correction: line.role === 'user' && i === voice.transcript.length - 1 ? latestCorrection : null,
      formattedTime: formatTime(Math.floor((line.timestamp - (voice.transcript[0]?.timestamp || line.timestamp)) / 1000)),
    }))
  }, [voice.transcript, latestCorrection, formatTime])

  // Show help nudge after the user's first completed exchange (2+ transcript lines = user + AI)
  useEffect(() => {
    if (helpNudgeShownRef.current || voice.transcript.length < 2) return
    // Wait for the first AI response to finalize
    const hasUserLine = voice.transcript.some(t => t.role === 'user')
    const hasAILine = voice.transcript.some(t => t.role === 'assistant')
    if (hasUserLine && hasAILine) {
      helpNudgeShownRef.current = true
      // Show after a brief delay so it doesn't compete with the first response
      const showTimer = setTimeout(() => setShowHelpNudge(true), 1500)
      // Auto-dismiss after 6 seconds
      const hideTimer = setTimeout(() => setShowHelpNudge(false), 7500)
      return () => { clearTimeout(showTimer); clearTimeout(hideTimer) }
    }
  }, [voice.transcript])

  // Close active panel when user starts talking; dismiss help nudge
  useEffect(() => {
    if (voice.isTalking) {
      setRightPanel(null)
      setShowHelpNudge(false)
    }
  }, [voice.isTalking])

  // F hotkey to toggle chat overlay
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'f' || e.key === 'F') {
        const tag = (e.target as HTMLElement)?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return
        e.preventDefault()
        setShowChat(c => !c)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  // Derive current section label for nav bar
  const currentPlan = voice.sessionPlan || existingPlan || null
  const currentSectionLabel = useMemo(() => {
    if (!currentPlan || !isConversationPlan(currentPlan) || !currentPlan.sections?.length) return undefined
    if (!voice.sectionTracking) return undefined
    const section = currentPlan.sections.find(s => s.id === voice.sectionTracking!.currentSectionId)
    return section?.label
  }, [currentPlan, voice.sectionTracking])

  return createPortal(
    <div className="fixed inset-0 z-[99999] overflow-hidden bg-bg">
      {/* Persistent flow panel (left) */}
      <ConversationFlowPanel
        plan={voice.sessionPlan || existingPlan || null}
        currentSectionId={voice.sectionTracking?.currentSectionId}
        completedSectionIds={voice.sectionTracking?.completedSectionIds}
        duration={voice.duration}
        onOpenFullPlan={() => setShowSettings(true)}
      />

      {/* Full Session Plan sidebar overlay (left, on top of flow panel) */}
      <SessionPlanSidebar
        isOpen={planOpen}
        plan={voice.sessionPlan || existingPlan || null}
        onCollapse={() => setPlanOpen(false)}
        steeringMessages={steeringMessages}
        currentSectionId={voice.sectionTracking?.currentSectionId}
        completedSectionIds={voice.sectionTracking?.completedSectionIds}
        className="z-[15]"
      />

      {/* Persistent session notes (right) */}
      <SessionNotesPanel
        analysisResults={voice.analysisResults}
        highlight={notesHighlight}
        isAnalyzing={voice.isAnalyzing}
        onOpenFeedback={openCorrectionsPanel}
      />

      {/* Main layout */}
      <div
        className="relative z-[1] h-screen flex flex-col"
      >
        {/* Nav bar */}
        <SessionNavBar
          plan={voice.sessionPlan}
          duration={voice.duration}
          transcriptCount={voice.transcript.length}
          isPlanOpen={planOpen}
          isTranscriptOpen={rightPanel === 'transcript'}
          isSubtitlesOn={showSubtitles}
          onTogglePlan={() => setPlanOpen(p => !p)}
          onToggleTranscript={() => {
            setRightPanel(p => p === 'transcript' ? null : 'transcript')
          }}
          onToggleSubtitles={() => setShowSubtitles(p => !p)}
          onEnd={requestEnd}
          currentSectionLabel={currentSectionLabel}
          inputMode="voice"
          rightSlot={
            <button
              onClick={() => setShowSettings(s => !s)}
              className={cn(
                'w-8 h-8 rounded-lg flex items-center justify-center bg-transparent border-none cursor-pointer text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary',
                showSettings && 'bg-bg-hover text-text-primary',
              )}
              title="Session settings"
            >
              <Cog6ToothIcon className="w-4 h-4" />
            </button>
          }
        />

        {/* Main stage — scrollable when content overflows */}
        <main className="flex-1 flex flex-col items-center justify-center px-6 overflow-y-auto overflow-x-visible relative pl-[310px] pr-[310px]">
          {/* Starting overlay */}
          {joined && isStarting && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-bg">
              <div className="flex flex-col items-center gap-5">
                <Spinner size={22} />
                <div className="flex flex-col items-center gap-1.5">
                  <p className="text-[15px] font-medium text-text-primary tracking-[-0.01em]">
                    Connecting
                  </p>
                  <p className="text-[13px] text-text-muted">
                    Setting up your voice session...
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Character info */}
          {!isStarting && voice.sessionPlan && 'persona' in voice.sessionPlan && voice.sessionPlan.persona?.name && (
            <div className="text-center mb-1 animate-[voice-fade-up_0.5s_ease_both]">
              <div className="text-[13px] font-medium text-text-primary tracking-[-0.01em]">
                {voice.sessionPlan.persona.name}
              </div>
              <div className="text-[11px] text-text-muted mt-0.5">
                {voice.sessionPlan.persona.relationship}
              </div>
            </div>
          )}

          {/* Orb + state ring */}
          <div className="relative shrink-0 flex flex-col items-center">
            <div className="relative">
              <VoiceCentralOrb state={voice.voiceState} />
              <VoiceStateRing state={voice.voiceState} isTalking={voice.isTalking} />
            </div>

            {/* Status text */}
            <div className="flex items-center gap-1.5 mt-1 text-[12px] transition-colors">
              <div className={cn(
                'w-[5px] h-[5px] rounded-full transition-colors shrink-0',
                voice.voiceState === 'LISTENING' || voice.voiceState === 'INTERRUPTED'
                  ? 'bg-ring-user animate-[voice-dot-pulse_.7s_ease-in-out_infinite]'
                  : voice.voiceState === 'SPEAKING'
                    ? 'bg-ring-ai animate-[voice-dot-pulse_1.1s_ease-in-out_infinite]'
                    : voice.voiceState === 'THINKING'
                      ? 'bg-ring-thinking animate-[voice-dot-pulse_.55s_ease-in-out_infinite]'
                      : 'bg-text-muted animate-[voice-dot-pulse_2s_ease-in-out_infinite]',
              )} />
              <span className={cn(
                'text-text-muted',
                voice.voiceState === 'LISTENING' && 'text-ring-user',
                voice.voiceState === 'THINKING' && 'text-ring-thinking',
                voice.voiceState === 'SPEAKING' && 'text-ring-ai',
              )}>
                {voice.voiceState === 'IDLE' && (voice.inputMode === 'vad' ? (voice.isMuted ? 'Muted' : 'Ready') : 'Hold to speak')}
                {voice.voiceState === 'LISTENING' && 'Listening...'}
                {voice.voiceState === 'THINKING' && 'Thinking...'}
                {voice.voiceState === 'SPEAKING' && 'Speaking...'}
                {voice.voiceState === 'INTERRUPTED' && 'Listening...'}
              </span>
            </div>
          </div>

          {/* Live subtitles */}
          <div className="mt-4">
            <VoiceLiveSubtitles
              partialText=""
              userLine={exchangeUserLine}
              aiLine={exchangeAILine}
              correction={latestCorrection}
              visible={showSubtitles}
              voiceState={voice.voiceState}
              isTalking={voice.isTalking}
              onLookup={handleLookup}
              lookupResult={lookupResult}
              lookupLoading={lookupLoading}
              onTranslate={handleTranslate}
              translation={translation}
              onSuggest={handleSuggest}
              suggestion={suggestion}
              suggestionLoading={suggestionLoading}
              onOpenChat={(context) => {
                if (context) setChatLookupWord(context)
                setShowChat(true)
              }}
            />
          </div>

          {/* Retry feedback flash */}
          <AnimatePresence>
            {showRetryFeedback && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="text-center mt-2"
              >
                <span className="text-[13px] text-text-secondary font-medium">Retrying — say it again</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Help nudge — appears once after first exchange, auto-dismisses */}
          <AnimatePresence>
            {showHelpNudge && (
              <motion.button
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.4 }}
                onClick={() => { setShowHelpNudge(false); setShowChat(true) }}
                className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-bg-pure border border-border shadow-[0_2px_8px_rgba(0,0,0,.06)] cursor-pointer transition-all hover:bg-bg-hover hover:border-border-strong hover:shadow-[0_4px_12px_rgba(0,0,0,.08)] active:scale-[0.97]"
              >
                <span className="text-[13px] text-text-secondary">Stuck or need help?</span>
                <span className="text-[12px] font-medium text-accent-brand">Open chat</span>
                <kbd className="font-mono text-[10px] font-medium px-1 py-0.5 rounded bg-bg-secondary border border-border text-text-muted">F</kbd>
              </motion.button>
            )}
          </AnimatePresence>

        </main>

        {/* Voice controls */}
        <VoiceControls
          voiceState={voice.voiceState}
          isTalking={voice.isTalking}
          onTalkStart={voice.startTalking}
          onTalkEnd={voice.stopTalking}
          onTalkCancel={voice.cancelTalking}
          correctionsCount={unviewedFeedbackCount}
          activePanel={rightPanel}
          onRetry={handleRetry}
          canRetry={voice.transcript.length >= 2}
          newFeedbackFlash={newFeedbackFlash}
          onToggleChat={() => setShowChat(c => !c)}
          onTogglePanel={(panel) => {
            if (panel === 'feedback' || panel === 'help') {
              setShowChat(c => !c)
            } else {
              setRightPanel(p => p === panel ? null : panel)
            }
          }}
          inputMode={voice.inputMode}
          isMuted={voice.isMuted}
          onToggleMute={voice.toggleMute}
          onJoin={!joined ? handleJoin : undefined}
          onEnd={joined ? requestEnd : undefined}
        />
      </div>

      {/* Feedback card flipper (bottom-right, outside z-[1] stacking context so it renders over session notes) */}
      <FeedbackCardFlipper
        analysisResults={voice.analysisResults}
        onRetry={handleRetry}
        onOpenChat={() => setShowChat(true)}
      />

      {/* Transcript panel (right slide) */}
      <VoiceTranscriptPanel
        isOpen={rightPanel === 'transcript'}
        entries={transcriptEntries}
        onClose={() => setRightPanel(null)}
      />

      {/* Unified chat overlay (feedback + help merged) */}
      <UnifiedChatOverlay
        isOpen={showChat}
        onClose={() => setShowChat(false)}
        analysisResults={voice.analysisResults}
        recentHistory={voice.transcript.slice(-6).map(t => ({ role: t.role, content: t.text }))}
        onRetry={handleRetry}
        lookupWord={chatLookupWord}
        onClearLookupWord={() => setChatLookupWord(null)}
        targetLanguage={targetLanguage}
      />

      {/* Session settings modal */}
      <SessionSettingsPanel
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        settings={sessionSettings}
        onSettingsChange={setSessionSettings}
        plan={voice.sessionPlan || existingPlan || null}
        onPlanSave={handlePlanSave}
        onSteer={handleSteer}
        currentSectionId={voice.sectionTracking?.currentSectionId}
        completedSectionIds={voice.sectionTracking?.completedSectionIds}
      />


      {/* Fallback keyboard */}
      <VoiceFallbackInput
        isOpen={showKeyboard}
        onClose={() => setShowKeyboard(false)}
        onSend={voice.sendTextMessage}
        disabled={voice.isStreaming}
      />


      {/* Tool cards are now shown in the Session Notes panel */}

      {/* Inactivity warning */}
      {inactivityWarning && !showEndConfirm && (
        <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-50 animate-[voice-fade-up_0.3s_ease_both]">
          <div className="flex items-center gap-3 px-5 py-3 bg-bg-pure border border-border-strong rounded-2xl shadow-[0_8px_24px_rgba(0,0,0,.1)]">
            <span className="text-[13px] text-text-secondary">Still there? Session will end soon due to inactivity.</span>
            <button
              onClick={resetActivity}
              className="text-[13px] font-semibold text-accent-brand bg-transparent border-none cursor-pointer hover:underline whitespace-nowrap"
            >
              I'm here
            </button>
          </div>
        </div>
      )}

      {/* End confirmation dialog */}
      <EndConfirmation
        isOpen={showEndConfirm}
        onConfirm={handleEndConfirm}
        onCancel={handleEndCancel}
        duration={voice.duration}
        turnsCount={voice.transcript.length}
      />

      {/* Error */}
      {voice.error && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 px-4 py-2.5 bg-warm-soft border border-warm-med rounded-xl shadow-md z-50">
          <span className="text-[13px] text-accent-warm">{voice.error}</span>
        </div>
      )}
    </div>,
    document.body,
  )
}

