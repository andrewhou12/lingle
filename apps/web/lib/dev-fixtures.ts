/**
 * Synthetic session state fixtures for dev testing.
 * Only used in development — never imported in production routes.
 */
import type { RedisSessionState, LessonPlan, SlideContent, LessonPhase, WhiteboardContent } from '@lingle/shared'

const EMPTY_SLIDE: SlideContent = { phase: 'warmup', title: '', bullets: [] }

const BASE_PLAN: LessonPlan = {
  sessionId: '',
  warmup: { questionOfDay: 'How was your week?', personalHook: null, hookSource: null },
  review: { skip: true, vocabItems: [], grammarItems: [], errorsToRevisit: [] },
  core: { topic: 'Free conversation', angle: 'General discussion', targetGrammar: null, anticipatedErrors: [] },
  phaseBudgetMinutes: { warmup: 5, review: 0, core: 20, debrief: 4, closing: 3 },
  slides: [EMPTY_SLIDE],
}

export const FIXTURES: Record<string, (userId: string, sessionId: string, lessonId: string) => RedisSessionState> = {
  beginner: (userId, sessionId) => ({
    sessionId,
    lessonPlan: { ...BASE_PLAN, sessionId },
    currentPhase: 'closing' as LessonPhase,
    phaseStartTimeMs: Date.now(),
    phaseExtensionGranted: false,
    errorsLogged: [
      { sessionId, utteranceIndex: 2, userUtterance: '私は趣味が読書', errorType: 'grammar', errorDetail: 'Incorrect topic marker', correction: '私の趣味は読書です', severity: 'major', likelySttArtifact: false },
      { sessionId, utteranceIndex: 5, userUtterance: 'きのう本を読むました', errorType: 'grammar', errorDetail: 'Past tense conjugation error', correction: 'きのう本を読みました', severity: 'major', likelySttArtifact: false },
      { sessionId, utteranceIndex: 8, userUtterance: '東京は大きな', errorType: 'grammar', errorDetail: 'i-adjective predicate form', correction: '東京は大きいです', severity: 'minor', likelySttArtifact: false },
    ],
    correctionsQueued: [
      { sessionId, utteranceIndex: 2, userUtterance: '私は趣味が読書', errorType: 'grammar', errorDetail: 'Incorrect topic marker', correction: '私の趣味は読書です', severity: 'major', likelySttArtifact: false },
      { sessionId, utteranceIndex: 5, userUtterance: 'きのう本を読むました', errorType: 'grammar', errorDetail: 'Past tense conjugation error', correction: 'きのう本を読みました', severity: 'major', likelySttArtifact: false },
    ],
    whiteboardContent: {
      newMaterial: [
        { id: 'v1', addedAtPhase: 'core' as LessonPhase, content: '趣味 — hobby', type: 'vocab' as const },
        { id: 'v2', addedAtPhase: 'core' as LessonPhase, content: '仕事 — work', type: 'vocab' as const },
        { id: 'g1', addedAtPhase: 'core' as LessonPhase, content: 'topic marker は/の', type: 'grammar' as const },
      ],
      corrections: [],
    },
    currentSlide: EMPTY_SLIDE,
  }),

  intermediate: (userId, sessionId) => ({
    sessionId,
    lessonPlan: { ...BASE_PLAN, sessionId, core: { ...BASE_PLAN.core, topic: 'Weekend plans' } },
    currentPhase: 'closing' as LessonPhase,
    phaseStartTimeMs: Date.now(),
    phaseExtensionGranted: false,
    errorsLogged: [
      { sessionId, utteranceIndex: 3, userUtterance: '美味しいのレストラン', errorType: 'grammar', errorDetail: 'の particle with i-adjective', correction: '美味しいレストラン', severity: 'minor', likelySttArtifact: false },
      { sessionId, utteranceIndex: 7, userUtterance: '友達と行くつもり', errorType: 'grammar', errorDetail: 'Missing sentence-final です', correction: '友達と行くつもりです', severity: 'minor', likelySttArtifact: false },
    ],
    correctionsQueued: [
      { sessionId, utteranceIndex: 3, userUtterance: '美味しいのレストラン', errorType: 'grammar', errorDetail: 'の particle with i-adjective', correction: '美味しいレストラン', severity: 'minor', likelySttArtifact: false },
    ],
    whiteboardContent: {
      newMaterial: [
        { id: 'v1', addedAtPhase: 'core' as LessonPhase, content: '予約 — reservation', type: 'vocab' as const },
        { id: 'v2', addedAtPhase: 'core' as LessonPhase, content: 'おすすめ — recommendation', type: 'vocab' as const },
        { id: 'g1', addedAtPhase: 'core' as LessonPhase, content: 'つもり expression', type: 'grammar' as const },
      ],
      corrections: [],
    },
    currentSlide: EMPTY_SLIDE,
  }),

  advanced: (userId, sessionId) => ({
    sessionId,
    lessonPlan: { ...BASE_PLAN, sessionId, core: { ...BASE_PLAN.core, topic: 'Work-life balance in Japan' } },
    currentPhase: 'closing' as LessonPhase,
    phaseStartTimeMs: Date.now(),
    phaseExtensionGranted: false,
    errorsLogged: [
      { sessionId, utteranceIndex: 10, userUtterance: '日本で残業が多いにもかかわらず', errorType: 'grammar', errorDetail: 'Missing contrastive は', correction: '日本では残業が多いにもかかわらず', severity: 'minor', likelySttArtifact: false },
    ],
    correctionsQueued: [
      { sessionId, utteranceIndex: 10, userUtterance: '日本で残業が多いにもかかわらず', errorType: 'grammar', errorDetail: 'Missing contrastive は', correction: '日本では残業が多いにもかかわらず', severity: 'minor', likelySttArtifact: false },
    ],
    whiteboardContent: {
      newMaterial: [
        { id: 'v1', addedAtPhase: 'core' as LessonPhase, content: '残業 — overtime', type: 'vocab' as const },
        { id: 'v2', addedAtPhase: 'core' as LessonPhase, content: '有給休暇 — paid leave', type: 'vocab' as const },
        { id: 'g1', addedAtPhase: 'core' as LessonPhase, content: 'にもかかわらず — despite', type: 'grammar' as const },
      ],
      corrections: [],
    },
    currentSlide: EMPTY_SLIDE,
  }),
}

export const FIXTURE_NAMES = Object.keys(FIXTURES)
