'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, type UIMessage } from 'ai'
import { api } from '@/lib/api'
import type { SessionPlan } from '@/lib/session-plan'
import { extractTextFromMessage } from '@/lib/message-utils'
import { useSoniox, type EnrichedUtterance, type SonioxContext } from './use-soniox'
import { useVoiceTTS } from './use-voice-tts'
import { useLanguage } from './use-language'
import { getSttCode, getNativeSttCode } from '@/lib/languages'
import { computeTurnSignals, formatSignalsForLLM } from '@/lib/voice/turn-signals'
import { isTutorPlan, isImmersionPlan, isConversationPlan } from '@/lib/session-plan'
import { VoiceSessionFSM, type VoiceState, type TranscriptLine, type VoiceAnalysisResult } from '@/lib/voice/voice-session-fsm'
import { parseVoiceStream } from '@/lib/voice/voice-stream-protocol'
import { PCMStreamPlayer } from '@/lib/voice/pcm-stream-player'

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

const extractText = extractTextFromMessage

// ── Hook ──

export interface UseVoiceConversationOptions {
  sessionId?: string | null
  sessionPlan?: SessionPlan | null
  autoEndpoint?: boolean
  onPlanUpdate?: (plan: SessionPlan) => void
}

export interface SectionTracking {
  currentSectionId: string
  completedSectionIds: string[]
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
  retryLast: () => void
  sectionTracking: SectionTracking | null
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
  const sessionExpiryRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const endSessionRef = useRef<() => void>(() => {})
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
    stop: stopChat,
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

  // Wrap sendMessage to abort any in-flight request first, preventing
  // "Cannot read properties of undefined (reading 'state')" race condition
  const chatStatusRef = useRef(chatStatus)
  chatStatusRef.current = chatStatus
  const sendingRef = useRef(false)

  const safeSendMessage = useCallback(
    (msg: { text: string }) => {
      if (sendingRef.current) {
        console.warn('[voice-conversation] safeSendMessage: already sending, ignoring duplicate')
        return
      }
      sendingRef.current = true
      try {
        if (chatStatusRef.current === 'streaming' || chatStatusRef.current === 'submitted') {
          stopChat()
        }
        sendMessage(msg)
      } catch (err) {
        console.error('[voice-conversation] sendMessage failed:', err)
        sendingRef.current = false
      }
    },
    [sendMessage, stopChat],
  )

  sendMessageRef.current = safeSendMessage
  const messagesRef = useRef(messages)
  messagesRef.current = messages
  const isStreaming = chatStatus === 'streaming' || chatStatus === 'submitted'

  // ── TTS ──

  const sonioxRef = useRef<{
    pause: () => void
    resume: () => void
    finalize: () => void
    immediateFlush: () => EnrichedUtterance | null
    start: () => Promise<void>
    stop: () => Promise<void>
    warmup?: () => void
  }>({ pause: () => {}, resume: () => {}, finalize: () => {}, immediateFlush: () => null, start: async () => {}, stop: async () => {} })

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
  const ttsWarmupRef = useRef(tts.warmup)
  ttsWarmupRef.current = tts.warmup

  // ── Voice Stream (unified server-side LLM+TTS pipeline) ──

  const voiceStreamAbortRef = useRef(new AbortController())
  const voiceStreamDoneRef = useRef(true)
  const voiceStreamGenRef = useRef(0)
  const voiceHistoryRef = useRef<Array<{ role: string; content: string }>>([])
  const voicePlayerRef = useRef<PCMStreamPlayer | null>(null)
  const [vsCurrentSentence, setVsCurrentSentence] = useState<string | null>(null)
  const [vsSpokenSentences, setVsSpokenSentences] = useState<string[]>([])
  const [vsTtsPlaying, setVsTtsPlaying] = useState(false)

  const getVoicePlayer = useCallback((): PCMStreamPlayer => {
    if (!voicePlayerRef.current) {
      voicePlayerRef.current = new PCMStreamPlayer(24000)
    }
    return voicePlayerRef.current
  }, [])

  const voiceStreamInterrupt = useCallback(() => {
    voiceStreamAbortRef.current.abort()
    voiceStreamAbortRef.current = new AbortController()
    getVoicePlayer().interrupt()
    voiceStreamDoneRef.current = true
    setVsTtsPlaying(false)
  }, [getVoicePlayer])

  const doVoiceStream = useCallback(async (userText: string) => {
    // Ensure abort controller is fresh (may have been aborted by strict mode cleanup)
    if (voiceStreamAbortRef.current.signal.aborted) {
      voiceStreamAbortRef.current = new AbortController()
    }
    const gen = ++voiceStreamGenRef.current
    const t0 = performance.now()
    voiceStreamDoneRef.current = false
    sendingRef.current = true

    const historyMessages = [...voiceHistoryRef.current, { role: 'user', content: userText }]

    // Create a ReadableStream bridge — audio chunks are enqueued here,
    // PCMStreamPlayer reads from the other end for gapless playback
    const audio = { ctrl: null as ReadableStreamDefaultController<Uint8Array> | null }
    const audioStream = new ReadableStream<Uint8Array>({
      start(controller) { audio.ctrl = controller },
    })

    const player = getVoicePlayer()
    let audioStartFired = false
    const spokenSentences: string[] = []
    let currentSentenceLocal = ''

    // Start playback in background — resolves when all audio finishes
    const playPromise = player.play(audioStream).then(() => {
      if (gen === voiceStreamGenRef.current) {
        setVsTtsPlaying(false)
        setVsCurrentSentence(null)
        fsmRef.current.onTTSEnded()
      }
    }).catch(() => {})

    try {
      const response = await fetch('/api/conversation/voice-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: historyMessages,
          sessionId: sessionIdRef.current,
        }),
        signal: voiceStreamAbortRef.current.signal,
      })

      if (!response.ok || !response.body) {
        throw new Error(`Voice stream failed: ${response.status}`)
      }

      console.log(`[voice-stream:client] fetch responded ${(performance.now() - t0).toFixed(0)}ms`)

      await parseVoiceStream(response.body, {
        onTextDelta: (fullText) => {
          if (gen !== voiceStreamGenRef.current) return
          fsmRef.current.onStreamingText(fullText)
        },
        onAudioChunk: (pcm) => {
          if (gen !== voiceStreamGenRef.current) return
          if (!audioStartFired) {
            audioStartFired = true
            setVsTtsPlaying(true)
            fsmRef.current.onTTSStarted()
            console.log(`[voice-stream:client] TTFA ${(performance.now() - t0).toFixed(0)}ms`)
          }
          try { audio.ctrl?.enqueue(pcm) } catch {}
        },
        onSentenceStart: (sentence) => {
          if (gen !== voiceStreamGenRef.current) return
          currentSentenceLocal = sentence
          setVsCurrentSentence(sentence)
          console.log(`[voice-stream:client] sentence: "${sentence.slice(0, 40)}"`)
        },
        onSentenceEnd: () => {
          if (gen !== voiceStreamGenRef.current) return
          if (currentSentenceLocal) {
            spokenSentences.push(currentSentenceLocal)
            setVsSpokenSentences([...spokenSentences])
          }
          currentSentenceLocal = ''
        },
        onDone: (fullText) => {
          if (gen !== voiceStreamGenRef.current) return
          console.log(`[voice-stream:client] complete ${(performance.now() - t0).toFixed(0)}ms textLen:${fullText.length}`)
          voiceStreamDoneRef.current = true
          sendingRef.current = false
          try { audio.ctrl?.close() } catch {}
          audio.ctrl = null
          fsmRef.current.onStreamingEnd(fullText, userText)

          // Update voice history
          voiceHistoryRef.current.push(
            { role: 'user', content: userText },
            { role: 'assistant', content: fullText },
          )
        },
        onError: (error) => {
          console.error('[voice-stream:client] error:', error)
          voiceStreamDoneRef.current = true
          sendingRef.current = false
          try { audio.ctrl?.close() } catch {}
          audio.ctrl = null
          fsmRef.current.onStreamingEnd(null, null)
        },
      })
    } catch (err) {
      const wasAborted = (err as Error)?.name === 'AbortError'
      if (!wasAborted) {
        console.error('[voice-stream:client] fetch error:', err)
      }
      voiceStreamDoneRef.current = true
      sendingRef.current = false
      try { audio.ctrl?.close() } catch {}
      // Safety net: ensure FSM isn't stuck with sendInFlight=true
      fsmRef.current.onStreamingEnd(null, null)
    }

    await playPromise
  }, [getVoicePlayer])

  const doVoiceStreamRef = useRef(doVoiceStream)
  doVoiceStreamRef.current = doVoiceStream

  // Voice stream TTS adapter — replaces useVoiceTTS for the FSM
  const voiceStreamTts = useMemo(() => ({
    reset: () => {
      voiceStreamAbortRef.current.abort()
      voiceStreamAbortRef.current = new AbortController()
      if (voicePlayerRef.current) voicePlayerRef.current.interrupt()
      voiceStreamDoneRef.current = true
      setVsSpokenSentences([])
      setVsCurrentSentence(null)
      setVsTtsPlaying(false)
    },
    feedText: () => {}, // No-op — server handles sentence detection + TTS
    flushText: () => {}, // No-op — server handles flush
    interrupt: () => {
      voiceStreamAbortRef.current.abort()
      voiceStreamAbortRef.current = new AbortController()
      if (voicePlayerRef.current) voicePlayerRef.current.interrupt()
      voiceStreamDoneRef.current = true
      setVsTtsPlaying(false)
    },
    get isDone() {
      return voiceStreamDoneRef.current && !(voicePlayerRef.current?.isPlaying)
    },
  }), [])

  // ── FSM ──

  const fsmRef = useRef<VoiceSessionFSM>(null!)
  if (!fsmRef.current) {
    fsmRef.current = new VoiceSessionFSM({
      soniox: sonioxRef.current,
      tts: voiceStreamTts,
      sendMessage: (text) => doVoiceStreamRef.current(text),
      onStateChange: setVoiceState,
      onTranscriptUpdate: setTranscript,
      onAnalysisResult: (turnIdx, result) => setAnalysisResults((prev) => ({ ...prev, [turnIdx]: result })),
      onTalkingChange: setIsTalking,
      getSessionId: () => sessionIdRef.current,
      getRecentHistory: () => voiceHistoryRef.current.slice(-6),
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
      tts: voiceStreamTts,
      sendMessage: (text) => doVoiceStreamRef.current(text),
      getSessionId: () => sessionIdRef.current,
      getRecentHistory: () => voiceHistoryRef.current.slice(-6),
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
    if (prevStreamingRef.current && !isStreaming) {
      sendingRef.current = false
    }
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
      try { voiceStreamInterrupt() } catch {}
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
      // Warm up AudioContext + Soniox key eagerly (needs user gesture context)
      console.log('[voice:opt] session start — warming up voice player + Soniox key')
      getVoicePlayer().warmup()
      sonioxRef.current.warmup?.()
      try {
        const result = await api.conversationPlan(prompt, mode as 'conversation' | 'tutor' | 'immersion' | 'reference', 'voice')
        setSessionId(result._sessionId ?? null)
        setSessionPlan(result.plan ?? null)
        setMessages([])
        setTranscript([])
        voiceHistoryRef.current = []
        setVsSpokenSentences([])
        setVsCurrentSentence(null)
        setIsActive(true)
        setDuration(0)
        setAnalysisResults({})

        durationIntervalRef.current = setInterval(() => {
          setDuration((d) => d + 1)
        }, 1000)

        // Auto-end session when daily limit expires (free plan enforcement)
        if (result.remainingSeconds != null && result.remainingSeconds < Infinity) {
          if (sessionExpiryRef.current) clearTimeout(sessionExpiryRef.current)
          sessionExpiryRef.current = setTimeout(() => {
            console.log('[voice] session expired — daily limit reached')
            endSessionRef.current()
          }, result.remainingSeconds * 1000)
        }

        await fsmRef.current.startSession(autoEndpoint)
        doVoiceStreamRef.current(prompt)
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
      console.log('[voice:opt] existing plan start — warming up voice player + Soniox key')
      getVoicePlayer().warmup()
      sonioxRef.current.warmup?.()
      try {
        setSessionId(existingSessionId)
        setSessionPlan(existingPlan)
        setMessages([])
        setTranscript([])
        voiceHistoryRef.current = []
        setVsSpokenSentences([])
        setVsCurrentSentence(null)
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

        doVoiceStreamRef.current(messageText)
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
    if (sessionExpiryRef.current) {
      clearTimeout(sessionExpiryRef.current)
      sessionExpiryRef.current = null
    }

    await fsmRef.current.endSession()

    if (sessionIdRef.current) {
      api.conversationEnd(sessionIdRef.current).catch(err => {
        console.error('[voice-conversation] Failed to end session:', err)
      })
    }
  }, [])

  endSessionRef.current = endSession

  const toggleMute = useCallback(() => {
    const newMuted = fsmRef.current.toggleMute()
    setIsMuted(newMuted)
  }, [])

  const sendTextMessage = useCallback((text: string) => {
    fsmRef.current.sendTextMessage(text)
  }, [])

  // Derive section tracking from latest analysis result
  const sectionTracking = useMemo((): SectionTracking | null => {
    const entries = Object.entries(analysisResults)
    for (let i = entries.length - 1; i >= 0; i--) {
      if (entries[i][1].sectionTracking) return entries[i][1].sectionTracking!
    }
    return null
  }, [analysisResults])

  const retryLast = useCallback(() => {
    // Remove last user+assistant pair from voice history
    if (voiceHistoryRef.current.length >= 2) {
      const lastTwo = voiceHistoryRef.current.slice(-2)
      if (lastTwo[0]?.role === 'user' && lastTwo[1]?.role === 'assistant') {
        voiceHistoryRef.current = voiceHistoryRef.current.slice(0, -2)
      }
    }

    // Remove last user+assistant lines from transcript
    setTranscript(prev => {
      const copy = [...prev]
      // Remove from the end: last assistant, then last user
      while (copy.length > 0 && copy[copy.length - 1].role === 'assistant') copy.pop()
      while (copy.length > 0 && copy[copy.length - 1].role === 'user') copy.pop()
      return copy
    })

    // Interrupt any playing audio
    voiceStreamInterrupt()

    // Reset FSM to IDLE
    fsmRef.current.resetToIdle()
  }, [voiceStreamInterrupt])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current)
      }
      if (sessionExpiryRef.current) {
        clearTimeout(sessionExpiryRef.current)
      }
      voiceStreamAbortRef.current.abort()
      voiceStreamAbortRef.current = new AbortController()
      voicePlayerRef.current?.dispose()
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
    spokenSentences: vsSpokenSentences,
    currentSentence: vsCurrentSentence,
    currentProgress: 0, // Voice stream mode doesn't track per-sentence progress
    ttsPlaying: vsTtsPlaying,
    analysisResults,
    retryLast,
    sectionTracking,
  }
}
