import { NextResponse } from 'next/server'
import { generateObject } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'
import { withAuth } from '@/lib/api-helpers'
import { prisma } from '@lingle/db'
import { getDifficultyLevel } from '@/lib/difficulty-levels'

const analysisSchema = z.object({
  levelAssessment: z.object({
    currentLevel: z.string().describe('CEFR level: A1, A2, B1, B2, C1, or C2'),
    confidence: z.enum(['low', 'medium', 'high']),
    summary: z.string().describe('2-3 sentence assessment of the learner\'s current level'),
    evidencePoints: z.array(z.string()).describe('2-4 specific observations from the transcripts'),
  }),
  strengths: z.array(z.object({
    area: z.string().describe('Strength area name'),
    detail: z.string().describe('Specific detail about this strength'),
  })).describe('2-4 learner strengths'),
  mistakesAndHabits: z.array(z.object({
    pattern: z.string().describe('Pattern name'),
    detail: z.string().describe('Specific detail about this pattern'),
    severity: z.enum(['minor', 'notable', 'persistent']),
  })).describe('2-4 mistake patterns or habits'),
  skillScores: z.object({
    reading: z.number().describe('Reading comprehension score'),
    listening: z.number().describe('Listening comprehension score (estimate conservatively for text-only app)'),
    speaking: z.number().describe('Speaking/production ability score'),
    writing: z.number().describe('Writing ability score'),
    vocabulary: z.number().describe('Vocabulary breadth and depth score'),
    grammar: z.number().describe('Grammar accuracy and range score'),
  }),
})

export type LearnerAnalysis = z.infer<typeof analysisSchema>

export const GET = withAuth(async (_request, { userId }) => {
  const profile = await prisma.learnerProfile.findUniqueOrThrow({ where: { userId } })
  const level = getDifficultyLevel(profile.difficultyLevel)

  // Fetch last 20 sessions with duration >= 60s
  const sessions = await prisma.conversationSession.findMany({
    where: {
      userId,
      targetLanguage: profile.targetLanguage,
      durationSeconds: { gte: 60 },
    },
    select: {
      id: true,
      transcript: true,
      mode: true,
      durationSeconds: true,
      sessionPlan: true,
      timestamp: true,
    },
    orderBy: { timestamp: 'desc' },
    take: 20,
  })

  // Filter to sessions with >= 4 transcript messages, keep first 10
  const qualifyingSessions = sessions
    .filter((s) => {
      const transcript = s.transcript as { role: string; content: string }[] | null
      return Array.isArray(transcript) && transcript.length >= 4
    })
    .slice(0, 10)

  if (qualifyingSessions.length < 2) {
    return NextResponse.json({ status: 'insufficient_data' })
  }

  // Compress transcripts: last 15 messages per session, truncated to 300 chars each
  const compressedSessions = qualifyingSessions.map((s) => {
    const transcript = s.transcript as { role: string; content: string }[]
    const messages = transcript
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(-15)
      .map((m) => ({
        role: m.role,
        content: m.content.length > 300 ? m.content.slice(0, 300) + '...' : m.content,
      }))

    const plan = s.sessionPlan as Record<string, unknown> | null
    return {
      mode: s.mode,
      durationMinutes: Math.round((s.durationSeconds ?? 0) / 60),
      topic: plan?.topic || plan?.focus || 'Free conversation',
      messages,
    }
  })

  try {
    const { object } = await generateObject({
      model: anthropic('claude-haiku-4-5-20251001'),
      schema: analysisSchema,
      prompt: `You are a language learning analyst. Analyze the following conversation transcripts from a ${profile.targetLanguage} learner (native ${profile.nativeLanguage} speaker, self-assessed level: ${level.label}).

You have ${qualifyingSessions.length} conversation sessions to analyze. Assess the learner's abilities entirely from transcript evidence — look at their production quality, error patterns, vocabulary range, grammar accuracy, and communication strategies.

For skill scores (0-100):
- Base scores on what you observe in the transcripts
- "listening" and "reading" should be estimated conservatively since this is a text-only app — infer from comprehension shown in responses
- "speaking" maps to production quality in the target language
- "writing" maps to written accuracy and naturalness
- Be honest but not harsh — a beginner doing well at their level should still get reasonable scores relative to their level

${compressedSessions.map((s, i) => `--- Session ${i + 1} (${s.mode}, ${s.durationMinutes} min, topic: ${s.topic}) ---
${s.messages.map((m) => `[${m.role}]: ${m.content}`).join('\n')}`).join('\n\n')}`,
    })

    return NextResponse.json({ status: 'ok', analysis: object, sessionCount: qualifyingSessions.length })
  } catch (err) {
    console.error('[analysis] Failed to generate analysis:', err)
    return NextResponse.json({ error: 'Analysis generation failed' }, { status: 500 })
  }
})
