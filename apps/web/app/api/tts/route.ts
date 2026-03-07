import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-helpers'
import { parseMessage } from '@/lib/message-parser'

const RUBY_REGEX = /\{([^}|]+)\|[^}]+\}/g

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'urE3OJfJRxJuk9kAMN0Y'

export const POST = withAuth(async (request) => {
  if (!ELEVENLABS_API_KEY) {
    return NextResponse.json({ error: 'ELEVENLABS_API_KEY not configured' }, { status: 500 })
  }

  const body = await request.json()
  const { text, voice: voiceParam } = body
  if (!text || typeof text !== 'string') {
    return NextResponse.json({ error: 'text is required' }, { status: 400 })
  }

  // Extract only conversational text, skip cards and metadata
  const segments = parseMessage(text)
  const spoken = segments
    .filter((s) => s.type === 'text')
    .map((s) => s.content.trim())
    .filter(Boolean)
    .join(' ')
    .replace(RUBY_REGEX, '$1')

  if (!spoken) {
    return NextResponse.json({ error: 'no speakable text' }, { status: 400 })
  }

  const voiceId = voiceParam || ELEVENLABS_VOICE_ID

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: spoken,
        model_id: 'eleven_flash_v2_5',
        output_format: 'mp3_44100_128',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true,
        },
      }),
    },
  )

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error')
    console.error('ElevenLabs TTS error:', response.status, errorText)
    return NextResponse.json(
      { error: 'TTS generation failed' },
      { status: response.status },
    )
  }

  return new Response(response.body, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Transfer-Encoding': 'chunked',
    },
  })
})
