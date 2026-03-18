import { NextResponse, type NextRequest } from 'next/server'
import { AgentDispatchClient, RoomServiceClient } from 'livekit-server-sdk'
import { withAuth } from '@/lib/api-helpers'

/**
 * Dispatches the agent to the user's room.
 * Called by the browser AFTER it has connected to LiveKit, so the room
 * already exists on the correct regional node.
 */
export const POST = withAuth(async (request: NextRequest, { userId }) => {
  const { roomName, metadata } = await request.json()

  const apiKey = process.env.LIVEKIT_API_KEY
  const apiSecret = process.env.LIVEKIT_API_SECRET
  const livekitUrl = process.env.LIVEKIT_URL

  if (!apiKey || !apiSecret || !livekitUrl) {
    return NextResponse.json({ error: 'LiveKit credentials not configured' }, { status: 500 })
  }

  // Verify the room belongs to this user
  const expectedRoom = `lingle-${userId}`
  if (roomName !== expectedRoom) {
    return NextResponse.json({ error: 'Invalid room' }, { status: 403 })
  }

  const dispatchClient = new AgentDispatchClient(livekitUrl, apiKey, apiSecret)
  const roomService = new RoomServiceClient(livekitUrl, apiKey, apiSecret)

  // If an agent participant is already active in the room, nothing to do
  try {
    const participants = await roomService.listParticipants(roomName)
    const hasActiveAgent = participants.some((p) => p.kind === 4) // ParticipantKind.AGENT
    if (hasActiveAgent) {
      console.log(`[start-agent] agent already in room ${roomName}, skipping dispatch`)
      return NextResponse.json({ ok: true, reused: true })
    }
  } catch {
    // Room may not exist yet on the server — proceed to dispatch
  }

  // Delete stale/stuck dispatches from failed previous sessions so they don't
  // block the new dispatch (listDispatch returns pending dispatches where the
  // agent accepted the job but never connected to the room).
  try {
    const stale = await dispatchClient.listDispatch(roomName)
    if (stale.length > 0) {
      console.log(`[start-agent] deleting ${stale.length} stale dispatch(es) for ${roomName}`)
      await Promise.all(stale.map((d) => dispatchClient.deleteDispatch(d.id, roomName)))
    }
  } catch {
    // Ignore — proceed to create a new dispatch regardless
  }

  const dispatch = await dispatchClient.createDispatch(roomName, 'lingle-agent', {
    metadata: JSON.stringify(metadata || {}),
  })
  console.log(`[start-agent] dispatch created for ${roomName}`, JSON.stringify(dispatch))

  return NextResponse.json({ ok: true })
})
