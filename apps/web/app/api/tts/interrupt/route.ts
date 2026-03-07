import { NextResponse } from 'next/server'
import { getRimeWs } from '@/lib/rime-ws'

export async function POST() {
  const provider = process.env.TTS_PROVIDER || 'elevenlabs'
  if (provider === 'rime') {
    getRimeWs().clear()
  }
  return NextResponse.json({ ok: true })
}
