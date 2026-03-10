import { NextResponse } from 'next/server'
import { getRimeWs } from '@/lib/rime-ws'

export async function POST(request: Request) {
  let ttsProvider = process.env.TTS_PROVIDER || 'elevenlabs'
  try {
    const body = await request.json()
    if (body.ttsProvider === 'rime' || body.ttsProvider === 'elevenlabs') ttsProvider = body.ttsProvider
  } catch { /* empty body is fine */ }
  if (ttsProvider === 'rime') {
    getRimeWs().clear()
  }
  return NextResponse.json({ ok: true })
}
