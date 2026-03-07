'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ChevronRightIcon, ChartBarIcon, ClockIcon, FireIcon, BoltIcon } from '@heroicons/react/24/outline'
import { api } from '@/lib/api'
import { Spinner } from '@/components/spinner'
import { MODE_LABELS } from '@/lib/experience-scenarios'
import type { ScenarioMode } from '@/lib/experience-scenarios'
import { useLanguage } from '@/hooks/use-language'

interface SessionSummary {
  id: string
  timestamp: string
  durationSeconds: number | null
  mode: string
  sessionFocus: string
}

interface StatsSummary {
  totalSessions: number
  totalMinutes: number
  currentStreak: number
  longestStreak: number
  averageSessionMinutes: number
}

function formatRelativeTime(timestamp: string): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return ''
  const mins = Math.round(seconds / 60)
  return `${mins} min`
}

export default function ProgressPage() {
  const { targetLanguage } = useLanguage()
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [stats, setStats] = useState<StatsSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    setIsLoading(true)
    Promise.all([
      api.conversationList(),
      api.statsSummary(),
    ]).then(([s, st]) => {
      setSessions(s)
      setStats(st)
      setIsLoading(false)
    }).catch(() => setIsLoading(false))
  }, [targetLanguage])

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 justify-center pt-12">
        <Spinner size={18} />
        <span className="text-[13px] text-text-muted">Loading history...</span>
      </div>
    )
  }

  const filteredSessions = sessions.filter(s => s.durationSeconds !== null && s.durationSeconds >= 60)

  return (
    <div className="h-full -m-6 p-6 overflow-y-auto">
      <div className="flex flex-col gap-6 max-w-[960px]">
        {/* Stats cards */}
        {stats && (
          <div className="grid grid-cols-4 gap-3">
            <StatCard icon={<ChartBarIcon className="w-4 h-4 text-text-muted" />} label="Sessions" value={stats.totalSessions} />
            <StatCard
              icon={<ClockIcon className="w-4 h-4 text-text-muted" />}
              label="Practice time"
              value={stats.totalMinutes > 60 ? `${Math.round(stats.totalMinutes / 60 * 10) / 10}h` : `${stats.totalMinutes}m`}
            />
            <StatCard
              icon={<FireIcon className="w-4 h-4 text-text-muted" />}
              label="Streak"
              value={`${stats.currentStreak}d`}
              sublabel={`best: ${stats.longestStreak}d`}
            />
            <StatCard icon={<BoltIcon className="w-4 h-4 text-text-muted" />} label="Avg session" value={`${stats.averageSessionMinutes}m`} />
          </div>
        )}

        {/* Session history */}
        <div>
          <div className="text-[11px] font-semibold tracking-[0.07em] uppercase text-text-muted mb-2">
            Session History
          </div>
          {filteredSessions.length === 0 ? (
            <div className="bg-bg-pure border border-border-subtle rounded-xl p-6 text-center">
              <p className="text-[13px] text-text-muted">No sessions yet. Start practicing to see your history here.</p>
            </div>
          ) : (
            <div className="bg-bg-pure border border-border-subtle rounded-xl overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,.04)]">
              {filteredSessions.map((session, i) => {
                const label = session.sessionFocus || MODE_LABELS[session.mode as ScenarioMode] || 'Session'
                return (
                  <Link
                    key={session.id}
                    href={`/progress/${session.id}`}
                    className="flex items-center gap-3 px-4 py-3 w-full text-left transition-colors no-underline hover:bg-bg-hover"
                    style={{ borderTop: i > 0 ? '1px solid var(--border-subtle)' : 'none' }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium text-text-primary truncate">{label}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[11px] px-1.5 py-px rounded bg-bg-secondary text-text-muted font-medium uppercase tracking-wide">
                          {MODE_LABELS[session.mode as ScenarioMode] || session.mode}
                        </span>
                        <span className="text-[11px] text-text-muted">
                          {formatRelativeTime(session.timestamp)}
                          {session.durationSeconds ? ` · ${formatDuration(session.durationSeconds)}` : ''}
                        </span>
                      </div>
                    </div>
                    <ChevronRightIcon className="w-3.5 h-3.5 text-text-muted shrink-0" />
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
  sublabel,
}: {
  icon: React.ReactNode
  label: string
  value: string | number
  sublabel?: string
}) {
  return (
    <div className="bg-bg-pure border border-border-subtle rounded-xl shadow-[0_1px_2px_rgba(0,0,0,.04)] p-4">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-[12px] text-text-muted font-medium">{label}</span>
      </div>
      <div className="text-[22px] font-bold text-text-primary leading-none">{value}</div>
      {sublabel && (
        <div className="text-[11px] text-text-muted mt-1">{sublabel}</div>
      )}
    </div>
  )
}
