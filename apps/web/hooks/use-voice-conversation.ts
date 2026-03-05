'use client'

import { useState, useReducer, useCallback, useRef, useEffect, useMemo } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, type UIMessage } from 'ai'
import { api } from '@/lib/api'
import type { SessionPlan } from '@/lib/session-plan'
import { useSoniox, type RealtimeUtterance } from './use-soniox'
import { useVoiceTTS } from './use-voice-tts'
import { useLanguage } from './use-language'
import { getSttCode } from '@/lib/languages'

// ── State Machine ──

export type VoiceState = 'IDLE' | 'LISTENING' | 'THINKING' | 'SPEAKING' | 'INTERRUPTED'

type VoiceAction =
  | { type: 'SPEECH_DETECTED' }
  | { type: 'ENDPOINT_FIRED' }
  | { type: 'LLM_STREAMING' }
  | { type: 'TTS_STARTED' }
  | { type: 'TTS_ENDED' }
  | { type: 'INTERRUPTED' }
  | { type: 'INTERRUPT_EMPTY' }
  | { type: 'RESET' }

function voiceReducer(state: VoiceState, action: VoiceAction): VoiceState {
  switch (action.type) {
    case 'SPEECH_DETECTED':
      if (state === 'IDLE') return 'LISTENING'
      if (state === 'SPEAKING') return 'INTERRUPTED'
      return state
    case 'ENDPOINT_FIRED':
      if (state === 'LISTENING' || state === 'INTERRUPTED') return 'THINKING'
      return state
    case 'LLM_STREAMING':
      if (state === 'THINKING') return 'SPEAKING'
      return state
    case 'TTS_STARTED':
      if (state === 'THINKING') return 'SPEAKING'
      return state
    case 'TTS_ENDED':
      if (state === 'SPEAKING' || state === 'THINKING') return 'IDLE'
      return state
    case 'INTERRUPTED':
      if (state === 'SPEAKING') return 'INTERRUPTED'
      return state
    case 'INTERRUPT_EMPTY':
      if (state === 'INTERRUPTED') return 'SPEAKING'
      return state
    case 'RESET':
      return 'IDLE'
    default:
      return state
  }
}

// ── Transcript ──

export interface TranscriptLine {
  role: 'user' | 'assistant'
  text: string
  isFinal: boolean
  timestamp: number
}

// ── Helpers ──

/** Find the last assistant message that comes AFTER the last user message.
 *  Returns null if no such message exists (e.g. during 'submitted' before the new response arrives). */
function findCurrentAssistantMessage(messages: UIMessage[]): UIMessage | null {
  let lastAssistantIdx = -1
  let lastUserIdx = -1
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant' && lastAssistantIdx === -1) lastAssistantIdx = i
    if (messages[i].role === 'user' && lastUserIdx === -1) lastUserIdx = i
    if (lastAssistantIdx !== -1 && lastUserIdx !== -1) break
  }
  // The assistant message must follow the most recent user message
  if (lastAssistantIdx === -1 || lastAssistantIdx < lastUserIdx) return null
  return messages[lastAssistantIdx]
}

/** Extract plain text from a message's parts. */
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
  /** Start session with an already-generated plan (for begin overlay flow) */
  startWithExistingPlan: (sessionId: string, plan: SessionPlan, prompt: string, steeringNotes?: string[]) => Promise<void>
  /** Push-to-talk: call on button press to start recording */
  startTalking: () => void
  /** Push-to-talk: call on button release to finalize and send */
  stopTalking: () => void
  /** Whether push-to-talk button is currently held */
  isTalking: boolean
}

export function useVoiceConversation(
  options: UseVoiceConversationOptions = {},
): UseVoiceConversationReturn {
  const { autoEndpoint = false, onPlanUpdate } = options
  const { targetLanguage } = useLanguage()
  const sttLanguageCode = getSttCode(targetLanguage)

  const [voiceState, dispatch] = useReducer(voiceReducer, 'IDLE')
  const [transcript, setTranscript] = useState<TranscriptLine[]>([])
  const [isMuted, setIsMuted] = useState(false)
  const [isActive, setIsActive] = useState(false)
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(options.sessionId ?? null)
  const [sessionPlan, setSessionPlan] = useState<SessionPlan | null>(options.sessionPlan ?? null)
  const [isTalking, setIsTalking] = useState(false)

  // Refs to avoid stale closures in callbacks
  const voiceStateRef = useRef<VoiceState>('IDLE')
  voiceStateRef.current = voiceState
  const sessionIdRef = useRef<string | null>(sessionId)
  sessionIdRef.current = sessionId
  const isActiveRef = useRef(false)
  isActiveRef.current = isActive
  const isMutedRef = useRef(false)
  isMutedRef.current = isMuted
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
    },
  })

  sendMessageRef.current = sendMessage
  const isStreaming = chatStatus === 'streaming' || chatStatus === 'submitted'

  // ── TTS (use refs for callbacks to avoid re-creating the hook) ──

  const sonioxRef = useRef<{
    pause: () => void
    resume: () => void
    finalize: () => void
    start: () => Promise<void>
    stop: () => Promise<void>
  }>({ pause: () => {}, resume: () => {}, finalize: () => {}, start: async () => {}, stop: async () => {} })

  const autoEndpointRef = useRef(autoEndpoint)
  autoEndpointRef.current = autoEndpoint

  const ttsCallbacksRef = useRef({
    onPlaybackStart: () => {
      dispatch({ type: 'TTS_STARTED' })
    },
    onPlaybackEnd: () => {
      dispatch({ type: 'TTS_ENDED' })
      // In auto-endpoint mode, resume mic after TTS finishes
      // In PTT mode, mic stays paused until user holds the button
      if (autoEndpointRef.current && isActiveRef.current && !isMutedRef.current) {
        sonioxRef.current.resume()
      }
    },
  })

  const tts = useVoiceTTS(
    ttsCallbacksRef.current.onPlaybackStart,
    ttsCallbacksRef.current.onPlaybackEnd,
  )

  // Use refs for TTS methods to avoid dependency loops
  const ttsRef = useRef(tts)
  ttsRef.current = tts

  // ── Feed streaming LLM text to TTS ──

  const prevStreamingRef = useRef(false)

  useEffect(() => {
    if (!isStreaming || !isActive) return

    // Only feed the assistant message that belongs to the CURRENT turn
    // (i.e. it must come after the latest user message)
    const msg = findCurrentAssistantMessage(messages)
    if (!msg) return

    const text = extractText(msg)
    if (!text) return

    console.log('[voice] feeding TTS, len:', text.length, 'msgId:', msg.id)
    ttsRef.current.feedText(text)

    // Update transcript with latest assistant text
    setTranscript((prev) => {
      const last = prev[prev.length - 1]
      if (last && last.role === 'assistant' && !last.isFinal) {
        if (last.text === text) return prev
        return [...prev.slice(0, -1), { ...last, text }]
      }
      return [...prev, { role: 'assistant', text, isFinal: false, timestamp: Date.now() }]
    })
  }, [messages, isStreaming, isActive])

  // When streaming stops, flush TTS and finalize transcript
  useEffect(() => {
    if (prevStreamingRef.current && !isStreaming && isActive) {
      const msg = findCurrentAssistantMessage(messages)
      if (msg) {
        const text = extractText(msg)
        if (text) {
          console.log('[voice] flushing TTS, len:', text.length)
          ttsRef.current.flushText(text)
          setTranscript((prev) => {
            const last = prev[prev.length - 1]
            if (last && last.role === 'assistant') {
              return [...prev.slice(0, -1), { ...last, text, isFinal: true }]
            }
            return prev
          })
        } else {
          // Tool-calls-only response (no text) — nothing for TTS to play.
          // Reset to IDLE so the conversation doesn't freeze.
          console.log('[voice] tool-only response, resetting to IDLE')
          dispatch({ type: 'TTS_ENDED' })
        }
      } else {
        // No assistant message found — reset to IDLE
        dispatch({ type: 'TTS_ENDED' })
      }

      // Pause Soniox during TTS playback (only if TTS has something to play)
      if (!ttsRef.current.isDone) {
        sonioxRef.current.pause()
      }
    }
    prevStreamingRef.current = isStreaming
  }, [isStreaming, isActive, messages])

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

  // Memoize options to prevent re-renders
  const sonioxOptions = useMemo(
    () => ({
      endpointDetection: autoEndpoint,
      maxEndpointDelayMs: 1500,
      languageCode: sttLanguageCode,
    }),
    [autoEndpoint, sttLanguageCode],
  )

  // Track whether Soniox has been started (for PTT deferred start)
  const sonioxStartedRef = useRef(false)

  const handleUtterance = useCallback(
    (utterance: RealtimeUtterance) => {
      const text = utterance.text.trim()
      if (!text) return

      console.log('[voice] user utterance:', text)
      setTranscript((prev) => [...prev, { role: 'user', text, isFinal: true, timestamp: Date.now() }])
      dispatch({ type: 'ENDPOINT_FIRED' })

      if (voiceStateRef.current === 'INTERRUPTED' || voiceStateRef.current === 'SPEAKING') {
        ttsRef.current.interrupt()
      }

      ttsRef.current.reset()
      sendMessageRef.current({ text })
      dispatch({ type: 'LLM_STREAMING' })
      sonioxRef.current.pause()
    },
    [],
  )

  const handleEndpoint = useCallback(() => {
    // Endpoint event from Soniox — handled via utterance callback
  }, [])

  const soniox = useSoniox(sonioxOptions, handleUtterance, handleEndpoint)

  // Keep sonioxRef in sync
  sonioxRef.current = soniox

  // Track speech detection for state transitions
  const prevPartialRef = useRef('')
  useEffect(() => {
    const hasPartial = !!soniox.partialText
    const hadPartial = !!prevPartialRef.current
    prevPartialRef.current = soniox.partialText

    if (hasPartial && !hadPartial) {
      if (voiceStateRef.current === 'IDLE') {
        dispatch({ type: 'SPEECH_DETECTED' })
      }
      if (voiceStateRef.current === 'SPEAKING') {
        dispatch({ type: 'INTERRUPTED' })
        ttsRef.current.interrupt()
      }
    }
  }, [soniox.partialText])

  // ── Push-to-Talk ──

  const startTalking = useCallback(async () => {
    if (!isActiveRef.current) return
    // If AI is speaking, interrupt it
    if (voiceStateRef.current === 'SPEAKING') {
      ttsRef.current.interrupt()
      dispatch({ type: 'INTERRUPTED' })
    }
    setIsTalking(true)
    // Start Soniox on first PTT press (deferred start)
    if (!sonioxStartedRef.current) {
      sonioxStartedRef.current = true
      await sonioxRef.current.start()
    } else {
      sonioxRef.current.resume()
    }
    dispatch({ type: 'SPEECH_DETECTED' })
  }, [])

  const stopTalking = useCallback(() => {
    setIsTalking(false)
    sonioxRef.current.finalize()
    // finalize triggers the 'finalized' event → handleUtterance → sends to LLM
  }, [])

  // ── Session Lifecycle ──

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

        durationIntervalRef.current = setInterval(() => {
          setDuration((d) => d + 1)
        }, 1000)

        ttsRef.current.reset()
        sonioxStartedRef.current = false
        // Only start Soniox immediately in auto-endpoint mode
        // In PTT mode, Soniox starts on first button press
        if (autoEndpoint) {
          await sonioxRef.current.start()
          sonioxStartedRef.current = true
        }
        sendMessageRef.current({ text: prompt })
        dispatch({ type: 'LLM_STREAMING' })
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

        durationIntervalRef.current = setInterval(() => {
          setDuration((d) => d + 1)
        }, 1000)

        ttsRef.current.reset()
        sonioxStartedRef.current = false
        if (autoEndpoint) {
          await sonioxRef.current.start()
          sonioxStartedRef.current = true
        }

        // Build message with steering context
        let messageText = prompt
        if (steeringNotes && steeringNotes.length > 0) {
          messageText += '\n\n[Learner instructions before session start:]\n' + steeringNotes.map(n => `- ${n}`).join('\n')
        }

        sendMessageRef.current({ text: messageText })
        dispatch({ type: 'LLM_STREAMING' })
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
    durationIntervalRef.current = setInterval(() => {
      setDuration((d) => d + 1)
    }, 1000)
    ttsRef.current.reset()
    sonioxStartedRef.current = false
    if (autoEndpoint) {
      await sonioxRef.current.start()
      sonioxStartedRef.current = true
    }
    dispatch({ type: 'RESET' })
  }, [autoEndpoint])

  const endSession = useCallback(async () => {
    setIsActive(false)
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current)
      durationIntervalRef.current = null
    }

    try { ttsRef.current.interrupt() } catch {}
    try { await sonioxRef.current.stop() } catch {}
    sonioxStartedRef.current = false
    dispatch({ type: 'RESET' })

    if (sessionIdRef.current) {
      try {
        await api.conversationEnd(sessionIdRef.current)
      } catch (err) {
        console.error('[voice-conversation] Failed to end session:', err)
      }
    }
  }, [])

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      if (prev) {
        sonioxRef.current.resume()
      } else {
        sonioxRef.current.pause()
      }
      return !prev
    })
  }, [])

  const sendTextMessage = useCallback(
    (text: string) => {
      if (!text.trim() || !sessionIdRef.current) return
      setTranscript((prev) => [
        ...prev,
        { role: 'user', text: text.trim(), isFinal: true, timestamp: Date.now() },
      ])
      ttsRef.current.reset()
      sendMessageRef.current({ text: text.trim() })
      dispatch({ type: 'LLM_STREAMING' })
    },
    [],
  )

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current)
      }
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
    isTalking,
  }
}
