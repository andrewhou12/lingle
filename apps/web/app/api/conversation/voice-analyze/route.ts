import { NextResponse } from 'next/server'
import { generateObject } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'
import { withAuth } from '@/lib/api-helpers'
import { prisma } from '@lingle/db'

const voiceAnalysisSchema = z.object({
  corrections: z.array(z.object({
    original: z.string().describe('What the learner said (incorrect form)'),
    corrected: z.string().describe('The corrected form'),
    explanation: z.string().describe('Brief explanation of the error'),
    grammarPoint: z.string().optional().describe('Grammar point if applicable'),
  })).describe('Genuine errors only — do not flag stylistic choices or natural speech variation'),
  vocabularyCards: z.array(z.object({
    word: z.string().describe('Word in target language'),
    reading: z.string().optional().describe('Reading/pronunciation'),
    meaning: z.string().describe('English meaning'),
    partOfSpeech: z.string().optional().describe('Part of speech'),
    exampleSentence: z.string().optional().describe('Example sentence'),
    notes: z.string().optional().describe('Usage notes'),
  })).describe('Only words above learner level used by the assistant — 0-2 cards max'),
  grammarNotes: z.array(z.object({
    pattern: z.string().describe('Grammar pattern'),
    meaning: z.string().describe('English meaning'),
    formation: z.string().describe('How to form it'),
    examples: z.array(z.object({
      japanese: z.string(),
      english: z.string(),
    })).min(1).max(2).describe('1-2 examples'),
    level: z.string().optional().describe('JLPT level'),
  })).describe('Only if assistant used a notable grammar pattern — 0-1 notes max'),
})

export const POST = withAuth(async (request) => {
  const { sessionId, userMessage, assistantMessage, recentHistory } = await request.json()

  if (!sessionId || !userMessage || !assistantMessage) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const session = await prisma.conversationSession.findUnique({
    where: { id: sessionId },
    select: { targetLanguage: true, userId: true },
  })
  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  const profile = await prisma.learnerProfile.findUnique({
    where: { userId: session.userId },
    select: { difficultyLevel: true, nativeLanguage: true, targetLanguage: true },
  })

  const historyBlock = recentHistory?.length
    ? `Recent conversation context:\n${recentHistory.map((m: { role: string; content: string }) => `${m.role}: ${m.content}`).join('\n')}\n\n`
    : ''

  try {
    const { object } = await generateObject({
      model: anthropic('claude-haiku-4-5-20251001'),
      schema: voiceAnalysisSchema,
      prompt: `You are a language learning analysis engine. Analyze this voice conversation exchange and extract teaching feedback.

${historyBlock}Latest exchange:
Learner: ${userMessage}
Assistant: ${assistantMessage}

Learner info:
- Target language: ${profile?.targetLanguage ?? session.targetLanguage}
- Native language: ${profile?.nativeLanguage ?? 'English'}
- Difficulty level: ${profile?.difficultyLevel ?? 3}

Rules:
- Only flag GENUINE errors in the learner's speech — not stylistic choices, casual speech, or natural variation
- Vocabulary cards: only for words the ASSISTANT used that are clearly above the learner's current level. 0-2 max.
- Grammar notes: only if the assistant used a notable pattern the learner likely hasn't seen. 0-1 max.
- If everything looks fine, return empty arrays. Most turns should have 0 corrections.
- Be selective — quality over quantity.`,
    })

    return NextResponse.json(object)
  } catch (err) {
    console.error('[voice-analyze] Analysis failed:', err)
    return NextResponse.json({ corrections: [], vocabularyCards: [], grammarNotes: [] })
  }
})
