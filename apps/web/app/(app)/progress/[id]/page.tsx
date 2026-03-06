'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, ChevronRight } from 'lucide-react'
import { api } from '@/lib/api'
import { Spinner } from '@/components/spinner'
import { MessageBlock } from '@/components/chat/message-block'
import { SkillHexagon } from '@/components/skill-hexagon'
import { MODE_LABELS } from '@/lib/experience-scenarios'
import type { ScenarioMode } from '@/lib/experience-scenarios'

interface SessionDetail {
  id: string
  timestamp: string
  durationSeconds: number | null
  transcript: { role: string; content: string; timestamp?: string }[]
  sessionPlan: Record<string, unknown> | null
  systemPrompt: string | null
}

interface SessionAnalysis {
  overallRating: 'excellent' | 'good' | 'developing' | 'needs_work'
  summary: string
  targetLanguageUsage: { percentage: number; assessment: string }
  vocabularyUsed: { word: string; reading?: string; meaning: string; usedWell: boolean }[]
  grammarPoints: { pattern: string; example: string; correct: boolean; note?: string }[]
  errors: { original: string; corrected: string; type: string; explanation: string }[]
  strengths: string[]
  suggestions: string[]
  skillScores: Record<string, number>
}

const RATING_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  excellent: { bg: 'bg-green-soft', text: 'text-green', label: 'Excellent' },
  good: { bg: 'bg-blue-soft', text: 'text-blue', label: 'Good' },
  developing: { bg: 'bg-warm-soft', text: 'text-accent-warm', label: 'Developing' },
  needs_work: { bg: 'bg-red-soft', text: 'text-red', label: 'Needs Work' },
}

const ERROR_TYPE_LABELS: Record<string, string> = {
  grammar: 'Grammar',
  vocabulary: 'Vocab',
  spelling: 'Spelling',
  particle: 'Particle',
  conjugation: 'Conjugation',
  word_choice: 'Word Choice',
}

function formatDateTime(timestamp: string): string {
  const d = new Date(timestamp)
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return ''
  const mins = Math.round(seconds / 60)
  return `${mins} min`
}

export default function SessionDetailPage() {
  const params = useParams()
  const router = useRouter()
  const sessionId = params.id as string

  const [detail, setDetail] = useState<SessionDetail | null>(null)
  const [analysis, setAnalysis] = useState<SessionAnalysis | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [sessionMeta, setSessionMeta] = useState<{ mode: string; sessionFocus: string } | null>(null)

  useEffect(() => {
    // Fetch session detail
    api.conversationGet(sessionId)
      .then((data) => {
        setDetail(data)
        const plan = data.sessionPlan
        const focus = (plan?.generatedTitle as string) || (plan?.topic as string) || (plan?.focus as string) || ''
        setSessionMeta({ mode: (plan as Record<string, unknown>)?.mode as string ?? 'conversation', sessionFocus: focus })
      })
      .catch(() => setDetail(null))
      .finally(() => setIsLoading(false))

    // Fetch session analysis
    setIsAnalyzing(true)
    api.statsSessionAnalysis(sessionId)
      .then((data) => {
        if (data.status === 'ok' && data.analysis) {
          setAnalysis(data.analysis)
        }
      })
      .catch(() => {})
      .finally(() => setIsAnalyzing(false))
  }, [sessionId])

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 justify-center pt-12">
        <Spinner size={18} />
        <span className="text-[13px] text-text-muted">Loading session...</span>
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="text-center pt-12">
        <p className="text-[13px] text-text-muted">Session not found</p>
        <button
          onClick={() => router.push('/progress')}
          className="text-[13px] text-accent-brand mt-2 bg-transparent border-none cursor-pointer underline"
        >
          Back to History
        </button>
      </div>
    )
  }

  const plan = detail.sessionPlan
  const topic = (plan?.generatedTitle as string) || (plan?.topic as string) || (plan?.focus as string) || 'Session'
  const mode = sessionMeta?.mode || 'conversation'
  const messages = Array.isArray(detail.transcript)
    ? detail.transcript.filter((m) => m.role === 'user' || m.role === 'assistant')
    : []
  const ratingStyle = analysis ? RATING_STYLES[analysis.overallRating] ?? RATING_STYLES.good : null

  return (
    <div className="h-full -m-6 p-6 overflow-y-auto">
      <div className="flex flex-col gap-6 max-w-[960px]">
        {/* Back + header */}
        <div>
          <button
            onClick={() => router.push('/progress')}
            className="flex items-center gap-1.5 text-[13px] text-text-muted hover:text-text-primary bg-transparent border-none cursor-pointer mb-3 -ml-0.5 transition-colors"
          >
            <ArrowLeft size={14} />
            History
          </button>
          <h1 className="text-[20px] font-semibold text-text-primary leading-tight mb-1.5">
            {topic}
          </h1>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] px-2 py-0.5 rounded bg-bg-secondary text-text-muted font-semibold uppercase tracking-wide">
              {MODE_LABELS[mode as ScenarioMode] || mode}
            </span>
            <span className="text-[13px] text-text-secondary">
              {formatDateTime(detail.timestamp)}
            </span>
            {detail.durationSeconds && (
              <span className="text-[13px] text-text-muted">
                · {formatDuration(detail.durationSeconds)}
              </span>
            )}
            {ratingStyle && (
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${ratingStyle.bg} ${ratingStyle.text} uppercase tracking-wide`}>
                {ratingStyle.label}
              </span>
            )}
          </div>
        </div>

        {/* Analysis summary banner */}
        {analysis && (
          <div className="bg-bg-pure border border-border-subtle rounded-xl shadow-[0_1px_2px_rgba(0,0,0,.04)] p-4">
            <p className="text-[14px] text-text-secondary leading-relaxed">{analysis.summary}</p>
            <div className="flex items-center gap-4 mt-3">
              <div className="flex items-center gap-1.5">
                <span className="text-[12px] text-text-muted">Target language:</span>
                <span className="text-[13px] font-semibold text-text-primary">{analysis.targetLanguageUsage.percentage}%</span>
              </div>
              <span className="text-[12px] text-text-muted">{analysis.targetLanguageUsage.assessment}</span>
            </div>
          </div>
        )}

        {/* Main content: two columns */}
        <div className="grid grid-cols-[1fr_340px] gap-5">
          {/* Left: Transcript */}
          <div>
            <div className="text-[11px] font-semibold tracking-[0.07em] uppercase text-text-muted mb-2">
              Transcript
            </div>
            <div className="bg-bg-pure border border-border-subtle rounded-xl shadow-[0_1px_2px_rgba(0,0,0,.04)] p-4">
              {messages.length > 0 ? (
                messages.map((msg, i) => (
                  <MessageBlock
                    key={i}
                    role={msg.role as 'user' | 'assistant'}
                    content={msg.content}
                  />
                ))
              ) : (
                <p className="text-[13px] text-text-muted text-center py-8">No transcript available</p>
              )}
            </div>
          </div>

          {/* Right: Analysis sidebar */}
          <div className="flex flex-col gap-3">
            {isAnalyzing ? (
              <>
                <AnalysisSkeleton />
                <AnalysisSkeleton />
                <AnalysisSkeleton />
              </>
            ) : analysis ? (
              <>
                {/* Skill hexagon */}
                <div className="bg-bg-pure border border-border-subtle rounded-xl shadow-[0_1px_2px_rgba(0,0,0,.04)] p-3">
                  <div className="text-[11px] font-semibold tracking-[0.07em] uppercase text-text-muted mb-1">
                    Session Skills
                  </div>
                  <SkillHexagon scores={analysis.skillScores} />
                </div>

                {/* Strengths */}
                {analysis.strengths.length > 0 && (
                  <div className="bg-bg-pure border border-border-subtle rounded-xl shadow-[0_1px_2px_rgba(0,0,0,.04)] p-3">
                    <div className="text-[11px] font-semibold tracking-[0.07em] uppercase text-text-muted mb-2">
                      💪 Strengths
                    </div>
                    <div className="space-y-1.5">
                      {analysis.strengths.map((s, i) => (
                        <div key={i} className="text-[12px] text-text-secondary flex items-start gap-1.5">
                          <span className="shrink-0 mt-1.5 w-1 h-1 rounded-full bg-green" />
                          {s}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Errors / Corrections */}
                {analysis.errors.length > 0 && (
                  <div className="bg-bg-pure border border-border-subtle rounded-xl shadow-[0_1px_2px_rgba(0,0,0,.04)] p-3">
                    <div className="text-[11px] font-semibold tracking-[0.07em] uppercase text-text-muted mb-2">
                      ✏️ Corrections
                    </div>
                    <div className="space-y-2.5">
                      {analysis.errors.map((e, i) => (
                        <div key={i} className="text-[12px]">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="text-[10px] font-semibold px-1.5 py-px rounded bg-bg-secondary text-text-muted uppercase tracking-wide">
                              {ERROR_TYPE_LABELS[e.type] ?? e.type}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-red line-through">{e.original}</span>
                            <ChevronRight size={10} className="text-text-muted" />
                            <span className="text-green font-medium">{e.corrected}</span>
                          </div>
                          <div className="text-text-muted text-[11px]">{e.explanation}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Vocabulary */}
                {analysis.vocabularyUsed.length > 0 && (
                  <div className="bg-bg-pure border border-border-subtle rounded-xl shadow-[0_1px_2px_rgba(0,0,0,.04)] p-3">
                    <div className="text-[11px] font-semibold tracking-[0.07em] uppercase text-text-muted mb-2">
                      📚 Vocabulary Used
                    </div>
                    <div className="space-y-1">
                      {analysis.vocabularyUsed.map((v, i) => (
                        <div key={i} className="flex items-center gap-2 text-[12px]">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${v.usedWell ? 'bg-green' : 'bg-accent-warm'}`} />
                          <span className="font-medium text-text-primary font-jp">{v.word}</span>
                          {v.reading && <span className="text-text-muted">({v.reading})</span>}
                          <span className="text-text-muted">— {v.meaning}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Grammar Points */}
                {analysis.grammarPoints.length > 0 && (
                  <div className="bg-bg-pure border border-border-subtle rounded-xl shadow-[0_1px_2px_rgba(0,0,0,.04)] p-3">
                    <div className="text-[11px] font-semibold tracking-[0.07em] uppercase text-text-muted mb-2">
                      📐 Grammar Points
                    </div>
                    <div className="space-y-2">
                      {analysis.grammarPoints.map((g, i) => (
                        <div key={i} className="text-[12px]">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${g.correct ? 'bg-green' : 'bg-accent-warm'}`} />
                            <span className="font-medium text-text-primary">{g.pattern}</span>
                          </div>
                          <div className="text-text-muted font-jp pl-3">{g.example}</div>
                          {g.note && <div className="text-text-muted pl-3 text-[11px]">{g.note}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Suggestions */}
                {analysis.suggestions.length > 0 && (
                  <div className="bg-bg-pure border border-border-subtle rounded-xl shadow-[0_1px_2px_rgba(0,0,0,.04)] p-3">
                    <div className="text-[11px] font-semibold tracking-[0.07em] uppercase text-text-muted mb-2">
                      💡 Suggestions
                    </div>
                    <div className="space-y-1.5">
                      {analysis.suggestions.map((s, i) => (
                        <div key={i} className="text-[12px] text-text-secondary flex items-start gap-1.5">
                          <span className="shrink-0 mt-1.5 w-1 h-1 rounded-full bg-blue" />
                          {s}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="bg-bg-pure border border-border-subtle rounded-xl shadow-[0_1px_2px_rgba(0,0,0,.04)] px-4 py-6 text-center">
                <div className="text-[13px] text-text-muted">Analysis unavailable for this session</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function AnalysisSkeleton() {
  return (
    <div className="bg-bg-pure border border-border-subtle rounded-xl shadow-[0_1px_2px_rgba(0,0,0,.04)] p-3">
      <div className="skeleton h-3 w-20 mb-3" />
      <div className="skeleton h-3 w-full mb-2" />
      <div className="skeleton h-3 w-3/4" />
    </div>
  )
}
