'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeftIcon, ChevronRightIcon, LockClosedIcon } from '@heroicons/react/24/outline'
import { api } from '@/lib/api'
import { Spinner } from '@/components/spinner'
import { MODE_LABELS } from '@/lib/experience-scenarios'
import type { ScenarioMode } from '@/lib/experience-scenarios'
import { cn } from '@/lib/utils'

interface SessionDetail {
  id: string
  timestamp: string
  durationSeconds: number | null
  transcript: { role: string; content: string; timestamp?: string }[]
  sessionPlan: Record<string, unknown> | null
  systemPrompt: string | null
}

interface SessionAnalysis {
  overallRating?: 'excellent' | 'good' | 'developing' | 'needs_work'
  summary?: string
  targetLanguageUsage?: { percentage: number; assessment: string }
  vocabularyUsed?: { word: string; reading?: string; meaning: string; usedWell: boolean }[]
  grammarPoints?: { pattern: string; example: string; correct: boolean; note?: string }[]
  errors?: { original: string; corrected: string; type: string; explanation: string }[]
  strengths?: string[]
  suggestions?: string[]
  skillScores?: Record<string, number>
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

const SKILL_LABELS: Record<string, string> = {
  vocabularyRange: 'Vocabulary range',
  grammarAccuracy: 'Grammar accuracy',
  naturalness: 'Naturalness',
  complexity: 'Complexity',
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

function hasJapanese(text: string): boolean {
  return /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf\u3400-\u4dbf]/.test(text)
}

export default function SessionDetailPage() {
  const params = useParams()
  const router = useRouter()
  const sessionId = params.id as string

  const [detail, setDetail] = useState<SessionDetail | null>(null)
  const [analysis, setAnalysis] = useState<SessionAnalysis | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [requiresPro, setRequiresPro] = useState(false)
  const [insufficientData, setInsufficientData] = useState(false)
  const [sessionMeta, setSessionMeta] = useState<{ mode: string; sessionFocus: string } | null>(null)
  const analysisRef = useRef<SessionAnalysis | null>(null)

  useEffect(() => {
    api.conversationGet(sessionId)
      .then((data) => {
        setDetail(data)
        const plan = data.sessionPlan
        const focus = (plan?.generatedTitle as string) || (plan?.topic as string) || (plan?.focus as string) || ''
        setSessionMeta({ mode: (plan as Record<string, unknown>)?.mode as string ?? 'conversation', sessionFocus: focus })
      })
      .catch(() => setDetail(null))
      .finally(() => setIsLoading(false))

    setIsAnalyzing(true)
    fetch('/api/stats/session-analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    })
      .then(async (res) => {
        const contentType = res.headers.get('content-type') || ''

        if (contentType.includes('application/json')) {
          const data = await res.json()
          if (data.status === 'ok' && data.analysis) {
            analysisRef.current = data.analysis
            setAnalysis(data.analysis)
          } else if (data.status === 'requires_pro') {
            setRequiresPro(true)
          } else if (data.status === 'insufficient_data') {
            setInsufficientData(true)
          }
          setIsAnalyzing(false)
        } else if (contentType.includes('ndjson') && res.body) {
          const reader = res.body.getReader()
          const decoder = new TextDecoder()
          let buffer = ''

          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop()!
            for (const line of lines) {
              if (line.trim()) {
                try {
                  const partial = JSON.parse(line) as SessionAnalysis
                  analysisRef.current = partial
                  setAnalysis(partial)
                } catch { /* skip malformed lines */ }
              }
            }
          }
          if (buffer.trim()) {
            try {
              const final = JSON.parse(buffer) as SessionAnalysis
              analysisRef.current = final
              setAnalysis(final)
            } catch { /* ignore */ }
          }
          setIsAnalyzing(false)
        } else {
          setIsAnalyzing(false)
        }
      })
      .catch(() => setIsAnalyzing(false))
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
  const ratingStyle = analysis?.overallRating ? RATING_STYLES[analysis.overallRating] ?? RATING_STYLES.good : null
  const done = !isAnalyzing

  return (
    <div className="h-full -m-6 p-6 overflow-y-auto">
      <div className="flex flex-col gap-6">
        {/* Back + header */}
        <div>
          <button
            onClick={() => router.push('/progress')}
            className="flex items-center gap-1.5 text-[13px] text-text-muted hover:text-text-primary bg-transparent border-none cursor-pointer mb-4 -ml-0.5 transition-colors"
          >
            <ArrowLeftIcon className="w-3.5 h-3.5" />
            History
          </button>
          <h1 className="text-[20px] font-semibold text-text-primary leading-tight mb-2">
            {topic}
          </h1>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[12px] px-2 py-0.5 rounded-md bg-bg-secondary text-text-muted font-medium">
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
              <span className={`text-[12px] font-medium px-2 py-0.5 rounded-md ${ratingStyle.bg} ${ratingStyle.text}`}>
                {ratingStyle.label}
              </span>
            )}
          </div>
        </div>

        {/* Pro gate */}
        {requiresPro && (
          <div className="bg-bg-pure border border-border-subtle rounded-xl shadow-sm px-5 py-8 text-center">
            <div className="w-10 h-10 rounded-full bg-bg-active border border-border flex items-center justify-center mx-auto mb-3">
              <LockClosedIcon className="w-[18px] h-[18px] text-text-muted" />
            </div>
            <h3 className="text-[15px] font-semibold text-text-primary mb-1.5">
              Upgrade to Pro
            </h3>
            <p className="text-[13px] text-text-secondary leading-relaxed mb-4">
              Get detailed analysis, suggestions, and breakdown for every session.
            </p>
            <button
              onClick={() => router.push('/upgrade')}
              className="px-5 py-2 rounded-lg bg-accent-brand text-white text-[13px] font-medium border-none cursor-pointer transition-colors hover:bg-accent-brand/90"
            >
              Upgrade to Pro
            </button>
          </div>
        )}

        {/* Insufficient data */}
        {insufficientData && (
          <div className="bg-bg-pure border border-border-subtle rounded-xl shadow-sm px-5 py-6 text-center">
            <p className="text-[13px] text-text-secondary font-medium">Not enough learner input</p>
            <p className="text-[13px] text-text-muted mt-1">Try speaking or writing more in your next session to get a detailed analysis.</p>
          </div>
        )}

        {/* Analysis loading */}
        {isAnalyzing && !analysis && !requiresPro && !insufficientData && (
          <div className="bg-bg-pure border border-border-subtle rounded-xl shadow-sm px-5 py-8 flex flex-col items-center gap-3">
            <Spinner size={20} />
            <div className="text-center">
              <p className="text-[14px] text-text-primary font-medium">Analyzing your session</p>
              <p className="text-[13px] text-text-muted mt-1">Reviewing vocabulary, grammar, and errors</p>
            </div>
          </div>
        )}

        {/* Analysis sections — all containers rendered at once to prevent layout shift */}
        {analysis && !requiresPro && (
          <div className="flex flex-col gap-4">
            {/* Summary */}
            <div className={cn(
              'bg-bg-pure border border-border-subtle rounded-xl shadow-sm p-5 transition-opacity duration-300',
              analysis.summary ? 'opacity-100' : (done ? 'hidden' : 'opacity-40'),
            )}>
              <p className="text-[14px] text-text-secondary leading-[1.7]">
                {analysis.summary || 'Generating summary...'}
              </p>
            </div>

            {/* Metrics */}
            <div className={cn(
              'bg-bg-pure border border-border-subtle rounded-xl shadow-sm p-5 transition-opacity duration-300',
              (analysis.targetLanguageUsage || analysis.skillScores) ? 'opacity-100' : (done ? 'hidden' : 'opacity-40'),
            )}>
              <h3 className="text-[14px] font-semibold text-text-primary mb-4">Session metrics</h3>

              {analysis.targetLanguageUsage ? (
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[13px] text-text-secondary">Target language usage</span>
                    <span className="text-[13px] font-medium text-text-primary">{analysis.targetLanguageUsage.percentage}%</span>
                  </div>
                  <div className="h-2 bg-bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent-brand rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(analysis.targetLanguageUsage.percentage, 100)}%` }}
                    />
                  </div>
                  <p className="text-[12px] text-text-muted mt-1">{analysis.targetLanguageUsage.assessment}</p>
                </div>
              ) : !done ? (
                <div className="mb-4">
                  <div className="h-3 w-40 bg-bg-secondary rounded animate-pulse mb-2" />
                  <div className="h-2 bg-bg-secondary rounded-full" />
                </div>
              ) : null}

              {analysis.skillScores ? (
                <div className="flex flex-col gap-2.5">
                  {Object.entries(analysis.skillScores)
                    .filter(([key]) => key in SKILL_LABELS)
                    .map(([key, value]) => (
                      <div key={key}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[13px] text-text-secondary">{SKILL_LABELS[key]}</span>
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
              ) : !done ? (
                <div className="flex flex-col gap-3">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i}>
                      <div className="h-3 w-28 bg-bg-secondary rounded animate-pulse mb-1.5" />
                      <div className="h-1.5 bg-bg-secondary rounded-full" />
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            {/* Strengths & Suggestions side by side */}
            <div className={cn(
              'grid grid-cols-2 gap-4 transition-opacity duration-300',
              (analysis.strengths?.length || analysis.suggestions?.length) ? 'opacity-100' : (done ? 'hidden' : 'opacity-40'),
            )}>
              <AnalysisCard title="Strengths">
                {analysis.strengths && analysis.strengths.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    {analysis.strengths.map((s, i) => (
                      <div key={i} className="text-[13px] text-text-secondary flex items-start gap-2 leading-[1.6]">
                        <span className="shrink-0 mt-[7px] w-1.5 h-1.5 rounded-full bg-green" />
                        {s}
                      </div>
                    ))}
                  </div>
                ) : (
                  <SkeletonLines count={3} />
                )}
              </AnalysisCard>
              <AnalysisCard title="Suggestions">
                {analysis.suggestions && analysis.suggestions.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    {analysis.suggestions.map((s, i) => (
                      <div key={i} className="text-[13px] text-text-secondary flex items-start gap-2 leading-[1.6]">
                        <span className="shrink-0 mt-[7px] w-1.5 h-1.5 rounded-full bg-blue" />
                        {s}
                      </div>
                    ))}
                  </div>
                ) : (
                  <SkeletonLines count={3} />
                )}
              </AnalysisCard>
            </div>

            {/* Corrections */}
            <div className={cn(
              'transition-opacity duration-300',
              (analysis.errors?.length) ? 'opacity-100' : (done ? 'hidden' : 'opacity-40'),
            )}>
              <AnalysisCard title="Corrections">
                {analysis.errors && analysis.errors.length > 0 ? (
                  <div className="flex flex-col gap-3">
                    {analysis.errors.map((e, i) => (
                      <div key={i}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[12px] font-medium px-1.5 py-px rounded bg-bg-secondary text-text-muted">
                            {ERROR_TYPE_LABELS[e.type] ?? e.type}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-[13px] text-red line-through">{e.original}</span>
                          <ChevronRightIcon className="w-3 h-3 text-text-muted shrink-0" />
                          <span className="text-[13px] text-green font-medium">{e.corrected}</span>
                        </div>
                        <p className="text-[13px] text-text-muted leading-[1.5]">{e.explanation}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <SkeletonLines count={2} />
                )}
              </AnalysisCard>
            </div>

            {/* Vocabulary */}
            <div className={cn(
              'transition-opacity duration-300',
              (analysis.vocabularyUsed?.length) ? 'opacity-100' : (done ? 'hidden' : 'opacity-40'),
            )}>
              <AnalysisCard title="Vocabulary used">
                {analysis.vocabularyUsed && analysis.vocabularyUsed.length > 0 ? (
                  <div className="flex flex-col gap-1.5">
                    {analysis.vocabularyUsed.map((v, i) => (
                      <div key={i} className="flex items-center gap-2 text-[13px]">
                        <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', v.usedWell ? 'bg-green' : 'bg-accent-warm')} />
                        <span className="font-medium text-text-primary font-jp">{v.word}</span>
                        {v.reading && <span className="text-text-muted">({v.reading})</span>}
                        <span className="text-text-muted">— {v.meaning}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <SkeletonLines count={4} />
                )}
              </AnalysisCard>
            </div>

            {/* Grammar Points */}
            <div className={cn(
              'transition-opacity duration-300',
              (analysis.grammarPoints?.length) ? 'opacity-100' : (done ? 'hidden' : 'opacity-40'),
            )}>
              <AnalysisCard title="Grammar points">
                {analysis.grammarPoints && analysis.grammarPoints.length > 0 ? (
                  <div className="flex flex-col gap-2.5">
                    {analysis.grammarPoints.map((g, i) => (
                      <div key={i}>
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', g.correct ? 'bg-green' : 'bg-accent-warm')} />
                          <span className="text-[13px] font-medium text-text-primary">{g.pattern}</span>
                        </div>
                        <div className="text-[13px] text-text-muted font-jp pl-[18px]">{g.example}</div>
                        {g.note && <div className="text-[13px] text-text-muted pl-[18px]">{g.note}</div>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <SkeletonLines count={3} />
                )}
              </AnalysisCard>
            </div>

            {/* Still analyzing indicator */}
            {isAnalyzing && (
              <div className="flex items-center justify-center gap-2 py-2">
                <Spinner size={14} />
                <span className="text-[13px] text-text-muted">Still analyzing...</span>
              </div>
            )}
          </div>
        )}

        {/* No analysis available */}
        {!analysis && !isAnalyzing && !requiresPro && !insufficientData && (
          <div className="bg-bg-pure border border-border-subtle rounded-xl shadow-sm px-5 py-6 text-center">
            <p className="text-[13px] text-text-muted">Analysis unavailable for this session</p>
          </div>
        )}

        {/* Transcript */}
        <div>
          <h3 className="text-[14px] font-semibold text-text-primary mb-3">Transcript</h3>
          <div className="bg-bg-pure border border-border-subtle rounded-xl shadow-sm p-5">
            {messages.length > 0 ? (
              <div className="flex flex-col gap-3">
                {messages.map((msg, i) => {
                  const isUser = msg.role === 'user'
                  const isJp = hasJapanese(msg.content)
                  return (
                    <div key={i} className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
                      <div
                        className={cn(
                          'max-w-[80%] px-4 py-2.5 rounded-2xl leading-[1.7] whitespace-pre-wrap',
                          isUser
                            ? 'bg-accent-brand text-white rounded-br-md'
                            : 'bg-bg-secondary text-text-primary rounded-bl-md',
                          isJp ? 'font-jp text-[15px]' : 'text-[14px]',
                        )}
                      >
                        {msg.content}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-[13px] text-text-muted text-center py-8">No transcript available</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function AnalysisCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-bg-pure border border-border-subtle rounded-xl shadow-sm p-5">
      <h3 className="text-[14px] font-semibold text-text-primary mb-3">{title}</h3>
      {children}
    </div>
  )
}

function SkeletonLines({ count }: { count: number }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="h-3 bg-bg-secondary rounded animate-pulse" style={{ width: `${75 - i * 10}%` }} />
      ))}
    </div>
  )
}
