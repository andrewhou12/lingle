'use client'

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

import { useVoiceConversation, type UseVoiceConversationReturn } from '@/hooks/use-voice-conversation'
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
import { VoiceCorrectionsPanel } from './voice-corrections-panel'
import { VoiceHelpPanel } from './voice-help-panel'
import { VoiceLookupPanel } from './voice-lookup-panel'
import { VoiceControls, type ActivePanel } from './voice-controls'
import { VoiceFallbackInput } from './voice-fallback-input'
import { motion, AnimatePresence } from 'framer-motion'
import { EndConfirmation } from '@/components/session/end-confirmation'
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
  // ── Panel state ──
  const [isStarting, setIsStarting] = useState(true)
  const [planOpen, setPlanOpen] = useState(false)
  const [rightPanel, setRightPanel] = useState<ActivePanel>(null)
  const [showSubtitles, setShowSubtitles] = useState(true)
  const [showKeyboard, setShowKeyboard] = useState(false)
  const [notesHighlight, setNotesHighlight] = useState(false)
  const [showCorrectionBanner, setShowCorrectionBanner] = useState(false)
  const correctionBannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Help panel state ──
  const [helpMessages, setHelpMessages] = useState<Array<{ role: 'user' | 'ai'; text: string }>>([
    { role: 'ai', text: 'Need help? Describe what you\'re trying to say and I\'ll guide you.' },
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
  const [precachedTranslation, setPrecachedTranslation] = useState<string | null>(null)

  // ── X-ray state ──
  const [xrayTokens, setXrayTokens] = useState<Array<{ surface: string; reading: string; meaning: string; pos: string }> | null>(null)
  const [xrayLoading, setXrayLoading] = useState(false)

  // ── Suggestion state ──
  const [suggestion, setSuggestion] = useState<string | null>(null)
  const [suggestionLoading, setSuggestionLoading] = useState(false)

  // ── Steering ──
  const [steeringMessages, setSteeringMessages] = useState<Array<{ text: string; time: string }>>(
    steeringNotes?.map(text => ({ text, time: '0:00' })) || [],
  )

  const startedRef = useRef(false)

  // Start session on mount
  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true

    const init = async () => {
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
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Format duration
  const formatTime = useCallback((seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }, [])

  // Steering handler
  const handleSteer = useCallback((text: string) => {
    setSteeringMessages(prev => [...prev, { text, time: formatTime(voice.duration) }])
    voice.sendTextMessage(`[Learner instruction: ${text}]`)
  }, [voice.duration, voice.sendTextMessage, formatTime])

  // Plan save handler
  const handlePlanSave = useCallback((planText: string) => {
    // Send as steering message so the AI adapts
    voice.sendTextMessage(`[Plan updated by learner: ${planText}]`)
    setSteeringMessages(prev => [...prev, { text: 'Plan edited', time: formatTime(voice.duration) }])
  }, [voice.sendTextMessage, voice.duration, formatTime])

  // ── Feedback aggregation (from analysis results) ──
  const feedbackCount = useMemo(() => {
    let count = 0
    for (const result of Object.values(voice.analysisResults)) {
      count += result.corrections.length + (result.naturalnessFeedback?.length || 0)
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
    setRightPanel('feedback')
  }, [])

  // Show correction banner when new corrections arrive
  const prevCorrectionTurnRef = useRef<number | null>(null)
  useEffect(() => {
    if (latestTurnIdx === null || latestTurnIdx === prevCorrectionTurnRef.current) return
    prevCorrectionTurnRef.current = latestTurnIdx
    if (latestCorrection) {
      setShowCorrectionBanner(true)
      if (correctionBannerTimerRef.current) clearTimeout(correctionBannerTimerRef.current)
      correctionBannerTimerRef.current = setTimeout(() => setShowCorrectionBanner(false), 12000)
    } else {
      setShowCorrectionBanner(false)
    }
    return () => {
      if (correctionBannerTimerRef.current) clearTimeout(correctionBannerTimerRef.current)
    }
  }, [latestTurnIdx, latestCorrection])

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

  // ── Help panel handlers ──
  const handleHelpSend = useCallback(async () => {
    if (!helpInput.trim() || helpLoading) return
    const query = helpInput.trim()
    setHelpMessages(m => [...m, { role: 'user', text: query }])
    setHelpInput('')
    setHelpLoading(true)

    try {
      const recentHistory = voice.transcript.slice(-6).map(t => ({
        role: t.role,
        content: t.text,
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
        setHelpMessages(m => [...m, { role: 'ai', text: 'Sorry, I couldn\'t get a suggestion right now.' }])
      }
    } catch {
      setHelpMessages(m => [...m, { role: 'ai', text: 'Something went wrong. Try again.' }])
    } finally {
      setHelpLoading(false)
    }
  }, [helpInput, helpLoading, voice.transcript])

  // ── Lookup handler ──
  const handleLookup = useCallback(async (word: string, context: string) => {
    setLookupLoading(true)
    setLookupResult(null)
    try {
      const res = await fetch('/api/conversation/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word, context }),
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

  // ── Translate in help panel ──
  const handleTranslateLastMessage = useCallback(async () => {
    const lastAiLine = [...voice.transcript].reverse().find(t => t.role === 'assistant')
    if (!lastAiLine) return
    setHelpLoading(true)
    try {
      const res = await fetch('/api/conversation/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: lastAiLine.text }),
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
  }, [voice.transcript])

  // ── X-ray handler (inline under subtitles) ──
  const handleXray = useCallback(async () => {
    // Toggle off if already showing
    if (xrayTokens) {
      setXrayTokens(null)
      return
    }
    const lastAiLine = [...voice.transcript].reverse().find(t => t.role === 'assistant')
    if (!lastAiLine) return
    setXrayLoading(true)
    try {
      const res = await fetch('/api/conversation/xray', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sentence: lastAiLine.text }),
      })
      if (res.ok) {
        const data = await res.json()
        setXrayTokens(data.tokens)
      }
    } catch {
      // silent fail
    } finally {
      setXrayLoading(false)
    }
  }, [voice.transcript, xrayTokens])

  // ── Suggestion handler (toggle) ──
  const handleSuggest = useCallback(async () => {
    if (suggestion) {
      setSuggestion(null)
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
  }, [suggestion, voice.transcript])

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

  // When user starts talking, clear the exchange
  const hasPartial = !!voice.partialText
  useEffect(() => {
    if (voice.isTalking || hasPartial) {
      setExchangeUserLine(null)
      setExchangeAILine(null)
    }
  }, [voice.isTalking, hasPartial])

  // Clear translation + xray + suggestion when AI line changes (new response)
  const exchangeAITimestamp = exchangeAILine?.timestamp
  useEffect(() => {
    setTranslation(null)
    setPrecachedTranslation(null)
    setXrayTokens(null)
    setSuggestion(null)
  }, [exchangeAITimestamp])

  // Pre-cache translation when AI line finalizes
  useEffect(() => {
    if (!exchangeAILine?.isFinal || !exchangeAILine.text) return
    fetch('/api/conversation/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: exchangeAILine.text }),
    })
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data?.translation) setPrecachedTranslation(data.translation) })
      .catch(() => {})
  }, [exchangeAILine?.isFinal, exchangeAILine?.text])

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

  // Close active panel when user starts talking
  useEffect(() => {
    if (voice.isTalking) setRightPanel(null)
  }, [voice.isTalking])

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
        onOpenFullPlan={() => setPlanOpen(true)}
      />

      {/* Full Session Plan sidebar overlay (left, on top of flow panel) */}
      <SessionPlanSidebar
        isOpen={planOpen}
        plan={voice.sessionPlan || existingPlan || null}
        onCollapse={() => setPlanOpen(false)}
        onSteer={handleSteer}
        onPlanSave={handlePlanSave}
        steeringMessages={steeringMessages}
        currentSectionId={voice.sectionTracking?.currentSectionId}
        completedSectionIds={voice.sectionTracking?.completedSectionIds}
        className="z-[15]"
      />

      {/* Persistent session notes (right) */}
      <SessionNotesPanel analysisResults={voice.analysisResults} highlight={notesHighlight} />

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
        />

        {/* Main stage */}
        <main className="flex-1 flex flex-col items-center justify-center px-6 overflow-hidden relative pl-[310px] pr-[310px]">
          {/* Starting overlay */}
          {isStarting && (
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
                {voice.voiceState === 'IDLE' && 'Hold to speak'}
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
              isLookupActive={rightPanel === 'lookup'}
              onLookup={handleLookup}
              onTranslate={handleTranslate}
              translation={translation}
              xrayTokens={xrayTokens}
              xrayLoading={xrayLoading}
              onXray={handleXray}
              onSuggest={handleSuggest}
              suggestion={suggestion}
              suggestionLoading={suggestionLoading}
            />
          </div>

        </main>

        {/* Correction banner with retry */}
        <AnimatePresence>
          {showCorrectionBanner && latestCorrection && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.2 }}
              className="shrink-0 flex justify-center px-6 pb-2"
            >
              <div className="flex items-center gap-3 px-4 py-2.5 bg-bg-pure border border-border-subtle rounded-lg shadow-[0_1px_2px_rgba(0,0,0,.04)] max-w-[500px]">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13px] font-jp-clean text-text-secondary line-through">{latestCorrection.original}</span>
                    <span className="text-text-secondary text-[12px]">&rarr;</span>
                    <span className="text-[13px] font-jp-clean font-medium text-text-primary">{latestCorrection.corrected}</span>
                  </div>
                  <div className="text-[12px] text-text-secondary mt-0.5 truncate">{latestCorrection.explanation}</div>
                </div>
                <button
                  onClick={() => {
                    voice.retryLast()
                    setShowCorrectionBanner(false)
                  }}
                  className="shrink-0 px-3 py-1.5 rounded-md bg-bg-secondary border border-border text-[12px] font-medium text-text-primary cursor-pointer transition-colors hover:bg-bg-hover hover:border-border-strong"
                >
                  Retry
                </button>
                <button
                  onClick={() => setShowCorrectionBanner(false)}
                  className="shrink-0 text-text-secondary hover:text-text-primary transition-colors cursor-pointer bg-transparent border-none p-0"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Voice controls */}
        <VoiceControls
          voiceState={voice.voiceState}
          isTalking={voice.isTalking}
          onTalkStart={voice.startTalking}
          onTalkEnd={voice.stopTalking}
          onTalkCancel={voice.cancelTalking}
          correctionsCount={feedbackCount}
          activePanel={rightPanel}
          onRetry={voice.retryLast}
          canRetry={voice.transcript.length >= 2}
          onTogglePanel={(panel) => {
            setRightPanel(p => p === panel ? null : panel)
          }}
        />
      </div>

      {/* Transcript panel (right slide) */}
      <VoiceTranscriptPanel
        isOpen={rightPanel === 'transcript'}
        entries={transcriptEntries}
        onClose={() => setRightPanel(null)}
      />

      {/* Feedback panel (right slide) */}
      <VoiceCorrectionsPanel
        isOpen={rightPanel === 'feedback'}
        turnResults={voice.analysisResults}
        onClose={() => setRightPanel(null)}
      />

      {/* Help panel (right slide) */}
      <VoiceHelpPanel
        isOpen={rightPanel === 'help'}
        messages={helpMessages}
        input={helpInput}
        loading={helpLoading}
        hasAiMessages={voice.transcript.some(t => t.role === 'assistant')}
        onInputChange={setHelpInput}
        onSend={handleHelpSend}
        onTranslateLastMessage={handleTranslateLastMessage}
        onClose={() => setRightPanel(null)}
      />

      {/* Lookup panel (right slide) */}
      <VoiceLookupPanel
        isOpen={rightPanel === 'lookup'}
        result={lookupResult}
        loading={lookupLoading}
        onClose={() => { setRightPanel(null); setLookupResult(null) }}
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

