'use client'

import type { AgentState } from '@livekit/components-react'
import type { VoiceState } from '@/hooks/use-voice-conversation'
import { cn } from '@/lib/utils'

export type OrbState = 'idle' | 'ai' | 'user' | 'thinking'

/** Map VoiceState to LiveKit AgentState (used by LingleChatTranscript) */
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

export function voiceStateToOrbState(voiceState: VoiceState): OrbState {
  switch (voiceState) {
    case 'SPEAKING':
      return 'ai'
    case 'LISTENING':
      return 'user'
    case 'THINKING':
      return 'thinking'
    case 'IDLE':
    case 'INTERRUPTED':
    default:
      return 'idle'
  }
}

// Sesame-style: single color, shape/movement changes only
const ORB_ANIMATIONS = {
  idle: 'session-orb-idle 6s ease-in-out infinite',
  ai: 'session-orb-talk 1.8s ease-in-out infinite',
  user: 'session-orb-listen 3s ease-in-out infinite',
  thinking: 'session-orb-think 1.2s ease-in-out infinite',
} as const

// Warm neutral — consistent across all states, matches design system
const ORB_COLOR = '#ece8e1'
const ORB_BORDER = '#d9d4cc'
const ORB_HALO = 'rgba(200, 87, 42, 0.08)'

interface AIOrbProps {
  state: OrbState
  /** Container size in pixels */
  size?: number
  mini?: boolean
  className?: string
}

export function AIOrb({ state = 'idle', size = 220, mini = false, className }: AIOrbProps) {
  // Orb disc is proportional to container
  const d = mini ? size * 0.7 : size * 0.6
  const haloSize = d * 1.35

  return (
    <div
      className={cn('relative flex items-center justify-center shrink-0', className)}
      style={{ width: size, height: size }}
    >
      {/* Halo ring — always present, pulses when listening */}
      {!mini && (
        <div
          className="absolute rounded-full border pointer-events-none"
          style={{
            width: haloSize,
            height: haloSize,
            borderColor: ORB_HALO,
            animation: state === 'user'
              ? 'session-orb-halo 2.5s ease-in-out infinite'
              : undefined,
            opacity: 0.3,
            transition: 'opacity 0.6s ease',
          }}
        />
      )}

      {/* Orb disc — single color, shape morphs per state */}
      <div
        className="shrink-0"
        style={{
          width: d,
          height: d,
          background: `radial-gradient(ellipse at 38% 35%, ${ORB_COLOR}dd, ${ORB_COLOR})`,
          borderRadius: '50%',
          border: `1.5px solid ${ORB_BORDER}`,
          animation: ORB_ANIMATIONS[state],
          transition: 'border-radius 0.4s ease',
          boxShadow: `0 4px 30px ${ORB_HALO}, inset 0 -8px 20px rgba(0,0,0,0.04)`,
        }}
      />
    </div>
  )
}
