'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Square } from 'lucide-react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, type UIMessage } from 'ai'
import type {
  ExpandedSessionPlan,
  PostSessionAnalysis,
} from '@linguist/shared/types'
import { api } from '@/lib/api'
import { stripRubyAnnotations } from '@/lib/ruby-annotator'
import { useRomaji, useAnnotatedTexts } from '@/hooks/use-romaji'
import { useTTS } from '@/hooks/use-tts'
import { RomajiText } from '@/components/romaji-text'
import { VocabCard, GrammarCard, CorrectionCard, ReviewPromptCard } from '@/components/conversation-cards'
import { ChallengeCard } from '@/components/challenge-card'
import { MessageBlock } from '@/components/chat/message-block'
import { ChatInput } from '@/components/chat/chat-input'
import { EscapeHatch } from '@/components/chat/escape-hatch'
import { SuggestionChips } from '@/components/chat/suggestion-chips'
import { SessionSummaryModal } from '@/components/chat/session-summary-modal'
import { Spinner } from '@/components/spinner'
import { cn } from '@/lib/utils'

type Phase = 'planning' | 'conversation' | 'summary'

const DEFAULT_SUGGESTIONS = [
  'こんにちは！',
  'What should we talk about?',
  'もう一度お願いします',
]

export default function ConversationPage() {
  const [phase, setPhase] = useState<Phase>('planning')
  const [sessionPlan, setSessionPlan] = useState<ExpandedSessionPlan | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<PostSessionAnalysis | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [targetsHit, setTargetsHit] = useState<Set<string>>(new Set())
  const [showSummaryModal, setShowSummaryModal] = useState(false)
  const sessionStartTime = useRef(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const sessionIdRef = useRef<string | null>(null)
  sessionIdRef.current = sessionId
  const { showRomaji, toggle: toggleRomaji } = useRomaji()
  const tts = useTTS()

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/conversation/send',
        body: () => (sessionIdRef.current ? { sessionId: sessionIdRef.current } : {}),
      }),
    []
  )

  const {
    messages,
    sendMessage,
    status,
    setMessages,
  } = useChat({ transport })

  const isSending = status === 'streaming' || status === 'submitted'

  // Extract text from assistant messages for romaji annotation
  const assistantTexts = useMemo(
    () =>
      messages
        .filter((m) => m.role === 'assistant')
        .map((m) => {
          const textParts = m.parts.filter((p) => p.type === 'text')
          return textParts.map((p) => (p as { type: 'text'; text: string }).text).join('')
        }),
    [messages]
  )
  const { getAnnotated } = useAnnotatedTexts(assistantTexts, showRomaji)

  // Extract targets hit from markTargetsHit tool calls
  useEffect(() => {
    const newHits = new Set<string>()
    for (const msg of messages) {
      if (msg.role !== 'assistant') continue
      for (const part of msg.parts) {
        if (
          'type' in part &&
          typeof part.type === 'string' &&
          part.type === 'tool-markTargetsHit' &&
          'state' in part &&
          part.state === 'output-available' &&
          'output' in part
        ) {
          const output = part.output as { vocab_ids?: string[]; grammar_ids?: string[] }
          for (const id of output.vocab_ids ?? []) newHits.add(id)
          for (const id of output.grammar_ids ?? []) newHits.add(id)
        }
      }
    }
    if (newHits.size > 0) {
      setTargetsHit((prev) => {
        const next = new Set(prev)
        for (const h of newHits) next.add(h)
        return next
      })
    }
  }, [messages])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

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
  }, [setMessages])

  const handleSend = useCallback(async () => {
    if (!input.trim() || !sessionId || isSending) return
    const text = input.trim()
    setInput('')
    await sendMessage({ text })
  }, [input, sessionId, isSending, sendMessage])

  const handleSuggestionSelect = useCallback((text: string) => {
    setInput(text)
  }, [])

  const handleEscapeHatch = useCallback(() => {
    setInput("I'd like to switch to English for a moment: ")
  }, [])

  const handleEndSession = useCallback(async () => {
    if (!sessionId) return
    setIsLoading(true)
    try {
      const result = await api.conversationEnd(sessionId)
      setAnalysis(result)
      setPhase('summary')
      setShowSummaryModal(true)
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
    setShowSummaryModal(false)
  }, [setMessages])

  // Planning Phase
  if (phase === 'planning') {
    return (
      <div className="h-full flex flex-col items-center justify-center">
        <div className="max-w-[480px] w-full flex flex-col items-center text-center">
          {/* Sensei avatar */}
          <div className="w-16 h-16 rounded-2xl bg-accent-brand flex items-center justify-center mb-5 shadow-[var(--shadow-md)]">
            <span className="text-[28px] font-jp font-bold text-white leading-none">先</span>
          </div>

          <h1 className="text-[26px] font-bold text-text-primary mb-2">Ready to practice?</h1>
          <p className="text-[15px] text-text-secondary mb-8 max-w-[360px] leading-relaxed">
            Sensei will tailor a conversation to your level, targeting vocabulary and grammar you need to reinforce.
          </p>

          {error && (
            <div className="mb-4 p-3 bg-warm-soft rounded-lg w-full">
              <span className="text-[13px] text-accent-warm">{error}</span>
            </div>
          )}

          {/* Start button */}
          <button
            className={cn(
              'inline-flex items-center justify-center gap-2.5 rounded-xl bg-accent-brand px-8 py-3 text-[15px] font-semibold text-white border-none cursor-pointer transition-all hover:shadow-[var(--shadow-md)] hover:scale-[1.02] active:scale-[0.98]',
              isLoading && 'opacity-60 pointer-events-none'
            )}
            onClick={handleStartSession}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Spinner size={16} />
                Planning your session...
              </>
            ) : (
              <>
                <span className="text-[18px]">🗣️</span>
                Start Conversation
              </>
            )}
          </button>

          {/* Info cards */}
          <div className="grid grid-cols-3 gap-4 mt-10 w-full">
            <div className="flex flex-col items-center gap-2.5 p-5 rounded-xl bg-bg-pure border border-border-subtle">
              <span className="text-[26px]">🎯</span>
              <span className="text-[14px] font-medium text-text-secondary">Personalized</span>
              <span className="text-[13px] text-text-muted leading-snug">Targets your weak spots</span>
            </div>
            <div className="flex flex-col items-center gap-2.5 p-5 rounded-xl bg-bg-pure border border-border-subtle">
              <span className="text-[26px]">📝</span>
              <span className="text-[14px] font-medium text-text-secondary">Gentle corrections</span>
              <span className="text-[13px] text-text-muted leading-snug">Learn from mistakes</span>
            </div>
            <div className="flex flex-col items-center gap-2.5 p-5 rounded-xl bg-bg-pure border border-border-subtle">
              <span className="text-[26px]">📊</span>
              <span className="text-[14px] font-medium text-text-secondary">Session review</span>
              <span className="text-[13px] text-text-muted leading-snug">Track your progress</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Summary Phase (modal overlay on conversation)
  if (phase === 'summary' && sessionPlan) {
    const durationSeconds = Math.round((Date.now() - sessionStartTime.current) / 1000)

    return (
      <>
        <div className="max-w-[640px] mx-auto">
          <h1 className="text-[28px] font-bold mb-4">Session Complete</h1>
          <p className="text-[15px] text-text-muted mb-4">
            {analysis?.overallAssessment || 'Great work on your conversation practice!'}
          </p>
          <div className="flex gap-3">
            <button
              className="rounded-xl bg-accent-brand px-5 py-2.5 text-[15px] font-medium text-white border-none cursor-pointer transition-opacity hover:opacity-90"
              onClick={handleNewSession}
            >
              Start New Session
            </button>
          </div>
        </div>

        {analysis && (
          <SessionSummaryModal
            isOpen={showSummaryModal}
            onClose={() => setShowSummaryModal(false)}
            analysis={analysis}
            plan={sessionPlan}
            durationSeconds={durationSeconds}
          />
        )}
      </>
    )
  }

  // Conversation Phase
  return (
    <div className="h-full flex flex-col -m-6">
      {/* Session info sticky bar */}
      <div className="flex items-center justify-between px-6 py-2.5 border-b border-border shrink-0 bg-bg">
        <div className="flex items-center gap-3">
          <span className="text-[13px] font-medium text-text-primary">
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
            'inline-flex items-center gap-1.5 rounded-lg bg-warm-soft px-3 py-1.5 text-[13px] font-medium text-accent-warm border-none cursor-pointer transition-colors hover:bg-warm-med',
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
          {messages.map((msg) => (
            <UIMessageRenderer
              key={msg.id}
              message={msg}
              showRomaji={showRomaji}
              getAnnotated={getAnnotated}
              onPlay={
                msg.role === 'assistant' && msg.parts.some((p) => p.type === 'text' && (p as { type: 'text'; text: string }).text.trim())
                  ? () => {
                      const textContent = msg.parts
                        .filter((p) => p.type === 'text')
                        .map((p) => (p as { type: 'text'; text: string }).text)
                        .join('')
                      tts.play(msg.id, textContent)
                    }
                  : undefined
              }
              onStop={msg.role === 'assistant' && msg.parts.some((p) => p.type === 'text' && (p as { type: 'text'; text: string }).text.trim()) ? tts.stop : undefined}
              isPlayingAudio={tts.playingId === msg.id}
              isStreaming={isSending && msg === messages[messages.length - 1] && msg.role === 'assistant'}
            />
          ))}

          {/* Loading indicator */}
          {isSending && messages.length > 0 && messages[messages.length - 1].role === 'user' && (
            <div className="flex items-center gap-2.5 py-3 pl-10">
              <Spinner size={14} />
              <span className="text-[13px] text-text-muted">Thinking...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Bottom area: escape hatch + chips + input */}
      <div className="px-6 pt-2 pb-4 flex flex-col gap-3">
        <div className="max-w-3xl mx-auto w-full flex flex-col gap-3">
          {/* Escape hatch */}
          {messages.length > 0 && !isSending && (
            <EscapeHatch onUse={handleEscapeHatch} />
          )}

          {/* Suggestion chips — only show when no messages yet or after assistant reply */}
          {(messages.length === 0 || (messages.length > 0 && messages[messages.length - 1].role === 'assistant' && !isSending)) && (
            <SuggestionChips
              suggestions={DEFAULT_SUGGESTIONS}
              onSelect={handleSuggestionSelect}
            />
          )}

          {/* Chat input */}
          <ChatInput
            value={input}
            onChange={setInput}
            onSend={handleSend}
            disabled={isSending}
            placeholder="Type your message..."
            showRomaji={showRomaji}
            onToggleRomaji={toggleRomaji}
          />
        </div>
      </div>
    </div>
  )
}

// Parts-based message rendering

function UIMessageRenderer({
  message,
  showRomaji,
  getAnnotated,
  onPlay,
  onStop,
  isPlayingAudio,
  isStreaming,
}: {
  message: UIMessage
  showRomaji: boolean
  getAnnotated: (text: string) => string
  onPlay?: () => void
  onStop?: () => void
  isPlayingAudio?: boolean
  isStreaming?: boolean
}) {
  if (message.role === 'user') {
    const textContent = message.parts
      .filter((p) => p.type === 'text')
      .map((p) => (p as { type: 'text'; text: string }).text)
      .join('')
    return (
      <MessageBlock
        role="user"
        content={textContent}
      />
    )
  }

  // Assistant message — render parts
  return (
    <MessageBlock
      role="assistant"
      content=""
      showRomaji={showRomaji}
      onPlay={onPlay}
      onStop={onStop}
      isPlayingAudio={isPlayingAudio}
      isStreaming={isStreaming}
    >
      {message.parts.map((part, i) => (
        <PartRenderer key={i} part={part} showRomaji={showRomaji} getAnnotated={getAnnotated} />
      ))}
    </MessageBlock>
  )
}

function PartRenderer({
  part,
  showRomaji,
  getAnnotated,
}: {
  part: UIMessage['parts'][number]
  showRomaji: boolean
  getAnnotated: (text: string) => string
}) {
  // Type narrowing via the type field
  if (part.type === 'text') {
    const text = (part as { type: 'text'; text: string }).text
    if (!text.trim()) return null
    const displayText = showRomaji ? getAnnotated(text) : text
    if (showRomaji) {
      return (
        <RomajiText
          text={displayText}
          className="chat-markdown text-text-primary leading-[1.7] text-[14.5px]"
        />
      )
    }
    return (
      <div className="chat-markdown text-text-primary leading-[1.7] text-[14.5px]">
        <Markdown remarkPlugins={[remarkGfm]}>
          {stripRubyAnnotations(displayText)}
        </Markdown>
      </div>
    )
  }

  // Tool invocations — match by type prefix 'tool-*'
  const partType = part.type as string
  const toolPart = part as { type: string; state: string; input?: unknown; output?: unknown }

  if (partType === 'tool-displayVocabCard' && toolPart.state === 'output-available' && toolPart.output) {
    return <VocabCard data={toolPart.output as { surface: string; reading?: string; meaning: string; example?: string; example_translation?: string }} />
  }

  if (partType === 'tool-displayGrammarCard' && toolPart.state === 'output-available' && toolPart.output) {
    return <GrammarCard data={toolPart.output as { pattern: string; meaning: string; formation?: string; example?: string; example_translation?: string }} />
  }

  if (partType === 'tool-displayCorrection' && toolPart.state === 'output-available' && toolPart.output) {
    return <CorrectionCard data={toolPart.output as { incorrect: string; correct: string; error_type?: string; explanation?: string }} />
  }

  if (partType === 'tool-displayReviewPrompt' && toolPart.state === 'output-available' && toolPart.output) {
    return <ReviewPromptCard data={toolPart.output as { prompt: string; answer: string; item_type?: string; item_id?: string }} />
  }

  // markTargetsHit and other tool types — hidden
  if (partType.startsWith('tool-')) {
    return null
  }

  // step-start, reasoning, etc. — ignore
  return null
}
