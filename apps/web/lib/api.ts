import type { LearnerProfile } from '@lingle/shared/types'

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
    if (!res.ok) throw new Error(`API error: ${res.status}`)
    this.cache.clear()
    return res.json()
  }

  private async fetchAndCache<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`/api${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    })
    if (!res.ok) throw new Error(`API error: ${res.status}`)
    const data = await res.json()
    this.cache.set(path, { data, ts: Date.now() })
    return data as T
  }

  // User
  userGetMe = () => this.request<{ id: string; email: string | null; name: string | null; avatarUrl: string | null }>('/user/me')

  // Conversation
  conversationPlan = (prompt?: string, mode?: string) =>
    this.request<{ _sessionId: string; sessionFocus: string }>('/conversation/plan', {
      method: 'POST',
      body: JSON.stringify({ ...(prompt ? { prompt } : {}), ...(mode ? { mode } : {}) }),
    })
  conversationEnd = (sessionId: string) =>
    this.request<null>('/conversation/end', {
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

  // Prefetch
  prefetch = () => {
    this.profileGet().catch(() => {})
  }
}

export const api = new LingleApiClient()
