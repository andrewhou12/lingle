'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import {
  Room,
  RoomEvent,
  type RemoteParticipant,
} from 'livekit-client'
import { api } from '@/lib/api'
import type { SessionPlan } from '@/lib/session-plan'
import type { VoiceState, TranscriptLine, VoiceAnalysisResult } from '@/lib/voice/voice-session-fsm'
import type { UseVoiceConversationReturn, SectionTracking } from './use-voice-conversation'

/** Strip Cartesia SSML/prosody tags and filler tags from text for display */
function stripSSML(text: string): string {
  return text
    .replace(/<next_filler>.*?<\/next_filler>/gs, '')
    .replace(/<\/?(?:break|speed|volume|emotion|prosody)\b[^>]*\/?>/gi, '')
    .trim()
}

/** Returns true if a transcript is just noise (dots, punctuation, whitespace) */
function isGarbageTranscript(text: string): boolean {
  return /^[\s.…。、,!?！？·]+$/.test(text) || text.trim().length === 0
}

/**
 * LiveKit voice hook — connects to a LiveKit room with an agent worker
 * and returns the same UseVoiceConversationReturn interface so the
 * UI layer is provider-agnostic.
 */
export function useLiveKitVoice(opts: {
  sessionId?: string | null
  sessionPlan?: SessionPlan | null
  onPlanUpdate?: (plan: SessionPlan) => void
}): UseVoiceConversationReturn & {
  connectedRoom: Room | null
  handleAgentStateChange: (state: string) => void
  handleAgentIdentity: (identity: string) => void
} {
  const [voiceState, setVoiceState] = useState<VoiceState>('IDLE')
  const [transcript, setTranscript] = useState<TranscriptLine[]>([])
  const [isActive, setIsActive] = useState(false)
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(opts.sessionId ?? null)
  const [sessionPlan, setSessionPlan] = useState<SessionPlan | null>(opts.sessionPlan ?? null)
  const [isTalking, setIsTalking] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [analysisResults, setAnalysisResults] = useState<Record<number, VoiceAnalysisResult>>({})
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [sectionTracking, setSectionTracking] = useState<SectionTracking | null>(null)
  const [spokenSentences, setSpokenSentences] = useState<string[]>([])
  const [currentSentence, setCurrentSentence] = useState<string | null>(null)
  const [partialText, setPartialText] = useState('')
  const [connectedRoom, setConnectedRoom] = useState<Room | null>(null)

  const roomRef = useRef<Room | null>(null)
  const connectingRef = useRef(false)
  const sessionIdRef = useRef(sessionId)
  sessionIdRef.current = sessionId
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const agentIdentityRef = useRef<string | null>(null)
  const onPlanUpdateRef = useRef(opts.onPlanUpdate)
  onPlanUpdateRef.current = opts.onPlanUpdate

  // ── Room connection ──

  const connectToRoom = useCallback(async (token: string, url: string) => {
    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
    })

    roomRef.current = room

    // Listen for transcription events
    room.on(RoomEvent.TranscriptionReceived, (segments, participant) => {
      for (const segment of segments) {
        const role = participant?.identity === agentIdentityRef.current ? 'assistant' : 'user'

        // Skip garbage transcripts (e.g. ".." from background noise)
        if (role === 'user' && isGarbageTranscript(segment.text)) continue

        if (segment.final) {
          const displayText = role === 'assistant' ? stripSSML(segment.text) : segment.text
          setTranscript((prev) => [
            ...prev,
            { role, text: displayText, isFinal: true, timestamp: Date.now() },
          ])
          // Clear partial text when final
          if (role === 'assistant') {
            setSpokenSentences((prev) => [...prev, displayText])
            setCurrentSentence(null)
            setPartialText('')
          }
        } else {
          // Update partial text for non-final segments
          if (role === 'assistant') {
            const displayText = stripSSML(segment.text)
            setCurrentSentence(displayText)
            setPartialText(displayText)
          }
        }
      }
    })

    // Listen for data messages (analysis results from agent)
    room.on(RoomEvent.DataReceived, (data: Uint8Array, participant?: RemoteParticipant) => {
      if (participant?.identity !== agentIdentityRef.current) return

      try {
        const decoded = new TextDecoder().decode(data)
        const message = JSON.parse(decoded)

        if (message.type === 'analysis') {
          setIsAnalyzing(true)
          try {
            const analysisData = JSON.parse(message.data)
            setAnalysisResults((prev) => ({
              ...prev,
              [message.turnIndex]: {
                corrections: analysisData.corrections || [],
                vocabularyCards: analysisData.vocabularyCards || [],
                grammarNotes: analysisData.grammarNotes || [],
                naturalnessFeedback: analysisData.naturalnessFeedback || [],
                registerMismatches: analysisData.registerMismatches || [],
                l1Interference: analysisData.l1Interference || [],
                alternativeExpressions: analysisData.alternativeExpressions || [],
                conversationalTips: analysisData.conversationalTips || [],
                takeaways: analysisData.takeaways || [],
                sectionTracking: analysisData.sectionTracking,
              },
            }))

            if (analysisData.sectionTracking) {
              setSectionTracking(analysisData.sectionTracking)
            }
          } catch {
            // Partial NDJSON — ignore parse errors for incomplete chunks
          } finally {
            setIsAnalyzing(false)
          }
        }
      } catch {
        // Not JSON data — ignore
      }
    })

    room.on(RoomEvent.Disconnected, () => {
      setIsActive(false)
      setVoiceState('IDLE')
      setConnectedRoom(null)
    })

    // Log ALL room events to diagnose why agent never appears
    const serializeParticipant = (p: unknown): unknown => {
      if (p == null) return null
      if (Array.isArray(p)) return p.map(serializeParticipant)
      if (typeof p !== 'object') return p
      const o = p as Record<string, unknown>
      return { kind: o.kind, identity: o.identity, sid: o.sid, state: o.state, name: o.name }
    }
    const allRoomEvents = Object.values(RoomEvent) as RoomEvent[]
    for (const evt of allRoomEvents) {
      room.on(evt, (...args: unknown[]) => {
        const safe = args.map(serializeParticipant)
        console.log('[dbg-event]', evt, ...safe)
      })
    }

    // Poll remoteParticipants every second for 60s
    const pollTimer = setInterval(() => {
      const participants = [...room.remoteParticipants.values()]
      console.log('[dbg-poll] remoteParticipants:', participants.map(p => ({ identity: p.identity, kind: p.kind, sid: p.sid })))
    }, 1000)
    setTimeout(() => clearInterval(pollTimer), 60000)

    // Connect to the room
    await room.connect(url, token)

    console.log('[livekit-voice] connected, setting connectedRoom. state=', room.state, 'remoteParticipants=', [...room.remoteParticipants.values()].map(p => ({ id: p.identity, kind: p.kind })))
    setConnectedRoom(room)

    // Enable microphone
    await room.localParticipant.setMicrophoneEnabled(true)
  }, [])

  // ── Session lifecycle ──

  const startNewSession = useCallback(
    async (prompt: string, mode: string) => {
      setError(null)
      try {
        const result = await api.conversationPlan(
          prompt,
          mode as 'conversation' | 'tutor' | 'immersion' | 'reference',
          'voice',
        )
        const newSessionId = result._sessionId ?? null
        setSessionId(newSessionId)
        setSessionPlan(result.plan ?? null)
        setTranscript([])
        setSpokenSentences([])
        setIsActive(true)
        setDuration(0)
        setAnalysisResults({})

        durationIntervalRef.current = setInterval(() => {
          setDuration((d) => d + 1)
        }, 1000)

        // Get LiveKit token
        const tokenRes = await fetch('/api/voice/livekit-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: newSessionId,
            metadata: {
              sessionId: newSessionId,
              sessionPlan: result.plan,
              sessionMode: mode,
              basePrompt: prompt,
              analyzeEndpoint: `${window.location.origin}/api/conversation/voice-analyze`,
            },
          }),
        })

        if (!tokenRes.ok) {
          throw new Error('Failed to get LiveKit token')
        }

        const { token, url } = await tokenRes.json()
        await connectToRoom(token, url)
      } catch (err) {
        console.error('[livekit-voice] Failed to start session:', err)
        setError(err instanceof Error ? err.message : 'Failed to start session')
      }
    },
    [connectToRoom],
  )

  const startWithExistingPlan = useCallback(
    async (existingSessionId: string, existingPlan: SessionPlan, prompt: string, steeringNotes?: string[]) => {
      setError(null)
      try {
        setSessionId(existingSessionId)
        setSessionPlan(existingPlan)
        setTranscript([])
        setSpokenSentences([])
        setIsActive(true)
        setDuration(0)
        setAnalysisResults({})

        durationIntervalRef.current = setInterval(() => {
          setDuration((d) => d + 1)
        }, 1000)

        let messageText = prompt
        if (steeringNotes?.length) {
          messageText +=
            '\n\n[Learner instructions before session start:]\n' +
            steeringNotes.map((n) => `- ${n}`).join('\n')
        }

        // Get LiveKit token
        const tokenRes = await fetch('/api/voice/livekit-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: existingSessionId,
            metadata: {
              sessionId: existingSessionId,
              sessionPlan: existingPlan,
              sessionMode: 'conversation',
              basePrompt: messageText,
              analyzeEndpoint: `${window.location.origin}/api/conversation/voice-analyze`,
            },
          }),
        })

        if (!tokenRes.ok) {
          throw new Error('Failed to get LiveKit token')
        }

        const { token, url } = await tokenRes.json()
        await connectToRoom(token, url)
      } catch (err) {
        console.error('[livekit-voice] Failed to start with existing plan:', err)
        setError(err instanceof Error ? err.message : 'Failed to start session')
      }
    },
    [connectToRoom],
  )

  /**
   * Start a session directly with provided metadata — skips plan generation.
   * Useful for quick testing of the LiveKit agent.
   */
  const startDirect = useCallback(
    async (metadata: Record<string, unknown>) => {
      if (connectingRef.current) {
        console.warn('[livekit-voice] startDirect called while already connecting — ignoring')
        return
      }
      connectingRef.current = true
      setError(null)
      try {
        setSessionId(null)
        setSessionPlan(null)
        setTranscript([])
        setSpokenSentences([])
        setIsActive(true)
        setDuration(0)
        setAnalysisResults({})

        durationIntervalRef.current = setInterval(() => {
          setDuration((d) => d + 1)
        }, 1000)

        const tokenRes = await fetch('/api/voice/livekit-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ metadata }),
        })

        if (!tokenRes.ok) {
          const body = await tokenRes.json().catch(() => ({}))
          throw new Error(body.error || `Failed to get LiveKit token (${tokenRes.status})`)
        }

        const { token, url } = await tokenRes.json()
        await connectToRoom(token, url)
      } catch (err) {
        console.error('[livekit-voice] Failed to start direct session:', err)
        setError(err instanceof Error ? err.message : 'Failed to start session')
        setIsActive(false)
        if (durationIntervalRef.current) {
          clearInterval(durationIntervalRef.current)
          durationIntervalRef.current = null
        }
      } finally {
        connectingRef.current = false
      }
    },
    [connectToRoom],
  )

  const startSession = useCallback(async () => {
    if (!sessionIdRef.current) return
    setIsActive(true)
    setDuration(0)
    setAnalysisResults({})

    durationIntervalRef.current = setInterval(() => {
      setDuration((d) => d + 1)
    }, 1000)

    const tokenRes = await fetch('/api/voice/livekit-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: sessionIdRef.current,
        metadata: {
          sessionId: sessionIdRef.current,
        },
      }),
    })

    if (!tokenRes.ok) {
      setError('Failed to get LiveKit token')
      return
    }

    const { token, url } = await tokenRes.json()
    await connectToRoom(token, url)
  }, [connectToRoom])

  const endSession = useCallback(async () => {
    setIsActive(false)
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current)
      durationIntervalRef.current = null
    }

    // Disconnect from LiveKit room
    if (roomRef.current) {
      roomRef.current.disconnect()
      roomRef.current = null
    }

    setConnectedRoom(null)

    if (sessionIdRef.current) {
      try {
        await api.conversationEnd(sessionIdRef.current)
      } catch (err) {
        console.error('[livekit-voice] Failed to end session:', err)
      }
    }
  }, [])

  const toggleMute = useCallback(() => {
    const room = roomRef.current
    if (!room) return

    if (isMuted) {
      room.localParticipant.setMicrophoneEnabled(true)
      setIsMuted(false)
    } else {
      room.localParticipant.setMicrophoneEnabled(false)
      setIsMuted(true)
    }
  }, [isMuted])

  const sendTextMessage = useCallback((text: string) => {
    if (!text.trim() || !roomRef.current) return

    // Add to local transcript so it appears in the chat panel immediately
    setTranscript((prev) => [
      ...prev,
      { role: 'user', text: text.trim(), isFinal: true, timestamp: Date.now() },
    ])

    // Send via data channel (topic: 'lingle-chat') — the agent listens for this
    const encoder = new TextEncoder()
    const payload = encoder.encode(JSON.stringify({ type: 'chat', text: text.trim() }))
    roomRef.current.localParticipant
      .publishData(payload, { reliable: true, topic: 'lingle-chat' })
      .catch((err: unknown) => console.error('[livekit-voice] publishData failed:', err))
  }, [])

  // ── Push-to-talk ──

  const startTalking = useCallback(() => {
    setIsTalking(true)
    const room = roomRef.current
    if (room) {
      room.localParticipant.setMicrophoneEnabled(true)
    }
    if (agentIdentityRef.current && room) {
      room.localParticipant
        .performRpc({
          destinationIdentity: agentIdentityRef.current,
          method: 'start_turn',
          payload: '',
        })
        .catch(() => {})
    }
  }, [])

  const stopTalking = useCallback(() => {
    setIsTalking(false)
    if (agentIdentityRef.current && roomRef.current) {
      roomRef.current.localParticipant
        .performRpc({
          destinationIdentity: agentIdentityRef.current,
          method: 'end_turn',
          payload: '',
        })
        .catch(() => {})
    }
  }, [])

  const cancelTalking = useCallback(() => {
    setIsTalking(false)
    // Briefly mute to cancel the current utterance
    const room = roomRef.current
    if (room) {
      room.localParticipant.setMicrophoneEnabled(false)
      setTimeout(() => {
        room.localParticipant.setMicrophoneEnabled(true)
      }, 100)
    }
  }, [])

  const retryLast = useCallback(() => {
    setTranscript((prev) => {
      const copy = [...prev]
      while (copy.length > 0 && copy[copy.length - 1].role === 'assistant') copy.pop()
      while (copy.length > 0 && copy[copy.length - 1].role === 'user') copy.pop()
      return copy
    })
  }, [])

  // ── Agent state/identity callbacks (used by LiveKitBridge) ──

  const handleAgentStateChange = useCallback((state: string) => {
    switch (state) {
      case 'listening': setVoiceState('LISTENING'); break
      case 'thinking': setVoiceState('THINKING'); break
      case 'speaking': setVoiceState('SPEAKING'); break
      default: setVoiceState('IDLE')
    }
  }, [])

  const handleAgentIdentity = useCallback((identity: string) => {
    agentIdentityRef.current = identity
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current)
      }
      if (roomRef.current) {
        roomRef.current.disconnect()
        roomRef.current = null
      }
    }
  }, [])

  const emptyMessages = useMemo(() => [] as never[], [])

  return {
    room: roomRef.current,
    connectedRoom,
    handleAgentStateChange,
    handleAgentIdentity,
    voiceState,
    transcript,
    partialText,
    startSession,
    endSession,
    toggleMute,
    isMuted,
    duration,
    speed: 1,
    setSpeed: () => {},
    sendTextMessage,
    sendSilentMessage: sendTextMessage,
    isActive,
    error,
    sessionId,
    sessionPlan,
    messages: emptyMessages,
    isStreaming: voiceState === 'SPEAKING',
    startNewSession,
    startWithExistingPlan,
    startDirect,
    startTalking,
    stopTalking,
    cancelTalking,
    isTalking,
    spokenSentences,
    currentSentence,
    currentProgress: 0,
    ttsPlaying: voiceState === 'SPEAKING',
    analysisResults,
    retryLast,
    sectionTracking,
    isAnalyzing,
    inputMode: 'vad' as const,
  }
}
