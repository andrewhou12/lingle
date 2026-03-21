'use client'

import { useState, useEffect, useCallback } from 'react'
import type { RedisSessionState, LessonPhase } from '@lingle/shared'
import { cn } from '@/lib/utils'

interface DevToolsPanelProps {
  sessionId: string | null
  voiceState: string
  duration: number
  isActive: boolean
  transcript: Array<{ role: string; text: string; isFinal: boolean; timestamp: number }>
}

export function DevToolsPanel({ sessionId, voiceState, duration, isActive, transcript }: DevToolsPanelProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [tab, setTab] = useState<'session' | 'plan' | 'state' | 'prompt' | 'transcript'>('session')
  const [sessionState, setSessionState] = useState<RedisSessionState | null>(null)
  const [stateLoading, setStateLoading] = useState(false)
  const [postResult, setPostResult] = useState<Record<string, unknown> | null>(null)

  // Poll session state from Redis
  const fetchState = useCallback(async () => {
    if (!sessionId) return
    setStateLoading(true)
    try {
      const res = await fetch(`/api/dev/session-state?sessionId=${sessionId}`)
      const data = await res.json()
      if (data.state) setSessionState(data.state)
    } catch {}
    setStateLoading(false)
  }, [sessionId])

  // Auto-poll every 5s when active and plan, state, or prompt tab is open
  useEffect(() => {
    if (!isActive || !isOpen || (tab !== 'state' && tab !== 'plan' && tab !== 'prompt')) return
    fetchState()
    const iv = setInterval(fetchState, 5000)
    return () => clearInterval(iv)
  }, [isActive, isOpen, tab, fetchState])

  const handleTestPostSession = async (fixture: string) => {
    try {
      const res = await fetch('/api/dev/test-post-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fixture }),
      })
      const data = await res.json()
      setPostResult(data)
    } catch (err) {
      setPostResult({ error: String(err) })
    }
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed top-3 right-3 z-[100] px-2.5 py-1 rounded-md bg-bg-active border border-border text-[11px] font-mono text-text-muted cursor-pointer hover:bg-bg-hover hover:text-text-primary transition-colors"
      >
        DEV
      </button>
    )
  }

  return (
    <div className="fixed top-0 right-0 bottom-0 w-[380px] z-[100] bg-bg-pure border-l border-border shadow-pop overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-bg-secondary">
        <span className="text-[12px] font-mono font-semibold text-text-primary">Dev Tools</span>
        <button
          onClick={() => setIsOpen(false)}
          className="text-[11px] text-text-muted cursor-pointer bg-transparent border-none hover:text-text-primary"
        >
          Close
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        {(['session', 'plan', 'state', 'prompt', 'transcript'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'flex-1 py-2 text-[11px] font-medium cursor-pointer bg-transparent border-none transition-colors',
              tab === t ? 'text-text-primary border-b-2 border-accent-brand' : 'text-text-muted hover:text-text-secondary',
            )}
          >
            {t === 'session' ? 'Session' : t === 'plan' ? 'Plan' : t === 'state' ? 'Redis' : t === 'prompt' ? 'Prompt' : 'Transcript'}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-3 text-[12px] font-mono">
        {tab === 'session' && (
          <div className="flex flex-col gap-3">
            <Section title="Connection">
              <Row label="Session ID" value={sessionId || '—'} />
              <Row label="Voice State" value={voiceState} />
              <Row label="Active" value={isActive ? 'yes' : 'no'} />
              <Row label="Duration" value={`${duration}s`} />
              <Row label="Turns" value={String(transcript.length)} />
            </Section>

            <Section title="Quick Actions">
              <div className="flex flex-col gap-1.5">
                <ActionButton label="Test Post-Session (beginner)" onClick={() => handleTestPostSession('beginner')} />
                <ActionButton label="Test Post-Session (intermediate)" onClick={() => handleTestPostSession('intermediate')} />
                <ActionButton label="Test Post-Session (advanced)" onClick={() => handleTestPostSession('advanced')} />
                <ActionButton label="Fetch Session State" onClick={fetchState} disabled={!sessionId} />
                <ActionButton
                  label="Copy Metadata JSON"
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify({ sessionId, voiceState, duration, turnCount: transcript.length }, null, 2))
                  }}
                />
              </div>
            </Section>

            {postResult && (
              <Section title="Post-Session Result">
                <pre className="text-[10px] leading-relaxed whitespace-pre-wrap break-all text-text-secondary bg-bg-secondary rounded-md p-2 max-h-[300px] overflow-auto">
                  {JSON.stringify(postResult, null, 2)}
                </pre>
              </Section>
            )}
          </div>
        )}

        {tab === 'plan' && (
          <PlanTab sessionState={sessionState} sessionId={sessionId} loading={stateLoading} onRetry={fetchState} />
        )}

        {tab === 'state' && (
          <div className="flex flex-col gap-3">
            {!sessionId && (
              <div className="text-text-muted text-center py-4">No active session</div>
            )}
            {sessionId && stateLoading && !sessionState && (
              <div className="text-text-muted text-center py-4">Loading...</div>
            )}
            {sessionState && (
              <>
                <Section title="Lesson">
                  <Row label="Phase" value={sessionState.currentPhase} />
                  <Row label="Extension" value={sessionState.phaseExtensionGranted ? 'granted' : 'no'} />
                  <Row label="Topic" value={sessionState.lessonPlan?.core?.topic ?? '—'} />
                </Section>
                <Section title={`Errors (${sessionState.errorsLogged.length})`}>
                  {sessionState.errorsLogged.length === 0 ? (
                    <div className="text-text-muted">None logged</div>
                  ) : (
                    sessionState.errorsLogged.map((e, i) => (
                      <div key={i} className="py-1 border-b border-border-subtle last:border-0">
                        <div className="text-text-primary">{e.userUtterance} &rarr; {e.correction}</div>
                        <div className="text-text-muted">{e.errorDetail} ({e.errorType}, {e.severity})</div>
                      </div>
                    ))
                  )}
                </Section>
                <Section title={`Corrections Queued (${sessionState.correctionsQueued.length})`}>
                  {sessionState.correctionsQueued.map((c, i) => (
                    <div key={i} className="py-1 border-b border-border-subtle last:border-0">
                      <div className="text-text-primary">&ldquo;{c.userUtterance}&rdquo; &rarr; &ldquo;{c.correction}&rdquo;</div>
                      <div className="text-text-muted mt-0.5">{c.errorDetail}</div>
                    </div>
                  ))}
                </Section>
                <Section title="Whiteboard">
                  <Row label="New Material" value={sessionState.whiteboardContent?.newMaterial?.map((i) => i.content).join(', ') || 'none'} />
                  <Row label="Corrections" value={sessionState.whiteboardContent?.corrections?.map((i) => i.content).join(', ') || 'none'} />
                </Section>
                <Section title="Raw JSON">
                  <pre className="text-[10px] leading-relaxed whitespace-pre-wrap break-all text-text-secondary bg-bg-secondary rounded-md p-2 max-h-[300px] overflow-auto">
                    {JSON.stringify(sessionState, null, 2)}
                  </pre>
                </Section>
              </>
            )}
            {sessionId && !stateLoading && !sessionState && (
              <div className="text-text-muted text-center py-4">
                No state in Redis.
                <button onClick={fetchState} className="block mx-auto mt-2 text-accent-brand bg-transparent border-none cursor-pointer underline">
                  Retry
                </button>
              </div>
            )}
          </div>
        )}

        {tab === 'prompt' && (
          <div className="flex flex-col gap-3">
            {!sessionId && (
              <div className="text-text-muted text-center py-4">No active session</div>
            )}
            {sessionId && stateLoading && !sessionState && (
              <div className="text-text-muted text-center py-4">Loading...</div>
            )}
            {sessionState ? (
              <Section title="Session State (used for prompt injection)">
                <pre className="text-[10px] leading-relaxed whitespace-pre-wrap break-words text-text-secondary bg-bg-secondary rounded-md p-2 max-h-[600px] overflow-auto">
                  {JSON.stringify(sessionState, null, 2)}
                </pre>
              </Section>
            ) : sessionId ? (
              <div className="text-text-muted text-center py-4">
                No state yet (waiting for session start).
                <button onClick={fetchState} className="block mx-auto mt-2 text-accent-brand bg-transparent border-none cursor-pointer underline">
                  Retry
                </button>
              </div>
            ) : null}
          </div>
        )}

        {tab === 'transcript' && (
          <div className="flex flex-col gap-1">
            {transcript.length === 0 && (
              <div className="text-text-muted text-center py-4">No transcript yet</div>
            )}
            {transcript.map((line, i) => (
              <div
                key={i}
                className={cn(
                  'py-1.5 px-2 rounded',
                  line.role === 'user' ? 'bg-blue-soft' : 'bg-bg-secondary',
                )}
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={cn('text-[10px] font-semibold uppercase', line.role === 'user' ? 'text-blue' : 'text-accent-warm')}>
                    {line.role}
                  </span>
                  <span className="text-[10px] text-text-muted">
                    {new Date(line.timestamp).toLocaleTimeString()}
                  </span>
                  {!line.isFinal && <span className="text-[9px] text-text-muted">(partial)</span>}
                </div>
                <div className="text-[11px] text-text-primary leading-relaxed">{line.text}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Plan Tab ────────────────────────────────────────────────────────────────

function PlanTab({ sessionState, sessionId, loading, onRetry }: {
  sessionState: RedisSessionState | null
  sessionId: string | null
  loading: boolean
  onRetry: () => void
}) {
  if (!sessionId) {
    return <div className="text-text-muted text-center py-4">No active session</div>
  }
  if (loading && !sessionState) {
    return <div className="text-text-muted text-center py-4">Loading...</div>
  }
  if (!sessionState) {
    return (
      <div className="text-text-muted text-center py-4">
        No state in Redis.
        <button onClick={onRetry} className="block mx-auto mt-2 text-accent-brand bg-transparent border-none cursor-pointer underline">
          Retry
        </button>
      </div>
    )
  }

  const plan = sessionState.lessonPlan
  if (!plan) {
    return <div className="text-text-muted text-center py-4">No lesson plan</div>
  }

  const currentPhase = sessionState.currentPhase
  const phaseElapsedMin = sessionState.phaseStartTimeMs
    ? Math.round((Date.now() - sessionState.phaseStartTimeMs) / 60000 * 10) / 10
    : 0

  const phases: LessonPhase[] = ['warmup', 'review', 'core', 'debrief', 'closing']
  const currentIdx = phases.indexOf(currentPhase)

  return (
    <div className="flex flex-col gap-3">
      <Section title="Lesson Plan">
        <Row label="Topic" value={plan.core.topic} />
        <Row label="Angle" value={plan.core.angle} />
        <Row label="Grammar" value={plan.core.targetGrammar || '—'} />
        <Row label="Review" value={plan.review.skip ? 'Skipped' : `${plan.review.vocabItems.length} vocab, ${plan.review.grammarItems.length} grammar`} />
      </Section>

      <Section title="Phase Progression">
        <div className="flex flex-col gap-1">
          {phases.map((phase, i) => {
            const isCurrent = phase === currentPhase
            const isDone = i < currentIdx
            const budget = plan.phaseBudgetMinutes[phase] ?? 0
            const icon = isDone ? '✓' : isCurrent ? '▶' : ' '
            const elapsed = isCurrent ? ` (${phaseElapsedMin}m elapsed)` : ''

            return (
              <div
                key={i}
                className={cn(
                  'flex items-center gap-2 py-1 px-1.5 rounded text-[11px]',
                  isCurrent ? 'bg-accent-brand/10 text-text-primary font-semibold' : isDone ? 'text-text-muted' : 'text-text-secondary',
                )}
              >
                <span className="w-4 text-center flex-shrink-0">{icon}</span>
                <span className="flex-1">
                  {i + 1}. {phase.toUpperCase()}
                  <span className="text-text-muted font-normal"> ({budget}m)</span>
                  {elapsed && <span className="text-accent-warm font-normal">{elapsed}</span>}
                </span>
              </div>
            )
          })}
        </div>
      </Section>

      <Section title="Full Plan JSON">
        <pre className="text-[10px] leading-relaxed whitespace-pre-wrap break-all text-text-secondary bg-bg-secondary rounded-md p-2 max-h-[300px] overflow-auto">
          {JSON.stringify(plan, null, 2)}
        </pre>
      </Section>
    </div>
  )
}

// ─── Shared Components ───────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold mb-1.5">{title}</div>
      <div className="bg-bg-secondary rounded-md p-2">{children}</div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-0.5">
      <span className="text-text-muted">{label}</span>
      <span className="text-text-primary text-right max-w-[200px] truncate" title={value}>{value}</span>
    </div>
  )
}

function ActionButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'text-left px-2 py-1.5 rounded text-[11px] cursor-pointer border transition-colors',
        disabled
          ? 'bg-bg text-text-muted border-border cursor-not-allowed'
          : 'bg-bg-pure text-text-secondary border-border hover:bg-bg-hover hover:text-text-primary',
      )}
    >
      {label}
    </button>
  )
}
