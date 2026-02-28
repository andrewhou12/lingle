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
  PostSessionAnalysis,
  ItemType,
  AssessmentItem,
  ReadingChallengeItem,
  ComprehensionItem,
  OnboardingResult,
  SelfReportedLevel,
  ExpandedTomBrief,
} from '@linguist/shared/types'

class LinguistApiClient {
  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`/api${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    })
    if (!res.ok) throw new Error(`API error: ${res.status}`)
    return res.json()
  }

  // User
  userGetMe = () => this.request<{ id: string; email: string | null; name: string | null; avatarUrl: string | null }>('/user/me')

  // Reviews
  reviewGetQueue = () => this.request<ReviewQueueItem[]>('/review/queue')
  reviewSubmit = (submission: ReviewSubmission) =>
    this.request<{ newMasteryState: string }>('/review/submit', {
      method: 'POST',
      body: JSON.stringify(submission),
    })
  reviewGetSummary = () => this.request<ReviewSummary>('/review/summary')

  // Word Bank
  wordbankList = (filters?: WordBankFilters) => {
    const params = new URLSearchParams()
    if (filters?.masteryState) params.set('masteryState', filters.masteryState)
    if (filters?.tag) params.set('tag', filters.tag)
    if (filters?.dueOnly) params.set('dueOnly', 'true')
    const qs = params.toString()
    return this.request<WordBankEntry[]>(`/wordbank${qs ? `?${qs}` : ''}`)
  }
  wordbankGet = (id: number) => this.request<WordBankEntry | null>(`/wordbank/${id}`)
  wordbankAdd = (data: {
    surfaceForm: string; reading?: string; meaning: string; partOfSpeech?: string; tags?: string[]
  }) => this.request<WordBankEntry>('/wordbank', { method: 'POST', body: JSON.stringify(data) })
  wordbankUpdate = (id: number, data: { meaning?: string; tags?: string[]; masteryState?: string }) =>
    this.request<WordBankEntry>(`/wordbank/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
  wordbankSearch = (query: string) => this.request<WordBankEntry[]>(`/wordbank/search?q=${encodeURIComponent(query)}`)

  // Conversation
  conversationPlan = () =>
    this.request<ExpandedSessionPlan & { _sessionId: string }>('/conversation/plan', { method: 'POST' })
  // Simple non-streaming send for pages that don't use useChat (e.g. learn page)
  conversationSend = async (sessionId: string, message: string): Promise<ConversationMessage> => {
    const userMsg = {
      id: crypto.randomUUID(),
      role: 'user' as const,
      parts: [{ type: 'text' as const, text: message }],
    }
    const res = await fetch('/api/conversation/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, messages: [userMsg] }),
    })
    if (!res.ok) throw new Error(`API error: ${res.status}`)
    // Read the UI message stream to extract text
    const reader = res.body?.getReader()
    if (!reader) throw new Error('No response body')
    const decoder = new TextDecoder()
    let fullText = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = decoder.decode(value, { stream: true })
      // Extract text parts from the stream (format: 0:text\n)
      for (const line of chunk.split('\n')) {
        if (line.startsWith('0:')) {
          try {
            fullText += JSON.parse(line.slice(2))
          } catch { /* skip non-text chunks */ }
        }
      }
    }
    return {
      role: 'assistant',
      content: fullText,
      timestamp: new Date().toISOString(),
    }
  }
  conversationEnd = (sessionId: string) =>
    this.request<PostSessionAnalysis | null>('/conversation/end', {
      method: 'POST',
      body: JSON.stringify({ sessionId }),
    })
  conversationList = () =>
    this.request<Array<{
      id: string; timestamp: string; durationSeconds: number | null; sessionFocus: string
      targetsPlannedCount: number; targetsHitCount: number; errorsLoggedCount: number
    }>>('/conversation/list')
  conversationDetail = (id: string) =>
    this.request<{
      id: string; timestamp: string; durationSeconds: number | null
      transcript: ConversationMessage[]; sessionPlan: ExpandedSessionPlan
      targetsPlanned: { vocabulary: number[]; grammar: number[] }
      targetsHit: number[]; errorsLogged: Array<{ itemId: number; errorType: string; contextQuote: string }>
      avoidanceEvents: Array<{ itemId: number; contextQuote: string }>
      systemPrompt: string | null; contextLogs: Array<{
        id: number; contextType: string; modality: string; wasProduction: boolean
        wasSuccessful: boolean | null; contextQuote: string | null; lexicalItemId: number | null
        grammarItemId: number | null
      }>
    }>(`/conversation/${id}`)

  // Grammar
  grammarList = (filters?: { masteryState?: string; search?: string }) => {
    const params = new URLSearchParams()
    if (filters?.masteryState) params.set('masteryState', filters.masteryState)
    if (filters?.search) params.set('search', filters.search)
    const qs = params.toString()
    return this.request<Array<{
      id: number; patternId: string; name: string; description: string | null
      cefrLevel: string | null; masteryState: string; contextCount: number
      recognitionFsrs: import('@linguist/shared/types').FsrsState
      productionFsrs: import('@linguist/shared/types').FsrsState
      firstSeen: string; lastReviewed: string | null; productionWeight: number
    }>>(`/grammar${qs ? `?${qs}` : ''}`)
  }

  // Chunks
  chunksList = (filters?: { masteryState?: string; itemKind?: string; search?: string }) => {
    const params = new URLSearchParams()
    if (filters?.masteryState) params.set('masteryState', filters.masteryState)
    if (filters?.itemKind) params.set('itemKind', filters.itemKind)
    if (filters?.search) params.set('search', filters.search)
    const qs = params.toString()
    return this.request<import('@linguist/shared/types').WordBankChunkEntry[]>(`/chunks${qs ? `?${qs}` : ''}`)
  }

  // Promote items
  wordbankPromote = (id: number) =>
    this.request<{ masteryState: string }>(`/wordbank/${id}/promote`, { method: 'POST' })
  grammarPromote = (id: number) =>
    this.request<{ masteryState: string }>(`/grammar/${id}/promote`, { method: 'POST' })

  // ToM
  tomRunAnalysis = () => this.request<void>('/tom/analyze', { method: 'POST' })
  tomGetBrief = () => this.request<ExpandedTomBrief>('/tom/brief')
  tomGetInferences = () =>
    this.request<Array<{ id: number; type: string; itemIds: number[]; confidence: number; description: string; resolved: boolean }>>(
      '/tom/inferences'
    )

  // Profile
  profileGet = () => this.request<ExpandedLearnerProfile>('/profile')
  profileUpdate = (data: { dailyNewItemLimit?: number; targetRetention?: number }) =>
    this.request<ExpandedLearnerProfile>('/profile', { method: 'PATCH', body: JSON.stringify(data) })
  profileRecalculate = () =>
    this.request<ExpandedLearnerProfile>('/profile/recalculate', { method: 'POST' })

  // Curriculum
  curriculumGetBubble = () => this.request<KnowledgeBubble>('/curriculum/bubble')
  curriculumGetRecommendations = (limit?: number) =>
    this.request<CurriculumRecommendation[]>(`/curriculum/recommendations${limit ? `?limit=${limit}` : ''}`)
  curriculumIntroduceItem = (curriculumItemId: number) =>
    this.request<{ itemId: number; itemType: ItemType }>('/curriculum/introduce', {
      method: 'POST',
      body: JSON.stringify({ curriculumItemId }),
    })
  curriculumSkipItem = (curriculumItemId: number) =>
    this.request<void>('/curriculum/skip', {
      method: 'POST',
      body: JSON.stringify({ curriculumItemId }),
    })
  curriculumRegenerate = () =>
    this.request<CurriculumRecommendation[]>('/curriculum/regenerate', { method: 'POST' })

  // Pragmatics
  pragmaticGetState = () => this.request<PragmaticState>('/pragmatic')
  pragmaticUpdate = (data: Partial<PragmaticState>) =>
    this.request<PragmaticState>('/pragmatic', { method: 'PATCH', body: JSON.stringify(data) })

  // Context Log
  contextLogList = (filters?: { itemId?: number; itemType?: string; contextType?: string; limit?: number }) => {
    const params = new URLSearchParams()
    if (filters?.itemId) params.set('itemId', String(filters.itemId))
    if (filters?.itemType) params.set('itemType', filters.itemType)
    if (filters?.contextType) params.set('contextType', filters.contextType)
    if (filters?.limit) params.set('limit', String(filters.limit))
    const qs = params.toString()
    return this.request<ContextLogEntry[]>(`/context-log${qs ? `?${qs}` : ''}`)
  }
  contextLogAdd = (entry: {
    contextType: string; modality: string; wasProduction: boolean;
    wasSuccessful?: boolean; contextQuote?: string; sessionId?: string;
    lexicalItemId?: number; grammarItemId?: number
  }) => this.request<ContextLogEntry>('/context-log', { method: 'POST', body: JSON.stringify(entry) })

  // Dashboard
  dashboardGetFrontier = () => this.request<FrontierData | null>('/dashboard/frontier')
  dashboardGetWeeklyStats = () => this.request<WeeklyStats>('/dashboard/weekly-stats')

  // Narrative
  narrativeBuildDraft = (frontier: FrontierData, brief: TomBrief | null) =>
    this.request<NarrativeDraft>('/narrative/draft', {
      method: 'POST',
      body: JSON.stringify({ frontier, brief }),
    })
  narrativePolish = (draft: NarrativeDraft) =>
    this.request<string>('/narrative/polish', {
      method: 'POST',
      body: JSON.stringify({ draft }),
    })

  // Onboarding
  onboardingGetStatus = () => this.request<{ completed: boolean }>('/onboarding/status')
  onboardingGetAssessment = (selfReportedLevel: SelfReportedLevel) =>
    this.request<AssessmentItem[]>('/onboarding/assessment', {
      method: 'POST',
      body: JSON.stringify({ selfReportedLevel }),
    })
  onboardingGetReadingChallenge = (selfReportedLevel: SelfReportedLevel) =>
    this.request<ReadingChallengeItem[]>('/onboarding/reading-challenge', {
      method: 'POST',
      body: JSON.stringify({ selfReportedLevel }),
    })
  onboardingGetComprehension = (selfReportedLevel: SelfReportedLevel) =>
    this.request<ComprehensionItem[]>('/onboarding/comprehension', {
      method: 'POST',
      body: JSON.stringify({ selfReportedLevel }),
    })
  onboardingComplete = (result: OnboardingResult) =>
    this.request<{ computedLevel: string }>('/onboarding/complete', {
      method: 'POST',
      body: JSON.stringify(result),
    })
}

export const api = new LinguistApiClient()
