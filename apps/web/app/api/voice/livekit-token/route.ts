import { NextResponse, type NextRequest } from 'next/server'
import { AccessToken, RoomServiceClient, AgentDispatchClient } from 'livekit-server-sdk'
import { withAuth } from '@/lib/api-helpers'

export const POST = withAuth(async (request: NextRequest, { userId }) => {
  const { sessionId, metadata } = await request.json()

  const apiKey = process.env.LIVEKIT_API_KEY
  const apiSecret = process.env.LIVEKIT_API_SECRET
  const livekitUrl = process.env.LIVEKIT_URL

  if (!apiKey || !apiSecret || !livekitUrl) {
    return NextResponse.json(
      { error: 'LiveKit credentials not configured' },
      { status: 500 },
    )
  }

  const roomName = `lingle-${sessionId || crypto.randomUUID()}`
  const identity = userId || `user-${crypto.randomUUID().slice(0, 8)}`

  // Create the room explicitly BEFORE dispatching the agent.
  // Dispatch requires the room to exist — if we dispatch first and the room
  // doesn't exist yet, the job is dropped.
  const roomService = new RoomServiceClient(livekitUrl, apiKey, apiSecret)
  await roomService.createRoom({ name: roomName })

  // Dispatch the agent now that the room exists.
  const dispatchClient = new AgentDispatchClient(livekitUrl, apiKey, apiSecret)
  await dispatchClient.createDispatch(roomName, 'lingle-agent', {
    metadata: JSON.stringify(metadata || {}),
  })

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
