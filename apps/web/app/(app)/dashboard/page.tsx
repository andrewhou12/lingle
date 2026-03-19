'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

function getCefrLabel(score: number): string {
  if (score < 1.5) return 'A1'
  if (score < 2.5) return 'A2'
  if (score < 3.5) return 'B1'
  if (score < 4.5) return 'B2'
  if (score < 5.5) return 'C1'
  return 'C2'
}

function getCefrDescription(score: number): string {
  if (score < 1.5) return 'Beginner'
  if (score < 2.5) return 'Elementary'
  if (score < 3.5) return 'Intermediate'
  if (score < 4.5) return 'Upper Intermediate'
  if (score < 5.5) return 'Advanced'
  return 'Proficient'
}

interface ProfileData {
  totalLessons: number
  cefrGrammar: number | null
  cefrFluency: number | null
  sessionsCompleted: number
}

export default function DashboardPage() {
  const router = useRouter()
  const [user, setUser] = useState<{ name: string | null } | null>(null)
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [topic, setTopic] = useState('')

  useEffect(() => {
    api.userGetMe().then((u) => setUser({ name: u.name })).catch(() => {})
    api.profileGet().then(setProfile).catch(() => {})
  }, [])

  const handleStart = () => {
    const params = new URLSearchParams()
    if (topic.trim()) params.set('topic', topic.trim())
    const query = params.toString()
    router.push(`/conversation/voice${query ? `?${query}` : ''}`)
  }

  const firstName = user?.name?.split(' ')[0] || 'there'
  const grammar = profile?.cefrGrammar ?? null
  const fluency = profile?.cefrFluency ?? null

  return (
    <div className="max-w-[520px]">
      {/* Welcome */}
      <div className="mb-8">
        <h1 className="text-[22px] font-semibold text-text-primary tracking-tight mb-1">
          Welcome back, {firstName}
        </h1>
        <p className="text-[14px] text-text-muted">
          {profile && profile.totalLessons > 0
            ? `${profile.totalLessons} session${profile.totalLessons === 1 ? '' : 's'} completed`
            : 'Ready for your first session?'}
        </p>
      </div>

      {/* Start session card */}
      <div className="bg-bg-pure border border-border-subtle rounded-xl p-5 shadow-sm mb-6">
        <div className="text-[13px] font-medium text-text-secondary mb-3">Start a session</div>
        <div className="flex gap-2">
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleStart()}
            placeholder="Topic (optional) — e.g. ordering food, weekend plans"
            className="flex-1 px-3 py-2 rounded-lg border border-border bg-bg text-[14px] text-text-primary placeholder:text-text-placeholder outline-none focus:border-border-strong transition-colors"
          />
          <button
            onClick={handleStart}
            className="px-5 py-2 rounded-lg bg-accent-brand text-white text-[14px] font-medium cursor-pointer border-none hover:opacity-90 transition-opacity shrink-0"
          >
            Start
          </button>
        </div>
      </div>

      {/* CEFR levels */}
      {grammar !== null && fluency !== null && (
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-bg-pure border border-border-subtle rounded-xl p-4 shadow-sm">
            <div className="text-[11px] uppercase tracking-[0.08em] text-text-muted font-medium mb-2">Grammar</div>
            <div className="flex items-baseline gap-2">
              <span className="text-[24px] font-semibold text-text-primary tracking-tight">
                {getCefrLabel(grammar)}
              </span>
              <span className="text-[12px] text-text-muted">{getCefrDescription(grammar)}</span>
            </div>
            <div className="mt-2 h-1 rounded-full bg-bg-active overflow-hidden">
              <div
                className="h-full rounded-full bg-accent-brand transition-[width] duration-500"
                style={{ width: `${Math.min(100, (grammar / 6) * 100)}%` }}
              />
            </div>
          </div>
          <div className="bg-bg-pure border border-border-subtle rounded-xl p-4 shadow-sm">
            <div className="text-[11px] uppercase tracking-[0.08em] text-text-muted font-medium mb-2">Fluency</div>
            <div className="flex items-baseline gap-2">
              <span className="text-[24px] font-semibold text-text-primary tracking-tight">
                {getCefrLabel(fluency)}
              </span>
              <span className="text-[12px] text-text-muted">{getCefrDescription(fluency)}</span>
            </div>
            <div className="mt-2 h-1 rounded-full bg-bg-active overflow-hidden">
              <div
                className="h-full rounded-full bg-accent-warm transition-[width] duration-500"
                style={{ width: `${Math.min(100, (fluency / 6) * 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Quick start suggestions */}
      <div className="flex flex-wrap gap-2">
        {['Free conversation', 'Ordering at a restaurant', 'Job interview practice', 'Travel planning'].map((suggestion) => (
          <button
            key={suggestion}
            onClick={() => {
              setTopic(suggestion === 'Free conversation' ? '' : suggestion)
              const params = new URLSearchParams()
              if (suggestion !== 'Free conversation') params.set('topic', suggestion)
              router.push(`/conversation/voice${params.toString() ? `?${params}` : ''}`)
            }}
            className={cn(
              'px-3 py-1.5 rounded-full border text-[13px] cursor-pointer transition-colors',
              'bg-bg-pure border-border text-text-secondary hover:bg-bg-hover hover:text-text-primary hover:border-border-strong',
            )}
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  )
}
