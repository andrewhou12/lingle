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
import { writeSessionState } from '@/lib/redis'
import type { Prisma } from '@prisma/client'
import type {
  StructuredLessonPlan,
  PhaseDefinition,
  DifficultyConstraints,
  SessionState,
} from '@lingle/shared'

export const maxDuration = 60

// --- Helpers ---

/** Map ISO 639-1 language codes to display names expected by the agent */
const LANGUAGE_DISPLAY_NAMES: Record<string, string> = {
  ja: 'Japanese',
  en: 'English',
  ko: 'Korean',
  zh: 'Mandarin Chinese',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
}

function languageDisplayName(code: string): string {
  return LANGUAGE_DISPLAY_NAMES[code] || code
}

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

function cefrLabel(score: number): string {
  if (score < 1.5) return 'A1'
  if (score < 2.5) return 'A2'
  if (score < 3.5) return 'B1'
  if (score < 4.5) return 'B2'
  if (score < 5.5) return 'C1'
  return 'C2'
}

/** Map domains to discussion prompt templates */
const DOMAIN_PROMPTS: Record<string, string[]> = {
  food: [
    'Ask what they like to cook or eat, and why',
    'Discuss a memorable meal or restaurant experience',
    'Talk about food differences between their culture and the target language culture',
  ],
  travel: [
    'Ask about a place they have visited or want to visit',
    'Discuss what they enjoy most about traveling',
    'Talk about a surprising or funny travel experience',
  ],
  work: [
    'Ask about their job or daily routine',
    'Discuss what they find challenging or rewarding about their work',
    'Talk about how work culture differs across countries',
  ],
  health: [
    'Ask about their exercise or wellness habits',
    'Discuss how they stay healthy or deal with stress',
    'Talk about seasonal changes and how they affect daily life',
  ],
  relationships: [
    'Ask about their friends or family',
    'Discuss what they value in friendships',
    'Talk about how they keep in touch with people they care about',
  ],
  hobbies: [
    'Ask about hobbies or things they do in their free time',
    'Discuss something new they have been trying recently',
    'Talk about a hobby they would like to start',
  ],
  general: [
    'Ask about their week and anything interesting that happened',
    'Discuss something they have been thinking about lately',
    'Talk about a goal they are working toward',
  ],
  culture: [
    'Ask about cultural differences they have noticed',
    'Discuss a movie, book, or show they enjoyed recently',
    'Talk about traditions or celebrations they look forward to',
  ],
  technology: [
    'Ask about apps or tools they use every day',
    'Discuss how technology has changed something in their life',
    'Talk about a piece of technology they find interesting or frustrating',
  ],
  nature: [
    'Ask about their favorite season and why',
    'Discuss outdoor activities they enjoy',
    'Talk about a natural place that is special to them',
  ],
}

// ── Structured Plan Builder (algorithmic, no LLM) ──────────────────────

function deriveDifficultyConstraints(
  cefrGrammar: number,
  grammarInScope: string[],
): DifficultyConstraints {
  let maxSentenceComplexity: DifficultyConstraints['maxSentenceComplexity'] = 'simple'
  let vocabularyTier: DifficultyConstraints['vocabularyTier'] = 'high_frequency'
  let allowL1Support = true

  if (cefrGrammar >= 3.0) {
    maxSentenceComplexity = 'compound'
    vocabularyTier = 'intermediate'
  }
  if (cefrGrammar >= 4.0) {
    maxSentenceComplexity = 'complex'
    vocabularyTier = 'intermediate_advanced'
    allowL1Support = false
  }
  if (cefrGrammar >= 5.0) {
    vocabularyTier = 'advanced'
  }

  return {
    grammarStructuresInScope: grammarInScope.slice(0, 15),
    maxSentenceComplexity,
    vocabularyTier,
    allowL1Support,
  }
}

function buildStructuredPlan(params: {
  sessionDurationMinutes: number
  domain: string
  cefrLevel: string
  targetLanguage: string
  grammarFocus: { pattern: string; displayName: string } | null
  vocabTargets: string[]
  reviewErrors: Array<{ rule: string; phrase: string; correction: string }>
  memories: string | null
  difficultyConstraints: DifficultyConstraints
}): StructuredLessonPlan {
  const dur = params.sessionDurationMinutes
  const domain = params.domain
  const prompts = DOMAIN_PROMPTS[domain] || DOMAIN_PROMPTS.general

  // Timing proportions: warmup 15%, review 10%, core 45%, debrief 20%, close 10%
  const phases: PhaseDefinition[] = [
    {
      phase: 'warmup',
      targetMinutes: Math.round(dur * 0.15),
      correctionMode: 'silent',
      instructions: [
        `Start with friendly small talk in ${params.targetLanguage}.`,
        `Ask about their week or something personal related to "${domain}".`,
        `Keep it light — this is about easing into the target language at low stakes.`,
        params.memories ? `You know from past sessions: ${params.memories}` : '',
      ].filter(Boolean).join(' '),
      content: {
        topic: domain,
      },
    },
    {
      phase: 'review',
      targetMinutes: Math.max(2, Math.round(dur * 0.10)),
      correctionMode: 'recast_only',
      instructions: params.reviewErrors.length > 0
        ? [
            `Briefly check in on material from recent sessions.`,
            `Naturally bring up contexts where these errors tend to occur — don't quiz directly.`,
            `If the learner produces the correct form, note it as a strength and move on.`,
            `If they make the same error, recast naturally and move on.`,
          ].join(' ')
        : `No specific errors to review. Briefly warm up with a question about recent ${params.targetLanguage} practice or something they learned recently.`,
      content: {
        reviewErrors: params.reviewErrors.length > 0 ? params.reviewErrors : undefined,
        vocabTargets: params.vocabTargets.slice(0, 2),
      },
    },
    {
      phase: 'core',
      targetMinutes: Math.round(dur * 0.45),
      correctionMode: 'recast_only',
      instructions: [
        `Free conversation about "${domain}". Guide the discussion using the prompts below.`,
        `Create natural contexts that elicit the target vocabulary.`,
        params.grammarFocus
          ? `Look for opportunities to model "${params.grammarFocus.displayName}" in your speech and invite the learner to try using it.`
          : '',
        `Keep turns short (1-3 sentences). This is a conversation, not a lecture.`,
      ].filter(Boolean).join(' '),
      content: {
        topic: domain,
        discussionPrompts: prompts,
        vocabTargets: params.vocabTargets,
        grammarPattern: params.grammarFocus?.displayName ?? undefined,
      },
    },
    {
      phase: 'debrief',
      targetMinutes: Math.round(dur * 0.20),
      correctionMode: 'active',
      instructions: [
        `Review the top 2-3 errors from this session. For each error:`,
        `1. Say what the learner said and what the natural form would be.`,
        `2. Model a sentence using the correct form.`,
        `3. Ask the learner to try saying it.`,
        `4. Confirm briefly and move to the next one.`,
        `Use whiteboardWriteCorrection to show each correction visually.`,
        `Keep it to 3 corrections max. Do NOT lecture or give long grammar explanations.`,
        `Correct, model, move on.`,
      ].join(' '),
      content: {},
    },
    {
      phase: 'close',
      targetMinutes: Math.max(2, Math.round(dur * 0.10)),
      correctionMode: 'silent',
      instructions: [
        `Wrap up warmly. Mention 1-2 vocabulary words from this session to keep practicing.`,
        `Give a brief preview of what you'd like to work on next time.`,
        `End with an encouraging note about something specific they did well today.`,
        `Then call endLesson.`,
      ].join(' '),
      content: {},
    },
  ]

  return {
    sessionDurationMinutes: dur,
    domain,
    cefrLevel: params.cefrLevel,
    grammarFocus: params.grammarFocus?.displayName ?? null,
    vocabTargets: params.vocabTargets,
    phases,
    difficultyConstraints: params.difficultyConstraints,
  }
}

// ── Route Handler ──────────────────────────────────────────────────────

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
  const sessionDuration = user.sessionLengthMinutes ?? 25

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

  // Error patterns for review (with examples from recent ErrorLog records)
  const errorPatterns = (user.learnerModel?.errorPatterns ?? []).map((ep) => ({
    rule: ep.rule,
    occurrenceCount: ep.occurrenceCount,
    sessionCount: ep.sessionsSeen.length,
  }))

  // Fetch concrete error examples for the review phase
  const topErrorRules = errorPatterns.slice(0, 3).map((ep) => ep.rule)
  const recentErrorLogs = topErrorRules.length > 0
    ? await prisma.errorLog.findMany({
        where: {
          userId,
          rule: { in: topErrorRules },
        },
        orderBy: { loggedAt: 'desc' },
        take: 10,
        select: { rule: true, phrase: true, correction: true },
      })
    : []

  // Deduplicate: one example per rule
  const reviewErrors: Array<{ rule: string; phrase: string; correction: string }> = []
  const seenRules = new Set<string>()
  for (const log of recentErrorLogs) {
    if (log.rule && !seenRules.has(log.rule)) {
      seenRules.add(log.rule)
      reviewErrors.push({ rule: log.rule, phrase: log.phrase, correction: log.correction })
    }
  }

  // ── Build structured lesson plan ──

  const difficultyConstraints = deriveDifficultyConstraints(cefrGrammar, grammarInScope)

  const structuredPlan = buildStructuredPlan({
    sessionDurationMinutes: sessionDuration,
    domain,
    cefrLevel: cefrLabel(cefrGrammar),
    targetLanguage,
    grammarFocus,
    vocabTargets,
    reviewErrors,
    memories: memoriesText || null,
    difficultyConstraints,
  })

  // Legacy plan object (stored in DB for backward compat)
  const plan: Record<string, unknown> = {
    _mode: resolvedMode,
    domain,
    targetVocab: vocabTargets,
    grammarFocus: grammarFocus ? grammarFocus.displayName : null,
    reviewPatterns: topErrorRules,
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

  // Update domain rotation (fire-and-forget)
  if (user.learnerModel) {
    const visited = [...(user.learnerModel.domainsVisited ?? []), domain].slice(-10)
    prisma.learnerModel.update({
      where: { id: user.learnerModel.id },
      data: { domainsVisited: visited },
    }).catch(() => {})
  }

  // ── Initialize session state in Redis ──

  const initialState: SessionState = {
    sessionId: lesson.id,
    userId,
    lessonId: lesson.id,
    lessonPhase: 'warmup' as const,
    targetLanguage,
    nativeLanguage,
    lessonGoal: sessionFocus,
    difficultyLevel: Math.max(1, Math.min(5, Math.round(cefrGrammar))),
    errorsLogged: [],
    topicsCovered: [],
    vocabIntroduced: [],
    strengthsNoted: [],
    corrections: [],
    memoriesQueued: [],
    elapsedMinutes: 0,
    lessonDurationTarget: sessionDuration,
    avgResponseLatencySec: 0,
    responseLatencies: [],
    difficultyConstraints,
    compactionCount: 0,
    conversationTokenEstimate: 0,
    // v1 structured plan fields
    structuredPlan,
    currentPhaseIndex: 0,
    phaseStartedAt: Date.now(),
    phasesCompleted: [],
    timePressure: 'on_track',
    deferredTopics: [],
    nextSessionPriority: [],
  }

  await writeSessionState(initialState)

  // ── Build agent metadata ──

  const agentMetadata = {
    targetLanguage: languageDisplayName(targetLanguage),
    nativeLanguage: languageDisplayName(nativeLanguage),
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
    structuredPlan,
    correctionStyle: user.correctionStyle || 'recast',
    personalNotes: user.personalNotes || undefined,
    memories: memoriesText || undefined,
    // Voice pipeline overrides (null = use defaults)
    ttsProvider: user.ttsProvider || undefined,
    sttProvider: user.sttProvider || undefined,
    voiceId: user.voiceId || undefined,
  }

  return NextResponse.json({
    _sessionId: lesson.id,
    sessionFocus,
    plan,
    structuredPlan,
    remainingSeconds,
    userPlan,
    agentMetadata,
  })
}))
