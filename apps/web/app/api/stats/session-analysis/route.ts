import { NextResponse } from 'next/server'
import { generateObject } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'
import { withAuth } from '@/lib/api-helpers'
import { prisma } from '@lingle/db'
import { getDifficultyLevel } from '@/lib/difficulty-levels'

const sessionAnalysisSchema = z.object({
  overallRating: z.enum(['excellent', 'good', 'developing', 'needs_work']),
  summary: z.string().describe('2-3 sentence overall assessment of this session'),
  targetLanguageUsage: z.object({
    percentage: z.number().describe('Estimated % of messages in target language'),
    assessment: z.string().describe('One sentence about target language usage'),
  }),
  vocabularyUsed: z.array(z.object({
    word: z.string(),
    reading: z.string().optional(),
    meaning: z.string(),
    usedWell: z.boolean(),
  })).describe('5-10 notable vocabulary items used by the learner'),
  grammarPoints: z.array(z.object({
    pattern: z.string(),
    example: z.string().describe('Example from the transcript'),
    correct: z.boolean(),
    note: z.string().optional(),
  })).describe('3-6 grammar patterns observed'),
  errors: z.array(z.object({
    original: z.string().describe('What the learner wrote'),
    corrected: z.string().describe('The correct form'),
    type: z.enum(['grammar', 'vocabulary', 'spelling', 'particle', 'conjugation', 'word_choice']),
    explanation: z.string(),
  })).describe('Errors found in the learner\'s messages (0-6)'),
  strengths: z.array(z.string()).describe('2-3 things the learner did well'),
  suggestions: z.array(z.string()).describe('2-3 actionable suggestions for improvement'),
  skillScores: z.object({
    reading: z.number(),
    listening: z.number(),
    speaking: z.number(),
    writing: z.number(),
    vocabulary: z.number(),
    grammar: z.number(),
  }),
})

export type SessionAnalysis = z.infer<typeof sessionAnalysisSchema>

export const POST = withAuth(async (request, { userId }) => {
  const { sessionId } = await request.json()
  if (!sessionId || typeof sessionId !== 'string') {
    return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 })
  }

  const session = await prisma.conversationSession.findFirst({
    where: { id: sessionId, userId },
  })
  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  const transcript = session.transcript as { role: string; content: string }[] | null
  if (!Array.isArray(transcript) || transcript.length < 2) {
    return NextResponse.json({ status: 'insufficient_data' })
  }

  const profile = await prisma.learnerProfile.findUniqueOrThrow({ where: { userId } })
  const level = getDifficultyLevel(profile.difficultyLevel)
  const plan = session.sessionPlan as Record<string, unknown> | null
  const topic = (plan?.topic as string) || (plan?.focus as string) || 'Free conversation'

  const messages = transcript
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({
      role: m.role,
      content: m.content.length > 500 ? m.content.slice(0, 500) + '...' : m.content,
    }))

  try {
    const { object } = await generateObject({
      model: anthropic('claude-haiku-4-5-20251001'),
      schema: sessionAnalysisSchema,
      prompt: `You are a language learning analyst. Analyze this single conversation session from a ${profile.targetLanguage} learner (native ${profile.nativeLanguage} speaker, level: ${level.label}).

Session mode: ${session.mode}
Topic: ${topic}
Duration: ${session.durationSeconds ? Math.round(session.durationSeconds / 60) : '?'} minutes

Analyze the learner's performance in this session. Focus on:
- What vocabulary and grammar they used (or attempted)
- Specific errors with corrections
- Communication strategies
- Overall production quality

For skill scores, assess based only on evidence from this session. Estimate conservatively for skills with little evidence (e.g. listening in text-only).

Be encouraging but honest. Identify specific, actionable improvements.

Transcript:
${messages.map((m) => `[${m.role}]: ${m.content}`).join('\n')}`,
    })

    return NextResponse.json({ status: 'ok', analysis: object })
  } catch (err) {
    console.error('[session-analysis] Failed:', err)
    return NextResponse.json({ error: 'Analysis generation failed' }, { status: 500 })
  }
})
