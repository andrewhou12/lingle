'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useVoice } from '@humeai/voice-react'
import { api } from '@/lib/api'
import type { SessionPlan } from '@/lib/session-plan'
import type { VoiceState, TranscriptLine, VoiceAnalysisResult } from '@/lib/voice/voice-session-fsm'
import type { UseVoiceConversationReturn } from './use-voice-conversation'

/**
 * Hume EVI voice hook — wraps @humeai/voice-react's useVoice()
 * and returns the same UseVoiceConversationReturn interface so the
 * UI layer is provider-agnostic.
 */
export function useHumeVoice(opts: {
  sessionId?: string | null
  sessionPlan?: SessionPlan | null
  onPlanUpdate?: (plan: SessionPlan) => void
}): UseVoiceConversationReturn {
  const {
    connect,
    disconnect,
    messages: humeMessages,
    sendUserInput,
    isPlaying,
    isMuted: humeMuted,
    mute,
    unmute,
    status: humeStatus,
    error: humeError,
  } = useVoice()

  const [voiceState, setVoiceState] = useState<VoiceState>('IDLE')
  const [transcript, setTranscript] = useState<TranscriptLine[]>([])
  const [isActive, setIsActive] = useState(false)
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(opts.sessionId ?? null)
  const [sessionPlan, setSessionPlan] = useState<SessionPlan | null>(opts.sessionPlan ?? null)
  const [isTalking, setIsTalking] = useState(false)
  const [analysisResults, setAnalysisResults] = useState<Record<number, VoiceAnalysisResult>>({})
  const [isMuted, setIsMuted] = useState(false)

  const sessionIdRef = useRef(sessionId)
  sessionIdRef.current = sessionId
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const turnCounterRef = useRef(0)
  const onPlanUpdateRef = useRef(opts.onPlanUpdate)
  onPlanUpdateRef.current = opts.onPlanUpdate

  // Track processed message count to avoid duplicating transcript entries
  const processedMsgCountRef = useRef(0)

  // Derive voiceState from Hume status + isPlaying
  useEffect(() => {
    if (!isActive) return

    if (isPlaying) {
      setVoiceState('SPEAKING')
    } else if (humeStatus.value === 'connected') {
      setVoiceState('IDLE')
    }
  }, [isPlaying, humeStatus, isActive])

  // Sync transcript from Hume messages
  useEffect(() => {
    if (!isActive) return

    const newMessages = humeMessages.slice(processedMsgCountRef.current)
    if (newMessages.length === 0) return

    processedMsgCountRef.current = humeMessages.length

    const newLines: TranscriptLine[] = []
    for (const msg of newMessages) {
      if (msg.type === 'user_message') {
        const text = msg.message?.content || ''
        if (text) {
          newLines.push({ role: 'user', text, isFinal: true, timestamp: Date.now() })
        }
      } else if (msg.type === 'assistant_message') {
        const text = msg.message?.content || ''
        if (text) {
          newLines.push({ role: 'assistant', text, isFinal: true, timestamp: Date.now() })

          // Fire Track 2 analysis after each assistant message
          const lastUserLine = [...transcript, ...newLines]
            .filter((l) => l.role === 'user')
            .pop()

          if (lastUserLine && sessionIdRef.current) {
            const turnIdx = turnCounterRef.current++
            const recentHistory = [...transcript, ...newLines]
              .slice(-6)
              .map((l) => ({ role: l.role, content: l.text }))

            fetch('/api/conversation/voice-analyze', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                sessionId: sessionIdRef.current,
                userMessage: lastUserLine.text,
                assistantMessage: text,
                recentHistory,
              }),
            })
              .then((res) => (res.ok ? res.json() : null))
              .then((result) => {
                if (result) {
                  setAnalysisResults((prev) => ({ ...prev, [turnIdx]: {
                    corrections: result.corrections || [],
                    vocabularyCards: result.vocabularyCards || [],
                    grammarNotes: result.grammarNotes || [],
                    naturalnessFeedback: result.naturalnessFeedback || [],
                  }}))
                }
              })
              .catch((err) => console.error('[hume-voice] Track 2 analysis failed:', err))
          }
        }
      }
    }

    if (newLines.length > 0) {
      setTranscript((prev) => [...prev, ...newLines])
    }
  }, [humeMessages, isActive, transcript])

  // Map Hume errors
  useEffect(() => {
    if (humeError) {
      setError(typeof humeError === 'object' && 'message' in humeError ? (humeError as { message: string }).message : 'Hume connection error')
    }
  }, [humeError])

  // ── Session lifecycle ──

  const startNewSession = useCallback(
    async (prompt: string, mode: string) => {
      setError(null)
      try {
        const result = await api.conversationPlan(prompt, mode as 'conversation' | 'tutor' | 'immersion' | 'reference')
        const newSessionId = result._sessionId ?? null
        setSessionId(newSessionId)
        setSessionPlan(result.plan ?? null)
        setTranscript([])
        setIsActive(true)
        setDuration(0)
        setAnalysisResults({})
        processedMsgCountRef.current = 0
        turnCounterRef.current = 0

        durationIntervalRef.current = setInterval(() => {
          setDuration((d) => d + 1)
        }, 1000)

        // Fetch Hume token and connect
        const tokenRes = await fetch('/api/voice/hume-token', { method: 'POST' })
        const { accessToken, configId } = await tokenRes.json()
        console.log('[hume-voice] token received, connecting...', { configId, sessionId: newSessionId })

        await connect({
          auth: { type: 'accessToken', value: accessToken },
          configId: configId || undefined,
          sessionSettings: {
            type: 'session_settings' as const,
            customSessionId: newSessionId || undefined,
            context: {
              type: 'persistent' as const,
              text: 'This is a Japanese language learning session. The user speaks in Japanese (日本語). Transcribe all speech as Japanese text using hiragana, katakana, and kanji. Do not transcribe Japanese speech as English.',
            },
          },
        })
        console.log('[hume-voice] connected, sending initial prompt')

        // Send the initial prompt as user input so the assistant starts
        sendUserInput(prompt)
      } catch (err) {
        console.error('[hume-voice] Failed to start session:', err)
        setError(err instanceof Error ? err.message : 'Failed to start session')
      }
    },
    [connect, sendUserInput],
  )

  const startWithExistingPlan = useCallback(
    async (existingSessionId: string, existingPlan: SessionPlan, prompt: string, steeringNotes?: string[]) => {
      setError(null)
      try {
        setSessionId(existingSessionId)
        setSessionPlan(existingPlan)
        setTranscript([])
        setIsActive(true)
        setDuration(0)
        setAnalysisResults({})
        processedMsgCountRef.current = 0
        turnCounterRef.current = 0

        durationIntervalRef.current = setInterval(() => {
          setDuration((d) => d + 1)
        }, 1000)

        const tokenRes = await fetch('/api/voice/hume-token', { method: 'POST' })
        const { accessToken, configId } = await tokenRes.json()
        console.log('[hume-voice] token received, connecting...', { configId, sessionId: existingSessionId })

        await connect({
          auth: { type: 'accessToken', value: accessToken },
          configId: configId || undefined,
          sessionSettings: {
            type: 'session_settings' as const,
            customSessionId: existingSessionId,
            context: {
              type: 'persistent' as const,
              text: 'This is a Japanese language learning session. The user speaks in Japanese (日本語). Transcribe all speech as Japanese text using hiragana, katakana, and kanji. Do not transcribe Japanese speech as English.',
            },
          },
        })
        console.log('[hume-voice] connected!')

        let messageText = prompt
        if (steeringNotes && steeringNotes.length > 0) {
          messageText += '\n\n[Learner instructions before session start:]\n' + steeringNotes.map((n) => `- ${n}`).join('\n')
        }
        sendUserInput(messageText)
      } catch (err) {
        console.error('[hume-voice] Failed to start with existing plan:', err)
        setError(err instanceof Error ? err.message : 'Failed to start session')
      }
    },
    [connect, sendUserInput],
  )

  const startSession = useCallback(async () => {
    if (!sessionIdRef.current) return
    setIsActive(true)
    setDuration(0)
    setAnalysisResults({})
    processedMsgCountRef.current = 0
    turnCounterRef.current = 0

    durationIntervalRef.current = setInterval(() => {
      setDuration((d) => d + 1)
    }, 1000)

    const tokenRes = await fetch('/api/voice/hume-token', { method: 'POST' })
    const { accessToken, configId } = await tokenRes.json()

    await connect({
      auth: { type: 'accessToken', value: accessToken },
      configId: configId || undefined,
      sessionSettings: {
        type: 'session_settings' as const,
        customSessionId: sessionIdRef.current || undefined,
        context: {
          type: 'persistent' as const,
          text: 'This is a Japanese language learning session. The user speaks in Japanese (日本語). Transcribe all speech as Japanese text using hiragana, katakana, and kanji. Do not transcribe Japanese speech as English.',
        },
      },
    })
  }, [connect])

  const endSession = useCallback(async () => {
    setIsActive(false)
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current)
      durationIntervalRef.current = null
    }

    disconnect()

    if (sessionIdRef.current) {
      try {
        await api.conversationEnd(sessionIdRef.current)
      } catch (err) {
        console.error('[hume-voice] Failed to end session:', err)
      }
    }
  }, [disconnect])

  const toggleMute = useCallback(() => {
    if (isMuted) {
      unmute()
      setIsMuted(false)
    } else {
      mute()
      setIsMuted(true)
    }
  }, [isMuted, mute, unmute])

  const sendTextMessage = useCallback(
    (text: string) => {
      if (!text.trim()) return
      sendUserInput(text.trim())
    },
    [sendUserInput],
  )

  // Push-to-talk stubs — Hume handles turn-taking automatically
  const startTalking = useCallback(async () => {
    setIsTalking(true)
    // Hume's mic is always-on, so we just unmute
    unmute()
  }, [unmute])

  const stopTalking = useCallback(() => {
    setIsTalking(false)
    // Let Hume handle endpoint detection naturally
  }, [])

  const cancelTalking = useCallback(() => {
    setIsTalking(false)
    mute()
    setTimeout(() => unmute(), 100)
  }, [mute, unmute])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current)
      }
    }
  }, [])

  // Build empty UIMessages array — Hume doesn't use useChat
  const emptyMessages = useMemo(() => [] as never[], [])

  return {
    voiceState,
    transcript,
    partialText: '',
    startSession,
    endSession,
    toggleMute,
    isMuted,
    duration,
    speed: 1,
    setSpeed: () => {},
    sendTextMessage,
    isActive,
    error,
    sessionId,
    sessionPlan,
    messages: emptyMessages,
    isStreaming: isPlaying,
    startNewSession,
    startWithExistingPlan,
    startTalking,
    stopTalking,
    cancelTalking,
    isTalking,
    spokenSentences: [],
    currentSentence: null,
    currentProgress: 0,
    ttsPlaying: isPlaying,
    analysisResults,
    retryLast: () => {
      // Remove last user+assistant pair from transcript
      setTranscript(prev => {
        const copy = [...prev]
        while (copy.length > 0 && copy[copy.length - 1].role === 'assistant') copy.pop()
        while (copy.length > 0 && copy[copy.length - 1].role === 'user') copy.pop()
        return copy
      })
    },
    sectionTracking: null,
  }
}
