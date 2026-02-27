'use client'

import { useRouter } from 'next/navigation'
import type { SessionStats } from '@/hooks/use-review'

const MASTERY_STYLES: Record<string, { bg: string; color: string }> = {
  unseen: { bg: 'var(--bg-secondary)', color: 'var(--text-muted)' },
  introduced: { bg: 'var(--bg-secondary)', color: 'var(--text-muted)' },
  apprentice_1: { bg: 'rgba(200,87,42,.07)', color: 'var(--accent-warm)' },
  apprentice_2: { bg: 'rgba(200,87,42,.07)', color: 'var(--accent-warm)' },
  apprentice_3: { bg: 'rgba(245,158,11,.08)', color: '#f59e0b' },
  apprentice_4: { bg: 'rgba(245,158,11,.08)', color: '#f59e0b' },
  journeyman: { bg: 'rgba(245,158,11,.08)', color: '#f59e0b' },
  expert: { bg: 'rgba(22,163,106,.08)', color: '#16a34a' },
  master: { bg: 'rgba(59,130,246,.08)', color: '#3b82f6' },
  burned: { bg: 'rgba(139,92,246,.08)', color: '#8b5cf6' },
}

function formatMasteryLabel(state: string): string {
  return state.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

function getAccuracyColor(accuracy: number): string {
  if (accuracy >= 80) return '#16a34a'
  if (accuracy >= 60) return '#f59e0b'
  return 'var(--accent-warm)'
}

export function SessionSummary({ stats }: { stats: SessionStats }) {
  const router = useRouter()
  const accuracy = stats.reviewed > 0 ? Math.round((stats.correct / stats.reviewed) * 100) : 0

  return (
    <div className="max-w-[500px] mx-auto">
      <h1 className="text-[28px] font-bold mb-6 text-center">Session Complete</h1>

      <div className="flex gap-4 mb-6 justify-center">
        <div className="min-w-[120px] text-center rounded-xl border border-border bg-bg p-4">
          <div className="flex flex-col gap-1 items-center">
            <span className="text-[13px] text-text-muted">Reviewed</span>
            <span className="text-4xl font-bold">{stats.reviewed}</span>
          </div>
        </div>
        <div className="min-w-[120px] text-center rounded-xl border border-border bg-bg p-4">
          <div className="flex flex-col gap-1 items-center">
            <span className="text-[13px] text-text-muted">Accuracy</span>
            <span className="text-4xl font-bold" style={{ color: getAccuracyColor(accuracy) }}>
              {accuracy}%
            </span>
          </div>
        </div>
      </div>

      <div className="mb-6">
        <div className="h-2 rounded bg-bg-active overflow-hidden">
          <div
            className="h-full rounded transition-[width] duration-500 ease-out"
            style={{
              background: getAccuracyColor(accuracy), width: `${accuracy}%`,
            }}
          />
        </div>
      </div>

      {stats.masteryChanges.length > 0 && (
        <div className="mb-6 rounded-xl border border-border bg-bg p-4">
          <div className="flex flex-col gap-3">
            <span className="text-[15px] font-bold">Mastery Changes</span>
            {stats.masteryChanges.map((change, i) => {
              const fromStyle = MASTERY_STYLES[change.from] ?? { bg: 'var(--bg-secondary)', color: 'var(--text-muted)' }
              const toStyle = MASTERY_STYLES[change.to] ?? { bg: 'var(--bg-secondary)', color: 'var(--text-muted)' }
              return (
                <div key={i} className="flex items-center gap-2 flex-wrap">
                  <span className="text-[13px] min-w-[80px]">{change.surfaceForm}</span>
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium"
                    style={{ background: fromStyle.bg, color: fromStyle.color }}
                  >
                    {formatMasteryLabel(change.from)}
                  </span>
                  <span className="text-[13px] text-text-muted">&rarr;</span>
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium"
                    style={{ background: toStyle.bg, color: toStyle.color }}
                  >
                    {formatMasteryLabel(change.to)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex justify-center">
        <button
          className="rounded-md bg-accent-brand px-5 py-2.5 text-[15px] font-medium text-white border-none cursor-pointer transition-opacity hover:opacity-90"
          onClick={() => router.push('/dashboard')}
        >
          Done
        </button>
      </div>
    </div>
  )
}
