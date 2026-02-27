// ── Mastery State Machine ──

export enum MasteryState {
  Unseen = 'unseen',
  Introduced = 'introduced',
  Apprentice1 = 'apprentice_1',
  Apprentice2 = 'apprentice_2',
  Apprentice3 = 'apprentice_3',
  Apprentice4 = 'apprentice_4',
  Journeyman = 'journeyman',
  Expert = 'expert',
  Master = 'master',
  Burned = 'burned',
}

export type ReviewGrade = 'again' | 'hard' | 'good' | 'easy'
export type ReviewModality = 'recognition' | 'production' | 'cloze'
export type ItemType = 'lexical' | 'grammar' | 'collocation' | 'chunk' | 'pragmatic_formula'
export type LearningModality = 'reading' | 'listening' | 'speaking' | 'writing'
export type ContextType = 'srs_review' | 'conversation' | 'reading' | 'textbook' | 'drill'

// ── FSRS ──

export interface FsrsState {
  due: string // ISO date string
  stability: number
  difficulty: number
  elapsed_days: number
  scheduled_days: number
  reps: number
  lapses: number
  state: number // FSRS State enum value (New=0, Learning=1, Review=2, Relearning=3)
  last_review?: string // ISO date string
}

// ── IPC Channel Names ──

export const IPC_CHANNELS = {
  // Reviews
  REVIEW_GET_QUEUE: 'review:get-queue',
  REVIEW_SUBMIT: 'review:submit',
  REVIEW_GET_SUMMARY: 'review:get-summary',

  // Word Bank
  WORDBANK_LIST: 'wordbank:list',
  WORDBANK_GET: 'wordbank:get',
  WORDBANK_ADD: 'wordbank:add',
  WORDBANK_UPDATE: 'wordbank:update',
  WORDBANK_SEARCH: 'wordbank:search',

  // Conversation
  CONVERSATION_PLAN: 'conversation:plan',
  CONVERSATION_SEND: 'conversation:send',
  CONVERSATION_END: 'conversation:end',
  CONVERSATION_LIST: 'conversation:list',

  // ToM
  TOM_RUN_ANALYSIS: 'tom:run-analysis',
  TOM_GET_BRIEF: 'tom:get-brief',
  TOM_GET_INFERENCES: 'tom:get-inferences',

  // Profile
  PROFILE_GET: 'profile:get',
  PROFILE_UPDATE: 'profile:update',
  PROFILE_RECALCULATE: 'profile:recalculate',

  // Curriculum
  CURRICULUM_GET_BUBBLE: 'curriculum:get-bubble',
  CURRICULUM_GET_RECOMMENDATIONS: 'curriculum:get-recommendations',
  CURRICULUM_INTRODUCE_ITEM: 'curriculum:introduce-item',
  CURRICULUM_SKIP_ITEM: 'curriculum:skip-item',
  CURRICULUM_REGENERATE: 'curriculum:regenerate',

  // Curriculum Spine
  CURRICULUM_GET_UNIT_PROGRESS: 'curriculum:get-unit-progress',
  CURRICULUM_EVALUATE_TRIGGERS: 'curriculum:evaluate-triggers',

  // Pragmatics
  PRAGMATIC_GET_STATE: 'pragmatic:get-state',
  PRAGMATIC_UPDATE: 'pragmatic:update',

  // Context Log
  CONTEXT_LOG_LIST: 'context-log:list',
  CONTEXT_LOG_ADD: 'context-log:add',

  // Dashboard
  DASHBOARD_GET_FRONTIER: 'dashboard:get-frontier',
  DASHBOARD_GET_WEEKLY_STATS: 'dashboard:get-weekly-stats',

  // Narrative
  NARRATIVE_BUILD_DRAFT: 'narrative:build-draft',
  NARRATIVE_POLISH: 'narrative:polish',

  // Chat (general-purpose)
  CHAT_SEND: 'chat:send',
  CHAT_STOP: 'chat:stop',

  // Auth
  AUTH_GET_SESSION: 'auth:get-session',
  AUTH_SIGN_IN_GOOGLE: 'auth:sign-in-google',
  AUTH_SIGN_OUT: 'auth:sign-out',

  // Onboarding
  ONBOARDING_GET_STATUS: 'onboarding:get-status',
  ONBOARDING_GET_ASSESSMENT: 'onboarding:get-assessment',
  ONBOARDING_GET_READING_CHALLENGE: 'onboarding:get-reading-challenge',
  ONBOARDING_GET_COMPREHENSION: 'onboarding:get-comprehension',
  ONBOARDING_COMPLETE: 'onboarding:complete',
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]

// ── IPC Payload Types ──

export interface ReviewSubmission {
  itemId: number
  itemType: ItemType
  grade: ReviewGrade
  modality: ReviewModality
  sessionId?: string
  productionWeight?: number
  contextType?: ContextType
}

export interface ReviewQueueItem {
  id: number
  itemType: ItemType
  surfaceForm: string
  reading?: string | null
  meaning: string
  modality: ReviewModality
  masteryState: MasteryState
  overdueDays: number
}

export interface ReviewSummary {
  totalReviewed: number
  accuracy: number
  newItemsAdded: number
  masteryChanges: Array<{
    itemId: number
    itemType: ItemType
    from: MasteryState
    to: MasteryState
  }>
}

export interface WordBankEntry {
  id: number
  surfaceForm: string
  reading: string | null
  meaning: string
  partOfSpeech: string | null
  masteryState: MasteryState
  recognitionFsrs: FsrsState
  productionFsrs: FsrsState
  firstSeen: string
  lastReviewed: string | null
  exposureCount: number
  productionCount: number
  tags: string[]
  source: string
}

export interface WordBankFilters {
  masteryState?: MasteryState
  tag?: string
  search?: string
  dueOnly?: boolean
}

export interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

export interface SessionPlan {
  targetVocabulary: number[]
  targetGrammar: number[]
  difficultyLevel: string
  register: 'casual' | 'polite'
  sessionFocus: string
}

export interface TomBrief {
  priorityTargets: Array<{ itemId: number; reason: string }>
  confusionPairs: Array<{ itemIds: number[]; description: string }>
  avoidancePatterns: Array<{ itemId: number; sessionsAvoided: number }>
  regressions: Array<{ itemId: number; recentGrades: ReviewGrade[] }>
  recommendedDifficulty: string
  notes: string
}

export interface PostSessionAnalysis {
  targetsHit: number[]
  errorsLogged: Array<{
    itemId: number
    errorType: string
    contextQuote: string
  }>
  avoidanceEvents: Array<{
    itemId: number
    contextQuote: string
  }>
  newItemsEncountered: Array<{
    surfaceForm: string
    contextQuote: string
  }>
  overallAssessment: string
}

// ── Expanded Knowledge Model Types ──

export interface ExpandedLearnerProfile {
  id: number
  targetLanguage: string
  nativeLanguage: string
  dailyNewItemLimit: number
  targetRetention: number
  computedLevel: string
  comprehensionCeiling: string
  productionCeiling: string
  readingLevel: number
  listeningLevel: number
  speakingLevel: number
  writingLevel: number
  totalSessions: number
  totalReviewEvents: number
  currentStreak: number
  longestStreak: number
  lastActiveDate: string | null
  errorPatternSummary: Record<string, unknown>
  avoidancePatternSummary: Record<string, unknown>
}

export interface ModalityBreakdown {
  reading: number
  listening: number
  speaking: number
  writing: number
}

export interface LevelBreakdown {
  level: string
  totalReferenceItems: number
  knownItems: number
  productionReady: number
  coverage: number
}

export interface KnowledgeBubble {
  levelBreakdowns: LevelBreakdown[]
  currentLevel: string
  frontierLevel: string
  gapsInCurrentLevel: Array<{
    itemType: ItemType
    surfaceForm?: string
    patternId?: string
    reason: string
  }>
  overallCoverage: number
}

export interface CurriculumRecommendation {
  id?: number
  itemType: ItemType
  surfaceForm?: string
  reading?: string
  meaning?: string
  patternId?: string
  cefrLevel?: string
  frequencyRank?: number
  priority: number
  reason: string
  prerequisitesMet: boolean
}

export interface PragmaticState {
  casualAccuracy: number
  politeAccuracy: number
  registerSlipCount: number
  preferredRegister: string
  circumlocutionCount: number
  silenceEvents: number
  l1FallbackCount: number
  averageSpeakingPace: number | null
  hesitationRate: number | null
  avoidedGrammarPatterns: string[]
  avoidedVocabIds: number[]
}

export interface ContextLogEntry {
  id: number
  contextType: ContextType
  modality: LearningModality
  wasProduction: boolean
  wasSuccessful: boolean | null
  contextQuote: string | null
  sessionId: string | null
  timestamp: string
  lexicalItemId: number | null
  grammarItemId: number | null
}

export interface ExpandedItemDetail extends WordBankEntry {
  contextTypes: string[]
  contextCount: number
  readingExposures: number
  listeningExposures: number
  speakingProductions: number
  writingProductions: number
  frequencyRank: number | null
  cefrLevel: string | null
  productionWeight: number
}

export interface ExpandedTomBrief extends TomBrief {
  modalityGaps: Array<{
    modality: LearningModality
    currentLevel: number
    strongestLevel: number
    gap: number
  }>
  transferGaps: Array<{
    itemId: number
    patternId: string
    contextCount: number
    needed: number
  }>
  pragmaticInsights: {
    registerAccuracy: { casual: number; polite: number }
    strategyCount: { circumlocution: number; l1Fallback: number; silence: number }
    avoidedPatterns: string[]
  }
  curriculumSuggestions: Array<{
    itemType: ItemType
    reason: string
    priority: number
  }>
}

export interface ExpandedSessionPlan extends SessionPlan {
  _sessionId?: string
  pragmaticTargets: {
    targetRegister: 'casual' | 'polite'
    registerFocusAreas: string[]
    encourageCircumlocution: boolean
  }
  curriculumNewItems: Array<{
    itemType: ItemType
    surfaceForm?: string
    patternId?: string
    reason: string
  }>
  transferTestTargets: Array<{
    itemId: number
    patternId: string
    novelContext: string
  }>
  cardBudget?: number
}

// ── Dashboard Weekly Stats ──

export interface WeeklyStats {
  reviewsThisWeek: number
  accuracyThisWeek: number
  sessionsThisWeek: number
  currentStreak: number
  longestStreak: number
  itemsLearned: number // new items that moved past "introduced" this week
}

// ── Dashboard Frontier Types ──

export interface FrontierItem {
  id: number
  itemType: ItemType
  surfaceForm?: string
  patternId?: string
  cefrLevel: string
  masteryState: string
}

export interface FrontierData {
  bubble: KnowledgeBubble
  profile: ExpandedLearnerProfile
  items: FrontierItem[]
  masteryDistribution: Record<string, number>
}

// ── Narrative Brief Types ──

export interface NarrativeDraft {
  level: string
  levelCoverage: number
  frontierLevel: string
  frontierCoverage: number
  strongest: string
  strongestValue: number
  weakest: string
  weakestValue: number
  totalItems: number
  activeItems: number
  streak: number
  gapCount: number
  avoidanceCount: number
  confusionCount: number
  regressionCount: number
  templateText: string
}

// ── Chat Types (general-purpose) ──

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AuthUser {
  id: string
  email: string | null
  name: string | null
  avatarUrl: string | null
  onboardingCompleted: boolean
}

// ── Onboarding Types ──

export type SelfReportedLevel = 'beginner' | 'N5' | 'N4' | 'N3' | 'N2' | 'N1'

export interface AssessmentItem {
  index: number
  surfaceForm: string
  reading: string
  meaning: string
  partOfSpeech: string
  level: string
  type: 'vocabulary' | 'grammar'
  patternId?: string
}

export interface ReadingChallengeItem {
  index: number
  surfaceForm: string
  meaning: string
  level: string
}

export interface ComprehensionItem {
  index: number
  sentence: string
  level: string
}

export interface ReadingChallengeResult {
  surfaceForm: string
  userAnswer: string
  correct: boolean
  level: string
}

export interface ComprehensionResult {
  sentenceIndex: number
  userTranslation: string
  keywordMatchRate: number
  level: string
}

export interface OnboardingResult {
  targetLanguage: string
  nativeLanguage: string
  selfReportedLevel: SelfReportedLevel
  dailyNewItemLimit: number
  knownItemIndices: number[]
  readingChallengeResults: ReadingChallengeResult[]
  comprehensionResults: ComprehensionResult[]
}

// ── Chunk / Multi-word Unit Types ──

export interface WordBankChunkEntry {
  id: number
  itemKind: 'collocation' | 'chunk' | 'pragmatic_formula'
  referenceId: string
  phrase: string
  reading: string | null
  meaning: string
  componentItemIds: number[]
  grammarDependencies: string[]
  register: string | null
  domain: string | null
  cefrLevel: string | null
  masteryState: MasteryState
  recognitionFsrs: FsrsState
  productionFsrs: FsrsState
  firstSeen: string
  lastReviewed: string | null
  exposureCount: number
  productionCount: number
  tags: string[]
  source: string
}

export interface ChunkTriggerResult {
  referenceId: string
  phrase: string
  itemKind: 'collocation' | 'chunk' | 'pragmatic_formula'
  ready: boolean
  reason: string
  missingComponents: string[]
}

export interface UnitProgress {
  unitId: string
  unitNumber: number
  title: string
  totalItems: number
  knownItems: number
  completionPercent: number
  coreItemsComplete: boolean
}

// ── Curriculum Spine Types ──

export interface SpineUnit {
  unitId: string
  unitNumber: number
  title: string
  communicativeGoal: string
  domain: string
  vocabulary: SpineItemRef[]
  grammar: SpineItemRef[]
  collocations: SpineItemRef[]
  chunks: SpineItemRef[]
  pragmaticFormulas: SpineItemRef[]
  coIntroductionRules: CoIntroductionRule[]
  chunkTriggers: ChunkTrigger[]
  prerequisites: string[]
}

export interface SpineItemRef {
  refId: string
  surfaceForm?: string
  name?: string
  phrase?: string
  role: 'core' | 'supporting'
}

export interface CoIntroductionRule {
  itemIds: string[]
  reason: string
}

export interface ChunkTrigger {
  chunkRefId: string
  requiredItems: string[]
  masteryThreshold: MasteryState
}

export interface ExpandedPostSessionAnalysis extends PostSessionAnalysis {
  registerAccuracy: {
    correctRegisterUses: number
    registerSlips: number
    targetRegister: string
  }
  strategyEvents: {
    circumlocutions: Array<{ contextQuote: string; targetItem?: string }>
    l1Fallbacks: Array<{ contextQuote: string; intendedMeaning?: string }>
    silenceEvents: number
  }
  contextLogs: Array<{
    itemId: number
    itemType: ItemType
    contextType: ContextType
    modality: LearningModality
    wasProduction: boolean
    wasSuccessful: boolean
  }>
}
