import { NextResponse } from 'next/server'
import { generateText } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
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

  return NextResponse.json(null)
})
