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

// ─── Skill Enum (21 hardcoded skills, no dynamic creation) ──────────────────

export enum Skill {
  INTRODUCE_SELF = 'introduce_self',
  GREET_FAREWELL = 'greet_farewell',
  TELL_TIME = 'tell_time',
  DESCRIBE_LOCATION = 'describe_location',
  TALK_ABOUT_FAMILY = 'talk_about_family',
  TALK_ABOUT_WORK = 'talk_about_work',
  MAKE_REQUESTS = 'make_requests',
  GIVE_OPINIONS = 'give_opinions',
  EXPRESS_AGREEMENT_DISAGREEMENT = 'express_agreement_disagreement',
  HANDLE_MISUNDERSTANDINGS = 'handle_misunderstandings',
  DISCUSS_PAST_EVENTS = 'discuss_past_events',
  DISCUSS_FUTURE_PLANS = 'discuss_future_plans',
  MAKE_COMPARISONS = 'make_comparisons',
  INTERJECT_NATURALLY = 'interject_naturally',
  HANDLE_PHONE_CALLS = 'handle_phone_calls',
  ORDER_FOOD = 'order_food',
  NAVIGATE_TRANSPORT = 'navigate_transport',
  SMALL_TALK = 'small_talk',
  DESCRIBE_EMOTIONS = 'describe_emotions',
  ARGUE_A_POINT = 'argue_a_point',
  NARRATE_A_STORY = 'narrate_a_story',
}

// Mastery: 0=untested, 1=struggled, 2=with support, 3=independent, 4=automatic
export interface SkillRecord {
  skill: Skill
  mastery: 0 | 1 | 2 | 3 | 4
  lastEvidencedSessionId: string | null
}

// ─── Introduced Item (pedagogically surfaced, NOT incidental) ───────────────

export interface IntroducedItem {
  id: string
  userId: string
  sessionId: string
  type: 'vocab' | 'grammar' | 'phrase'
  surface: string
  translation: string | null
  notes: string | null
  introducedAt: Date | string
}

// ─── Produced Item (vocab/grammar the learner has used in speech) ────────────

export interface ProducedItem {
  id: string
  userId: string
  type: 'vocab' | 'grammar'
  surface: string
  targetLanguage: string
  occurrenceCount: number
  firstSeenAt: Date | string
  lastSeenAt: Date | string
}

// ─── Curriculum Reference (deterministic lists, no state) ───────────────────

export interface CurriculumVocabItem {
  surface: string
  reading: string | null
  translation: string
  cefrLevel: string
  domain: string | null
}

export interface CurriculumGrammarItem {
  pattern: string
  displayName: string
  cefrLevel: string
  description: string
}

// ─── Error Log (session-scoped, no cross-session aggregation) ───────────────

export type ErrorType = 'grammar' | 'vocab' | 'pronunciation' | 'register' | 'l1_interference'
export type ErrorSeverity = 'pedantic' | 'minor' | 'major'

export interface ErrorLog {
  sessionId: string
  utteranceIndex: number
  userUtterance: string
  errorType: ErrorType
  errorDetail: string
  correction: string
  severity: ErrorSeverity
  likelySttArtifact: boolean
}

// ─── Transcript ─────────────────────────────────────────────────────────────

export interface ToolCallLog {
  toolName: string
  args: Record<string, unknown>
  timestampMs: number
}

export interface TranscriptTurn {
  index: number
  speaker: 'tutor' | 'user'
  text: string
  timestampMs: number
  toolCallsInTurn: ToolCallLog[]
}

// ─── Lesson Plan (spec: Section 3.3) ────────────────────────────────────────

export type LessonPhase = 'warmup' | 'review' | 'core' | 'debrief' | 'closing'

export interface LessonPlan {
  sessionId: string

  warmup: {
    questionOfDay: string
    personalHook: string | null
    hookSource: string | null
  }

  review: {
    skip: boolean
    vocabItems: string[]
    grammarItems: string[]
    errorsToRevisit: Array<{
      userUtterance: string
      correction: string
      errorDetail: string
    }>
  }

  core: {
    topic: string
    angle: string
    targetGrammar: string | null
    anticipatedErrors: string[]
  }

  phaseBudgetMinutes: {
    warmup: number
    review: number
    core: number
    debrief: number
    closing: number
  }

  slides: SlideContent[]
}

export interface SlideContent {
  phase: LessonPhase
  title: string
  bullets: string[]
}

// ─── Topic Generation (LLM output from planning step) ──────────────────────

export interface TopicGenerationResult {
  topic: string
  angle: string
  rationale: string
  targetGrammarElicited: string | null
  estimatedVocabDifficulty: 'A2' | 'B1' | 'B2'
}

// ─── Session Summary (post-session output) ──────────────────────────────────

export interface SessionSummary {
  timeline: Array<{
    phase: LessonPhase
    durationMinutes: number
    summary: string
  }>
  introducedItems: IntroducedItem[]
  keyErrors: ErrorLog[]
  tutorInsights: string[]
  suggestedFocusNextSession: string
  cefrUpdate: {
    grammar: { before: number; after: number }
    fluency: { before: number; after: number }
  }
}

// ─── Pipeline Stage (resumable post-session pipeline) ───────────────────────

export type PipelineStage =
  | 'error_classification'
  | 'strength_analysis'
  | 'personal_facts'
  | 'cefr_delta'
  | 'summary_generation'
  | 'complete'

// ─── Whiteboard (agent writes via writeWhiteboard tool) ─────────────────────

export interface WhiteboardItem {
  id: string
  addedAtPhase: LessonPhase
  content: string
  type: 'vocab' | 'grammar' | 'correction' | 'phrase'
}

export interface WhiteboardContent {
  newMaterial: WhiteboardItem[]
  corrections: WhiteboardItem[]
}

// ─── Redis Session State (live state during voice session) ──────────────────

export interface RedisSessionState {
  sessionId: string
  lessonPlan: LessonPlan
  currentPhase: LessonPhase
  phaseStartTimeMs: number
  phaseExtensionGranted: boolean

  // Accumulated during session
  errorsLogged: ErrorLog[]
  correctionsQueued: ErrorLog[]
  whiteboardContent: WhiteboardContent

  // Current whiteboard/slide state
  currentSlide: SlideContent
}

// ─── Fluency Signals (from post-session Step 2) ────────────────────────────

export interface FluencySignals {
  hesitationCount: number
  l1SwitchCount: number
  selfCorrectionCount: number
  clarificationRequestCount: number
  qualitativeSummary: string
}

// ─── Agent Metadata (passed from web → agent via LiveKit dispatch) ──────────

export interface AgentMetadata {
  sessionId?: string
  lessonId?: string
  userId: string
  targetLanguage: string
  nativeLanguage: string
  basePrompt?: string
  sessionMode?: string

  // Learner context (populated for real sessions)
  learnerModel?: LearnerModelSummary
  lessonPlan?: LessonPlan
  userProfile?: UserProfileSummary

  // User preferences
  correctionStyle?: 'recast' | 'explicit' | 'none'

  // Provider overrides
  voiceId?: string
  ttsProvider?: 'cartesia' | 'rime'
  sttProvider?: 'deepgram' | 'soniox'

  // Test mode
  sessionPlan?: Record<string, unknown>
}

// ─── Learner Model Summary (passed to agent via metadata) ───────────────────

export interface LearnerModelSummary {
  cefrGrammar: number
  cefrFluency: number
  skills: SkillRecord[]
  sessionCount: number
  totalMinutes: number
}

// ─── User Profile Summary (passed to agent for Slot 2) ─────────────────────

export interface UserProfileSummary {
  name: string | null
  interests: string[]
  occupation: string | null
  family: string | null
  goals: string | null
  recentUpdates: string[]
}

// ─── CEFR Helpers ───────────────────────────────────────────────────────────

export function cefrLabel(score: number): string {
  if (score < 2.0) return 'A1'
  if (score < 3.0) return 'A2'
  if (score < 4.0) return 'B1'
  if (score < 5.0) return 'B2'
  if (score < 6.0) return 'C1'
  return 'C2'
}
