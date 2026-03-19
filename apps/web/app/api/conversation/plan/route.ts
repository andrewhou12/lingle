import { NextResponse } from 'next/server'
import { generateObject } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'
import { withAuth } from '@/lib/api-helpers'

export const maxDuration = 60
import { withUsageCheck, getUsageInfo } from '@/lib/usage-guard'
import { prisma } from '@lingle/db'
import { getLanguageById } from '@/lib/languages'
import {
  getVocabTargets,
  getNextGrammarFocus,
  selectNextDomain,
  getGrammarStructuresInScope,
} from '@/lib/curriculum'
import { searchMemories } from '@/lib/memory'
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

function getCefrLabel(score: number): string {
  if (score < 1.5) return 'Absolute Beginner (A1)'
  if (score < 2.5) return 'Beginner (A1-A2)'
  if (score < 3.0) return 'Elementary (A2)'
  if (score < 3.5) return 'Pre-Intermediate (A2-B1)'
  if (score < 4.0) return 'Intermediate (B1)'
  if (score < 4.5) return 'Upper Intermediate (B1-B2)'
  if (score < 5.0) return 'Advanced (B2)'
  if (score < 5.5) return 'Upper Advanced (B2-C1)'
  if (score < 6.0) return 'Near-Native (C1)'
  return 'Native-Level (C2)'
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
  try {
    const body = await request.json()
    if (body.prompt && typeof body.prompt === 'string') prompt = body.prompt
    if (body.mode && typeof body.mode === 'string') mode = body.mode
  } catch {
    // No body or invalid JSON
  }

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: {
      learnerModel: {
        include: {
          errorPatterns: {
            orderBy: { occurrenceCount: 'desc' },
            take: 10,
          },
        },
      },
    },
  })

  const targetLanguage = user.targetLanguage ?? 'ja'
  const nativeLanguage = user.nativeLanguage ?? 'en'
  const cefrGrammar = user.learnerModel?.cefrGrammar ?? 2.0
  const cefrFluency = user.learnerModel?.cefrFluency ?? 2.0

  const sessionFocus = prompt || 'Free conversation'
  const resolvedMode = mode || 'conversation'
  const levelLabel = getCefrLabel(cefrGrammar)

  // ── Curriculum-driven planning ──

  const [vocabTargets, grammarFocus, grammarInScope, memoriesText] = await Promise.all([
    getVocabTargets(userId, targetLanguage, cefrGrammar, 5),
    getNextGrammarFocus(userId, targetLanguage, cefrGrammar),
    getGrammarStructuresInScope(targetLanguage, cefrGrammar),
    searchMemories(userId, sessionFocus, 10),
  ])

  const domain = selectNextDomain(user.learnerModel?.domainsVisited ?? [])

  // Error patterns for review
  const errorPatterns = (user.learnerModel?.errorPatterns ?? []).map((ep) => ({
    rule: ep.rule,
    occurrenceCount: ep.occurrenceCount,
    sessionCount: ep.sessionsSeen.length,
  }))
  const reviewPatterns = errorPatterns.slice(0, 3).map((ep) => ep.rule)

  // ── Generate conversation plan ──

  const langConfig = getLanguageById(targetLanguage)
  const registerOpts = langConfig?.registerOptions || '"casual", "polite", or "mixed"'
  const schema = buildConversationPlanSchema(registerOpts)

  let plan: SessionPlan
  try {
    const planPrompt = `You are a session planner for a language learning app.

User prompt: "${sessionFocus}"
Mode: ${resolvedMode}
Difficulty: ${levelLabel}
Target language: ${targetLanguage}
Native language: ${nativeLanguage}
Domain focus: ${domain}

Target vocabulary to work into conversation: ${vocabTargets.join(', ') || 'none'}
Grammar focus: ${grammarFocus?.displayName || 'general practice'}
Error patterns to address: ${reviewPatterns.join(', ') || 'none'}

Generate a scene card for a natural conversation:
- topic: what the conversation is about (be specific and engaging, incorporate the domain)
- persona: { relationship, personality } — who the AI is playing
- register: ${registerOpts}
- tone: the emotional quality
- setting: where the conversation takes place (optional)
- sections: 3-6 ordered sections forming a conversation skeleton

Make the plan specific to the user's prompt. Naturally incorporate opportunities for the target vocabulary and grammar.`

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

  // Attach curriculum data to plan for the agent
  plan.targetVocab = vocabTargets
  plan.grammarFocus = grammarFocus ? [grammarFocus.displayName] : []
  plan.reviewPatterns = reviewPatterns

  const systemPrompt = `You are a ${targetLanguage} conversation partner at ${levelLabel} level.`

  // ── Create Lesson + update user ──

  const [lesson, , { remainingSeconds, plan: userPlan }] = await Promise.all([
    prisma.lesson.create({
      data: {
        userId,
        targetLanguage,
        lessonGoal: sessionFocus,
        lessonPlan: plan as unknown as Prisma.InputJsonValue,
        systemPrompt,
      },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { totalLessons: { increment: 1 } },
    }),
    getUsageInfo(userId),
  ])

  // Update domain rotation
  if (user.learnerModel) {
    const visited = [...(user.learnerModel.domainsVisited ?? []), domain].slice(-10)
    prisma.learnerModel.update({
      where: { id: user.learnerModel.id },
      data: { domainsVisited: visited },
    }).catch(() => {}) // fire-and-forget
  }

  // ── Build expanded metadata for the agent ──

  const agentMetadata = {
    // Learner model summary
    learnerModel: user.learnerModel
      ? {
          cefrGrammar: user.learnerModel.cefrGrammar,
          cefrFluency: user.learnerModel.cefrFluency,
          sessionsCompleted: user.learnerModel.sessionsCompleted,
          weakAreas: user.learnerModel.priorityFocus
            ? [user.learnerModel.priorityFocus]
            : undefined,
        }
      : undefined,
    // Error patterns
    errorPatterns: errorPatterns.length > 0 ? errorPatterns : undefined,
    // Lesson plan for system prompt
    lessonPlan: {
      warmupTopic: (plan.sections as { description: string }[])?.[0]?.description || 'greeting',
      mainActivity: (plan.topic as string) || sessionFocus,
      targetVocab: vocabTargets,
      grammarFocus: grammarFocus ? [grammarFocus.displayName] : [],
      reviewPatterns,
    },
    // Difficulty constraints
    difficultyConstraints: {
      grammarStructuresInScope: grammarInScope.slice(0, 15),
    },
    // User preferences
    correctionStyle: user.correctionStyle || 'recast',
    personalNotes: user.personalNotes || undefined,
    // Episodic memories (Slot 4)
    memories: memoriesText || undefined,
  }

  return NextResponse.json({
    _sessionId: lesson.id,
    sessionFocus,
    plan,
    remainingSeconds,
    userPlan,
    agentMetadata,
  })
}))
