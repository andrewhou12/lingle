/**
 * Post-Session Analysis Pipeline (spec Section 2)
 *
 * 5-step sequential pipeline. Each step is resumable and idempotent.
 * Steps 1-3,5 use LLM (structured JSON only). Step 4 is algorithmic.
 *
 * Step 1: Error Classification
 * Step 2: Strength & Production Analysis
 * Step 3: Personal Facts Extraction
 * Step 4: CEFR Delta Computation (deterministic, no LLM)
 * Step 5: Session Summary Generation
 */
import { generateObject, generateText } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'
import { prisma } from '@lingle/db'
import type {
  RedisSessionState,
  ErrorLog,
  ErrorType,
  ErrorSeverity,
  Skill,
  SkillRecord,
  FluencySignals,
  SessionSummary,
  LessonPhase,
  PipelineStage,
  IntroducedItem,
} from '@lingle/shared'
import { cefrLabel } from '@lingle/shared'
import { computeCefrDeltas } from './cefr-updater'

// ─── Schema Definitions ─────────────────────────────────────────────────────

const errorClassificationSchema = z.object({
  errors: z.array(z.object({
    utteranceIndex: z.number(),
    userUtterance: z.string(),
    errorType: z.enum(['grammar', 'vocab', 'pronunciation', 'register', 'l1_interference']),
    errorDetail: z.string(),
    correction: z.string(),
    severity: z.enum(['pedantic', 'minor', 'major']),
    likelySttArtifact: z.boolean(),
  })),
})

const strengthAnalysisSchema = z.object({
  demonstratedSkills: z.array(z.object({
    skill: z.string(),
    masteryScore: z.number().min(1).max(4),
    evidence: z.string(),
  })),
  fluencySignals: z.object({
    hesitationCount: z.number(),
    l1SwitchCount: z.number(),
    selfCorrectionCount: z.number(),
    clarificationRequestCount: z.number(),
    qualitativeSummary: z.string(),
  }),
  producedVocab: z.array(z.string()).describe('Target-language vocabulary words the LEARNER (not tutor) actually used in speech. Only words in the target language, not L1.'),
  producedGrammar: z.array(z.string()).describe('Grammar patterns the LEARNER demonstrated using (e.g. "te-form", "passive voice", "conditional tara"). Only patterns they actually produced, not ones the tutor used.'),
})

const personalFactsSchema = z.object({
  newFacts: z.array(z.object({
    category: z.enum(['interest', 'family', 'work', 'event', 'preference', 'goal']),
    fact: z.string(),
    isTimeSensitive: z.boolean(),
  })),
})

const summarySchema = z.object({
  timeline: z.array(z.object({
    phase: z.string(),
    durationMinutes: z.number(),
    summary: z.string(),
  })),
  tutorInsights: z.array(z.string()),
  suggestedFocusNextSession: z.string(),
})

// ─── Pipeline Step Implementations ──────────────────────────────────────────

async function step1ErrorClassification(
  transcript: string,
  introducedItems: string[],
): Promise<ErrorLog[]> {
  const { object } = await generateObject({
    model: anthropic('claude-haiku-4-5-20251001'),
    schema: errorClassificationSchema,
    prompt: `Identify every language error in this lesson transcript. For each error, classify it according to the schema. Respond ONLY with valid JSON matching the schema below. Do not include any preamble, explanation, or markdown formatting.

If an error appears only once, is phonetically similar to a valid utterance, and the surrounding context shows no semantic disruption, set likelySttArtifact: true. These will be filtered before storage.

Transcript:
${transcript}

Items introduced this session (for context): ${introducedItems.join(', ') || 'none'}`,
  })

  // Filter out STT artifacts
  return object.errors
    .filter((e) => !e.likelySttArtifact)
    .map((e) => ({
      sessionId: '',
      utteranceIndex: e.utteranceIndex,
      userUtterance: e.userUtterance,
      errorType: e.errorType as ErrorType,
      errorDetail: e.errorDetail,
      correction: e.correction,
      severity: e.severity as ErrorSeverity,
      likelySttArtifact: false,
    }))
}

async function step2StrengthAnalysis(
  transcript: string,
  currentSkills: SkillRecord[],
  introducedItems: string[],
  curriculumVocab: string[],
  curriculumGrammar: Array<{ pattern: string; displayName: string }>,
): Promise<{ skills: Array<{ skill: string; masteryScore: number; evidence: string }>; fluency: FluencySignals; producedVocab: string[]; producedGrammar: string[] }> {
  const skillList = Object.values({
    INTRODUCE_SELF: 'introduce_self',
    GREET_FAREWELL: 'greet_farewell',
    TELL_TIME: 'tell_time',
    DESCRIBE_LOCATION: 'describe_location',
    TALK_ABOUT_FAMILY: 'talk_about_family',
    TALK_ABOUT_WORK: 'talk_about_work',
    MAKE_REQUESTS: 'make_requests',
    GIVE_OPINIONS: 'give_opinions',
    EXPRESS_AGREEMENT_DISAGREEMENT: 'express_agreement_disagreement',
    HANDLE_MISUNDERSTANDINGS: 'handle_misunderstandings',
    DISCUSS_PAST_EVENTS: 'discuss_past_events',
    DISCUSS_FUTURE_PLANS: 'discuss_future_plans',
    MAKE_COMPARISONS: 'make_comparisons',
    INTERJECT_NATURALLY: 'interject_naturally',
    HANDLE_PHONE_CALLS: 'handle_phone_calls',
    ORDER_FOOD: 'order_food',
    NAVIGATE_TRANSPORT: 'navigate_transport',
    SMALL_TALK: 'small_talk',
    DESCRIBE_EMOTIONS: 'describe_emotions',
    ARGUE_A_POINT: 'argue_a_point',
    NARRATE_A_STORY: 'narrate_a_story',
  }).join(', ')

  const vocabListStr = curriculumVocab.length > 0
    ? `\n\nVALID VOCABULARY (only emit words from this list for producedVocab):\n${curriculumVocab.join(', ')}`
    : ''

  const grammarListStr = curriculumGrammar.length > 0
    ? `\n\nVALID GRAMMAR PATTERNS (only emit pattern keys from this list for producedGrammar):\n${curriculumGrammar.map((g) => `${g.pattern} (${g.displayName})`).join(', ')}`
    : ''

  const { object } = await generateObject({
    model: anthropic('claude-haiku-4-5-20251001'),
    schema: strengthAnalysisSchema,
    prompt: `Identify demonstrated skills, fluency signals, and produced vocabulary/grammar from this lesson transcript. Respond ONLY with valid JSON matching the schema below. Do not include any preamble, explanation, or markdown formatting.

Only score skills that were directly and clearly evidenced in the transcript. Do not infer or extrapolate. If a skill was not evidenced, omit it from demonstratedSkills entirely.

For producedVocab: list target-language vocabulary words the LEARNER (not the tutor) actually used in speech. ONLY include words that appear in the VALID VOCABULARY list below. If a word the learner used is not in the list, omit it.

For producedGrammar: list grammar pattern KEYS the LEARNER demonstrated using. ONLY include patterns from the VALID GRAMMAR PATTERNS list below. Use the pattern key (e.g. "te_form"), not the display name.

Valid skills: ${skillList}

Current skill levels: ${currentSkills.filter((s) => s.mastery > 0).map((s) => `${s.skill}: ${s.mastery}`).join(', ') || 'none recorded'}

Items introduced this session: ${introducedItems.join(', ') || 'none'}${vocabListStr}${grammarListStr}

Transcript:
${transcript}`,
  })

  return {
    skills: object.demonstratedSkills,
    fluency: object.fluencySignals,
    producedVocab: object.producedVocab,
    producedGrammar: object.producedGrammar,
  }
}

async function step3PersonalFacts(
  transcript: string,
  existingRecentUpdates: string[],
): Promise<Array<{ category: string; fact: string; isTimeSensitive: boolean }>> {
  const { object } = await generateObject({
    model: anthropic('claude-haiku-4-5-20251001'),
    schema: personalFactsSchema,
    prompt: `Extract new personal facts about the user that are worth remembering for future sessions. Respond ONLY with valid JSON matching the schema below. Do not include any preamble, explanation, or markdown formatting.

Existing known facts (do not re-add): ${existingRecentUpdates.join('; ') || 'none'}

Transcript:
${transcript}`,
  })

  return object.newFacts
}

async function step5SummaryGeneration(params: {
  errors: ErrorLog[]
  fluencySignals: FluencySignals
  lessonPlan: Record<string, unknown>
  sessionDurationMinutes: number
  introducedItems: IntroducedItem[]
  cefrBefore: { grammar: number; fluency: number }
  cefrAfter: { grammar: number; fluency: number }
}): Promise<SessionSummary> {
  const keyErrors = params.errors.filter((e) => e.severity === 'major' || e.severity === 'minor')

  const { object } = await generateObject({
    model: anthropic('claude-haiku-4-5-20251001'),
    schema: summarySchema,
    prompt: `Generate a session summary for this completed language lesson. Respond ONLY with valid JSON.

Session duration: ${params.sessionDurationMinutes} minutes
Errors found: ${params.errors.length} (${keyErrors.length} major/minor)
Fluency: ${params.fluencySignals.qualitativeSummary}
Items introduced: ${params.introducedItems.map((i) => i.surface).join(', ') || 'none'}
CEFR before: Grammar ${params.cefrBefore.grammar.toFixed(1)}, Fluency ${params.cefrBefore.fluency.toFixed(1)}
CEFR after: Grammar ${params.cefrAfter.grammar.toFixed(1)}, Fluency ${params.cefrAfter.fluency.toFixed(1)}`,
  })

  return {
    timeline: object.timeline.map((t) => ({
      phase: t.phase as LessonPhase,
      durationMinutes: t.durationMinutes,
      summary: t.summary,
    })),
    introducedItems: params.introducedItems,
    keyErrors,
    tutorInsights: object.tutorInsights,
    suggestedFocusNextSession: object.suggestedFocusNextSession,
    cefrUpdate: {
      grammar: { before: params.cefrBefore.grammar, after: params.cefrAfter.grammar },
      fluency: { before: params.cefrBefore.fluency, after: params.cefrAfter.fluency },
    },
  }
}

// ─── Main Pipeline ──────────────────────────────────────────────────────────

export async function runPostSessionPipeline(
  sessionId: string,
  sessionState: RedisSessionState,
): Promise<{ summary: SessionSummary; errors: ErrorLog[] }> {
  const lesson = await prisma.lesson.findUniqueOrThrow({
    where: { id: sessionId },
    include: { introducedItems: true },
  })

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: lesson.userId },
    include: { learnerModel: true },
  })

  const durationMinutes = lesson.endedAt && lesson.startedAt
    ? Math.floor((lesson.endedAt.getTime() - lesson.startedAt.getTime()) / 60000)
    : 0

  // Build transcript text from session state errors (we don't have full transcript yet)
  // In production, this would come from the stored transcript
  const transcriptText = sessionState.errorsLogged
    .map((e) => `[Turn ${e.utteranceIndex}] User: ${e.userUtterance}`)
    .join('\n') || 'No transcript available.'

  const introducedSurfaces = sessionState.whiteboardContent.newMaterial
    .map((i) => i.content)

  const currentSkills: SkillRecord[] = user.learnerModel?.skills
    ? (user.learnerModel.skills as unknown as SkillRecord[])
    : []

  const cefrBefore = {
    grammar: user.learnerModel?.cefrGrammar ?? 1.0,
    fluency: user.learnerModel?.cefrFluency ?? 1.0,
  }

  // Load curriculum reference lists for constraining LLM extraction
  const [currVocabRows, currGrammarRows] = await Promise.all([
    prisma.curriculumVocab.findMany({
      where: { language: lesson.targetLanguage },
      select: { surface: true },
    }),
    prisma.curriculumGrammar.findMany({
      where: { language: lesson.targetLanguage },
      select: { pattern: true, displayName: true },
    }),
  ])
  const currVocab = currVocabRows.map((r) => r.surface)
  const currGrammar = currGrammarRows.map((r) => ({ pattern: r.pattern, displayName: r.displayName }))

  // ── Step 1: Error Classification ──
  await prisma.lesson.update({
    where: { id: sessionId },
    data: { pipelineStage: 'error_classification' as PipelineStage },
  })

  let classifiedErrors: ErrorLog[]
  try {
    classifiedErrors = await step1ErrorClassification(transcriptText, introducedSurfaces)
    // Set sessionId on all errors
    classifiedErrors = classifiedErrors.map((e) => ({ ...e, sessionId }))
  } catch (err) {
    console.error('[pipeline] Step 1 failed:', err)
    await prisma.lesson.update({ where: { id: sessionId }, data: { pipelineStage: 'error_classification' } })
    throw err
  }

  // ── Step 2: Strength Analysis ──
  await prisma.lesson.update({
    where: { id: sessionId },
    data: { pipelineStage: 'strength_analysis' as PipelineStage },
  })

  let fluencySignals: FluencySignals
  let demonstratedSkills: Array<{ skill: string; masteryScore: number; evidence: string }>
  let producedVocab: string[] = []
  let producedGrammar: string[] = []
  try {
    const result = await step2StrengthAnalysis(transcriptText, currentSkills, introducedSurfaces, currVocab, currGrammar)
    fluencySignals = result.fluency
    demonstratedSkills = result.skills
    producedVocab = result.producedVocab
    producedGrammar = result.producedGrammar
  } catch (err) {
    console.error('[pipeline] Step 2 failed:', err)
    throw err
  }

  // Upsert produced vocab/grammar items
  if (user.learnerModel && (producedVocab.length > 0 || producedGrammar.length > 0)) {
    const targetLang = lesson.targetLanguage
    const items = [
      ...producedVocab.map((s) => ({ type: 'vocab' as const, surface: s })),
      ...producedGrammar.map((s) => ({ type: 'grammar' as const, surface: s })),
    ]
    for (const item of items) {
      await prisma.producedItem.upsert({
        where: {
          userId_type_surface: { userId: user.id, type: item.type, surface: item.surface },
        },
        create: {
          userId: user.id,
          learnerModelId: user.learnerModel.id,
          type: item.type,
          surface: item.surface,
          targetLanguage: targetLang,
          occurrenceCount: 1,
        },
        update: {
          occurrenceCount: { increment: 1 },
          lastSeenAt: new Date(),
        },
      }).catch((err) => console.error(`[pipeline] ProducedItem upsert failed for "${item.surface}":`, err))
    }
    console.log(`[pipeline] Upserted ${producedVocab.length} vocab + ${producedGrammar.length} grammar produced items`)
  }

  // ── Step 3: Personal Facts ──
  await prisma.lesson.update({
    where: { id: sessionId },
    data: { pipelineStage: 'personal_facts' as PipelineStage },
  })

  try {
    const newFacts = await step3PersonalFacts(transcriptText, user.recentUpdates)
    if (newFacts.length > 0) {
      const newUpdates = [
        ...newFacts.map((f) => f.fact),
        ...user.recentUpdates,
      ].slice(0, 10) // Cap at 10

      await prisma.user.update({
        where: { id: user.id },
        data: { recentUpdates: newUpdates },
      })
    }
  } catch (err) {
    console.error('[pipeline] Step 3 failed (non-fatal):', err)
    // Non-fatal — continue pipeline
  }

  // ── Step 4: CEFR Delta (algorithmic, no LLM) ──
  await prisma.lesson.update({
    where: { id: sessionId },
    data: { pipelineStage: 'cefr_delta' as PipelineStage },
  })

  const { grammarDelta, fluencyDelta } = computeCefrDeltas(
    cefrBefore.grammar,
    cefrBefore.fluency,
    classifiedErrors,
    fluencySignals,
    durationMinutes,
    producedVocab.length,
    producedGrammar.length,
  )

  const cefrAfter = {
    grammar: Math.max(1.0, Math.min(6.0, cefrBefore.grammar + grammarDelta)),
    fluency: Math.max(1.0, Math.min(6.0, cefrBefore.fluency + fluencyDelta)),
  }

  // Update learner model
  if (user.learnerModel) {
    // Update skills
    const updatedSkills = [...currentSkills]
    for (const ds of demonstratedSkills) {
      const existing = updatedSkills.find((s) => s.skill === ds.skill)
      if (existing) {
        existing.mastery = ds.masteryScore as 0 | 1 | 2 | 3 | 4
        existing.lastEvidencedSessionId = sessionId
      } else {
        updatedSkills.push({
          skill: ds.skill as Skill,
          mastery: ds.masteryScore as 0 | 1 | 2 | 3 | 4,
          lastEvidencedSessionId: sessionId,
        })
      }
    }

    await prisma.learnerModel.update({
      where: { id: user.learnerModel.id },
      data: {
        cefrGrammar: cefrAfter.grammar,
        cefrFluency: cefrAfter.fluency,
        skills: JSON.parse(JSON.stringify(updatedSkills)),
        sessionCount: { increment: 1 },
        totalMinutes: { increment: durationMinutes },
        lastSessionDate: new Date(),
      },
    })
  }

  // Write error logs to DB
  if (classifiedErrors.length > 0) {
    await prisma.errorLog.createMany({
      data: classifiedErrors.map((e) => ({
        userId: user.id,
        lessonId: sessionId,
        utteranceIndex: e.utteranceIndex,
        userUtterance: e.userUtterance,
        errorType: e.errorType,
        errorDetail: e.errorDetail,
        correction: e.correction,
        severity: e.severity,
        likelySttArtifact: e.likelySttArtifact,
      })),
    })
  }

  // ── Step 5: Summary Generation ──
  await prisma.lesson.update({
    where: { id: sessionId },
    data: { pipelineStage: 'summary_generation' as PipelineStage },
  })

  let sessionSummary: SessionSummary
  try {
    sessionSummary = await step5SummaryGeneration({
      errors: classifiedErrors,
      fluencySignals,
      lessonPlan: (lesson.lessonPlan as Record<string, unknown>) ?? {},
      sessionDurationMinutes: durationMinutes,
      introducedItems: lesson.introducedItems.map((i) => ({
        id: i.id,
        userId: i.userId,
        sessionId: i.sessionId,
        type: i.type as 'vocab' | 'grammar' | 'phrase',
        surface: i.surface,
        translation: i.translation,
        notes: i.notes,
        introducedAt: i.introducedAt,
      })),
      cefrBefore,
      cefrAfter,
    })
  } catch (err) {
    console.error('[pipeline] Step 5 failed:', err)
    // Build minimal summary
    sessionSummary = {
      timeline: [],
      introducedItems: [],
      keyErrors: classifiedErrors.filter((e) => e.severity !== 'pedantic'),
      tutorInsights: [],
      suggestedFocusNextSession: '',
      cefrUpdate: {
        grammar: { before: cefrBefore.grammar, after: cefrAfter.grammar },
        fluency: { before: cefrBefore.fluency, after: cefrAfter.fluency },
      },
    }
  }

  // Generate corrections doc
  const keyErrors = classifiedErrors.filter((e) => e.severity === 'major' || e.severity === 'minor')
  const correctionsDoc = keyErrors.length > 0
    ? keyErrors.map((e, i) =>
        `${i + 1}. "${e.userUtterance}" → "${e.correction}"\n   ${e.errorDetail}`
      ).join('\n\n')
    : null

  // ── Mark pipeline complete ──
  await prisma.lesson.update({
    where: { id: sessionId },
    data: {
      pipelineStage: 'complete' as PipelineStage,
      pipelineCompletedAt: new Date(),
      sessionSummary: JSON.parse(JSON.stringify(sessionSummary)),
      correctionsDoc,
    },
  })

  console.log(`[pipeline] Session ${sessionId} complete: ${classifiedErrors.length} errors, grammar ${cefrBefore.grammar.toFixed(1)}→${cefrAfter.grammar.toFixed(1)}, fluency ${cefrBefore.fluency.toFixed(1)}→${cefrAfter.fluency.toFixed(1)}`)

  return { summary: sessionSummary, errors: classifiedErrors }
}
