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

// ─── Lesson Planning ────────────────────────────────────────────────────────

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
