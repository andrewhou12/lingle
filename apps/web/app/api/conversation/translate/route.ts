import { NextResponse } from 'next/server'
import { generateText } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { withAuth } from '@/lib/api-helpers'

export const POST = withAuth(async (request, { userId: _userId }) => {
  const { text } = await request.json()

  if (!text) {
    return NextResponse.json({ error: 'Missing text' }, { status: 400 })
  }

  try {
    const { text: translation } = await generateText({
      model: anthropic('claude-haiku-4-5-20251001'),
      prompt: `Translate this Japanese text to natural English. Return ONLY the translation, nothing else.\n\n${text}`,
    })

    return NextResponse.json({ translation: translation.trim() })
  } catch (err) {
    console.error('[translate] Failed:', err)
    return NextResponse.json({ error: 'Translation failed' }, { status: 500 })
  }
})
