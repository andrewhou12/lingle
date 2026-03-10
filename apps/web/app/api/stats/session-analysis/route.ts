import { NextResponse } from 'next/server'
import { streamObject } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'
import { withAuth } from '@/lib/api-helpers'
import { prisma } from '@lingle/db'
import { getDifficultyLevel } from '@/lib/difficulty-levels'

const sessionAnalysisSchema = z.object({
  overallRating: z.enum(['excellent', 'good', 'developing', 'needs_work']),
  summary: z.string().describe('2-3 sentence overall assessment of this session'),
  targetLanguageUsage: z.object({
    percentage: z.number().describe('Estimated % of the LEARNER\'s messages in target language'),
    assessment: z.string().describe('One sentence about target language usage'),
  }),
  vocabularyUsed: z.array(z.object({
    word: z.string(),
    reading: z.string().optional(),
    meaning: z.string(),
    usedWell: z.boolean(),
  })).describe('5-10 notable vocabulary items the LEARNER used or attempted (NOT tutor vocabulary)'),
  grammarPoints: z.array(z.object({
    pattern: z.string(),
    example: z.string().describe('Example from a LEARNER message'),
    correct: z.boolean(),
    note: z.string().optional(),
  })).describe('3-6 grammar patterns the LEARNER used'),
  errors: z.array(z.object({
    original: z.string().describe('What the learner wrote'),
    corrected: z.string().describe('The correct form'),
    type: z.enum(['grammar', 'vocabulary', 'spelling', 'particle', 'conjugation', 'word_choice']),
    explanation: z.string(),
  })).describe('Errors found in the LEARNER\'s messages only (0-6)'),
  strengths: z.array(z.string()).describe('2-3 things the learner did well'),
  suggestions: z.array(z.string()).describe('2-3 actionable suggestions for improvement'),
  skillScores: z.object({
    vocabularyRange: z.number().min(0).max(100).describe('Variety and appropriateness of vocabulary used'),
    grammarAccuracy: z.number().min(0).max(100).describe('Correctness of grammar, particles, conjugations'),
    naturalness: z.number().min(0).max(100).describe('How native-like and natural the phrasing sounds'),
    complexity: z.number().min(0).max(100).describe('Sophistication of sentence structures relative to level'),
  }),
})

export type SessionAnalysis = z.infer<typeof sessionAnalysisSchema>

export const POST = withAuth(async (request, { userId }) => {
  const { sessionId } = await request.json()
  if (!sessionId || typeof sessionId !== 'string') {
    return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 })
  }

  // Check if user is on Pro plan
  const subscription = await prisma.subscription.findUnique({ where: { userId } })
  const userPlan = subscription?.plan ?? 'free'
  if (userPlan !== 'pro') {
    return NextResponse.json({ status: 'requires_pro' })
  }

  const session = await prisma.conversationSession.findFirst({
    where: { id: sessionId, userId },
  })
  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  // Return cached analysis if available
  if (session.cachedAnalysis) {
    return NextResponse.json({ status: 'ok', analysis: session.cachedAnalysis })
  }

  const transcript = session.transcript as { role: string; content: string }[] | null
  if (!Array.isArray(transcript) || transcript.length < 2) {
    return NextResponse.json({ status: 'insufficient_data' })
  }

  // Check minimum learner input — need real content to analyze
  const userMessages = transcript.filter((m) => m.role === 'user')
  const userTextTotal = userMessages.reduce((sum, m) => sum + m.content.trim().length, 0)
  if (userMessages.length < 2 || userTextTotal < 30) {
    return NextResponse.json({ status: 'insufficient_data' })
  }

  const profile = await prisma.learnerProfile.findUniqueOrThrow({ where: { userId } })
  const level = getDifficultyLevel(profile.difficultyLevel, profile.targetLanguage)
  const plan = session.sessionPlan as Record<string, unknown> | null
  const topic = (plan?.topic as string) || (plan?.focus as string) || 'Free conversation'

  const messages = transcript
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({
      role: m.role,
      content: m.content.length > 500 ? m.content.slice(0, 500) + '...' : m.content,
    }))

  try {
    const result = streamObject({
      model: anthropic('claude-haiku-4-5-20251001'),
      schema: sessionAnalysisSchema,
      prompt: `You are a language learning analyst. Analyze this conversation session from a ${profile.targetLanguage} learner (native ${profile.nativeLanguage} speaker, level: ${level.label}).

Session mode: ${session.mode}
Topic: ${topic}
Duration: ${session.durationSeconds ? Math.round(session.durationSeconds / 60) : '?'} minutes

CRITICAL: Analyze ONLY the learner's messages (labeled [learner]).
The tutor's messages (labeled [tutor]) are provided for conversational context only.
Do NOT include tutor vocabulary, grammar, or text in your analysis.
All vocabulary, grammar points, errors, and examples MUST come from [learner] messages.

Focus on:
- Vocabulary and grammar the LEARNER used or attempted in their own messages
- Errors in the LEARNER's messages only
- The LEARNER's communication strategies and production quality

For skill scores (0-100), assess based only on evidence from the learner's messages in this session:
- vocabularyRange: variety and level-appropriateness of words the learner produced
- grammarAccuracy: correctness of particles, conjugations, and sentence patterns
- naturalness: how native-like and idiomatic the learner's phrasing sounds
- complexity: sophistication of sentence structures relative to their level

Be encouraging but honest. Identify specific, actionable improvements.

Transcript:
${messages.map((m) => `[${m.role === 'user' ? 'learner' : 'tutor'}]: ${m.content}`).join('\n')}`,
    })

    // Cache the final object asynchronously after stream completes
    result.object
      .then(async (obj) => {
        await prisma.conversationSession.update({
          where: { id: sessionId },
          data: { cachedAnalysis: JSON.parse(JSON.stringify(obj)) },
        })
      })
      .catch((err) => console.error('[session-analysis] Cache failed:', err))

    // Stream partial objects as NDJSON — throttled to avoid flooding the client
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          let lastEmit = 0
          let latestPartial: unknown = null

          for await (const partial of result.partialObjectStream) {
            latestPartial = partial
            const now = Date.now()
            if (now - lastEmit >= 150) {
              controller.enqueue(encoder.encode(JSON.stringify(partial) + '\n'))
              lastEmit = now
            }
          }

          // Always emit the final complete object
          if (latestPartial) {
            controller.enqueue(encoder.encode(JSON.stringify(latestPartial) + '\n'))
          }
        } catch (err) {
          console.error('[session-analysis] Stream error:', err)
        } finally {
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Cache-Control': 'no-cache',
      },
    })
  } catch (err) {
    console.error('[session-analysis] Failed:', err)
    return NextResponse.json({ error: 'Analysis generation failed' }, { status: 500 })
  }
})
