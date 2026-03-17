import { NextResponse, type NextRequest } from 'next/server'
import { RoomServiceClient } from 'livekit-server-sdk'

export async function GET(request: NextRequest) {
  const roomName = request.nextUrl.searchParams.get('room')
  if (!roomName) return NextResponse.json({ error: 'room param required' }, { status: 400 })

  const apiKey = process.env.LIVEKIT_API_KEY
  const apiSecret = process.env.LIVEKIT_API_SECRET
  const livekitUrl = process.env.LIVEKIT_URL

  if (!apiKey || !apiSecret || !livekitUrl) {
    return NextResponse.json({ error: 'LiveKit credentials not configured' }, { status: 500 })
  }

  const roomService = new RoomServiceClient(livekitUrl, apiKey, apiSecret)

  const [rooms, participants] = await Promise.all([
    roomService.listRooms([roomName]).catch((e: unknown) => ({ error: String(e) })),
    roomService.listParticipants(roomName).catch((e: unknown) => ({ error: String(e) })),
  ])

  return NextResponse.json({
    livekitUrl,
    keyPrefix: apiKey.slice(0, 8),
    rooms,
    participants,
  })
}
