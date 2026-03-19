/**
 * Synthetic session state fixtures for dev testing.
 * Only used in development — never imported in production routes.
 */
import type { SessionState } from '@lingle/shared'

const BASE: Omit<SessionState, 'sessionId' | 'userId' | 'lessonId'> = {
  lessonPhase: 'wrapup',
  targetLanguage: 'Japanese',
  nativeLanguage: 'English',
  lessonGoal: 'Free conversation',
  difficultyLevel: 2,
  errorsLogged: [],
  topicsCovered: [],
  vocabIntroduced: [],
  strengthsNoted: [],
  corrections: [],
  memoriesQueued: [],
  elapsedMinutes: 8,
  lessonDurationTarget: 20,
  avgResponseLatencySec: 1.2,
  responseLatencies: [1.1, 1.3, 1.0, 1.4, 1.2],
  difficultyConstraints: {
    grammarStructuresInScope: ['です/ます', 'て-form', 'adjective conjugation'],
    maxSentenceComplexity: 'compound',
    vocabularyTier: 'high_frequency',
    allowL1Support: true,
  },
  compactionCount: 0,
  conversationTokenEstimate: 3200,
}

export const FIXTURES: Record<string, (userId: string, sessionId: string, lessonId: string) => SessionState> = {
  beginner: (userId, sessionId, lessonId) => ({
    ...BASE,
    sessionId,
    userId,
    lessonId,
    difficultyLevel: 2,
    lessonGoal: 'Self-introduction practice',
    topicsCovered: ['greeting', 'self-introduction', 'hobbies'],
    vocabIntroduced: ['趣味', '仕事', '出身'],
    strengthsNoted: ['Good pronunciation of basic greetings'],
    errorsLogged: [
      { errorType: 'grammar', phrase: '私は趣味が読書', correction: '私の趣味は読書です', rule: 'topic_marker_wa', timestamp: new Date().toISOString() },
      { errorType: 'grammar', phrase: 'きのう本を読むました', correction: 'きのう本を読みました', rule: 'past_tense_conjugation', timestamp: new Date().toISOString() },
      { errorType: 'vocabulary', phrase: '作る食べ物', correction: '料理する', rule: 'word_choice_cook', timestamp: new Date().toISOString() },
      { errorType: 'grammar', phrase: '友達に会うたい', correction: '友達に会いたい', rule: 'tai_form_conjugation', timestamp: new Date().toISOString() },
      { errorType: 'grammar', phrase: '東京は大きな', correction: '東京は大きいです', rule: 'i_adjective_predicate', timestamp: new Date().toISOString() },
    ],
    corrections: [
      { phrase: '私は趣味が読書', correction: '私の趣味は読書です', rule: 'topic_marker_wa', explanation: 'Use の to show possession and は to mark the topic.' },
      { phrase: 'きのう本を読むました', correction: 'きのう本を読みました', rule: 'past_tense_conjugation', explanation: 'The past tense of 読む is 読みました, not 読むました.' },
      { phrase: '東京は大きな', correction: '東京は大きいです', rule: 'i_adjective_predicate', explanation: 'い-adjectives keep their い ending when used as predicates. Add です for politeness.' },
    ],
    memoriesQueued: [
      { content: 'Learner enjoys reading mystery novels', memoryType: 'personal_fact' },
      { content: 'Works as a software engineer', memoryType: 'personal_fact' },
    ],
    elapsedMinutes: 8,
  }),

  intermediate: (userId, sessionId, lessonId) => ({
    ...BASE,
    sessionId,
    userId,
    lessonId,
    difficultyLevel: 3,
    lessonGoal: 'Discussing weekend plans',
    topicsCovered: ['weekend_plans', 'restaurants', 'recommendations'],
    vocabIntroduced: ['予約', '雰囲気', 'おすすめ', '混んでいる', '席'],
    strengthsNoted: ['Natural use of て-form connections', 'Good listener comprehension at B1'],
    errorsLogged: [
      { errorType: 'grammar', phrase: '友達と行くつもり', correction: '友達と行くつもりです', rule: 'sentence_final_です', timestamp: new Date().toISOString() },
      { errorType: 'register', phrase: '予約した？', correction: '予約しましたか？', rule: 'politeness_level', timestamp: new Date().toISOString() },
      { errorType: 'grammar', phrase: '美味しいのレストラン', correction: '美味しいレストラン', rule: 'no_particle_adjective', timestamp: new Date().toISOString() },
    ],
    corrections: [
      { phrase: '美味しいのレストラン', correction: '美味しいレストラン', rule: 'no_particle_adjective', explanation: 'い-adjectives directly modify nouns without の.' },
      { phrase: '友達と行くつもり', correction: '友達と行くつもりです', rule: 'sentence_final_です', explanation: 'Add です at the end for polite speech.' },
    ],
    memoriesQueued: [
      { content: 'Learner prefers Italian food', memoryType: 'personal_fact' },
    ],
    elapsedMinutes: 12,
    difficultyConstraints: {
      grammarStructuresInScope: ['です/ます', 'て-form', 'たい-form', 'つもり', 'conditional ば/たら'],
      maxSentenceComplexity: 'compound',
      vocabularyTier: 'intermediate',
      allowL1Support: false,
    },
  }),

  advanced: (userId, sessionId, lessonId) => ({
    ...BASE,
    sessionId,
    userId,
    lessonId,
    difficultyLevel: 4,
    lessonGoal: 'Discussing work-life balance in Japan',
    topicsCovered: ['work_culture', 'overtime', 'vacation', 'societal_expectations'],
    vocabIntroduced: ['残業', '有給休暇', '働き方改革'],
    strengthsNoted: ['Excellent use of complex sentences', 'Natural register switching'],
    errorsLogged: [
      { errorType: 'grammar', phrase: '日本で残業が多いにもかかわらず', correction: '日本では残業が多いにもかかわらず', rule: 'topic_contrast_marker', timestamp: new Date().toISOString() },
    ],
    corrections: [
      { phrase: '日本で残業が多いにもかかわらず', correction: '日本では残業が多いにもかかわらず', rule: 'topic_contrast_marker', explanation: 'Use では instead of で when establishing a contrastive topic.' },
    ],
    memoriesQueued: [],
    elapsedMinutes: 15,
    difficultyConstraints: {
      grammarStructuresInScope: ['passive', 'causative', 'にもかかわらず', 'ものの', 'relative clauses'],
      maxSentenceComplexity: 'complex',
      vocabularyTier: 'intermediate_advanced',
      allowL1Support: false,
    },
  }),
}

export const FIXTURE_NAMES = Object.keys(FIXTURES)
