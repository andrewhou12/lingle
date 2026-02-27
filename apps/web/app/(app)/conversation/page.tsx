'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { ArrowUp, Square } from 'lucide-react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type {
  ExpandedSessionPlan,
  ConversationMessage,
  PostSessionAnalysis,
} from '@linguist/shared/types'
import { api } from '@/lib/api'
import { parseMessage, extractTargetsHit, type MessageSegment } from '@/lib/message-parser'
import { VocabCard, GrammarCard, CorrectionCard, ReviewPromptCard } from '@/components/conversation-cards'
import { ChallengeCard } from '@/components/challenge-card'
import { SessionSummaryCard } from '@/components/session-summary'
import { Spinner } from '@/components/spinner'
import { cn } from '@/lib/utils'

type Phase = 'planning' | 'conversation' | 'summary'

export default function ConversationPage() {
  const [phase, setPhase] = useState<Phase>('planning')
  const [sessionPlan, setSessionPlan] = useState<ExpandedSessionPlan | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [analysis, setAnalysis] = useState<PostSessionAnalysis | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [targetsHit, setTargetsHit] = useState<Set<string>>(new Set())
  const sessionStartTime = useRef(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  const handleStartSession = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const plan = await api.conversationPlan()
      setSessionPlan(plan)
      setSessionId(plan._sessionId ?? null)
      setMessages([])
      setTargetsHit(new Set())
      sessionStartTime.current = Date.now()
      setPhase('conversation')
    } catch (err) {
      console.error('Failed to plan session:', err)
      setError(err instanceof Error ? err.message : 'Failed to start session. Please try again.')
    }
    setIsLoading(false)
  }, [])

  const handleSend = useCallback(async () => {
    if (!input.trim() || !sessionId || isSending) return
    const text = input.trim()
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    const userMsg: ConversationMessage = {
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userMsg])
    setIsSending(true)
    setStreamingContent('')

    try {
      await api.conversationSendStream(
        sessionId,
        text,
        (delta) => {
          setStreamingContent((prev) => prev + delta)
        },
        (message) => {
          setMessages((prev) => [...prev, message])
          setStreamingContent('')
          const hits = extractTargetsHit(message.content)
          if (hits.length > 0) {
            setTargetsHit((prev) => {
              const next = new Set(prev)
              for (const h of hits) next.add(h)
              return next
            })
          }
        },
        (error) => {
          console.error('Stream error:', error)
        }
      )
    } catch (err) {
      console.error('Failed to send message:', err)
    }
    setIsSending(false)
  }, [input, sessionId, isSending])

  const handleEndSession = useCallback(async () => {
    if (!sessionId) return
    setIsLoading(true)
    try {
      const result = await api.conversationEnd(sessionId)
      setAnalysis(result)
      setPhase('summary')
    } catch (err) {
      console.error('Failed to end session:', err)
    }
    setIsLoading(false)
  }, [sessionId])

  const handleNewSession = useCallback(() => {
    setPhase('planning')
    setSessionPlan(null)
    setSessionId(null)
    setMessages([])
    setAnalysis(null)
    setTargetsHit(new Set())
    setStreamingContent('')
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend]
  )

  const adjustTextarea = useCallback(() => {
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = Math.min(el.scrollHeight, 200) + 'px'
    }
  }, [])

  // Planning Phase
  if (phase === 'planning') {
    return (
      <div className="max-w-[640px] mx-auto">
        <h1 className="text-[28px] font-bold mb-6">Conversation</h1>
        <p className="text-[15px] text-text-muted mb-6">
          Start a conversation session. The AI will plan targets based on your knowledge state.
        </p>
        {error && (
          <div className="mb-3 p-3 bg-[rgba(200,87,42,.06)] rounded-md">
            <span className="text-[13px] text-accent-warm">{error}</span>
          </div>
        )}
        <button
          className={cn(
            'inline-flex items-center gap-2 rounded-md bg-accent-brand px-5 py-2.5 text-[15px] font-medium text-white border-none cursor-pointer transition-opacity',
            isLoading && 'opacity-50'
          )}
          onClick={handleStartSession}
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <Spinner size={16} />
              Planning session...
            </>
          ) : (
            'Start Session'
          )}
        </button>
      </div>
    )
  }

  // Summary Phase
  if (phase === 'summary' && sessionPlan) {
    const durationSeconds = Math.round((Date.now() - sessionStartTime.current) / 1000)
    const totalTargets = (sessionPlan.targetVocabulary?.length ?? 0) + (sessionPlan.targetGrammar?.length ?? 0)
    return (
      <div className="max-w-[640px] mx-auto">
        <h1 className="text-[28px] font-bold mb-4">Session Complete</h1>
        {analysis && (
          <SessionSummaryCard
            analysis={analysis}
            durationSeconds={durationSeconds}
            totalTargets={totalTargets}
          />
        )}
        <div className="flex gap-3 mt-4">
          <button
            className="rounded-md bg-accent-brand px-5 py-2.5 text-[15px] font-medium text-white border-none cursor-pointer transition-opacity hover:opacity-90"
            onClick={handleNewSession}
          >
            Start New Session
          </button>
        </div>
      </div>
    )
  }

  // Conversation Phase
  return (
    <div className="h-full flex flex-col">
      {/* Session info bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-[13px] font-medium">
            {sessionPlan?.sessionFocus ?? 'Conversation'}
          </span>
          {sessionPlan && (
            <>
              <span className="inline-flex items-center rounded-full bg-bg-secondary px-2 py-0.5 text-[11px] font-medium text-text-secondary">
                {sessionPlan.difficultyLevel}
              </span>
              <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[11px] text-text-muted">
                {sessionPlan.register}
              </span>
            </>
          )}
        </div>
        <button
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md bg-[rgba(200,87,42,.06)] px-3 py-1.5 text-[13px] font-medium text-accent-warm border-none cursor-pointer transition-colors hover:bg-[rgba(200,87,42,.12)]',
            isLoading && 'opacity-50'
          )}
          onClick={handleEndSession}
          disabled={isLoading}
        >
          <Square size={12} />
          End Session
        </button>
      </div>

      {/* Challenge card */}
      {sessionPlan && (
        <div className="px-6">
          <div className="max-w-3xl mx-auto">
            <ChallengeCard plan={sessionPlan} targetsHit={targetsHit} />
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto px-6 py-4">
          {messages.map((msg, i) => (
            <MessageSegmentRenderer key={i} message={msg} />
          ))}

          {streamingContent && (
            <div className="py-3">
              <div className="chat-markdown text-text-primary leading-[1.7] text-[15px]">
                <Markdown remarkPlugins={[remarkGfm]}>{streamingContent}</Markdown>
                <span className="blink-cursor" />
              </div>
            </div>
          )}

          {isSending && !streamingContent && messages.length > 0 && messages[messages.length - 1].role === 'user' && (
            <div className="flex items-center gap-2 py-3">
              <Spinner size={16} />
              <span className="text-[13px] text-text-muted">Thinking...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="px-6 pt-3 pb-6">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-end gap-2 border border-border rounded-3xl py-2 pr-2 pl-5 bg-bg-secondary">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value)
                adjustTextarea()
              }}
              onKeyDown={handleKeyDown}
              placeholder="Type your message..."
              rows={1}
              style={{ maxHeight: 200 }}
              className="flex-1 resize-none border-none bg-transparent text-text-primary text-[15px] leading-normal font-[inherit] outline-none py-1"
            />
            <button
              className={cn(
                'flex items-center justify-center w-8 h-8 rounded-full bg-accent-brand text-white shrink-0 border-none cursor-pointer transition-opacity',
                (!input.trim() || isSending) && 'opacity-40'
              )}
              onClick={handleSend}
              disabled={!input.trim() || isSending}
            >
              <ArrowUp size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Message rendering with structured cards

function MessageSegmentRenderer({ message }: { message: ConversationMessage }) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end py-1.5">
        <div className="max-w-[75%] px-4 py-2.5 rounded-[20px] bg-bg-active text-text-primary leading-relaxed text-[15px] whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    )
  }

  const segments = parseMessage(message.content)

  return (
    <div className="py-3">
      {segments.map((segment, i) => (
        <SegmentComponent key={i} segment={segment} />
      ))}
    </div>
  )
}

function SegmentComponent({ segment }: { segment: MessageSegment }) {
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
