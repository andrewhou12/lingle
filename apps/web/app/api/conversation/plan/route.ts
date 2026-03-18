import { NextResponse } from 'next/server'
import { generateObject } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'
import { withAuth } from '@/lib/api-helpers'

export const maxDuration = 60
import { withUsageCheck, getUsageInfo } from '@/lib/usage-guard'
import { prisma } from '@lingle/db'
import { getLanguageById } from '@/lib/languages'
import type { Prisma } from '@prisma/client'

// --- Plan schema ---

function buildConversationPlanSchema(registerOptions: string) {
  return z.object({
    topic: z.string().describe('What the conversation is about'),
    persona: z.object({
      name: z.string().optional(),
      relationship: z.string(),
      personality: z.string(),
    }),
    register: z.string().describe(registerOptions),
    tone: z.string(),
    setting: z.string().optional(),
    sections: z.array(z.object({
      id: z.string(),
      label: z.string(),
      description: z.string(),
    })).describe('3-6 ordered conversation sections'),
  })
}

// --- Helpers ---

function getDifficultyLabel(level: number): string {
  const labels: Record<number, string> = {
    1: 'Absolute Beginner (A1)',
    2: 'Beginner (A1-A2)',
    3: 'Elementary (A2)',
    4: 'Pre-Intermediate (A2-B1)',
    5: 'Intermediate (B1)',
    6: 'Upper Intermediate (B1-B2)',
    7: 'Advanced (B2)',
    8: 'Upper Advanced (B2-C1)',
    9: 'Near-Native (C1)',
    10: 'Native-Level (C2)',
  }
  return labels[level] || `Level ${level}`
}

type SessionPlan = Record<string, unknown>

function normalizePlan(obj: Record<string, unknown>): SessionPlan {
  return { ...obj, _mode: 'conversation' }
}

function getFallbackPlan(sessionFocus: string): SessionPlan {
  return normalizePlan({
    topic: sessionFocus,
    persona: {
      relationship: 'conversation partner',
      personality: 'friendly and helpful',
    },
    register: 'polite',
    tone: 'lighthearted',
    sections: [
      { id: 'greeting', label: 'Greeting', description: 'Warm greeting and set the scene' },
      { id: 'main-topic', label: 'Main Topic', description: 'Explore the main conversation topic' },
      { id: 'wrap-up', label: 'Wrap-up', description: 'Wind down and say goodbye naturally' },
    ],
  })
}

export const POST = withAuth(withUsageCheck(async (request, { userId }) => {
  let prompt: string | undefined
  let mode: string | undefined
  let inputMode: string | undefined
  try {
    const body = await request.json()
    if (body.prompt && typeof body.prompt === 'string') prompt = body.prompt
    if (body.mode && typeof body.mode === 'string') mode = body.mode
    if (body.inputMode && typeof body.inputMode === 'string') inputMode = body.inputMode
  } catch {
    // No body or invalid JSON
  }

  const profile = await prisma.learnerProfile.findUniqueOrThrow({ where: { userId } })

  const sessionFocus = prompt || 'Free conversation'
  const resolvedMode = mode || 'conversation'
  const levelLabel = getDifficultyLabel(profile.difficultyLevel)

  const langConfig = getLanguageById(profile.targetLanguage)
  const registerOpts = langConfig?.registerOptions || '"casual", "polite", or "mixed"'

  const schema = buildConversationPlanSchema(registerOpts)
  let plan: SessionPlan
  try {
    const planPrompt = `You are a session planner for a language learning app.

User prompt: "${sessionFocus}"
Mode: ${resolvedMode}
Difficulty: ${levelLabel}
Target language: ${profile.targetLanguage}
Native language: ${profile.nativeLanguage}

Generate a scene card for a natural conversation:
- topic: what the conversation is about (be specific and engaging)
- persona: { relationship, personality } — who the AI is playing
- register: ${registerOpts}
- tone: the emotional quality
- setting: where the conversation takes place (optional)
- sections: 3-6 ordered sections forming a conversation skeleton

Make the plan specific to the user's prompt.`

    const { object } = await generateObject({
      model: anthropic('claude-haiku-4-5-20251001'),
      schema,
      prompt: planPrompt,
    })
    plan = normalizePlan(object)
  } catch (err) {
    console.error('[plan] Failed to generate session plan:', err)
    plan = getFallbackPlan(sessionFocus)
  }

  const systemPrompt = `You are a ${profile.targetLanguage} conversation partner at ${levelLabel} level.`

  const [session, , { remainingSeconds, plan: userPlan }] = await Promise.all([
    prisma.conversationSession.create({
      data: {
        userId,
        mode: resolvedMode,
        inputMode: inputMode || null,
        targetLanguage: profile.targetLanguage,
        transcript: [],
        targetsPlanned: {},
        targetsHit: [],
        errorsLogged: [],
        avoidanceEvents: [],
        sessionPlan: plan as unknown as Prisma.InputJsonValue,
        systemPrompt,
      },
    }),
    prisma.learnerProfile.update({
      where: { userId },
      data: { totalSessions: { increment: 1 } },
    }),
    getUsageInfo(userId),
  ])

  return NextResponse.json({ _sessionId: session.id, sessionFocus, plan, remainingSeconds, userPlan })
}))
