'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, type UIMessage } from 'ai'
import { api } from '@/lib/api'
import type { SessionPlan } from '@/lib/session-plan'
import { useSoniox, type EnrichedUtterance, type SonioxContext } from './use-soniox'
import { useVoiceTTS } from './use-voice-tts'
import { useLanguage } from './use-language'
import { getSttCode, getNativeSttCode } from '@/lib/languages'
import { computeTurnSignals, formatSignalsForLLM } from '@/lib/voice/turn-signals'
import { isTutorPlan, isImmersionPlan, isConversationPlan } from '@/lib/session-plan'
import { VoiceSessionFSM, type VoiceState, type TranscriptLine, type VoiceAnalysisResult } from '@/lib/voice/voice-session-fsm'

export type { VoiceState, TranscriptLine, VoiceAnalysisResult }

// ── Helpers ──

function findCurrentAssistantMessage(messages: UIMessage[]): UIMessage | null {
  let lastAssistantIdx = -1
  let lastUserIdx = -1
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant' && lastAssistantIdx === -1) lastAssistantIdx = i
    if (messages[i].role === 'user' && lastUserIdx === -1) lastUserIdx = i
    if (lastAssistantIdx !== -1 && lastUserIdx !== -1) break
  }
  if (lastAssistantIdx === -1 || lastAssistantIdx < lastUserIdx) return null
  return messages[lastAssistantIdx]
}

function extractText(msg: UIMessage): string {
  return msg.parts
    .filter((p) => p.type === 'text')
    .map((p) => (p as { type: 'text'; text: string }).text)
    .join('')
}

// ── Hook ──

export interface UseVoiceConversationOptions {
  sessionId?: string | null
  sessionPlan?: SessionPlan | null
  autoEndpoint?: boolean
  onPlanUpdate?: (plan: SessionPlan) => void
}

export interface UseVoiceConversationReturn {
  voiceState: VoiceState
  transcript: TranscriptLine[]
  partialText: string
  startSession: () => Promise<void>
  endSession: () => Promise<void>
  toggleMute: () => void
  isMuted: boolean
  duration: number
  speed: number
  setSpeed: (speed: number) => void
  sendTextMessage: (text: string) => void
  isActive: boolean
  error: string | null
  sessionId: string | null
  sessionPlan: SessionPlan | null
  messages: UIMessage[]
  isStreaming: boolean
  startNewSession: (prompt: string, mode: string) => Promise<void>
  startWithExistingPlan: (sessionId: string, plan: SessionPlan, prompt: string, steeringNotes?: string[]) => Promise<void>
  startTalking: () => void
  stopTalking: () => void
  cancelTalking: () => void
  isTalking: boolean
  spokenSentences: string[]
  currentSentence: string | null
  currentProgress: number
  ttsPlaying: boolean
  analysisResults: Record<number, VoiceAnalysisResult>
}

export function useVoiceConversation(
  options: UseVoiceConversationOptions = {},
): UseVoiceConversationReturn {
  const { autoEndpoint = false, onPlanUpdate } = options
  const { targetLanguage, nativeLanguage } = useLanguage()
  const sttLanguageCode = getSttCode(targetLanguage)
  const nativeSttCode = getNativeSttCode(nativeLanguage)

  // React state — FSM drives these via callbacks
  const [voiceState, setVoiceState] = useState<VoiceState>('IDLE')
  const [transcript, setTranscript] = useState<TranscriptLine[]>([])
  const [isMuted, setIsMuted] = useState(false)
  const [isActive, setIsActive] = useState(false)
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(options.sessionId ?? null)
  const [sessionPlan, setSessionPlan] = useState<SessionPlan | null>(options.sessionPlan ?? null)
  const [isTalking, setIsTalking] = useState(false)
  const [analysisResults, setAnalysisResults] = useState<Record<number, VoiceAnalysisResult>>({})

  // Refs for integration points
  const sessionIdRef = useRef<string | null>(sessionId)
  sessionIdRef.current = sessionId
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const onPlanUpdateRef = useRef(onPlanUpdate)
  onPlanUpdateRef.current = onPlanUpdate
  const sendMessageRef = useRef<(msg: { text: string }) => void>(() => {})

  // ── useChat for LLM ──

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/conversation/send',
        body: () => ({
          ...(sessionIdRef.current ? { sessionId: sessionIdRef.current } : {}),
          voiceMode: true,
        }),
      }),
    [],
  )

  const {
    messages,
    sendMessage,
    status: chatStatus,
    setMessages,
  } = useChat({
    transport,
    onError: (err) => {
      console.error('[voice-conversation] useChat error:', err)
      setError(err.message)
      fsmRef.current.updateDeps({ sendMessage: (text) => sendMessageRef.current({ text }) })
    },
  })

  sendMessageRef.current = sendMessage
  const messagesRef = useRef(messages)
  messagesRef.current = messages
  const isStreaming = chatStatus === 'streaming' || chatStatus === 'submitted'

  // ── TTS ──

  const sonioxRef = useRef<{
    pause: () => void
    resume: () => void
    finalize: () => void
    start: () => Promise<void>
    stop: () => Promise<void>
  }>({ pause: () => {}, resume: () => {}, finalize: () => {}, start: async () => {}, stop: async () => {} })

  const ttsCallbacksRef = useRef({
    onPlaybackStart: () => { fsmRef.current.onTTSStarted() },
    onPlaybackEnd: () => { fsmRef.current.onTTSEnded() },
  })

  const tts = useVoiceTTS(
    ttsCallbacksRef.current.onPlaybackStart,
    ttsCallbacksRef.current.onPlaybackEnd,
  )

  const ttsRef = useRef(tts)
  ttsRef.current = tts

  // ── FSM ──

  const fsmRef = useRef<VoiceSessionFSM>(null!)
  if (!fsmRef.current) {
    fsmRef.current = new VoiceSessionFSM({
      soniox: sonioxRef.current,
      tts: { reset: () => ttsRef.current.reset(), feedText: (t) => ttsRef.current.feedText(t), flushText: (t) => ttsRef.current.flushText(t), interrupt: () => ttsRef.current.interrupt(), get isDone() { return ttsRef.current.isDone } },
      sendMessage: (text) => sendMessageRef.current({ text }),
      onStateChange: setVoiceState,
      onTranscriptUpdate: setTranscript,
      onAnalysisResult: (turnIdx, result) => setAnalysisResults((prev) => ({ ...prev, [turnIdx]: result })),
      onTalkingChange: setIsTalking,
      getSessionId: () => sessionIdRef.current,
      computeSignals: (utterance) => {
        const signals = computeTurnSignals(utterance.tokens, {
          targetLanguageCode: sttLanguageCode,
          nativeLanguageCode: nativeSttCode !== sttLanguageCode ? nativeSttCode : undefined,
        })
        return { signals, annotation: formatSignalsForLLM(signals) }
      },
    })
  }

  // Keep FSM deps fresh
  useEffect(() => {
    fsmRef.current.updateDeps({
      soniox: sonioxRef.current,
      tts: { reset: () => ttsRef.current.reset(), feedText: (t) => ttsRef.current.feedText(t), flushText: (t) => ttsRef.current.flushText(t), interrupt: () => ttsRef.current.interrupt(), get isDone() { return ttsRef.current.isDone } },
      sendMessage: (text) => sendMessageRef.current({ text }),
      getSessionId: () => sessionIdRef.current,
      computeSignals: (utterance) => {
        const signals = computeTurnSignals(utterance.tokens, {
          targetLanguageCode: sttLanguageCode,
          nativeLanguageCode: nativeSttCode !== sttLanguageCode ? nativeSttCode : undefined,
        })
        return { signals, annotation: formatSignalsForLLM(signals) }
      },
    })
  })

  // ── Feed streaming LLM text to TTS via FSM ──

  const prevStreamingRef = useRef(false)

  useEffect(() => {
    if (!isStreaming || !isActive) return

    const msg = findCurrentAssistantMessage(messages)
    if (!msg) return

    const text = extractText(msg)
    if (!text) return

    console.log('[voice] feeding TTS, len:', text.length, 'msgId:', msg.id)
    fsmRef.current.onStreamingText(text)
  }, [messages, isStreaming, isActive])

  // When streaming stops, delegate to FSM
  useEffect(() => {
    if (prevStreamingRef.current && !isStreaming && isActive) {
      const msg = findCurrentAssistantMessage(messages)
      if (msg) {
        const text = extractText(msg)
        const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')
        const userText = lastUserMsg ? extractText(lastUserMsg) : null

        if (text) {
          fsmRef.current.onStreamingEnd(text, userText)
        } else {
          const hasToolCalls = msg.parts.some((p) => (p as { type: string }).type.startsWith('tool-'))
          if (hasToolCalls) {
            console.warn('[voice] tool-only response with no spoken text — LLM forgot to respond')
          }
          fsmRef.current.onStreamingEnd(null, null)
        }
      } else {
        fsmRef.current.onStreamingEnd(null, null)
      }
    }
    prevStreamingRef.current = isStreaming
  }, [isStreaming, isActive, messages])

  // Watchdog: reset if stuck
  useEffect(() => {
    if (voiceState !== 'THINKING' && voiceState !== 'SPEAKING') return
    const timeout = setTimeout(() => {
      console.warn('[voice] watchdog: stuck in', voiceState, 'for 20s, resetting')
      try { ttsRef.current.interrupt() } catch {}
      setVoiceState('IDLE')
    }, 20_000)
    return () => clearTimeout(timeout)
  }, [voiceState])

  // Extract session plan updates from messages
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
              onPlanUpdateRef.current?.(output.plan)
            }
          }
        }
      }
      break
    }
  }, [messages])

  // ── Soniox ──

  const sonioxContext = useMemo((): SonioxContext | undefined => {
    if (!sessionPlan) return undefined

    const general: { key: string; value: string }[] = [
      { key: 'domain', value: 'language_learning' },
    ]
    const terms: string[] = []

    if (isTutorPlan(sessionPlan)) {
      if (sessionPlan.topic) general.push({ key: 'topic', value: sessionPlan.topic })
      for (const concept of sessionPlan.concepts) {
        terms.push(concept.label)
      }
    } else if (isImmersionPlan(sessionPlan)) {
      if (sessionPlan.focus) general.push({ key: 'topic', value: sessionPlan.focus })
      if (sessionPlan.targetVocabulary) {
        terms.push(...sessionPlan.targetVocabulary)
      }
    } else if (isConversationPlan(sessionPlan)) {
      if (sessionPlan.topic) general.push({ key: 'topic', value: sessionPlan.topic })
    }

    if (general.length <= 1 && terms.length === 0) return undefined
    return { general, ...(terms.length > 0 ? { terms } : {}) }
  }, [sessionPlan])

  const sonioxOptions = useMemo(
    () => ({
      endpointDetection: autoEndpoint,
      maxEndpointDelayMs: 1500,
      languageCode: sttLanguageCode,
      nativeLanguageCode: nativeSttCode !== sttLanguageCode ? nativeSttCode : undefined,
      context: sonioxContext,
    }),
    [autoEndpoint, sttLanguageCode, nativeSttCode, sonioxContext],
  )

  const handleUtterance = useCallback(
    (utterance: EnrichedUtterance) => {
      console.log('[voice] user utterance:', utterance.text.trim(), 'tokens:', utterance.tokens.length)
      fsmRef.current.handleUtterance(utterance)
    },
    [],
  )

  const handleEndpoint = useCallback(() => {}, [])

  const soniox = useSoniox(sonioxOptions, handleUtterance, handleEndpoint)
  sonioxRef.current = soniox

  // Keep FSM soniox dep fresh after soniox hook initializes
  useEffect(() => {
    fsmRef.current.updateDeps({ soniox })
  }, [soniox])

  // Track speech detection for state transitions
  const prevPartialRef = useRef('')
  useEffect(() => {
    const hasPartial = !!soniox.partialText
    const hadPartial = !!prevPartialRef.current
    prevPartialRef.current = soniox.partialText

    if (hasPartial && !hadPartial) {
      fsmRef.current.onSpeechDetected()
    }
  }, [soniox.partialText])

  // ── Session Lifecycle (thin wrappers around FSM) ──

  const startTalking = useCallback(async () => {
    await fsmRef.current.startTalking()
  }, [])

  const stopTalking = useCallback(() => {
    fsmRef.current.stopTalking()
  }, [])

  const cancelTalking = useCallback(() => {
    fsmRef.current.cancelTalking()
  }, [])

  const startNewSession = useCallback(
    async (prompt: string, mode: string) => {
      setError(null)
      try {
        const result = await api.conversationPlan(prompt, mode as 'conversation' | 'tutor' | 'immersion' | 'reference')
        setSessionId(result._sessionId ?? null)
        setSessionPlan(result.plan ?? null)
        setMessages([])
        setTranscript([])
        setIsActive(true)
        setDuration(0)
        setAnalysisResults({})

        durationIntervalRef.current = setInterval(() => {
          setDuration((d) => d + 1)
        }, 1000)

        await fsmRef.current.startSession(autoEndpoint)
        sendMessageRef.current({ text: prompt })
      } catch (err) {
        console.error('[voice-conversation] Failed to start session:', err)
        setError(err instanceof Error ? err.message : 'Failed to start session')
      }
    },
    [setMessages, autoEndpoint],
  )

  const startWithExistingPlan = useCallback(
    async (existingSessionId: string, existingPlan: SessionPlan, prompt: string, steeringNotes?: string[]) => {
      setError(null)
      try {
        setSessionId(existingSessionId)
        setSessionPlan(existingPlan)
        setMessages([])
        setTranscript([])
        setIsActive(true)
        setDuration(0)
        setAnalysisResults({})

        durationIntervalRef.current = setInterval(() => {
          setDuration((d) => d + 1)
        }, 1000)

        await fsmRef.current.startSession(autoEndpoint)

        let messageText = prompt
        if (steeringNotes && steeringNotes.length > 0) {
          messageText += '\n\n[Learner instructions before session start:]\n' + steeringNotes.map(n => `- ${n}`).join('\n')
        }

        sendMessageRef.current({ text: messageText })
      } catch (err) {
        console.error('[voice-conversation] Failed to start with existing plan:', err)
        setError(err instanceof Error ? err.message : 'Failed to start session')
      }
    },
    [setMessages, autoEndpoint],
  )

  const startSession = useCallback(async () => {
    if (!sessionIdRef.current) return
    setIsActive(true)
    setDuration(0)
    setAnalysisResults({})
    durationIntervalRef.current = setInterval(() => {
      setDuration((d) => d + 1)
    }, 1000)
    await fsmRef.current.startSession(autoEndpoint)
  }, [autoEndpoint])

  const endSession = useCallback(async () => {
    setIsActive(false)
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current)
      durationIntervalRef.current = null
    }

    await fsmRef.current.endSession()

    if (sessionIdRef.current) {
      try {
        await api.conversationEnd(sessionIdRef.current)
      } catch (err) {
        console.error('[voice-conversation] Failed to end session:', err)
      }
    }
  }, [])

  const toggleMute = useCallback(() => {
    const newMuted = fsmRef.current.toggleMute()
    setIsMuted(newMuted)
  }, [])

  const sendTextMessage = useCallback((text: string) => {
    fsmRef.current.sendTextMessage(text)
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current)
      }
      fsmRef.current.dispose()
    }
  }, [])

  return {
    voiceState,
    transcript,
    partialText: soniox.partialText,
    startSession,
    endSession,
    toggleMute,
    isMuted,
    duration,
    speed: tts.speed,
    setSpeed: tts.setSpeed,
    sendTextMessage,
    isActive,
    error: error || soniox.error,
    sessionId,
    sessionPlan,
    messages,
    isStreaming,
    startNewSession,
    startWithExistingPlan,
    startTalking,
    stopTalking,
    cancelTalking,
    isTalking,
    spokenSentences: tts.spokenSentences,
    currentSentence: tts.currentSentence,
    currentProgress: tts.currentProgress,
    ttsPlaying: tts.isPlaying,
    analysisResults,
  }
}
