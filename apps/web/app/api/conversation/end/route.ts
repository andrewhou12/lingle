import { NextResponse } from 'next/server'
import { generateText, generateObject } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'
import { withAuth } from '@/lib/api-helpers'
import { prisma } from '@lingle/db'
import type { Prisma } from '@prisma/client'

export const POST = withAuth(async (request, { userId }) => {
  void userId // used implicitly via dbSession.userId
  const { sessionId } = await request.json()

  const dbSession = await prisma.conversationSession.findUnique({ where: { id: sessionId } })
  if (!dbSession) return NextResponse.json(null)

  const duration = Math.min(
    Math.floor((Date.now() - dbSession.timestamp.getTime()) / 1000),
    3600 // cap at 60 min per session
  )

  // Generate a short title from the transcript
  let generatedTitle: string | undefined
  try {
    const transcript = dbSession.transcript as Array<{ role: string; content: string }>
    if (transcript && transcript.length >= 2) {
      // Take last 10 messages for context
      const recentMessages = transcript.slice(-10)
        .map((m) => `${m.role}: ${m.content}`)
        .join('\n')

      const { text } = await generateText({
        model: anthropic('claude-haiku-4-5-20251001'),
        prompt: `Given this language learning conversation, generate a very short title (3-7 words, English) that captures what was practiced. Be specific and descriptive. Do NOT use quotes. Examples: "Ordering food at a restaurant", "Grammar conjugation drill", "Formal speech practice", "News article breakdown".

Conversation (last messages):
${recentMessages}

Title:`,
        maxOutputTokens: 30,
      })
      generatedTitle = text.trim().replace(/^["']|["']$/g, '')
    }
  } catch (err) {
    console.error('[end] Failed to generate session title:', err)
  }

  // Post-session analysis: extract targets hit, errors, avoidance
  let errorsLogged: Prisma.InputJsonValue = dbSession.errorsLogged ?? []
  let avoidanceEvents: Prisma.InputJsonValue = dbSession.avoidanceEvents ?? []
  try {
    const transcript = dbSession.transcript as Array<{ role: string; content: string }> | null
    if (transcript && transcript.length >= 4) {
      const fullTranscript = transcript
        .map((m) => `${m.role}: ${m.content}`)
        .join('\n')

      const postSessionSchema = z.object({
        targetsHit: z.array(z.string()).describe('Vocabulary/grammar successfully produced by the learner'),
        errorsLogged: z.array(z.object({
          errorType: z.string(),
          contextQuote: z.string(),
          explanation: z.string(),
        })),
        avoidanceEvents: z.array(z.object({
          pattern: z.string(),
          contextQuote: z.string(),
        })),
        overallAssessment: z.string(),
        difficultyAppropriate: z.boolean(),
      })

      const { object: analysis } = await generateObject({
        model: anthropic('claude-haiku-4-5-20251001'),
        schema: postSessionSchema,
        prompt: `Analyze this language learning conversation session. Identify what the learner produced correctly, errors they made, and patterns they may be avoiding.

Session transcript:
${fullTranscript}

Be selective — only flag genuine errors and clear avoidance patterns. Most learner utterances are fine.`,
      })

      errorsLogged = analysis.errorsLogged as unknown as Prisma.InputJsonValue
      avoidanceEvents = analysis.avoidanceEvents as unknown as Prisma.InputJsonValue

      console.log('[end] post-session analysis:', {
        targetsHit: analysis.targetsHit.length,
        errors: analysis.errorsLogged.length,
        avoidance: analysis.avoidanceEvents.length,
        assessment: analysis.overallAssessment,
      })
    }
  } catch (err) {
    console.error('[end] Failed to run post-session analysis:', err)
  }

  // Store the title in sessionPlan JSON
  const planData = (dbSession.sessionPlan ?? {}) as Record<string, unknown>
  if (generatedTitle) {
    planData.generatedTitle = generatedTitle
  }

  await prisma.conversationSession.update({
    where: { id: sessionId },
    data: {
      durationSeconds: duration,
      sessionPlan: planData as Prisma.InputJsonValue,
      errorsLogged,
      avoidanceEvents,
    },
  })

  // Accumulate daily usage
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  await prisma.dailyUsage.upsert({
    where: { userId_date: { userId: dbSession.userId, date: today } },
    create: {
      userId: dbSession.userId,
      date: today,
      conversationSeconds: duration,
    },
    update: {
      conversationSeconds: { increment: duration },
    },
  })
  // Update streak on the learner profile
  const profile = await prisma.learnerProfile.findUnique({ where: { userId: dbSession.userId } })
  if (profile) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    let newStreak = profile.currentStreak
    if (profile.lastActiveDate) {
      const lastActive = new Date(profile.lastActiveDate)
      lastActive.setHours(0, 0, 0, 0)

      if (lastActive.getTime() === today.getTime()) {
        // Already active today — no change
      } else if (lastActive.getTime() === yesterday.getTime()) {
        newStreak = profile.currentStreak + 1
      } else {
        newStreak = 1
      }
    } else {
      newStreak = 1
    }

    await prisma.learnerProfile.update({
      where: { userId: dbSession.userId },
      data: {
        currentStreak: newStreak,
        longestStreak: Math.max(profile.longestStreak, newStreak),
        lastActiveDate: new Date(),
        totalSessions: profile.totalSessions + 1,
      },
    })
  }

  return NextResponse.json(null)
})
