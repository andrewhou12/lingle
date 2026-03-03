'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Square, BookText } from 'lucide-react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, type UIMessage } from 'ai'
import type {
  ExpandedSessionPlan,
  ExpandedTomBrief,
  ExpandedLearnerProfile,
  ReviewSummary,
  WeeklyStats,
  PostSessionAnalysis,
} from '@lingle/shared/types'
import { api } from '@/lib/api'
import { stripRubyAnnotations } from '@/lib/ruby-annotator'
import { useRomaji, useAnnotatedTexts } from '@/hooks/use-romaji'
import { useTTS } from '@/hooks/use-tts'
import { RomajiText } from '@/components/romaji-text'
import { VocabCard, GrammarCard, CorrectionCard, ReviewPromptCard } from '@/components/conversation-cards'
import { NaturalnessBadge } from '@/components/chat/naturalness-badge'
import { SentenceXRayButton } from '@/components/chat/sentence-xray'
import { SelectionXRayPopover } from '@/components/chat/selection-xray-popover'
import { useSelectionXRay } from '@/hooks/use-selection-xray'
import { LivingText } from '@/components/chat/living-text'
import { ComprehensionScore } from '@/components/chat/comprehension-score'
import { useLivingText, type AnnotatedToken, type ComprehensionStats } from '@/hooks/use-living-text'
import { ChallengeCard } from '@/components/challenge-card'
import { MessageBlock } from '@/components/chat/message-block'
import { ChatInput } from '@/components/chat/chat-input'
import { EscapeHatch } from '@/components/chat/escape-hatch'
import { SuggestionChips } from '@/components/chat/suggestion-chips'
import { SessionSummaryModal } from '@/components/chat/session-summary-modal'
import { Spinner } from '@/components/spinner'
import { cn } from '@/lib/utils'

type Phase = 'planning' | 'conversation' | 'summary'

interface TopicStarter {
  emoji: string
  label: string
  description: string
  firstMessage: string
  hint: string
}

const TOPIC_STARTERS: TopicStarter[] = [
  {
    emoji: '\u2615',
    label: 'Cafe',
    description: 'Ordering drinks & food',
    firstMessage: '\u30B3\u30FC\u30D2\u30FC\u3092\u4E00\u3064\u304F\u3060\u3055\u3044\u3002',
    hint: 'Ordering at a cafe — food vocabulary, polite request forms, counters',
  },
  {
    emoji: '\uD83D\uDDD3\uFE0F',
    label: 'Plans',
    description: 'Weekend & future plans',
    firstMessage: '\u9031\u672B\u306F\u4F55\u3092\u3057\u307E\u3059\u304B\uFF1F',
    hint: 'Discussing weekend plans — volitional form, time expressions, activities',
  },
  {
    emoji: '\uD83C\uDFD9\uFE0F',
    label: 'City',
    description: 'Exploring & directions',
    firstMessage: '\u3053\u306E\u8FBA\u306B\u304A\u3059\u3059\u3081\u306E\u5834\u6240\u306F\u3042\u308A\u307E\u3059\u304B\uFF1F',
    hint: 'Exploring a city — location words, directions, recommendations',
  },
  {
    emoji: '\uD83C\uDF8C',
    label: 'Free',
    description: 'Open conversation',
    firstMessage: '\u4ECA\u65E5\u306F\u4F55\u3092\u8A71\u3057\u307E\u3057\u3087\u3046\u304B\uFF1F',
    hint: '',
  },
]

function getGreeting(): { japanese: string; english: string } {
  const hour = new Date().getHours()
  let japanese: string
  if (hour < 11) {
    japanese = '\u304A\u306F\u3088\u3046\uFF01'
  } else if (hour < 17) {
    japanese = '\u3053\u3093\u306B\u3061\u306F\uFF01'
  } else {
    japanese = '\u3053\u3093\u3070\u3093\u306F\uFF01'
  }
  return { japanese, english: 'What would you like to practice today?' }
}

function getContextSubtext(context: {
  profile?: ExpandedLearnerProfile | null
  reviewSummary?: ReviewSummary | null
  weeklyStats?: WeeklyStats | null
  tomBrief?: ExpandedTomBrief | null
}): string | null {
  // Show most salient context: avoidance > streak > reviews today
  const avoidance = context.tomBrief?.avoidancePatterns
  if (avoidance && avoidance.length > 0) {
    return `Let\u2019s work on patterns you\u2019ve been avoiding.`
  }
  const streak = context.weeklyStats?.currentStreak
  if (streak && streak > 1) {
    return `Day ${streak} of your streak. Keep it going!`
  }
  const reviewed = context.weeklyStats?.reviewsThisWeek
  if (reviewed && reviewed > 0) {
    return `${reviewed} review${reviewed === 1 ? '' : 's'} completed this week.`
  }
  return null
}

const DEFAULT_SUGGESTIONS = [
  'こんにちは！',
  'What should we talk about?',
  'もう一度お願いします',
]

export function ConversationView() {
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
  const [livingTextEnabled, setLivingTextEnabled] = useState(false)
  const livingText = useLivingText()
  const selectionXRay = useSelectionXRay()

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
  } = useChat({ transport, maxSteps: 3 })

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

  // Build naturalness map: user message ID → { rating, note }
  const naturalnessMap = useMemo(() => {
    const map = new Map<string, { rating: 'great' | 'good' | 'needs_work'; note?: string }>()
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i]
      if (msg.role !== 'assistant') continue
      // Find the preceding user message
      const prevUser = i > 0 && messages[i - 1].role === 'user' ? messages[i - 1] : null
      if (!prevUser) continue
      for (const part of msg.parts) {
        const partType = (part as { type: string }).type
        if (partType === 'tool-rateNaturalness') {
          const toolPart = part as { type: string; state: string; output?: unknown }
          if (toolPart.state === 'output-available' && toolPart.output) {
            const output = toolPart.output as { rating: 'great' | 'good' | 'needs_work'; note?: string }
            map.set(prevUser.id, output)
          }
        }
      }
    }
    return map
  }, [messages])

  // Extract dynamic suggestions from the latest assistant message
  const dynamicSuggestions = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (msg.role !== 'assistant') continue
      for (const part of msg.parts) {
        const partType = (part as { type: string }).type
        if (partType === 'tool-suggestResponses') {
          const toolPart = part as { type: string; state: string; output?: unknown }
          if (toolPart.state === 'output-available' && toolPart.output) {
            const output = toolPart.output as { suggestions: string[] }
            if (output.suggestions?.length > 0) return output.suggestions
          }
        }
      }
      break // Only check the latest assistant message
    }
    return null
  }, [messages])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Context data for the planning phase greeting/subtext
  const [contextData, setContextData] = useState<{
    profile?: ExpandedLearnerProfile | null
    reviewSummary?: ReviewSummary | null
    weeklyStats?: WeeklyStats | null
    tomBrief?: ExpandedTomBrief | null
  }>({})

  useEffect(() => {
    if (phase !== 'planning') return
    Promise.all([
      api.profileGet().catch(() => null),
      api.reviewGetSummary().catch(() => null),
      api.dashboardGetWeeklyStats().catch(() => null),
      api.tomGetBrief().catch(() => null),
    ]).then(([profile, reviewSummary, weeklyStats, tomBrief]) => {
      setContextData({ profile, reviewSummary, weeklyStats, tomBrief })
    })
  }, [phase])

  const handleStartSessionWithMessage = useCallback(async (initialMessage?: string, topicHint?: string) => {
    setIsLoading(true)
    setError(null)
    try {
      const plan = await api.conversationPlan(topicHint || undefined)
      setSessionPlan(plan)
      setSessionId(plan._sessionId ?? null)
      setMessages([])
      setTargetsHit(new Set())
      sessionStartTime.current = Date.now()
      setPhase('conversation')
      if (initialMessage) {
        requestAnimationFrame(() => {
          sendMessage({ text: initialMessage })
        })
      }
    } catch (err) {
      console.error('Failed to plan session:', err)
      setError(err instanceof Error ? err.message : 'Failed to start session. Please try again.')
    }
    setIsLoading(false)
  }, [setMessages, sendMessage])

  const handleStartSession = useCallback(async () => {
    await handleStartSessionWithMessage()
  }, [handleStartSessionWithMessage])

  const handlePlanningSubmit = useCallback(async () => {
    if (!input.trim()) return
    const text = input.trim()
    setInput('')
    await handleStartSessionWithMessage(text, text)
  }, [input, handleStartSessionWithMessage])

  const handleTopicSelect = useCallback(async (topic: TopicStarter) => {
    await handleStartSessionWithMessage(topic.firstMessage, topic.hint || undefined)
  }, [handleStartSessionWithMessage])

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
    const greeting = getGreeting()
    const subtext = getContextSubtext(contextData)

    return (
      <div className="h-full flex flex-col items-center justify-center px-6">
        <div className="max-w-[640px] w-full flex flex-col items-center text-center">
          {/* Logo */}
          <h1 className="logo-shimmer text-[42px] italic font-serif font-semibold mb-6 select-none">
            Lingle
          </h1>

          {/* Japanese greeting */}
          <p className="text-[28px] font-jp font-medium text-text-primary mb-1.5">
            {greeting.japanese}
          </p>

          {/* English line */}
          <p className="text-[15px] text-text-secondary mb-1">
            {greeting.english}
          </p>

          {/* Contextual subtext */}
          {subtext && (
            <p className="text-[13px] text-text-muted mb-6">
              {subtext}
            </p>
          )}
          {!subtext && <div className="mb-6" />}

          {error && (
            <div className="mb-4 p-3 bg-warm-soft rounded-lg w-full">
              <span className="text-[13px] text-accent-warm">{error}</span>
            </div>
          )}

          {/* Loading overlay */}
          {isLoading ? (
            <div className="flex items-center gap-2.5 py-3 mb-6">
              <Spinner size={16} />
              <span className="text-[14px] text-text-muted">Planning your session...</span>
            </div>
          ) : (
            <>
              {/* Chat input */}
              <div className="w-full mb-8">
                <ChatInput
                  value={input}
                  onChange={setInput}
                  onSend={handlePlanningSubmit}
                  disabled={isLoading}
                  placeholder="Type a topic or message to start..."
                  showRomaji={showRomaji}
                  onToggleRomaji={toggleRomaji}
                  minRows={3}
                />
              </div>

              {/* Topic starters */}
              <p className="text-[11px] uppercase tracking-wider text-text-muted mb-3 font-medium">
                Or start with a topic
              </p>

              <div className="grid grid-cols-2 gap-3 w-full">
                {TOPIC_STARTERS.map((topic) => (
                  <button
                    key={topic.label}
                    className="flex items-start gap-3 p-4 rounded-xl bg-bg-pure border border-border-subtle text-left cursor-pointer transition-all hover:border-border-strong hover:shadow-[var(--shadow-sm)] active:scale-[0.98]"
                    onClick={() => handleTopicSelect(topic)}
                  >
                    <span className="text-[20px] mt-0.5 shrink-0">{topic.emoji}</span>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[14px] font-medium text-text-primary">{topic.label}</span>
                      <span className="text-[12px] text-text-muted leading-snug">{topic.description}</span>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
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
        <div className="flex items-center gap-2">
          <button
            className={cn(
              'inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-medium border-none cursor-pointer transition-colors',
              livingTextEnabled
                ? 'bg-accent-brand/10 text-accent-brand'
                : 'bg-bg-secondary text-text-muted hover:text-text-secondary'
            )}
            onClick={() => setLivingTextEnabled((v) => !v)}
            title="Toggle Living Text"
          >
            <BookText size={12} />
            Living Text
          </button>
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
      <div className="flex-1 overflow-auto" ref={selectionXRay.containerRef}>
        <div className="max-w-3xl mx-auto px-6 py-4">
          {messages.map((msg) => (
            <UIMessageRenderer
              key={msg.id}
              message={msg}
              showRomaji={showRomaji}
              getAnnotated={getAnnotated}
              naturalness={msg.role === 'user' ? naturalnessMap.get(msg.id) : undefined}
              livingTextEnabled={livingTextEnabled}
              livingText={livingText}
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
              suggestions={dynamicSuggestions ?? DEFAULT_SUGGESTIONS}
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

      <SelectionXRayPopover
        selectedText={selectionXRay.selectedText}
        selectionRect={selectionXRay.selectionRect}
        isOpen={selectionXRay.isOpen}
        isLoading={selectionXRay.isLoading}
        tokens={selectionXRay.tokens}
        error={selectionXRay.error}
        onTrigger={selectionXRay.trigger}
        onDismiss={selectionXRay.dismiss}
      />
    </div>
  )
}

// Parts-based message rendering

function UIMessageRenderer({
  message,
  showRomaji,
  getAnnotated,
  naturalness,
  livingTextEnabled,
  livingText,
  onPlay,
  onStop,
  isPlayingAudio,
  isStreaming,
}: {
  message: UIMessage
  showRomaji: boolean
  getAnnotated: (text: string) => string
  naturalness?: { rating: 'great' | 'good' | 'needs_work'; note?: string }
  livingTextEnabled?: boolean
  livingText?: { ready: boolean; annotateText: (text: string) => Promise<AnnotatedToken[]>; computeComprehension: (tokens: AnnotatedToken[]) => ComprehensionStats }
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
      >
        {naturalness && (
          <NaturalnessBadge rating={naturalness.rating} note={naturalness.note} />
        )}
      </MessageBlock>
    )
  }

  const useLiving = livingTextEnabled && livingText?.ready && !isStreaming

  // Assistant message — render parts
  const assistantText = message.parts
    .filter((p) => p.type === 'text')
    .map((p) => (p as { type: 'text'; text: string }).text)
    .join('')

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
      {message.parts.map((part, i) => {
        // Find if this is the last text part for cursor placement
        const isLastTextPart = isStreaming && part.type === 'text' &&
          !message.parts.slice(i + 1).some((p) => p.type === 'text')
        return (
          <PartRenderer
            key={i}
            part={part}
            showRomaji={showRomaji}
            getAnnotated={getAnnotated}
            livingTextEnabled={useLiving}
            livingText={livingText}
            isStreaming={isLastTextPart || false}
          />
        )
      })}
      {!isStreaming && assistantText.trim() && (
        <SentenceXRayButton sentence={assistantText} />
      )}
    </MessageBlock>
  )
}

function PartRenderer({
  part,
  showRomaji,
  getAnnotated,
  livingTextEnabled,
  livingText,
  isStreaming,
}: {
  part: UIMessage['parts'][number]
  showRomaji: boolean
  getAnnotated: (text: string) => string
  livingTextEnabled?: boolean
  livingText?: { ready: boolean; annotateText: (text: string) => Promise<AnnotatedToken[]>; computeComprehension: (tokens: AnnotatedToken[]) => ComprehensionStats }
  isStreaming?: boolean
}) {
  // Type narrowing via the type field
  if (part.type === 'text') {
    const text = (part as { type: 'text'; text: string }).text
    if (!text.trim()) return null

    // Living Text mode: tokenize + mastery-color
    if (livingTextEnabled && livingText) {
      return <LivingTextPart text={text} livingText={livingText} />
    }

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
      <div className={cn(
        "chat-markdown text-text-primary leading-[1.7] text-[14.5px]",
        isStreaming && "[&>p:last-of-type]:inline"
      )}>
        <Markdown remarkPlugins={[remarkGfm]}>
          {stripRubyAnnotations(displayText)}
        </Markdown>
        {isStreaming && <span className="blink-cursor" />}
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

function LivingTextPart({
  text,
  livingText,
}: {
  text: string
  livingText: { annotateText: (text: string) => Promise<AnnotatedToken[]>; computeComprehension: (tokens: AnnotatedToken[]) => ComprehensionStats }
}) {
  const [tokens, setTokens] = useState<AnnotatedToken[] | null>(null)
  const [stats, setStats] = useState<ComprehensionStats | null>(null)

  useEffect(() => {
    let cancelled = false
    livingText.annotateText(text).then((result) => {
      if (cancelled) return
      setTokens(result)
      setStats(livingText.computeComprehension(result))
    })
    return () => { cancelled = true }
  }, [text, livingText])

  if (!tokens) {
    // Fallback to plain text while tokenizing
    return (
      <div className="chat-markdown text-text-primary leading-[1.7] text-[14.5px]">
        <Markdown remarkPlugins={[remarkGfm]}>
          {stripRubyAnnotations(text)}
        </Markdown>
      </div>
    )
  }

  return (
    <>
      <LivingText tokens={tokens} />
      {stats && <ComprehensionScore stats={stats} />}
    </>
  )
}
