import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-helpers'
import { withUsageCheck, getUsageInfo } from '@/lib/usage-guard'
import { prisma } from '@lingle/db'
import {
  getVocabTargets,
  getNextGrammarFocus,
  selectNextDomain,
  getGrammarStructuresInScope,
} from '@/lib/curriculum'
import { searchMemories } from '@/lib/memory'
import type { Prisma } from '@prisma/client'

export const maxDuration = 60

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

  // ── Build plan from curriculum data (no LLM call) ──

  const plan: Record<string, unknown> = {
    _mode: resolvedMode,
    domain,
    targetVocab: vocabTargets,
    grammarFocus: grammarFocus ? grammarFocus.displayName : null,
    reviewPatterns,
    level: levelLabel,
  }

  const systemPrompt = `You are a ${targetLanguage} language tutor at ${levelLabel} level.`

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
    errorPatterns: errorPatterns.length > 0 ? errorPatterns : undefined,
    lessonPlan: {
      warmupTopic: sessionFocus,
      mainActivity: sessionFocus,
      targetVocab: vocabTargets,
      grammarFocus: grammarFocus ? [grammarFocus.displayName] : [],
      reviewPatterns,
    },
    difficultyConstraints: {
      grammarStructuresInScope: grammarInScope.slice(0, 15),
    },
    correctionStyle: user.correctionStyle || 'recast',
    personalNotes: user.personalNotes || undefined,
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
