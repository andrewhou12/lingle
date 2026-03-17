import { NextResponse, type NextRequest } from 'next/server'
import { AgentDispatchClient } from 'livekit-server-sdk'
import { withAuth } from '@/lib/api-helpers'

/**
 * Dispatches the agent to the user's room.
 * Called by the browser AFTER it has connected to LiveKit, so the room
 * already exists on the correct regional node and the dispatch assignment
 * URL will point to that same node (fixing the US-East/US-West mismatch).
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

  // Skip if agent already dispatched (e.g. browser reconnect)
  try {
    const existing = await dispatchClient.listDispatch(roomName)
    if (existing.length > 0) {
      console.log(`[start-agent] agent already dispatched for ${roomName}, reusing`)
      return NextResponse.json({ ok: true, reused: true })
    }
  } catch {
    // Room may not exist yet on server side — proceed to dispatch
  }

  const dispatch = await dispatchClient.createDispatch(roomName, 'lingle-agent', {
    metadata: JSON.stringify(metadata || {}),
  })
  console.log(`[start-agent] dispatch created for ${roomName}`, JSON.stringify(dispatch))

  return NextResponse.json({ ok: true })
})
