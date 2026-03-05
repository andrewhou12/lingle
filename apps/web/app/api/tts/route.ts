import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-helpers'
import OpenAI from 'openai'
import { parseMessage } from '@/lib/message-parser'

const RUBY_REGEX = /\{([^}|]+)\|[^}]+\}/g
const openai = new OpenAI()

export const POST = withAuth(async (request) => {
  const body = await request.json()
  const { text, voice: voiceParam, speed: speedParam } = body
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

  const response = await openai.audio.speech.create({
    model: 'tts-1',
    voice: (voiceParam as 'shimmer' | 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova') || 'shimmer',
    input: spoken,
    response_format: 'mp3',
    speed: typeof speedParam === 'number' ? Math.max(0.25, Math.min(4.0, speedParam)) : undefined,
  })

  const buffer = Buffer.from(await response.arrayBuffer())

  return new Response(buffer, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'public, max-age=86400',
    },
  })
})
