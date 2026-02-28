import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-helpers'
import OpenAI from 'openai'
import { parseMessage } from '@/lib/message-parser'

const RUBY_REGEX = /\{([^}|]+)\|[^}]+\}/g

export const POST = withAuth(async (request) => {
  const { text } = await request.json()
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

  const openai = new OpenAI()
  const response = await openai.audio.speech.create({
    model: 'tts-1',
    voice: 'shimmer',
    input: spoken,
    response_format: 'mp3',
  })

  const buffer = Buffer.from(await response.arrayBuffer())

  return new Response(buffer, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'public, max-age=86400',
    },
  })
})
