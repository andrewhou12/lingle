import { NextResponse, type NextRequest } from 'next/server'
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk'
import { withAuth } from '@/lib/api-helpers'

/**
 * Issues a LiveKit access token for the user's stable room.
 * Pre-creates the room pinned to LIVEKIT_NODE_ID (the specific node where
 * the cloud agent worker is registered) so the browser and agent always
 * end up on the same node regardless of geographic routing.
 */
export const POST = withAuth(async (_request: NextRequest, { userId }) => {
  const apiKey = process.env.LIVEKIT_API_KEY
  const apiSecret = process.env.LIVEKIT_API_SECRET
  const livekitUrl = process.env.LIVEKIT_URL
  const nodeId = process.env.LIVEKIT_NODE_ID  // e.g. NC_OASHBURN1B_F843qfP6BawS

  if (!apiKey || !apiSecret || !livekitUrl) {
    return NextResponse.json(
      { error: 'LiveKit credentials not configured' },
      { status: 500 },
    )
  }

  const identity = userId || `user-${crypto.randomUUID().slice(0, 8)}`
  const roomName = `lingle-${identity}`

  console.log(`[livekit-token] issuing token room=${roomName} nodeId=${nodeId ?? 'none'} keyPrefix=${apiKey?.slice(0, 8)}`)

  // Pre-create the room pinned to the agent's specific node.
  // This ensures the browser is routed to the same node as the agent
  // when it connects, regardless of LiveKit's geographic routing.
  if (nodeId) {
    const roomService = new RoomServiceClient(livekitUrl, apiKey, apiSecret)
    try {
      await roomService.createRoom({ name: roomName, nodeId, emptyTimeout: 300 })
      console.log(`[livekit-token] room pre-created on nodeId=${nodeId}`)
    } catch {
      // Room already exists on this node — that's fine
      console.log(`[livekit-token] room already exists, skipping creation`)
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
