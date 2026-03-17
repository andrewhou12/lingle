'use client'

import { useEffect } from 'react'
import { RoomContext, RoomAudioRenderer, useVoiceAssistant } from '@livekit/components-react'
import type { Room } from 'livekit-client'

interface LiveKitBridgeProps {
  room: Room
  onAgentState: (state: string) => void
  onAgentIdentity: (identity: string) => void
}

/**
 * Bridges LiveKit agent state into our app's voice state machine.
 * Must be rendered outside of any existing RoomContext — it creates one.
 * Uses useVoiceAssistant() which correctly detects ParticipantKind.AGENT
 * participants (which don't appear in room.remoteParticipants).
 */
export function LiveKitBridge({ room, onAgentState, onAgentIdentity }: LiveKitBridgeProps) {
  return (
    <RoomContext.Provider value={room}>
      <RoomAudioRenderer />
      <AgentStateBridge onAgentState={onAgentState} onAgentIdentity={onAgentIdentity} />
    </RoomContext.Provider>
  )
}

function AgentStateBridge({ onAgentState, onAgentIdentity }: {
  onAgentState: (state: string) => void
  onAgentIdentity: (identity: string) => void
}) {
  const { state, agent } = useVoiceAssistant()

  useEffect(() => {
    onAgentState(state)
  }, [state, onAgentState])

  useEffect(() => {
    if (agent?.identity) {
      onAgentIdentity(agent.identity)
    }
  }, [agent?.identity, onAgentIdentity])

  return null
}
