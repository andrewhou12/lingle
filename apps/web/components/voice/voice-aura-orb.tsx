'use client'

import { useState, useEffect } from 'react'
import { RoomEvent, Track, type RemoteTrackPublication, type RemoteParticipant, type Room, type RemoteAudioTrack } from 'livekit-client'
import type { AgentState } from '@livekit/components-react'
import { AgentAudioVisualizerAura } from '@/components/agents-ui/agent-audio-visualizer-aura'
import type { VoiceState } from '@/hooks/use-voice-conversation'
import { cn } from '@/lib/utils'

/** Map our VoiceState to LiveKit AgentState */
export function toAgentState(voiceState: VoiceState): AgentState {
  switch (voiceState) {
    case 'LISTENING':
    case 'INTERRUPTED':
      return 'listening'
    case 'THINKING':
      return 'thinking'
    case 'SPEAKING':
      return 'speaking'
    case 'IDLE':
    default:
      return 'idle'
  }
}

/**
 * Hook that extracts the agent's remote audio track from a LiveKit Room.
 * Listens for track subscription events and returns the first remote audio track.
 */
function useAgentAudioTrack(room: Room | null | undefined): RemoteAudioTrack | undefined {
  const [audioTrack, setAudioTrack] = useState<RemoteAudioTrack | undefined>(undefined)

  useEffect(() => {
    if (!room) {
      setAudioTrack(undefined)
      return
    }

    // Check for existing subscribed audio tracks
    const findExistingTrack = () => {
      for (const participant of room.remoteParticipants.values()) {
        for (const pub of participant.trackPublications.values()) {
          if (pub.kind === Track.Kind.Audio && pub.track && pub.isSubscribed) {
            setAudioTrack(pub.track as RemoteAudioTrack)
            return
          }
        }
      }
    }

    findExistingTrack()

    const onTrackSubscribed = (track: { kind: Track.Kind }, _pub: RemoteTrackPublication, _participant: RemoteParticipant) => {
      if (track.kind === Track.Kind.Audio) {
        setAudioTrack(track as RemoteAudioTrack)
      }
    }

    const onTrackUnsubscribed = (track: { kind: Track.Kind }) => {
      if (track.kind === Track.Kind.Audio) {
        setAudioTrack(undefined)
      }
    }

    room.on(RoomEvent.TrackSubscribed, onTrackSubscribed)
    room.on(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed)

    return () => {
      room.off(RoomEvent.TrackSubscribed, onTrackSubscribed)
      room.off(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed)
    }
  }, [room])

  return audioTrack
}

interface VoiceAuraOrbProps {
  voiceState: VoiceState
  /** The LiveKit Room instance to extract the agent audio track from */
  room?: Room | null
  className?: string
}

/**
 * Aura visualizer that pulls the agent's audio track directly from the Room.
 * No LiveKit context providers needed — works standalone.
 */
export function VoiceAuraOrb({ voiceState, room, className }: VoiceAuraOrbProps) {
  const audioTrack = useAgentAudioTrack(room)

  return (
    <AgentAudioVisualizerAura
      size="lg"
      state={toAgentState(voiceState)}
      audioTrack={audioTrack}
      color="#C8572A"
      colorShift={0.15}
      themeMode="light"
      className={cn('pointer-events-none', className)}
    />
  )
}

/**
 * Standalone Aura visualizer — no Room needed.
 * Uses state-only animation (no audio reactivity).
 * For prompt screens, loading states, etc.
 */
export function VoiceAuraOrbStandalone({ voiceState, className }: Omit<VoiceAuraOrbProps, 'room'>) {
  return (
    <AgentAudioVisualizerAura
      size="lg"
      state={toAgentState(voiceState)}
      color="#C8572A"
      colorShift={0.15}
      themeMode="light"
      className={cn('pointer-events-none', className)}
    />
  )
}
