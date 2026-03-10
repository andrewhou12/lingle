'use client'

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { VoiceProvider } from '@humeai/voice-react'
import { useVoiceConversation, type UseVoiceConversationReturn } from '@/hooks/use-voice-conversation'
import { useHumeVoice } from '@/hooks/use-hume-voice'
import { getVoiceToolZone } from '@/lib/voice/voice-tool-zones'
import type { SessionPlan } from '@/lib/session-plan'
import type { VoiceProviderType } from '@/lib/voice/voice-provider-config'
import { VoiceCentralOrb } from './voice-central-orb'
import { VoiceNavBar } from './voice-nav-bar'
import { VoiceSessionPlanSidebar } from './voice-session-plan-sidebar'
import { VoiceExchangeView } from './voice-exchange-view'
import { VoiceTranscriptPanel } from './voice-transcript-panel'
import { VoiceVocabPanel, type VocabWord } from './voice-vocab-panel'
import { VoiceControls } from './voice-controls'
import { VoiceFallbackInput } from './voice-fallback-input'
import { ToolToastContainer } from './tool-toast'
import { ToolTray } from './tool-tray'
import { CorrectionCard } from '@/components/chat/correction-card'
import { VocabularyCard } from '@/components/chat/vocabulary-card'
import { GrammarNote } from '@/components/chat/grammar-note'
import { Spinner } from '@/components/spinner'
import { cn } from '@/lib/utils'

interface VoiceSessionOverlayProps {
  prompt: string
  mode: string
  sessionId?: string | null
  plan?: SessionPlan | null
  steeringNotes?: string[]
  voiceProvider?: VoiceProviderType
  onEnd: () => void
}

export function VoiceSessionOverlay(props: VoiceSessionOverlayProps) {
  const { voiceProvider = 'soniox' } = props

  if (voiceProvider === 'hume') {
    return (
      <VoiceProvider
        onError={(err) => console.error('[hume-provider] error:', JSON.stringify(err, null, 2), err)}
        onOpen={() => console.log('[hume-provider] connected')}
        onClose={(ev) => console.log('[hume-provider] closed:', ev)}
      >
        <HumeSessionContent {...props} />
      </VoiceProvider>
    )
  }

  return <SonioxSessionContent {...props} />
}

/** Soniox pathway — uses useVoiceConversation */
function SonioxSessionContent(props: VoiceSessionOverlayProps) {
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
      voiceProvider="soniox"
      onEnd={onEnd}
    />
  )
}

/** Hume pathway — uses useHumeVoice (must be inside VoiceProvider) */
function HumeSessionContent(props: VoiceSessionOverlayProps) {
  const { prompt, mode, sessionId: existingSessionId, plan: existingPlan, steeringNotes, onEnd } = props

  const voice = useHumeVoice({
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
      voiceProvider="hume"
      onEnd={onEnd}
    />
  )
}

/** Shared session overlay content — provider-agnostic */
function SessionOverlayInner({
  voice,
  prompt,
  mode,
  existingSessionId,
  existingPlan,
  steeringNotes,
  voiceProvider,
  onEnd,
}: {
  voice: UseVoiceConversationReturn
  prompt: string
  mode: string
  existingSessionId?: string | null
  existingPlan?: SessionPlan | null
  steeringNotes?: string[]
  voiceProvider: VoiceProviderType
  onEnd: () => void
}) {
  const [isStarting, setIsStarting] = useState(true)
  const [planOpen, setPlanOpen] = useState(true)
  const [transcriptOpen, setTranscriptOpen] = useState(false)
  const [vocabOpen, setVocabOpen] = useState(false)
  const [showKeyboard, setShowKeyboard] = useState(false)
  const [dismissedToasts, setDismissedToasts] = useState<Set<string>>(new Set())
  const [steeringMessages, setSteeringMessages] = useState<Array<{ text: string; time: string }>>(
    steeringNotes?.map(text => ({ text, time: '0:00' })) || []
  )
  const startedRef = useRef(false)

  // Start the session on mount
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

  // Format duration for steering timestamps
  const formatTime = useCallback((seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }, [])

  // Steering handler
  const handleSteer = useCallback((text: string) => {
    setSteeringMessages(prev => [...prev, { text, time: formatTime(voice.duration) }])
    // Send as a user message with steering prefix
    voice.sendTextMessage(`[Learner instruction: ${text}]`)
  }, [voice.duration, voice.sendTextMessage, formatTime])

  // Extract tool outputs for toasts (from both message tool-calls AND Track 2 analysis)
  const toolOutputs = useMemo(() => {
    const outputs: Array<{ id: string; toolName: string; output: Record<string, unknown> }> = []

    // From message tool-call parts (text mode tools that still fire)
    for (const msg of voice.messages) {
      if (msg.role !== 'assistant') continue
      for (const part of msg.parts) {
        const partType = (part as { type: string }).type
        if (!partType.startsWith('tool-')) continue
        const toolName = partType.replace('tool-', '')
        const zone = getVoiceToolZone(toolName)
        if (zone !== 'toast') continue
        const toolPart = part as { type: string; state: string; output?: unknown }
        if (toolPart.state === 'output-available' && toolPart.output) {
          const id = `${msg.id}-${toolName}-${outputs.length}`
          outputs.push({ id, toolName, output: toolPart.output as Record<string, unknown> })
        }
      }
    }

    // From Track 2 analysis results
    for (const [turnIdx, result] of Object.entries(voice.analysisResults)) {
      for (const correction of result.corrections) {
        const id = `analysis-${turnIdx}-correction-${correction.original}`
        outputs.push({ id, toolName: 'showCorrection', output: correction as unknown as Record<string, unknown> })
      }
      for (const card of result.vocabularyCards) {
        const id = `analysis-${turnIdx}-vocab-${card.word}`
        outputs.push({ id, toolName: 'showVocabularyCard', output: card as unknown as Record<string, unknown> })
      }
      for (const note of result.grammarNotes) {
        const id = `analysis-${turnIdx}-grammar-${note.pattern}`
        outputs.push({ id, toolName: 'showGrammarNote', output: note as unknown as Record<string, unknown> })
      }
    }

    return outputs
  }, [voice.messages, voice.analysisResults])

  // Extract vocab words from tool outputs + Track 2 analysis
  const vocabWords = useMemo<VocabWord[]>(() => {
    const words: VocabWord[] = []
    const seen = new Set<string>()
    for (const msg of voice.messages) {
      if (msg.role !== 'assistant') continue
      for (const part of msg.parts) {
        const partType = (part as { type: string }).type
        if (partType !== 'tool-showVocabularyCard') continue
        const toolPart = part as { type: string; state: string; output?: unknown }
        if (toolPart.state === 'output-available' && toolPart.output) {
          const o = toolPart.output as Record<string, string>
          if (!seen.has(o.word)) {
            seen.add(o.word)
            words.push({ word: o.word, reading: o.reading, meaning: o.meaning, tag: 'new' })
          }
        }
      }
    }
    // Track 2 vocab cards
    for (const result of Object.values(voice.analysisResults)) {
      for (const card of result.vocabularyCards) {
        if (!seen.has(card.word)) {
          seen.add(card.word)
          words.push({ word: card.word, reading: card.reading, meaning: card.meaning, tag: 'new' })
        }
      }
    }
    return words
  }, [voice.messages, voice.analysisResults])

  // Extract latest correction (from tool calls or Track 2 analysis)
  const latestCorrection = useMemo(() => {
    // Check Track 2 analysis first (most recent)
    const turnKeys = Object.keys(voice.analysisResults).map(Number).sort((a, b) => b - a)
    for (const turnIdx of turnKeys) {
      const result = voice.analysisResults[turnIdx]
      if (result.corrections.length > 0) {
        const c = result.corrections[0]
        return { original: c.original, corrected: c.corrected, explanation: c.explanation, grammarPoint: c.grammarPoint }
      }
    }
    // Fall back to message tool-call parts
    for (let i = voice.messages.length - 1; i >= 0; i--) {
      const msg = voice.messages[i]
      if (msg.role !== 'assistant') continue
      for (const part of msg.parts) {
        const partType = (part as { type: string }).type
        if (partType !== 'tool-showCorrection') continue
        const toolPart = part as { type: string; state: string; output?: unknown }
        if (toolPart.state === 'output-available' && toolPart.output) {
          const o = toolPart.output as Record<string, string>
          return { original: o.original, corrected: o.corrected, explanation: o.explanation, grammarPoint: o.grammarPoint }
        }
      }
    }
    return null
  }, [voice.messages, voice.analysisResults])

  // Toast management
  const activeToasts = useMemo(
    () => toolOutputs
      .filter(t => !dismissedToasts.has(t.id))
      .slice(-3)
      .map(t => ({ id: t.id, content: renderToolCard(t.toolName, t.output) })),
    [toolOutputs, dismissedToasts],
  )

  const trayItems = useMemo(
    () => toolOutputs.map(t => ({ id: t.id, content: renderToolCard(t.toolName, t.output) })),
    [toolOutputs],
  )

  const handleDismissToast = useCallback((id: string) => {
    setDismissedToasts(prev => new Set(prev).add(id))
  }, [])

  const endingRef = useRef(false)
  const handleEnd = useCallback(async () => {
    if (endingRef.current) return
    endingRef.current = true
    try { await voice.endSession() } catch {}
    onEnd()
  }, [voice.endSession, onEnd])

  // Escape exits (but not while talking — Escape there cancels the recording)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !showKeyboard && !voice.isTalking) handleEnd()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleEnd, showKeyboard, voice.isTalking])

  // Cleanup
  useEffect(() => {
    return () => {
      if (voice.isActive) voice.endSession().catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Get latest exchange lines
  const latestAI = voice.transcript.filter(l => l.role === 'assistant').slice(-1)[0] || null
  const latestUser = voice.transcript.filter(l => l.role === 'user').slice(-1)[0] || null

  // Transcript entries with corrections
  const transcriptEntries = useMemo(() => {
    return voice.transcript.map((line, i) => ({
      ...line,
      correction: line.role === 'user' && i === voice.transcript.length - 1 ? latestCorrection : null,
      formattedTime: formatTime(Math.floor((line.timestamp - (voice.transcript[0]?.timestamp || line.timestamp)) / 1000)),
    }))
  }, [voice.transcript, latestCorrection, formatTime])

  return createPortal(
    <div className="fixed inset-0 z-[99999] overflow-hidden bg-bg">
      {/* Paper background */}
      <div className="voice-paper-bg" />
      <div className={cn('voice-atmosphere', voice.isActive && 'on')} />

      {/* Session Plan Sidebar — outside the grid so it doesn't affect grid slots */}
      <VoiceSessionPlanSidebar
        isOpen={planOpen}
        plan={voice.sessionPlan || existingPlan || null}
        onCollapse={() => setPlanOpen(false)}
        onSteer={handleSteer}
        steeringMessages={steeringMessages}
      />

      {/* App grid */}
      <div
        className={cn(
          'relative z-[1] h-screen grid transition-[padding-left] duration-[380ms] ease-[cubic-bezier(.76,0,.24,1)]',
          planOpen ? 'pl-[290px]' : 'pl-0',
        )}
        style={{ gridTemplateRows: '54px 1fr 96px' }}
      >
        {/* Nav */}
        <VoiceNavBar
          plan={voice.sessionPlan}
          duration={voice.duration}
          transcriptCount={voice.transcript.length}
          isPlanOpen={planOpen}
          voiceProvider={voiceProvider}
          onTogglePlan={() => setPlanOpen(p => !p)}
          onOpenTranscript={() => setTranscriptOpen(true)}
          onEnd={handleEnd}
        />

        {/* Main content */}
        <main className="flex flex-col items-center justify-center px-6 pt-3 overflow-hidden gap-0 relative">
          {/* Starting overlay */}
          {isStarting && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-bg/80">
              <VoiceCentralOrb state="IDLE" />
              <div className="flex items-center gap-2.5">
                <Spinner size={16} />
                <span className="text-[14px] text-text-muted">Starting voice session...</span>
              </div>
            </div>
          )}

          {/* Character info */}
          {!isStarting && voice.sessionPlan && 'persona' in voice.sessionPlan && voice.sessionPlan.persona?.name && (
            <div className="text-center mb-1 animate-[voice-fade-up_0.5s_ease_both]">
              <div className="font-jp text-[11px] font-light text-text-muted tracking-[.22em] mb-px">
                {voice.sessionPlan.persona.name.charAt(0)}
              </div>
              <div className="font-serif text-[20px] font-normal italic text-text-primary tracking-[-0.02em] leading-none">
                {voice.sessionPlan.persona.name}
              </div>
              <div className="text-[10.5px] text-text-muted mt-0.5 tracking-[.02em]">
                {voice.sessionPlan.persona.relationship}
              </div>
            </div>
          )}

          {/* Orb */}
          <div className="relative shrink-0 flex flex-col items-center">
            <VoiceCentralOrb state={voice.voiceState} />

            {/* Status indicator */}
            <div className="flex flex-col items-center mt-0.5 gap-[3px]">
              <div className="inline-flex items-center gap-1.5 text-[11.5px] text-text-muted tracking-[.04em] transition-colors">
                <div className={cn(
                  'w-[5px] h-[5px] rounded-full transition-colors shrink-0',
                  voice.voiceState === 'LISTENING' || voice.voiceState === 'INTERRUPTED'
                    ? 'bg-accent-warm animate-[voice-dot-pulse_.7s_ease-in-out_infinite]'
                    : voice.voiceState === 'SPEAKING'
                      ? 'bg-accent-brand animate-[voice-dot-pulse_1.1s_ease-in-out_infinite]'
                      : voice.voiceState === 'THINKING'
                        ? 'bg-text-secondary animate-[voice-dot-pulse_.55s_ease-in-out_infinite]'
                        : 'bg-text-muted animate-[voice-dot-pulse_2s_ease-in-out_infinite]',
                )} />
                <span className={cn(
                  voice.voiceState === 'LISTENING' && 'text-accent-warm',
                  voice.voiceState === 'SPEAKING' && 'text-accent-brand',
                )}>
                  {voice.voiceState === 'IDLE' && 'Ready'}
                  {voice.voiceState === 'LISTENING' && 'Your turn'}
                  {voice.voiceState === 'THINKING' && 'Thinking...'}
                  {voice.voiceState === 'SPEAKING' && 'Speaking...'}
                  {voice.voiceState === 'INTERRUPTED' && 'Listening...'}
                </span>
              </div>
              {/* Contextual keyboard hint */}
              <div className="mt-1 flex items-center justify-center">
                {voiceProvider === 'hume' ? (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-bg-secondary border border-border">
                    <span className="text-[12px] text-text-secondary font-medium">Speak naturally — Hume handles turns</span>
                  </div>
                ) : (
                  <>
                    {voice.isTalking && (
                      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-accent-warm/10 border border-accent-warm/20">
                        <kbd className="font-mono text-[11px] font-medium px-1.5 py-0.5 rounded bg-white border border-accent-warm/30 text-accent-warm shadow-[0_1px_0_rgba(200,87,42,.15)]">esc</kbd>
                        <span className="text-[12px] text-accent-warm/80 font-medium">cancel</span>
                        <span className="text-[10px] text-text-muted mx-0.5">·</span>
                        <span className="text-[12px] text-text-secondary">release to send</span>
                      </div>
                    )}
                    {!voice.isTalking && (voice.voiceState === 'SPEAKING' || voice.voiceState === 'THINKING') && (
                      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-bg-secondary border border-border">
                        <kbd className="font-mono text-[11px] font-medium px-1.5 py-0.5 rounded bg-white border border-border-strong text-text-primary shadow-[0_1px_0_rgba(0,0,0,.08)]">space</kbd>
                        <span className="text-[12px] text-text-secondary font-medium">to interrupt</span>
                      </div>
                    )}
                    {!voice.isTalking && voice.voiceState === 'IDLE' && (
                      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-bg-secondary border border-border">
                        <kbd className="font-mono text-[11px] font-medium px-1.5 py-0.5 rounded bg-white border border-border-strong text-text-primary shadow-[0_1px_0_rgba(0,0,0,.08)]">space</kbd>
                        <span className="text-[12px] text-text-secondary font-medium">hold to speak</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Exchange view */}
          <VoiceExchangeView
            aiLine={latestAI}
            userLine={latestUser}
            partialText={voice.partialText}
            correction={latestCorrection}
            spokenSentences={voice.spokenSentences}
            currentSentence={voice.currentSentence}
            currentProgress={voice.currentProgress}
            ttsPlaying={voice.ttsPlaying}
            className="mt-1.5"
          />
        </main>

        {/* Voice controls */}
        <VoiceControls
          voiceState={voice.voiceState}
          isTalking={voice.isTalking}
          onTalkStart={voice.startTalking}
          onTalkEnd={voice.stopTalking}
          onTalkCancel={voice.cancelTalking}
          vocabCount={vocabWords.length}
          onOpenVocab={() => setVocabOpen(true)}
          onReplay={() => {
            // TODO: replay last AI audio
          }}
        />
      </div>

      {/* Transcript panel */}
      <VoiceTranscriptPanel
        isOpen={transcriptOpen}
        entries={transcriptEntries}
        onClose={() => setTranscriptOpen(false)}
      />

      {/* Vocab panel */}
      <VoiceVocabPanel
        isOpen={vocabOpen}
        words={vocabWords}
        onClose={() => setVocabOpen(false)}
      />

      {/* Fallback keyboard */}
      <VoiceFallbackInput
        isOpen={showKeyboard}
        onClose={() => setShowKeyboard(false)}
        onSend={voice.sendTextMessage}
        disabled={voice.isStreaming}
      />

      {/* Tool toasts */}
      <ToolToastContainer
        toasts={activeToasts}
        onDismiss={handleDismissToast}
      />

      {/* Tool tray */}
      {dismissedToasts.size > 0 && trayItems.length > 0 && (
        <ToolTray items={trayItems} />
      )}

      {/* Error */}
      {voice.error && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 px-4 py-2 bg-warm-soft rounded-lg shadow-md z-50">
          <span className="text-[13px] text-accent-warm">{voice.error}</span>
        </div>
      )}
    </div>,
    document.body,
  )
}

function renderToolCard(toolName: string, output: Record<string, unknown>): React.ReactNode {
  if (toolName === 'showCorrection') {
    return (
      <CorrectionCard
        original={output.original as string}
        corrected={output.corrected as string}
        explanation={output.explanation as string}
        grammarPoint={output.grammarPoint as string | undefined}
      />
    )
  }
  if (toolName === 'showVocabularyCard') {
    return (
      <VocabularyCard
        word={output.word as string}
        reading={output.reading as string | undefined}
        meaning={output.meaning as string}
        partOfSpeech={output.partOfSpeech as string | undefined}
        exampleSentence={output.exampleSentence as string | undefined}
        notes={output.notes as string | undefined}
      />
    )
  }
  if (toolName === 'showGrammarNote') {
    return (
      <GrammarNote
        pattern={output.pattern as string}
        meaning={output.meaning as string}
        formation={output.formation as string}
        examples={output.examples as { japanese: string; english: string }[]}
        level={output.level as string | undefined}
      />
    )
  }
  return null
}
