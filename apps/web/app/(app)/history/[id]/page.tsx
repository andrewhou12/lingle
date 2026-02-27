'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Clock } from 'lucide-react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ConversationMessage, ExpandedSessionPlan } from '@linguist/shared/types'
import { api } from '@/lib/api'
import { parseMessage, type MessageSegment } from '@/lib/message-parser'
import { VocabCard, GrammarCard, CorrectionCard, ReviewPromptCard } from '@/components/conversation-cards'
import { AnnotatedMessage, type Annotation } from '@/components/annotated-message'
import { SessionAnalysisPanel } from '@/components/session-analysis-panel'
import { Spinner } from '@/components/spinner'

type SessionDetail = Awaited<ReturnType<typeof api.conversationDetail>>

export default function SessionDetailPage() {
  const params = useParams()
  const id = params.id as string
  const [session, setSession] = useState<SessionDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    api.conversationDetail(id).then((data) => {
      setSession(data)
      setIsLoading(false)
    }).catch((err) => {
      console.error('Failed to load session:', err)
      setIsLoading(false)
    })
  }, [id])

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-2 py-4">
          <Spinner size={16} />
          <span className="text-text-muted text-[13px]">Loading session...</span>
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="max-w-3xl mx-auto">
        <span className="text-text-muted text-[13px]">Session not found.</span>
      </div>
    )
  }

  const transcript = (session.transcript ?? []) as ConversationMessage[]
  const plan = session.sessionPlan as ExpandedSessionPlan | null
  const targetsHit = (session.targetsHit ?? []) as number[]
  const errorsLogged = (session.errorsLogged ?? []) as Array<{ itemId: number; errorType: string; contextQuote: string }>
  const avoidanceEvents = (session.avoidanceEvents ?? []) as Array<{ itemId: number; contextQuote: string }>
  const targetsPlanned = (session.targetsPlanned ?? { vocabulary: [], grammar: [] }) as { vocabulary: number[]; grammar: number[] }

  const date = new Date(session.timestamp)
  const mins = session.durationSeconds ? Math.max(1, Math.round(session.durationSeconds / 60)) : null

  // Build annotation index: for each message, match context quotes
  function getAnnotationsForMessage(content: string): Annotation[] {
    const annotations: Annotation[] = []
    for (const id of targetsHit) {
      annotations.push({ type: 'target_hit', label: `Target #${id}` })
    }
    for (const err of errorsLogged) {
      if (err.contextQuote && content.includes(err.contextQuote)) {
        annotations.push({ type: 'error', label: err.contextQuote })
      }
    }
    for (const ev of avoidanceEvents) {
      if (ev.contextQuote && content.includes(ev.contextQuote)) {
        annotations.push({ type: 'avoidance', label: ev.contextQuote })
      }
    }
    return annotations
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <Link
          href="/history"
          className="flex items-center justify-center p-1.5 rounded-md text-text-secondary no-underline transition-colors hover:bg-bg-hover"
        >
          <ArrowLeft size={16} />
        </Link>
        <div className="flex flex-col">
          <h1 className="text-[22px] font-bold m-0">
            {date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
          </h1>
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-text-muted">
              {date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
            </span>
            {mins && (
              <div className="flex items-center gap-1">
                <Clock size={12} className="text-text-muted" />
                <span className="text-[13px] text-text-muted">{mins}m</span>
              </div>
            )}
            {plan && (
              <>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-bg-secondary text-[11px] font-medium text-text-secondary">
                  {plan.difficultyLevel}
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full border border-border text-[11px] text-text-muted">
                  {plan.register}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {plan?.sessionFocus && (
        <p className="text-[13px] text-text-muted mb-4">
          {plan.sessionFocus}
        </p>
      )}

      {/* Annotated Transcript */}
      <div className="mb-4">
        {transcript.map((msg, i) => {
          const annotations = msg.role === 'user' ? [] : getAnnotationsForMessage(msg.content).filter(
            (a) => a.type === 'error' || a.type === 'avoidance'
          )

          if (msg.role === 'user') {
            return (
              <div key={i} className="flex justify-end py-1.5">
                <div className="max-w-[75%] px-4 py-2.5 rounded-[20px] bg-bg-active text-text-primary leading-relaxed text-[15px] whitespace-pre-wrap">
                  {msg.content}
                </div>
              </div>
            )
          }

          const segments = parseMessage(msg.content)
          return (
            <AnnotatedMessage key={i} annotations={annotations}>
              <div className="py-3">
                {segments.map((seg, j) => (
                  <SegmentRenderer key={j} segment={seg} />
                ))}
              </div>
            </AnnotatedMessage>
          )
        })}
      </div>

      {/* Session Analysis */}
      <SessionAnalysisPanel
        targetsPlanned={targetsPlanned}
        targetsHit={targetsHit}
        errorsLogged={errorsLogged}
        avoidanceEvents={avoidanceEvents}
        durationSeconds={session.durationSeconds}
      />
    </div>
  )
}

function SegmentRenderer({ segment }: { segment: MessageSegment }) {
  switch (segment.type) {
    case 'vocab_card':
      return <VocabCard segment={segment} />
    case 'grammar_card':
      return <GrammarCard segment={segment} />
    case 'correction':
      return <CorrectionCard segment={segment} />
    case 'review_prompt':
      return <ReviewPromptCard segment={segment} />
    case 'targets_hit':
      return null
    case 'text':
    default:
      if (!segment.content.trim()) return null
      return (
        <div className="chat-markdown text-text-primary leading-[1.7] text-[15px]">
          <Markdown remarkPlugins={[remarkGfm]}>{segment.content}</Markdown>
        </div>
      )
  }
}
