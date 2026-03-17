import { NextResponse, type NextRequest } from 'next/server'
import { AccessToken } from 'livekit-server-sdk'
import { withAuth } from '@/lib/api-helpers'

/**
 * Issues a LiveKit access token for the user's stable room.
 */
export const POST = withAuth(async (_request: NextRequest, { userId }) => {
  const apiKey = process.env.LIVEKIT_API_KEY
  const apiSecret = process.env.LIVEKIT_API_SECRET
  const livekitUrl = process.env.LIVEKIT_URL

  if (!apiKey || !apiSecret || !livekitUrl) {
    return NextResponse.json(
      { error: 'LiveKit credentials not configured' },
      { status: 500 },
    )
  }

  const identity = userId || `user-${crypto.randomUUID().slice(0, 8)}`
  const roomName = `lingle-${identity}`

  console.log(`[livekit-token] issuing token room=${roomName} keyPrefix=${apiKey?.slice(0, 8)}`)

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
