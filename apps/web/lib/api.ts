import type { LearnerProfile, UsageInfo, SubscriptionInfo } from '@lingle/shared/types'
import type { SessionPlan } from '@/lib/session-plan'

export class UsageLimitError extends Error {
  usedSeconds: number
  limitSeconds: number
  plan: string
  constructor(data: { usedSeconds: number; limitSeconds: number; plan: string }) {
    super('Daily conversation limit reached')
    this.name = 'UsageLimitError'
    this.usedSeconds = data.usedSeconds
    this.limitSeconds = data.limitSeconds
    this.plan = data.plan
  }
}

class LingleApiClient {
  private cache = new Map<string, { data: unknown; ts: number }>()
  private inflight = new Map<string, Promise<unknown>>()
  private static STALE_AFTER = 30_000

  peekCache<T>(path: string): T | undefined {
    const entry = this.cache.get(path)
    return entry ? (entry.data as T) : undefined
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const method = options?.method?.toUpperCase() ?? 'GET'
    const isRead = method === 'GET'

    if (isRead) {
      const cached = this.cache.get(path)
      if (cached) {
        const age = Date.now() - cached.ts
        if (age > LingleApiClient.STALE_AFTER && !this.inflight.has(path)) {
          const promise = this.fetchAndCache<T>(path, options)
          this.inflight.set(path, promise)
          promise.finally(() => this.inflight.delete(path))
        }
        return cached.data as T
      }
      const existing = this.inflight.get(path)
      if (existing) return existing as Promise<T>
      const promise = this.fetchAndCache<T>(path, options)
      this.inflight.set(path, promise)
      promise.finally(() => this.inflight.delete(path))
      return promise
    }

    const res = await fetch(`/api${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      if (body.error === 'usage_limit_exceeded') {
        throw new UsageLimitError(body)
      }
      throw new Error(`API error: ${res.status}`)
    }
    this.cache.clear()
    return res.json()
  }

  private async fetchAndCache<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`/api${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      if (body.error === 'usage_limit_exceeded') {
        throw new UsageLimitError(body)
      }
      throw new Error(`API error: ${res.status}`)
    }
    const data = await res.json()
    this.cache.set(path, { data, ts: Date.now() })
    return data as T
  }

  // User
  userGetMe = () => this.request<{ id: string; email: string | null; name: string | null; avatarUrl: string | null }>('/user/me')

  // Conversation
  conversationList = () =>
    this.request<{ id: string; timestamp: string; durationSeconds: number | null; mode: string; sessionFocus: string }[]>('/conversation/list')
  conversationPlan = (prompt?: string, mode?: string) =>
    this.request<{ _sessionId: string; sessionFocus: string; plan: SessionPlan; remainingSeconds?: number; userPlan?: string }>('/conversation/plan', {
      method: 'POST',
      body: JSON.stringify({ ...(prompt ? { prompt } : {}), ...(mode ? { mode } : {}) }),
    })
  conversationPlanUpdate = (sessionId: string, updates: Partial<SessionPlan>) =>
    this.request<{ plan: SessionPlan }>('/conversation/plan/update', {
      method: 'POST',
      body: JSON.stringify({ sessionId, updates }),
    })
  conversationGet = (id: string) =>
    this.request<{
      id: string
      timestamp: string
      durationSeconds: number | null
      transcript: { role: string; content: string; timestamp?: string }[]
      sessionPlan: Record<string, unknown> | null
      systemPrompt: string | null
    }>(`/conversation/${id}`)
  conversationEnd = (sessionId: string) =>
    this.request<null>('/conversation/end', {
      method: 'POST',
      body: JSON.stringify({ sessionId }),
    })

  // Stats
  statsToday = () => this.request<{ minutesToday: number }>('/stats/today')
  statsSummary = () =>
    this.request<{
      totalSessions: number
      totalMinutes: number
      currentStreak: number
      longestStreak: number
      averageSessionMinutes: number
    }>('/stats/summary')
  statsAnalysis = () =>
    this.request<{
      status: 'ok' | 'insufficient_data'
      sessionCount?: number
      analysis?: {
        levelAssessment: {
          currentLevel: string
          confidence: 'low' | 'medium' | 'high'
          summary: string
          evidencePoints: string[]
        }
        strengths: { area: string; detail: string }[]
        mistakesAndHabits: {
          pattern: string
          detail: string
          severity: 'minor' | 'notable' | 'persistent'
        }[]
        skillScores: {
          vocabularyRange: number
          grammarAccuracy: number
          naturalness: number
          complexity: number
        }
      }
    }>('/stats/analysis')
  statsSessionAnalysis = (sessionId: string) =>
    this.request<{
      status: 'ok' | 'insufficient_data' | 'requires_pro'
      analysis?: {
        overallRating: 'excellent' | 'good' | 'developing' | 'needs_work'
        summary: string
        targetLanguageUsage: { percentage: number; assessment: string }
        vocabularyUsed: { word: string; reading?: string; meaning: string; usedWell: boolean }[]
        grammarPoints: { pattern: string; example: string; correct: boolean; note?: string }[]
        errors: { original: string; corrected: string; type: string; explanation: string }[]
        strengths: string[]
        suggestions: string[]
        skillScores: {
          reading: number
          listening: number
          speaking: number
          writing: number
          vocabulary: number
          grammar: number
        }
      }
    }>('/stats/session-analysis', {
      method: 'POST',
      body: JSON.stringify({ sessionId }),
    })

  // Profile
  profileGet = () => this.request<LearnerProfile>('/profile')
  profilePatch = (updates: Partial<LearnerProfile>) =>
    this.request<LearnerProfile>('/profile', {
      method: 'PATCH',
      body: JSON.stringify(updates),
    })

  // Usage & Subscription
  usageGet = () => this.request<UsageInfo>('/usage')
  subscriptionGet = () => this.request<SubscriptionInfo>('/subscription')

  // Stripe
  stripeCreateCheckout = () =>
    this.request<{ url: string }>('/stripe/create-checkout-session', {
      method: 'POST',
      body: JSON.stringify({}),
    })
  stripePortal = () =>
    this.request<{ url: string }>('/stripe/portal', {
      method: 'POST',
      body: JSON.stringify({}),
    })

  // Prefetch
  prefetch = () => {
    this.profileGet().catch(() => {})
  }
}

export const api = new LingleApiClient()
