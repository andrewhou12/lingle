import { NextResponse } from 'next/server'
import { generateObject } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'
import { withAuth } from '@/lib/api-helpers'
import { withUsageCheck, getUsageInfo } from '@/lib/usage-guard'
import { prisma } from '@lingle/db'
import { writeSessionState } from '@/lib/redis'
import type {
  LessonPlan,
  SlideContent,
  RedisSessionState,
  LessonPhase,
  AgentMetadata,
  SkillRecord,
} from '@lingle/shared'
import { cefrLabel } from '@lingle/shared'

export const maxDuration = 60

// --- Helpers ---

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

// ── Topic Generation (the ONLY LLM call in planning) ────────────────────

const topicSchema = z.object({
  topic: z.string(),
  angle: z.string(),
  rationale: z.string(),
  targetGrammarElicited: z.string().nullable(),
  estimatedVocabDifficulty: z.enum(['A2', 'B1', 'B2']),
})

async function generateTopic(params: {
  userProfile: { interests: string[]; occupation: string | null; family: string | null; recentUpdates: string[] }
  cefrGrammar: number
  cefrFluency: number
  lastTopics: string[]
  lastErrors: Array<{ errorDetail: string; correction: string }>
  producedVocab: string[]
  producedGrammar: string[]
  curriculumVocabSuggestions: string[]
  curriculumGrammarSuggestions: string[]
}): Promise<z.infer<typeof topicSchema>> {
  const { userProfile, cefrGrammar, cefrFluency, lastTopics, lastErrors, producedVocab, producedGrammar } = params

  const profileLines: string[] = []
  if (userProfile.interests.length) profileLines.push(`Interests: ${userProfile.interests.join(', ')}`)
  if (userProfile.occupation) profileLines.push(`Occupation: ${userProfile.occupation}`)
  if (userProfile.family) profileLines.push(`Family: ${userProfile.family}`)
  if (userProfile.recentUpdates.length) profileLines.push(`Recent updates: ${userProfile.recentUpdates.join('; ')}`)

  const errorLines = lastErrors.slice(0, 5).map((e) => `- ${e.errorDetail} → ${e.correction}`)

  const vocabContext = producedVocab.length > 0
    ? `\nVocabulary the learner already uses (${producedVocab.length} words): ${producedVocab.slice(0, 30).join(', ')}${producedVocab.length > 30 ? '...' : ''}\nBuild on this vocabulary while introducing new related words.`
    : ''

  const grammarContext = producedGrammar.length > 0
    ? `\nGrammar patterns the learner already uses: ${producedGrammar.join(', ')}\nTarget a grammar pattern they haven't demonstrated yet.`
    : ''

  const curriculumContext = params.curriculumVocabSuggestions && params.curriculumVocabSuggestions.length > 0
    ? `\nSuggested new vocabulary to introduce (from curriculum at learner's level): ${params.curriculumVocabSuggestions.join(', ')}`
    : ''

  const currGrammarContext = params.curriculumGrammarSuggestions && params.curriculumGrammarSuggestions.length > 0
    ? `\nSuggested grammar targets (from curriculum, not yet produced by learner): ${params.curriculumGrammarSuggestions.join(', ')}`
    : ''

  const { object } = await generateObject({
    model: anthropic('claude-haiku-4-5-20251001'),
    schema: topicSchema,
    prompt: `You are a skilled language tutor planning a conversation topic for a student. Based on the learner profile below, propose ONE specific conversation topic for today's session. The topic should: feel natural given their interests and life context, be specific enough to generate real vocabulary (not just "talk about your day"), and naturally elicit the target grammar pattern if one is specified. Respond ONLY with JSON.

Learner profile:
${profileLines.join('\n') || 'No profile data yet'}

CEFR levels: Grammar ${cefrGrammar.toFixed(1)} (${cefrLabel(cefrGrammar)}), Fluency ${cefrFluency.toFixed(1)} (${cefrLabel(cefrFluency)})

Last 3 session topics (avoid repeating): ${lastTopics.join(', ') || 'none'}

${errorLines.length > 0 ? `Errors from last session (topic should naturally elicit practice of these):\n${errorLines.join('\n')}` : 'No recent errors.'}${vocabContext}${grammarContext}${curriculumContext}${currGrammarContext}`,
  })

  return object
}

// ── Slide Generation (pre-generated at plan time) ───────────────────────

function generateSlides(plan: LessonPlan): SlideContent[] {
  return [
    {
      phase: 'warmup' as LessonPhase,
      title: "今日のレッスン",
      bullets: [
        plan.warmup.questionOfDay,
        `Today's topic: ${plan.core.topic}`,
      ],
    },
    {
      phase: 'review' as LessonPhase,
      title: "前回の復習",
      bullets: plan.review.skip
        ? ['No review items — moving to today\'s topic']
        : [
            ...plan.review.vocabItems.map((v) => `Vocab: ${v}`),
            ...plan.review.grammarItems.map((g) => `Grammar: ${g}`),
            ...plan.review.errorsToRevisit.map((e) => `Error: ${e.errorDetail}`),
          ],
    },
    {
      phase: 'core' as LessonPhase,
      title: plan.core.topic,
      bullets: [
        plan.core.angle,
        ...(plan.core.targetGrammar ? [`Target grammar: ${plan.core.targetGrammar}`] : []),
      ],
    },
    {
      phase: 'debrief' as LessonPhase,
      title: "振り返り",
      bullets: ['Corrections from this session (populated live)'],
    },
    {
      phase: 'closing' as LessonPhase,
      title: "お疲れ様でした",
      bullets: ['Great work today!'],
    },
  ]
}

// ── Route Handler ──────────────────────────────────────────────────────

export const POST = withAuth(withUsageCheck(async (request, { userId }) => {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: {
      learnerModel: true,
    },
  })

  const targetLanguage = user.targetLanguage ?? 'ja'
  const nativeLanguage = user.nativeLanguage ?? 'en'
  const cefrGrammar = user.learnerModel?.cefrGrammar ?? 1.0
  const cefrFluency = user.learnerModel?.cefrFluency ?? 1.0
  const sessionDuration = user.sessionLengthMinutes ?? 30
  const isFirstSession = !user.learnerModel || (user.learnerModel.sessionCount === 0)

  // ── Load last session data for review ──

  const lastSession = await prisma.lesson.findFirst({
    where: { userId, endedAt: { not: null } },
    orderBy: { startedAt: 'desc' },
    include: {
      introducedItems: true,
      errorLogs: {
        where: { severity: { in: ['minor', 'major'] } },
      },
    },
  })

  // Last 3 session topics (avoid repetition)
  const recentLessons = await prisma.lesson.findMany({
    where: { userId, endedAt: { not: null } },
    orderBy: { startedAt: 'desc' },
    take: 3,
    select: { lessonPlan: true },
  })
  const lastTopics = recentLessons
    .map((l) => {
      const plan = l.lessonPlan as Record<string, unknown> | null
      return (plan?.core as Record<string, unknown>)?.topic as string | undefined
    })
    .filter(Boolean) as string[]

  // ── Assemble review items (from last session only) ──

  const reviewVocab = lastSession?.introducedItems
    .filter((i) => i.type === 'vocab')
    .map((i) => i.surface) ?? []
  const reviewGrammar = lastSession?.introducedItems
    .filter((i) => i.type === 'grammar')
    .map((i) => i.surface) ?? []
  const errorsToRevisit = lastSession?.errorLogs
    .slice(0, 5)
    .map((e) => ({
      userUtterance: e.userUtterance,
      correction: e.correction,
      errorDetail: e.errorDetail,
    })) ?? []

  const skipReview = isFirstSession || (reviewVocab.length === 0 && reviewGrammar.length === 0 && errorsToRevisit.length === 0)

  // ── Load produced vocab/grammar bank ──

  const producedItems = await prisma.producedItem.findMany({
    where: { userId },
    orderBy: { occurrenceCount: 'desc' },
    select: { type: true, surface: true },
  })
  const producedVocabBank = producedItems.filter((i) => i.type === 'vocab').map((i) => i.surface)
  const producedGrammarBank = producedItems.filter((i) => i.type === 'grammar').map((i) => i.surface)

  // ── Load curriculum targets at learner's level ──

  const level = cefrLabel(cefrGrammar)
  const [currVocabTargets, currGrammarFocus] = await Promise.all([
    prisma.curriculumVocab.findMany({
      where: { language: targetLanguage, cefrLevel: level },
      take: 50,
    }).then((rows) =>
      rows
        .filter((r) => !producedVocabBank.includes(r.surface))
        .slice(0, 20)
        .map((r) => ({ surface: r.surface, translation: r.translation, domain: r.domain }))
    ),
    prisma.curriculumGrammar.findMany({
      where: { language: targetLanguage, cefrLevel: level },
      take: 20,
    }).then((rows) =>
      rows
        .filter((r) => !producedGrammarBank.includes(r.pattern))
        .slice(0, 5)
        .map((r) => ({ pattern: r.pattern, displayName: r.displayName }))
    ),
  ])

  // ── Generate topic (single LLM call) ──

  const topicResult = await generateTopic({
    userProfile: {
      interests: user.interests,
      occupation: user.occupation,
      family: user.family,
      recentUpdates: user.recentUpdates,
    },
    cefrGrammar,
    cefrFluency,
    lastTopics,
    lastErrors: lastSession?.errorLogs.map((e) => ({
      errorDetail: e.errorDetail,
      correction: e.correction,
    })) ?? [],
    producedVocab: producedVocabBank,
    producedGrammar: producedGrammarBank,
    curriculumVocabSuggestions: currVocabTargets.map((v) => `${v.surface} (${v.translation})`),
    curriculumGrammarSuggestions: currGrammarFocus.map((g) => g.displayName),
  })

  // ── Phase budget (with redistribution when review is skipped) ──

  let phaseBudget = {
    warmup: 5,
    review: 8,
    core: Math.max(10, sessionDuration - 20),
    debrief: 4,
    closing: 3,
  }

  if (skipReview) {
    phaseBudget = {
      warmup: isFirstSession ? 8 : 8, // extended warmup
      review: 0,
      core: Math.max(10, sessionDuration - 15),
      debrief: 4,
      closing: 3,
    }
  }

  // ── Warmup hook from recentUpdates ──

  let personalHook: string | null = null
  let hookSource: string | null = null
  if (user.recentUpdates.length > 0) {
    personalHook = `Ask about: ${user.recentUpdates[0]}`
    hookSource = user.recentUpdates[0]
  }

  // ── Assemble LessonPlan ──

  const lessonPlanPartial: Omit<LessonPlan, 'sessionId' | 'slides'> = {
    warmup: {
      questionOfDay: isFirstSession
        ? "What's something interesting that happened this week?"
        : topicResult.topic.includes('?') ? topicResult.topic : "What's something interesting that happened recently?",
      personalHook,
      hookSource,
    },
    review: {
      skip: skipReview,
      vocabItems: reviewVocab,
      grammarItems: reviewGrammar,
      errorsToRevisit,
    },
    core: {
      topic: topicResult.topic,
      angle: topicResult.angle,
      targetGrammar: topicResult.targetGrammarElicited,
      anticipatedErrors: lastSession?.errorLogs.slice(0, 3).map((e) => e.errorDetail) ?? [],
    },
    phaseBudgetMinutes: phaseBudget,
  }

  // ── Create Lesson record ──

  const [lesson, , { remainingSeconds, plan: userPlan }] = await Promise.all([
    prisma.lesson.create({
      data: {
        userId,
        targetLanguage,
      },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { totalLessons: { increment: 1 } },
    }),
    getUsageInfo(userId),
  ])

  // Now we have sessionId — complete the plan
  const lessonPlan: LessonPlan = {
    ...lessonPlanPartial,
    sessionId: lesson.id,
    slides: [],
  }
  lessonPlan.slides = generateSlides(lessonPlan)

  // Store plan in lesson record
  await prisma.lesson.update({
    where: { id: lesson.id },
    data: {
      lessonPlan: JSON.parse(JSON.stringify(lessonPlan)),
    },
  })

  // ── Initialize Redis session state ──

  const initialState: RedisSessionState = {
    sessionId: lesson.id,
    lessonPlan: lessonPlan,
    currentPhase: 'warmup',
    phaseStartTimeMs: Date.now(),
    phaseExtensionGranted: false,
    errorsLogged: [],
    correctionsQueued: [],
    whiteboardContent: { newMaterial: [], corrections: [] },
    currentSlide: lessonPlan.slides[0],
  }

  await writeSessionState(initialState)

  // ── Build agent metadata ──

  const skills: SkillRecord[] = user.learnerModel?.skills
    ? (user.learnerModel.skills as unknown as SkillRecord[])
    : []

  const agentMetadata: AgentMetadata = {
    sessionId: lesson.id,
    lessonId: lesson.id,
    userId,
    targetLanguage: languageDisplayName(targetLanguage),
    nativeLanguage: languageDisplayName(nativeLanguage),
    learnerModel: user.learnerModel
      ? {
          cefrGrammar: user.learnerModel.cefrGrammar,
          cefrFluency: user.learnerModel.cefrFluency,
          skills,
          sessionCount: user.learnerModel.sessionCount,
          totalMinutes: user.learnerModel.totalMinutes,
        }
      : undefined,
    lessonPlan,
    userProfile: {
      name: user.name,
      interests: user.interests,
      occupation: user.occupation,
      family: user.family,
      goals: user.goals,
      recentUpdates: user.recentUpdates,
    },
    correctionStyle: (user.correctionStyle as 'recast' | 'explicit' | 'none') || 'recast',
    ttsProvider: user.ttsProvider as 'cartesia' | 'rime' | undefined,
    sttProvider: user.sttProvider as 'deepgram' | 'soniox' | undefined,
    voiceId: user.voiceId || undefined,
  }

  return NextResponse.json({
    _sessionId: lesson.id,
    lessonPlan,
    remainingSeconds,
    userPlan,
    agentMetadata,
  })
}))
