import type {
  ReviewSubmission,
  ReviewQueueItem,
  ReviewSummary,
  WordBankEntry,
  WordBankFilters,
  ConversationMessage,
  ExpandedSessionPlan,
  TomBrief,
  ExpandedLearnerProfile,
  KnowledgeBubble,
  CurriculumRecommendation,
  PragmaticState,
  ContextLogEntry,
  FrontierData,
  WeeklyStats,
  NarrativeDraft,
  ChatMessage,
  PostSessionAnalysis,
  ItemType,
  AuthUser,
  AssessmentItem,
  OnboardingResult,
  SelfReportedLevel,
} from '@shared/types'

interface LinguistApi {
  // Reviews
  reviewGetQueue: () => Promise<ReviewQueueItem[]>
  reviewSubmit: (submission: ReviewSubmission) => Promise<{ newMasteryState: string }>
  reviewGetSummary: () => Promise<ReviewSummary>

  // Word Bank
  wordbankList: (filters?: WordBankFilters) => Promise<WordBankEntry[]>
  wordbankGet: (id: number) => Promise<WordBankEntry | null>
  wordbankAdd: (data: {
    surfaceForm: string
    reading?: string
    meaning: string
    partOfSpeech?: string
    tags?: string[]
  }) => Promise<WordBankEntry>
  wordbankUpdate: (
    id: number,
    data: { meaning?: string; tags?: string[]; masteryState?: string }
  ) => Promise<WordBankEntry>
  wordbankSearch: (query: string) => Promise<WordBankEntry[]>

  // Conversation
  conversationPlan: () => Promise<ExpandedSessionPlan>
  conversationSend: (sessionId: string, message: string) => Promise<ConversationMessage>
  conversationEnd: (sessionId: string) => Promise<PostSessionAnalysis | null>
  conversationList: () => Promise<
    Array<{ id: string; timestamp: string; durationSeconds: number | null; sessionFocus: string }>
  >

  // ToM
  tomRunAnalysis: () => Promise<void>
  tomGetBrief: () => Promise<TomBrief>
  tomGetInferences: () => Promise<
    Array<{
      id: number
      type: string
      itemIds: number[]
      confidence: number
      description: string
      resolved: boolean
    }>
  >

  // Profile
  profileGet: () => Promise<ExpandedLearnerProfile>
  profileUpdate: (data: {
    dailyNewItemLimit?: number
    targetRetention?: number
  }) => Promise<ExpandedLearnerProfile>
  profileRecalculate: () => Promise<ExpandedLearnerProfile>

  // Curriculum
  curriculumGetBubble: () => Promise<KnowledgeBubble>
  curriculumGetRecommendations: (limit?: number) => Promise<CurriculumRecommendation[]>
  curriculumIntroduceItem: (curriculumItemId: number) => Promise<{ itemId: number; itemType: ItemType }>
  curriculumSkipItem: (curriculumItemId: number) => Promise<void>
  curriculumRegenerate: () => Promise<CurriculumRecommendation[]>

  // Pragmatics
  pragmaticGetState: () => Promise<PragmaticState>
  pragmaticUpdate: (data: Partial<PragmaticState>) => Promise<PragmaticState>

  // Context Log
  contextLogList: (filters?: {
    itemId?: number
    itemType?: string
    contextType?: string
    limit?: number
  }) => Promise<ContextLogEntry[]>
  contextLogAdd: (entry: {
    contextType: string
    modality: string
    wasProduction: boolean
    wasSuccessful?: boolean
    contextQuote?: string
    sessionId?: string
    lexicalItemId?: number
    grammarItemId?: number
  }) => Promise<ContextLogEntry>

  // Dashboard
  dashboardGetFrontier: () => Promise<FrontierData | null>
  dashboardGetWeeklyStats: () => Promise<WeeklyStats>

  // Narrative
  narrativeBuildDraft: (frontier: FrontierData, brief: TomBrief | null) => Promise<NarrativeDraft>
  narrativePolish: (draft: NarrativeDraft) => Promise<string>

  // Chat (general-purpose)
  chatSend: (conversationId: string, messages: ChatMessage[]) => Promise<void>
  chatStop: (conversationId: string) => Promise<void>
  chatOnChunk: (cb: (data: { conversationId: string; delta: string }) => void) => () => void
  chatOnDone: (cb: (data: { conversationId: string; error?: string }) => void) => () => void

  // Auth
  authGetSession: () => Promise<{ user: AuthUser } | null>
  authSignInGoogle: () => Promise<{ user: AuthUser }>
  authSignOut: () => Promise<void>

  // Onboarding
  onboardingGetStatus: () => Promise<{ completed: boolean }>
  onboardingGetAssessment: (selfReportedLevel: SelfReportedLevel) => Promise<AssessmentItem[]>
  onboardingComplete: (result: OnboardingResult) => Promise<void>
}

declare global {
  interface Window {
    linguist: LinguistApi
    platform: 'darwin' | 'win32' | 'linux'
  }
}

export {}
