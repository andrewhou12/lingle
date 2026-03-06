import { NextResponse } from 'next/server'
import { generateText } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { withAuth } from '@/lib/api-helpers'
import { prisma } from '@lingle/db'
import type { Prisma } from '@prisma/client'

export const POST = withAuth(async (request, { userId: _userId }) => {
  const { sessionId } = await request.json()

  const dbSession = await prisma.conversationSession.findUnique({ where: { id: sessionId } })
  if (!dbSession) return NextResponse.json(null)

  const duration = Math.floor((Date.now() - dbSession.timestamp.getTime()) / 1000)

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
        prompt: `Given this Japanese language learning conversation, generate a very short title (3-7 words, English) that captures what was practiced. Be specific and descriptive. Do NOT use quotes. Examples: "Ordering ramen in Osaka", "て-form conjugation drill", "Job interview keigo practice", "NHK news article breakdown".

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
