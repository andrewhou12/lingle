import type { UsageInfo, SubscriptionInfo } from '@lingle/shared/types'

// Profile response shape from /api/profile GET
interface ProfileResponse {
  targetLanguage: string | null
  nativeLanguage: string | null
  sessionLengthMinutes: number
  correctionStyle: string
  lessonStylePreference: string
  ttsProvider: string | null
  sttProvider: string | null
  voiceId: string | null
  totalLessons: number
  cefrGrammar: number | null
  cefrFluency: number | null
  sessionsCompleted: number
}

export interface PostSessionResult {
  cefrDelta?: { grammarDelta: number; fluencyDelta: number }
  errorsCount?: number
  correctionsCount?: number
  correctionsDoc?: string | null
}

export interface LessonSummary {
  id: string
  summary: string | null
  lessonGoal: string | null
  startedAt: string
  endedAt: string | null
  durationMinutes: number | null
  errorsCount: number
  correctionsDoc: string | null
  targetLanguage: string
}

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
      throw new Error(body.error || `API error: ${res.status}`)
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
  conversationPlan = (prompt?: string, mode?: string, inputMode?: string) =>
    this.request<{ _sessionId: string; sessionFocus: string; plan: Record<string, unknown>; remainingSeconds?: number; userPlan?: string; agentMetadata?: Record<string, unknown> }>('/conversation/plan', {
      method: 'POST',
      body: JSON.stringify({ ...(prompt ? { prompt } : {}), ...(mode ? { mode } : {}), ...(inputMode ? { inputMode } : {}) }),
    })
  conversationEnd = (sessionId: string) =>
    this.request<PostSessionResult | null>('/conversation/end', {
      method: 'POST',
      body: JSON.stringify({ sessionId }),
    })
  onboardingPlan = (targetLanguage: string, nativeLanguage: string) =>
    this.request<{ _sessionId: string; sessionFocus: string; plan: Record<string, unknown>; agentMetadata?: Record<string, unknown>; basePrompt: string }>('/conversation/onboarding-plan', {
      method: 'POST',
      body: JSON.stringify({ targetLanguage, nativeLanguage }),
    })

  // Lessons
  lessonsGet = () =>
    this.request<{ lessons: LessonSummary[] }>('/lessons')

  // Profile
  profileGet = () => this.request<ProfileResponse>('/profile')
  profilePatch = (updates: Partial<ProfileResponse>) =>
    this.request<ProfileResponse>('/profile', {
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
