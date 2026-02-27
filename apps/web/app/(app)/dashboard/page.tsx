'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { ReviewSummary, WeeklyStats } from '@linguist/shared/types'
import { useFrontier } from '@/hooks/use-frontier'
import { DailyBrief } from './daily-brief'
import { FrontierContainer } from './frontier/frontier-container'
import { Skeleton } from '@/components/skeleton'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

export default function DashboardPage() {
  const [summary, setSummary] = useState<ReviewSummary | null>(null)
  const [dueCount, setDueCount] = useState<number | null>(null)
  const [weeklyStats, setWeeklyStats] = useState<WeeklyStats | null>(null)
  const { data: frontierData } = useFrontier()

  useEffect(() => {
    api.reviewGetSummary().then(setSummary)
    api.reviewGetQueue().then((q) => setDueCount(q.length))
    api.dashboardGetWeeklyStats().then(setWeeklyStats)
  }, [])

  const isLoading = summary === null || dueCount === null || weeklyStats === null

  return (
    <div>
      <h1 className="text-[28px] font-bold mb-4">Dashboard</h1>

      <div className="flex gap-4 flex-wrap">
        {/* Due for Review */}
        <div className="min-w-[200px] flex-1 rounded-xl border border-border bg-bg p-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xl">📋</span>
              <span className="text-[13px] text-text-muted">Due for Review</span>
            </div>
            {isLoading ? (
              <>
                <Skeleton width={60} height={36} />
                <Skeleton width={120} height={12} />
                <Skeleton width="100%" height={32} borderRadius={6} />
              </>
            ) : (
              <>
                <span className="text-4xl font-bold">{dueCount}</span>
                <span className="text-[11px] text-text-muted">
                  {dueCount === 0 ? 'All caught up!' : `${dueCount} card${dueCount === 1 ? '' : 's'} waiting`}
                </span>
                <Link
                  href="/review"
                  className="mt-1 inline-flex items-center justify-center rounded-md bg-bg-secondary px-4 py-2 text-[13px] font-medium text-text-secondary no-underline transition-colors duration-150 hover:bg-bg-hover"
                >
                  Start Review
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Reviewed Today */}
        <div className="min-w-[200px] flex-1 rounded-xl border border-border bg-bg p-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xl">✅</span>
              <span className="text-[13px] text-text-muted">Reviewed Today</span>
            </div>
            {isLoading ? (
              <>
                <Skeleton width={60} height={36} />
                <Skeleton width={100} height={12} />
              </>
            ) : (
              <>
                <span className="text-4xl font-bold">{summary?.totalReviewed ?? 0}</span>
                <div className="flex items-center gap-1">
                  <span className="text-sm">🎯</span>
                  <span className="text-[11px] text-text-muted">
                    Accuracy: {summary ? Math.round(summary.accuracy * 100) : 0}%
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* This Week */}
        <div className="min-w-[360px] flex-[2] rounded-xl border border-border bg-bg p-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">📊</span>
              <span className="text-[13px] text-text-muted">This Week</span>
            </div>
            {isLoading ? (
              <div className="flex items-stretch">
                {['Streak', 'Reviews', 'Sessions', 'Learned'].map((label, i, arr) => (
                  <div
                    key={label}
                    className={cn(
                      'flex flex-col gap-2 flex-1 px-3 py-2',
                      i < arr.length - 1 && 'border-r border-border'
                    )}
                  >
                    <Skeleton width={50} height={24} />
                    <Skeleton width={60} height={10} />
                  </div>
                ))}
              </div>
            ) : (
              <>
                <div className="flex items-stretch">
                  {[
                    { emoji: '🔥', value: weeklyStats?.currentStreak ?? 0, label: 'Streak' },
                    { emoji: '📝', value: weeklyStats?.reviewsThisWeek ?? 0, label: 'Reviews' },
                    { emoji: '💬', value: weeklyStats?.sessionsThisWeek ?? 0, label: 'Sessions' },
                    { emoji: '🧠', value: weeklyStats?.itemsLearned ?? 0, label: 'Learned' },
                  ].map((stat, i, arr) => (
                    <div
                      key={stat.label}
                      className={cn(
                        'flex flex-col gap-1 flex-1 px-3 py-2',
                        i < arr.length - 1 && 'border-r border-border'
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{stat.emoji}</span>
                        <span className="text-xl font-bold">{stat.value}</span>
                      </div>
                      <span className="text-[11px] text-text-muted">{stat.label}</span>
                    </div>
                  ))}
                </div>
                {weeklyStats && weeklyStats.reviewsThisWeek > 0 && (
                  <div className="flex items-center gap-1">
                    <span className="text-sm">🎯</span>
                    <span className="text-[11px] text-text-muted">
                      {Math.round(weeklyStats.accuracyThisWeek * 100)}% accuracy
                    </span>
                    <span className="text-[11px] text-text-muted">·</span>
                    <span className="text-sm">🏆</span>
                    <span className="text-[11px] text-text-muted">
                      Best Streak {weeklyStats.longestStreak}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {frontierData && <DailyBrief frontier={frontierData} />}

      <FrontierContainer />
    </div>
  )
}
