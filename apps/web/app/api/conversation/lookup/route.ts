import { NextResponse } from 'next/server'
import { generateObject } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'
import { withAuth } from '@/lib/api-helpers'

export const POST = withAuth(async (request, { userId: _userId }) => {
  const { word, context, targetLanguage } = await request.json()
  const lang = targetLanguage || 'Japanese'

  if (!word) {
    return NextResponse.json({ error: 'Missing word' }, { status: 400 })
  }

  const readingDesc = lang === 'Japanese' ? 'Reading in hiragana (for kanji words)'
    : lang === 'Mandarin Chinese' ? 'Reading in pinyin (for hanzi)'
    : lang === 'Korean' ? 'Romanization'
    : 'Pronunciation guide'

  const lookupSchema = z.object({
    word: z.string().describe('The word/phrase looked up'),
    reading: z.string().optional().describe(readingDesc),
    meaning: z.string().describe('English meaning'),
    partOfSpeech: z.string().optional().describe('Part of speech'),
    exampleSentence: z.string().optional().describe(`Short example sentence in ${lang}`),
    notes: z.string().optional().describe('Brief usage note if helpful'),
  })

  try {
    const { object } = await generateObject({
      model: anthropic('claude-haiku-4-5-20251001'),
      schema: lookupSchema,
      prompt: `Look up this ${lang} word/phrase and provide a concise dictionary entry.

Word: ${word}
${context ? `Context sentence: ${context}` : ''}

Provide the reading/pronunciation, meaning, part of speech, and a brief example sentence. Keep everything concise.`,
    })

    return NextResponse.json(object)
  } catch (err) {
    console.error('[lookup] Failed:', err)
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 })
  }
})
