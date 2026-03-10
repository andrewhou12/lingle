import { NextResponse } from 'next/server'
import { generateText } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { withAuth } from '@/lib/api-helpers'

export const POST = withAuth(async (request, { userId: _userId }) => {
  const { query, recentHistory } = await request.json()

  if (!query) {
    return NextResponse.json({ error: 'Missing query' }, { status: 400 })
  }

  const historyBlock = recentHistory?.length
    ? `Recent conversation:\n${recentHistory.map((m: { role: string; content: string }) => `${m.role}: ${m.content}`).join('\n')}\n\n`
    : ''

  try {
    const { text } = await generateText({
      model: anthropic('claude-haiku-4-5-20251001'),
      system: 'You are a language learning assistant. The student is in a Japanese voice conversation and needs help figuring out how to say something. Give 1-2 concise suggestions in Japanese with brief English explanation. Keep it short — they need to get back to the conversation quickly.',
      prompt: `${historyBlock}The learner asks: "${query}"\n\nGive a concise suggestion for how to say this in Japanese.`,
      maxOutputTokens: 200,
    })

    return NextResponse.json({ suggestion: text })
  } catch (err) {
    console.error('[help] Failed:', err)
    return NextResponse.json({ suggestion: 'Sorry, I couldn\'t generate a suggestion right now.' })
  }
})
