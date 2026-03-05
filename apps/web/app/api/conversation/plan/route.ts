import { NextResponse } from 'next/server'
import { generateObject } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'
import { withAuth } from '@/lib/api-helpers'
import { prisma } from '@lingle/db'
import { buildSystemPrompt } from '@/lib/experience-prompt'
import { getDifficultyLevel } from '@/lib/difficulty-levels'
import type { SessionPlan } from '@/lib/session-plan'
import type { Prisma } from '@prisma/client'

const sessionPlanSchema = z.object({
  focus: z.string().describe('One-line session description'),
  goals: z.array(z.string()).describe('2-4 specific learning objectives'),
  approach: z.string().describe('1-2 sentences on teaching strategy'),
  milestones: z
    .array(
      z.object({
        description: z.string(),
        completed: z.boolean().default(false),
      })
    )
    .describe('3-5 ordered checkpoints to hit during the session'),
  targetVocabulary: z
    .array(z.string())
    .optional()
    .describe('3-8 key vocabulary words to introduce or practice'),
  targetGrammar: z
    .array(z.string())
    .optional()
    .describe('1-3 grammar patterns to cover'),
  scenario: z
    .object({
      setting: z.string(),
      aiRole: z.string(),
      learnerGoal: z.string(),
      register: z.string(),
    })
    .optional()
    .describe('Conversation scenario details (conversation mode only)'),
})

export const POST = withAuth(async (request, { userId }) => {
  let prompt: string | undefined
  let mode: string | undefined
  try {
    const body = await request.json()
    if (body.prompt && typeof body.prompt === 'string') {
      prompt = body.prompt
    }
    if (body.mode && typeof body.mode === 'string') {
      mode = body.mode
    }
  } catch {
    // No body or invalid JSON
  }

  const profile = await prisma.learnerProfile.findUniqueOrThrow({ where: { userId } })

  const sessionFocus = prompt || 'Free conversation'
  const resolvedMode = mode || 'conversation'
  const level = getDifficultyLevel(profile.difficultyLevel)

  const systemPrompt = buildSystemPrompt({
    userPrompt: sessionFocus,
    mode: resolvedMode,
    difficultyLevel: profile.difficultyLevel,
    nativeLanguage: profile.nativeLanguage,
    targetLanguage: profile.targetLanguage,
  })

  // Generate structured session plan via Haiku
  let plan: SessionPlan
  try {
    const { object } = await generateObject({
      model: anthropic('claude-haiku-4-5-20251001'),
      schema: sessionPlanSchema,
      prompt: `You are a session planner for a language learning app.

User prompt: "${sessionFocus}"
Mode: ${resolvedMode}
Difficulty: ${level.label}
Target language: ${profile.targetLanguage}
Native language: ${profile.nativeLanguage}

Generate a session plan as JSON:
- focus: one-line session description
- goals: 2-4 specific learning objectives appropriate for the difficulty level
- approach: 1-2 sentences on teaching strategy for this session
- milestones: 3-5 ordered checkpoints to hit during the session (all start as not completed)
- targetVocabulary: 3-8 key words to introduce or practice (in ${profile.targetLanguage})
- targetGrammar: 1-3 grammar patterns to cover (if applicable)
- scenario: { setting, aiRole, learnerGoal, register } — ONLY include this if the user's prompt describes a specific situation (e.g. "ordering at a restaurant", "job interview"). If the prompt is generic like "Free conversation" or doesn't specify a scenario, OMIT the scenario field entirely.

IMPORTANT: Do NOT invent fictional settings or roleplay scenarios unless the user explicitly asked for one. A generic prompt means the learner just wants to chat naturally — no imagined locations or characters.

Make the plan specific to the user's prompt and difficulty level. Vocabulary and grammar should be appropriate for ${level.label} level.`,
    })
    plan = object as SessionPlan
  } catch (err) {
    console.error('[plan] Failed to generate session plan:', err)
    // Fallback to basic plan
    plan = {
      focus: sessionFocus,
      goals: ['Practice conversation', 'Build vocabulary'],
      approach: 'Natural conversation with gentle corrections.',
      milestones: [
        { description: 'Greet and establish context', completed: false },
        { description: 'Introduce target vocabulary', completed: false },
        { description: 'Practice in context', completed: false },
      ],
    }
  }

  const session = await prisma.conversationSession.create({
    data: {
      userId,
      transcript: [],
      targetsPlanned: {},
      targetsHit: [],
      errorsLogged: [],
      avoidanceEvents: [],
      sessionPlan: plan as unknown as Prisma.InputJsonValue,
      systemPrompt,
    },
  })

  await prisma.learnerProfile.update({
    where: { userId },
    data: { totalSessions: { increment: 1 } },
  })

  return NextResponse.json({ _sessionId: session.id, sessionFocus, plan })
})
