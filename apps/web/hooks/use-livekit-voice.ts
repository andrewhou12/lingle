'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import {
  Room,
  RoomEvent,
  type RemoteParticipant,
} from 'livekit-client'
import { api, type PostSessionResult } from '@/lib/api'
import { useWhiteboard } from '@/components/voice/whiteboard'
import type { UseVoiceConversationReturn, VoiceState, TranscriptLine } from './use-voice-conversation'

type SessionPlan = Record<string, unknown> | null

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
  whiteboard: ReturnType<typeof useWhiteboard>
  postSessionResult: PostSessionResult | null
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
  const [spokenSentences, setSpokenSentences] = useState<string[]>([])
  const [currentSentence, setCurrentSentence] = useState<string | null>(null)
  const [partialText, setPartialText] = useState('')
  const [connectedRoom, setConnectedRoom] = useState<Room | null>(null)
  const [postSessionResult, setPostSessionResult] = useState<PostSessionResult | null>(null)

  const whiteboard = useWhiteboard()

  const roomRef = useRef<Room | null>(null)
  const connectingRef = useRef(false)
  const sessionIdRef = useRef(sessionId)
  sessionIdRef.current = sessionId
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const agentIdentityRef = useRef<string | null>(null)
  const onPlanUpdateRef = useRef(opts.onPlanUpdate)
  onPlanUpdateRef.current = opts.onPlanUpdate

  // ── Room connection ──

  const connectToRoom = useCallback(async (token: string, url: string, roomName: string, metadata: Record<string, unknown>) => {
    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
    })

    roomRef.current = room

    // Listen for transcription events
    room.on(RoomEvent.TranscriptionReceived, (segments, participant) => {
      for (const segment of segments) {
        const role = participant?.identity === agentIdentityRef.current ? 'assistant' : 'user'

        if (role === 'user' && isGarbageTranscript(segment.text)) continue

        if (segment.final) {
          const displayText = role === 'assistant' ? stripSSML(segment.text) : segment.text
          setTranscript((prev) => [
            ...prev,
            { role, text: displayText, isFinal: true, timestamp: Date.now() },
          ])
          if (role === 'assistant') {
            setSpokenSentences((prev) => [...prev, displayText])
            setCurrentSentence(null)
            setPartialText('')
          }
        } else {
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

        // Whiteboard messages from agent tools
        if (typeof message.type === 'string' && message.type.startsWith('whiteboard_')) {
          whiteboard.handleMessage(message)
        }
      } catch {
        // Not JSON — ignore
      }
    })

    room.on(RoomEvent.Disconnected, () => {
      setIsActive(false)
      setVoiceState('IDLE')
      setConnectedRoom(null)
    })

    // Connect to the room
    await room.connect(url, token)

    // Dispatch the agent now that the room exists
    const dispatchRes = await fetch('/api/voice/start-agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ roomName, metadata }),
    })
    if (!dispatchRes.ok) {
      const body = await dispatchRes.json().catch(() => ({}))
      console.error('[livekit-voice] start-agent failed:', body.error || dispatchRes.status)
    }

    setConnectedRoom(room)

    // Enable microphone
    await room.localParticipant.setMicrophoneEnabled(true)
  }, [])

  // ── Shared helper: fetch token and connect ──

  const fetchTokenAndConnect = useCallback(async (metadata: Record<string, unknown>) => {
    const tokenRes = await fetch('/api/voice/livekit-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ metadata }),
    })

    if (!tokenRes.ok) {
      const body = await tokenRes.json().catch(() => ({}))
      throw new Error(body.error || `Failed to get LiveKit token (${tokenRes.status})`)
    }

    const { token, url, roomName } = await tokenRes.json()
    await connectToRoom(token, url, roomName, metadata)
  }, [connectToRoom])

  // ── Shared session setup ──

  const setupSession = useCallback(() => {
    setTranscript([])
    setSpokenSentences([])
    setPostSessionResult(null)
    setIsActive(true)
    setDuration(0)

    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current)
    }
    durationIntervalRef.current = setInterval(() => {
      setDuration((d) => d + 1)
    }, 1000)
  }, [])

  // ── Session lifecycle ──

  const startNewSession = useCallback(
    async (prompt: string, mode: string) => {
      if (connectingRef.current) return
      connectingRef.current = true
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
        setupSession()

        await fetchTokenAndConnect({
          sessionId: newSessionId,
          sessionPlan: result.plan,
          sessionMode: mode,
          basePrompt: prompt,
          ...(result.agentMetadata ?? {}),
        })
      } catch (err) {
        console.error('[livekit-voice] Failed to start session:', err)
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
    [fetchTokenAndConnect, setupSession],
  )

  const startWithExistingPlan = useCallback(
    async (existingSessionId: string, existingPlan: SessionPlan, prompt: string, steeringNotes?: string[]) => {
      if (connectingRef.current) return
      connectingRef.current = true
      setError(null)
      try {
        setSessionId(existingSessionId)
        setSessionPlan(existingPlan)
        setupSession()

        let messageText = prompt
        if (steeringNotes?.length) {
          messageText +=
            '\n\n[Learner instructions before session start:]\n' +
            steeringNotes.map((n) => `- ${n}`).join('\n')
        }

        await fetchTokenAndConnect({
          sessionId: existingSessionId,
          sessionPlan: existingPlan,
          sessionMode: 'conversation',
          basePrompt: messageText,
        })
      } catch (err) {
        console.error('[livekit-voice] Failed to start with existing plan:', err)
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
    [fetchTokenAndConnect, setupSession],
  )

  const startDirect = useCallback(
    async (metadata: Record<string, unknown>) => {
      if (connectingRef.current) return
      connectingRef.current = true
      setError(null)
      try {
        setSessionId(null)
        setSessionPlan(null)
        setupSession()
        await fetchTokenAndConnect(metadata)
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
    [fetchTokenAndConnect, setupSession],
  )

  const startSession = useCallback(async () => {
    if (!sessionIdRef.current || connectingRef.current) return
    connectingRef.current = true
    setError(null)
    try {
      setupSession()
      await fetchTokenAndConnect({ sessionId: sessionIdRef.current })
    } catch (err) {
      console.error('[livekit-voice] Failed to start session:', err)
      setError(err instanceof Error ? err.message : 'Failed to start session')
      setIsActive(false)
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current)
        durationIntervalRef.current = null
      }
    } finally {
      connectingRef.current = false
    }
  }, [fetchTokenAndConnect, setupSession])

  const endSession = useCallback(async () => {
    setIsActive(false)
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current)
      durationIntervalRef.current = null
    }

    if (roomRef.current) {
      roomRef.current.disconnect()
      roomRef.current = null
    }

    setConnectedRoom(null)

    if (sessionIdRef.current) {
      try {
        const result = await api.conversationEnd(sessionIdRef.current)
        if (result) setPostSessionResult(result)
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

    setTranscript((prev) => [
      ...prev,
      { role: 'user', text: text.trim(), isFinal: true, timestamp: Date.now() },
    ])

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
    retryLast,
    inputMode: 'vad' as const,
    whiteboard,
    postSessionResult,
  }
}
