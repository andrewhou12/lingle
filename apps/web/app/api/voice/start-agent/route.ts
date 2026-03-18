import { NextResponse, type NextRequest } from 'next/server'
import { AgentDispatchClient } from 'livekit-server-sdk'
import { withAuth } from '@/lib/api-helpers'

/**
 * Dispatches the agent to the user's room.
 * Called by the browser AFTER it has connected to LiveKit, so the room
 * already exists on a node.
 */
export const POST = withAuth(async (request: NextRequest, { userId }) => {
  const { roomName, metadata } = await request.json()

  const apiKey = process.env.LIVEKIT_API_KEY
  const apiSecret = process.env.LIVEKIT_API_SECRET
  const livekitUrl = process.env.LIVEKIT_URL

  if (!apiKey || !apiSecret || !livekitUrl) {
    return NextResponse.json({ error: 'LiveKit credentials not configured' }, { status: 500 })
  }

  const expectedRoom = `lingle-${userId}`
  if (roomName !== expectedRoom) {
    return NextResponse.json({ error: 'Invalid room' }, { status: 403 })
  }

  const dispatchClient = new AgentDispatchClient(livekitUrl, apiKey, apiSecret)

  // Clean up stale/stuck dispatches from failed previous sessions
  try {
    const stale = await dispatchClient.listDispatch(roomName)
    if (stale.length > 0) {
      console.log(`[start-agent] cleaning ${stale.length} stale dispatch(es) for ${roomName}`)
      await Promise.all(stale.map((d) => dispatchClient.deleteDispatch(d.id, roomName)))
    }
  } catch {
    // Ignore — proceed to create a new dispatch regardless
  }

  const dispatch = await dispatchClient.createDispatch(roomName, 'lingle-agent', {
    metadata: JSON.stringify(metadata || {}),
  })
  console.log(`[start-agent] dispatched to ${roomName}`, dispatch.id)

  return NextResponse.json({ ok: true })
})
