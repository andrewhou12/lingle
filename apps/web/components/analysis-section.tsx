'use client'

import { useState, useEffect } from 'react'
import { api } from '@/lib/api'

interface LevelAssessment {
  currentLevel: string
  confidence: 'low' | 'medium' | 'high'
  summary: string
  evidencePoints: string[]
}

interface Strength {
  area: string
  detail: string
}

interface MistakePattern {
  pattern: string
  detail: string
  severity: 'minor' | 'notable' | 'persistent'
}

interface SkillScores {
  vocabularyRange: number
  grammarAccuracy: number
  naturalness: number
  complexity: number
}

interface AnalysisData {
  status: 'ok' | 'insufficient_data'
  sessionCount?: number
  analysis?: {
    levelAssessment: LevelAssessment
    strengths: Strength[]
    mistakesAndHabits: MistakePattern[]
    skillScores: SkillScores
  }
}

const CONFIDENCE_DOTS: Record<string, number> = { low: 1, medium: 2, high: 3 }

const SEVERITY_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  persistent: { bg: 'bg-warm-soft', text: 'text-accent-warm', label: 'Persistent' },
  notable: { bg: 'bg-blue-soft', text: 'text-blue', label: 'Notable' },
  minor: { bg: 'bg-bg-secondary', text: 'text-text-muted', label: 'Minor' },
}

const SKILL_LABELS: Record<string, string> = {
  vocabularyRange: 'Vocabulary range',
  grammarAccuracy: 'Grammar accuracy',
  naturalness: 'Naturalness',
  complexity: 'Complexity',
}

export function AnalysisSection() {
  const [data, setData] = useState<AnalysisData | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    api.statsAnalysis()
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setIsLoading(false))
  }, [])

  if (isLoading) {
    return (
      <div>
        <h3 className="text-[14px] font-semibold text-text-primary mb-3">Learner analysis</h3>
        <div className="flex flex-col gap-3">
          <SkeletonCard height="h-[100px]" />
          <SkeletonCard height="h-[80px]" />
        </div>
      </div>
    )
  }

  if (!data || data.status === 'insufficient_data' || !data.analysis) {
    return (
      <div>
        <h3 className="text-[14px] font-semibold text-text-primary mb-3">Learner analysis</h3>
        <div className="bg-bg-pure border border-border-subtle rounded-xl shadow-sm px-5 py-4 flex items-center gap-4">
          <div className="text-[24px] opacity-30">🔬</div>
          <div>
            <p className="text-[13px] font-medium text-text-primary">Not enough data yet</p>
            <p className="text-[13px] text-text-muted">
              Complete a few more sessions to unlock your analysis.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const { levelAssessment, strengths, mistakesAndHabits, skillScores } = data.analysis
  const confidenceDots = CONFIDENCE_DOTS[levelAssessment.confidence] ?? 1

  return (
    <div>
      <h3 className="text-[14px] font-semibold text-text-primary mb-3">Learner analysis</h3>
      <div className="flex flex-col gap-3">
        {/* Level Assessment */}
        <div className="bg-bg-pure border border-border-subtle rounded-xl shadow-sm p-5">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[13px] font-bold text-text-primary px-2 py-0.5 rounded-md bg-bg-secondary">
              {levelAssessment.currentLevel}
            </span>
            <div className="flex gap-1">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={`w-1.5 h-1.5 rounded-full ${
                    i <= confidenceDots ? 'bg-accent-brand' : 'bg-border-subtle'
                  }`}
                />
              ))}
            </div>
            <span className="text-[13px] text-text-muted">{levelAssessment.confidence} confidence</span>
          </div>
          <p className="text-[14px] text-text-secondary leading-[1.7] mb-2">
            {levelAssessment.summary}
          </p>
          <ul className="flex flex-col gap-1.5">
            {levelAssessment.evidencePoints.map((point, i) => (
              <li key={i} className="text-[13px] text-text-muted flex items-start gap-2">
                <span className="shrink-0 mt-[7px] w-1 h-1 rounded-full bg-text-muted" />
                {point}
              </li>
            ))}
          </ul>
        </div>

        {/* Skill bars */}
        <div className="bg-bg-pure border border-border-subtle rounded-xl shadow-sm p-5">
          <h4 className="text-[14px] font-semibold text-text-primary mb-4">Skill profile</h4>
          <div className="flex flex-col gap-2.5">
            {Object.entries(skillScores).map(([key, value]) => (
              <div key={key}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[13px] text-text-secondary">{SKILL_LABELS[key] || key}</span>
                  <span className="text-[13px] font-medium text-text-primary tabular-nums">{value}</span>
                </div>
                <div className="h-1.5 bg-bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent-brand/70 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(value, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="text-[13px] text-text-muted mt-3">
            Based on {data.sessionCount ?? 'recent'} sessions
          </p>
        </div>

        {/* Strengths */}
        <div className="bg-bg-pure border border-border-subtle rounded-xl shadow-sm p-5">
          <h4 className="text-[14px] font-semibold text-text-primary mb-3">Strengths</h4>
          <div className="flex flex-col gap-2.5">
            {strengths.map((s, i) => (
              <div key={i} className="border-l-2 border-green pl-3">
                <p className="text-[13px] font-medium text-text-primary">{s.area}</p>
                <p className="text-[13px] text-text-muted">{s.detail}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Patterns to Work On */}
        <div className="bg-bg-pure border border-border-subtle rounded-xl shadow-sm p-5">
          <h4 className="text-[14px] font-semibold text-text-primary mb-3">Patterns to work on</h4>
          <div className="flex flex-col gap-2.5">
            {mistakesAndHabits.map((m, i) => {
              const style = SEVERITY_STYLES[m.severity] ?? SEVERITY_STYLES.minor
              return (
                <div key={i} className="flex items-start gap-2">
                  <span className={`text-[12px] font-medium px-1.5 py-0.5 rounded-md ${style.bg} ${style.text} shrink-0 mt-0.5`}>
                    {style.label}
                  </span>
                  <div>
                    <p className="text-[13px] font-medium text-text-primary">{m.pattern}</p>
                    <p className="text-[13px] text-text-muted">{m.detail}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function SkeletonCard({ height }: { height: string }) {
  return (
    <div className={`bg-bg-pure border border-border-subtle rounded-xl shadow-sm p-5 ${height}`}>
      <div className="skeleton h-3 w-24 mb-3" />
      <div className="skeleton h-3 w-full mb-2" />
      <div className="skeleton h-3 w-3/4 mb-2" />
      <div className="skeleton h-3 w-1/2" />
    </div>
  )
}
