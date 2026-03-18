import { NextResponse, type NextRequest } from 'next/server'
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk'
import { withAuth } from '@/lib/api-helpers'

/**
 * Issues a LiveKit access token for the user's stable room.
 *
 * Room is pre-created and pinned to LIVEKIT_NODE_ID so the agent worker
 * receives the dispatch. Despite the SDK docs saying nodeId "does not work
 * with Cloud", in practice dispatch only reaches the agent when the room
 * is pinned to the agent's node.
 *
 * LIVEKIT_NODE_ID must be updated after each `lk agent deploy` — read it
 * from the agent startup logs.
 */
export const POST = withAuth(async (_request: NextRequest, { userId }) => {
  const apiKey = process.env.LIVEKIT_API_KEY
  const apiSecret = process.env.LIVEKIT_API_SECRET
  const livekitUrl = process.env.LIVEKIT_URL
  const nodeId = process.env.LIVEKIT_NODE_ID

  if (!apiKey || !apiSecret || !livekitUrl) {
    return NextResponse.json(
      { error: 'LiveKit credentials not configured' },
      { status: 500 },
    )
  }

  if (!nodeId) {
    console.warn('[livekit-token] LIVEKIT_NODE_ID not set — agent dispatch may not work')
  }

  const identity = userId
  const roomName = `lingle-${identity}`

  // Pin room to agent's node so dispatch reaches it
  if (nodeId) {
    const roomService = new RoomServiceClient(livekitUrl, apiKey, apiSecret)
    try {
      await roomService.createRoom({ name: roomName, nodeId, emptyTimeout: 300 })
    } catch {
      // Room already exists — fine
    }
  }

  const token = new AccessToken(apiKey, apiSecret, { identity })
  token.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  })

  const jwt = await token.toJwt()
  return NextResponse.json({ token: jwt, url: livekitUrl, roomName })
})
