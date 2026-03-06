'use client'

import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import { SkillHexagon } from './skill-hexagon'

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
  reading: number
  listening: number
  speaking: number
  writing: number
  vocabulary: number
  grammar: number
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

const DEFAULT_SCORES: SkillScores = {
  reading: 0, listening: 0, speaking: 0, writing: 0, vocabulary: 0, grammar: 0,
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
        <div className="text-[11px] font-semibold tracking-[0.07em] uppercase text-text-muted mb-2">
          Learner Analysis
        </div>
        <div className="grid grid-cols-[1fr_280px] gap-3">
          <div className="flex flex-col gap-3">
            <SkeletonCard height="h-[100px]" />
            <SkeletonCard height="h-[80px]" />
          </div>
          <SkeletonCard height="h-[190px]" />
        </div>
      </div>
    )
  }

  if (!data || data.status === 'insufficient_data' || !data.analysis) {
    return (
      <div>
        <div className="text-[11px] font-semibold tracking-[0.07em] uppercase text-text-muted mb-2">
          Learner Analysis
        </div>
        <div className="bg-bg-pure border border-border-subtle rounded-xl shadow-[0_1px_2px_rgba(0,0,0,.04)] px-5 py-4 flex items-center gap-4">
          <div className="text-[24px] opacity-30">🔬</div>
          <div>
            <div className="text-[13px] font-medium text-text-primary">Not enough data yet</div>
            <p className="text-[12px] text-text-muted">
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
      <div className="text-[11px] font-semibold tracking-[0.07em] uppercase text-text-muted mb-2">
        Learner Analysis
      </div>
      <div className="grid grid-cols-[1fr_260px] gap-3">
        {/* Left column: text cards */}
        <div className="flex flex-col gap-3">
          {/* Level Assessment */}
          <div className="bg-bg-pure border border-border-subtle rounded-xl shadow-[0_1px_2px_rgba(0,0,0,.04)] p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[13px] font-bold text-text-primary px-2 py-0.5 rounded bg-bg-secondary">
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
              <span className="text-[11px] text-text-muted">{levelAssessment.confidence} confidence</span>
            </div>
            <p className="text-[13px] text-text-secondary leading-relaxed mb-2">
              {levelAssessment.summary}
            </p>
            <ul className="space-y-1">
              {levelAssessment.evidencePoints.map((point, i) => (
                <li key={i} className="text-[12px] text-text-muted flex items-start gap-1.5">
                  <span className="shrink-0 mt-1.5 w-1 h-1 rounded-full bg-text-muted" />
                  {point}
                </li>
              ))}
            </ul>
          </div>

          {/* Strengths */}
          <div className="bg-bg-pure border border-border-subtle rounded-xl shadow-[0_1px_2px_rgba(0,0,0,.04)] p-3">
            <div className="text-[11px] font-semibold tracking-[0.07em] uppercase text-text-muted mb-2">
              Strengths
            </div>
            <div className="space-y-2">
              {strengths.map((s, i) => (
                <div key={i} className="border-l-2 border-green pl-3">
                  <div className="text-[13px] font-medium text-text-primary">{s.area}</div>
                  <div className="text-[12px] text-text-muted">{s.detail}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Patterns to Work On */}
          <div className="bg-bg-pure border border-border-subtle rounded-xl shadow-[0_1px_2px_rgba(0,0,0,.04)] p-3">
            <div className="text-[11px] font-semibold tracking-[0.07em] uppercase text-text-muted mb-2">
              Patterns to Work On
            </div>
            <div className="space-y-2">
              {mistakesAndHabits.map((m, i) => {
                const style = SEVERITY_STYLES[m.severity] ?? SEVERITY_STYLES.minor
                return (
                  <div key={i} className="flex items-start gap-2">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${style.bg} ${style.text} uppercase tracking-wide shrink-0 mt-0.5`}>
                      {style.label}
                    </span>
                    <div>
                      <div className="text-[13px] font-medium text-text-primary">{m.pattern}</div>
                      <div className="text-[12px] text-text-muted">{m.detail}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Right column: hexagon */}
        <div className="bg-bg-pure border border-border-subtle rounded-xl shadow-[0_1px_2px_rgba(0,0,0,.04)] p-3 flex flex-col items-center">
          <div className="text-[11px] font-semibold tracking-[0.07em] uppercase text-text-muted mb-1 self-start">
            Skill Profile
          </div>
          <SkillHexagon scores={skillScores as unknown as Record<string, number>} />
          <div className="text-[11px] text-text-muted">
            Based on {data.sessionCount ?? 'recent'} sessions
          </div>
        </div>
      </div>
    </div>
  )
}

function SkeletonCard({ height }: { height: string }) {
  return (
    <div className={`bg-bg-pure border border-border-subtle rounded-xl shadow-[0_1px_2px_rgba(0,0,0,.04)] p-4 ${height}`}>
      <div className="skeleton h-3 w-24 mb-3" />
      <div className="skeleton h-3 w-full mb-2" />
      <div className="skeleton h-3 w-3/4 mb-2" />
      <div className="skeleton h-3 w-1/2" />
    </div>
  )
}
