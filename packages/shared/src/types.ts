// ─── Conversation Messages (used by voice test + transcript display) ─────────

export interface ConversationToolCall {
  toolName: string
  args: Record<string, unknown>
}

export interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  toolCalls?: ConversationToolCall[]
}

// ─── Auth & Billing ─────────────────────────────────────────────────────────

export interface AuthUser {
  id: string
  email: string | null
  name: string | null
  avatarUrl: string | null
  onboardingComplete: boolean
}

export type PlanType = 'free' | 'pro'

export interface UsageInfo {
  usedSeconds: number
  limitSeconds: number
  remainingSeconds: number
  isLimitReached: boolean
  plan: PlanType
}

export interface SubscriptionInfo {
  plan: PlanType
  status: string
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
}

// ─── Session State (Redis hot state, injected into agent every turn) ────────

export interface ErrorEntry {
  errorType: 'grammar' | 'vocabulary' | 'pronunciation' | 'register' | 'l1_interference' | 'fluency'
  phrase: string
  correction: string
  rule: string
  timestamp?: string
  reviewed?: boolean
}

export interface DifficultyConstraints {
  grammarStructuresInScope: string[]
  maxSentenceComplexity: 'simple' | 'compound' | 'complex'
  vocabularyTier: 'high_frequency' | 'intermediate' | 'intermediate_advanced' | 'advanced'
  allowL1Support: boolean
}

export interface SessionState {
  sessionId: string
  userId: string
  lessonId: string
  lessonPhase: 'warmup' | 'main' | 'review' | 'wrapup'
  targetLanguage: string
  nativeLanguage: string
  lessonGoal: string
  difficultyLevel: number // 1–5
  errorsLogged: ErrorEntry[]
  topicsCovered: string[]
  vocabIntroduced: string[]
  strengthsNoted: string[]
  corrections: CorrectionEntry[]
  memoriesQueued: MemoryEntry[]
  elapsedMinutes: number
  lessonDurationTarget: number

  // Latency signal
  avgResponseLatencySec: number
  responseLatencies: number[] // rolling window of last 10 turns

  // Operational difficulty constraints
  difficultyConstraints: DifficultyConstraints

  // Compaction bookkeeping
  compactionCount: number
  conversationTokenEstimate: number

  // Structured lesson plan + phase tracking (v1)
  structuredPlan?: StructuredLessonPlan
  currentPhaseIndex: number
  phaseStartedAt: number           // Unix ms when current phase started
  phasesCompleted: LessonPhaseType[]
  timePressure: 'on_track' | 'slightly_over' | 'significantly_over'

  // Between-session continuity
  deferredTopics: string[]
  nextSessionPriority: string[]    // error rules flagged for next Review phase

  // Dev inspection
  _devLastInjectedPrompt?: string  // last SESSION STATE block injected into system prompt
}

export interface CorrectionEntry {
  phrase: string
  correction: string
  rule: string
  explanation?: string
  timestamp?: string
}

export interface MemoryEntry {
  content: string
  memoryType: 'preference' | 'goal' | 'personal_fact' | 'personal' | 'context' | 'achievement' | 'recurring_struggle'
  timestamp?: string
}

// ─── Structured Lesson Plan (v1: 5-phase session arc) ──────────────────────

export type LessonPhaseType = 'warmup' | 'review' | 'core' | 'debrief' | 'close'
export type CorrectionMode = 'active' | 'recast_only' | 'silent'

export interface PhaseContent {
  topic?: string
  discussionPrompts?: string[]
  vocabTargets?: string[]
  grammarPattern?: string
  reviewErrors?: Array<{ rule: string; phrase: string; correction: string }>
}

export interface PhaseDefinition {
  phase: LessonPhaseType
  targetMinutes: number
  instructions: string
  correctionMode: CorrectionMode
  content: PhaseContent
}

export interface StructuredLessonPlan {
  sessionDurationMinutes: number
  domain: string
  cefrLevel: string
  grammarFocus: string | null
  vocabTargets: string[]
  phases: PhaseDefinition[]
  difficultyConstraints: DifficultyConstraints
}

// ─── Legacy Lesson Plan (kept for backward compat) ─────────────────────────

/** @deprecated Use StructuredLessonPlan instead */
export interface LessonPlan {
  warmupTopic: string
  mainActivity: {
    goal: string
    method: string
    expectedDurationMin: number
  }
  grammarFocus: string | null
  vocabTargets: string[]
  reviewPatterns: string[]
  difficultyConstraints: DifficultyConstraints
}

// ─── Learner Model Summary (passed to agent via metadata) ───────────────────

export interface LearnerModelSummary {
  cefrGrammar: number
  cefrFluency: number
  sessionsCompleted: number
  speechProfile: string | null
  priorityFocus: string | null
  errorDensityTrend: string | null
}

export interface ErrorPatternSummary {
  rule: string
  occurrenceCount: number
  sessionsSeen: number
}

// ─── Agent Metadata (passed from web → agent via LiveKit dispatch) ──────────

export interface AgentMetadata {
  sessionId?: string
  lessonId?: string
  userId: string
  targetLanguage: string
  nativeLanguage: string
  basePrompt?: string

  // Learner context (populated for real sessions, absent for /voice/test)
  learnerModel?: LearnerModelSummary
  errorPatterns?: ErrorPatternSummary[]
  structuredPlan?: StructuredLessonPlan
  /** @deprecated Use structuredPlan instead */
  lessonPlan?: LessonPlan
  difficultyConstraints?: DifficultyConstraints

  // User preferences
  correctionStyle?: 'recast' | 'explicit' | 'none'
  personalNotes?: string

  // Provider overrides
  voiceId?: string
  ttsProvider?: 'cartesia' | 'rime'
  sttProvider?: 'deepgram' | 'soniox'
}
