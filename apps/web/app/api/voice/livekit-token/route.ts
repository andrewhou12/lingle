import { NextResponse, type NextRequest } from 'next/server'
import { AccessToken, RoomServiceClient, AgentDispatchClient } from 'livekit-server-sdk'
import { withAuth } from '@/lib/api-helpers'

export const POST = withAuth(async (request: NextRequest, { userId }) => {
  const { metadata } = await request.json()

  const apiKey = process.env.LIVEKIT_API_KEY
  const apiSecret = process.env.LIVEKIT_API_SECRET
  const livekitUrl = process.env.LIVEKIT_URL

  if (!apiKey || !apiSecret || !livekitUrl) {
    return NextResponse.json(
      { error: 'LiveKit credentials not configured' },
      { status: 500 },
    )
  }

  // Use a stable, user-scoped room name so the agent always connects to the
  // same room the client is in — regardless of how many times the user rejoins.
  const identity = userId || `user-${crypto.randomUUID().slice(0, 8)}`
  const roomName = `lingle-${identity}`

  console.log(`[livekit-token] room=${roomName} url=${livekitUrl} keyPrefix=${apiKey?.slice(0, 8)}`)

  const roomService = new RoomServiceClient(livekitUrl, apiKey, apiSecret)

  // Delete any existing room first so old dispatches/agents are evicted.
  // This ensures the new dispatch always goes to a fresh room.
  try {
    await roomService.deleteRoom(roomName)
    console.log(`[livekit-token] deleted existing room`)
  } catch {
    // Room didn't exist — that's fine
  }

  // Small delay to let the room deletion propagate before re-creating.
  await new Promise((r) => setTimeout(r, 500))

  // Create the room explicitly BEFORE dispatching the agent.
  await roomService.createRoom({ name: roomName })
  console.log(`[livekit-token] room created`)

  // Dispatch the agent now that the room exists.
  const dispatchClient = new AgentDispatchClient(livekitUrl, apiKey, apiSecret)
  const dispatch = await dispatchClient.createDispatch(roomName, 'lingle-agent', {
    metadata: JSON.stringify(metadata || {}),
  })
  console.log(`[livekit-token] dispatch created`, JSON.stringify(dispatch))

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
