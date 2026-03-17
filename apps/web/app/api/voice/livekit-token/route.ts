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

  const identity = userId || `user-${crypto.randomUUID().slice(0, 8)}`
  const roomName = `lingle-${identity}`

  console.log(`[livekit-token] room=${roomName} url=${livekitUrl} keyPrefix=${apiKey?.slice(0, 8)}`)

  const roomService = new RoomServiceClient(livekitUrl, apiKey, apiSecret)
  const dispatchClient = new AgentDispatchClient(livekitUrl, apiKey, apiSecret)

  // Check if the room already has an active agent dispatch / agent participant.
  // If the room exists and an agent is already present, just return a token —
  // no need to redispatch. If no agent is present (e.g. first join, or the
  // previous agent session ended), create the room and dispatch a fresh agent.
  let needsDispatch = true
  try {
    const rooms = await roomService.listRooms([roomName])
    if (rooms.length > 0) {
      // Room exists — check if there's already an active agent dispatch.
      const dispatches = await dispatchClient.listDispatch(roomName)
      if (dispatches.length > 0) {
        console.log(`[livekit-token] room exists with ${dispatches.length} active dispatch(es), reusing`)
        needsDispatch = false
      } else {
        console.log(`[livekit-token] room exists but no active dispatch, redispatching`)
      }
    } else {
      console.log(`[livekit-token] room does not exist, creating`)
    }
  } catch {
    console.log(`[livekit-token] error checking room state, will create fresh`)
  }

  if (needsDispatch) {
    // Delete any stale room so we start from a clean slate.
    try {
      await roomService.deleteRoom(roomName)
      console.log(`[livekit-token] deleted stale room`)
    } catch {
      // Room didn't exist — fine
    }

    await roomService.createRoom({ name: roomName })
    console.log(`[livekit-token] room created`)

    const dispatch = await dispatchClient.createDispatch(roomName, 'lingle-agent', {
      metadata: JSON.stringify(metadata || {}),
    })
    console.log(`[livekit-token] dispatch created`, JSON.stringify(dispatch))
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
