import { NextResponse, type NextRequest } from 'next/server'
import { AccessToken, AgentDispatchClient } from 'livekit-server-sdk'
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

  // Room name is based on session ID for uniqueness
  const roomName = `lingle-${sessionId || crypto.randomUUID()}`
  const identity = userId || `user-${crypto.randomUUID().slice(0, 8)}`

  // Create an access token for the browser participant
  const token = new AccessToken(apiKey, apiSecret, {
    identity,
  })

  token.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  })

  const jwt = await token.toJwt()

  // Dispatch the agent with metadata in the background — don't block the token return.
  // The agent picks up the job around the same time the client connects.
  const dispatchClient = new AgentDispatchClient(livekitUrl, apiKey, apiSecret)
  dispatchClient.createDispatch(roomName, 'lingle-agent', {
    metadata: JSON.stringify(metadata || {}),
  }).catch((err) => console.error('[livekit-token] dispatch failed:', err))

  return NextResponse.json({
    token: jwt,
    url: livekitUrl,
    roomName,
  })
})
