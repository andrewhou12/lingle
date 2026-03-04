'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Square } from 'lucide-react'
import Markdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import remarkGfm from 'remark-gfm'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, type UIMessage } from 'ai'
import { api } from '@/lib/api'
import { rubyToHtml, stripRubyAnnotations } from '@/lib/ruby-annotator'
import { useRomaji, useAnnotatedTexts } from '@/hooks/use-romaji'
import { useTTS } from '@/hooks/use-tts'
import { RomajiText } from '@/components/romaji-text'
import { MessageBlock } from '@/components/chat/message-block'
import { ChatInput } from '@/components/chat/chat-input'
import { EscapeHatch } from '@/components/chat/escape-hatch'
import { SuggestionChips } from '@/components/chat/suggestion-chips'
import { ChoiceButtons, ChoiceButtonsSkeleton } from '@/components/chat/choice-buttons'
import type { Choice } from '@/components/chat/choice-buttons'
import { CorrectionCard, CorrectionCardSkeleton } from '@/components/chat/correction-card'
import { VocabularyCard, VocabularyCardSkeleton } from '@/components/chat/vocabulary-card'
import { GrammarNote, GrammarNoteSkeleton } from '@/components/chat/grammar-note'
import { Spinner } from '@/components/spinner'
import { cn } from '@/lib/utils'
import {
  type ScenarioMode,
  MODE_LABELS,
  MODE_DESCRIPTIONS,
  MODE_PLACEHOLDERS,
  getAllModes,
} from '@/lib/experience-scenarios'

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
  return { japanese, english: 'What would you like to do today?' }
}

const DEFAULT_SUGGESTIONS = [
  '\u3053\u3093\u306B\u3061\u306F\uFF01',
  'What should we talk about?',
  '\u3082\u3046\u4E00\u5EA6\u304A\u9858\u3044\u3057\u307E\u3059',
]

type Phase = 'idle' | 'conversation'

export function ConversationView() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessionTitle, setSessionTitle] = useState<string>('Conversation')
  const [isLoading, setIsLoading] = useState(false)
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [selectedMode, setSelectedMode] = useState<ScenarioMode>('conversation')
  const [chosenChoiceIds, setChosenChoiceIds] = useState<Set<string>>(new Set())
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
    error: chatError,
  } = useChat({
    transport,
    onError: (err) => {
      console.error('[useChat] error:', err)
    },
  })

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

  // Extract dynamic suggestions from the latest assistant message
  const dynamicSuggestions = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (msg.role !== 'assistant') continue
      for (const part of msg.parts) {
        const partType = (part as { type: string }).type
        if (partType === 'tool-suggestActions') {
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

  const handleStartSession = useCallback(async (prompt: string, mode: ScenarioMode) => {
    setIsLoading(true)
    setError(null)
    try {
      const plan = await api.conversationPlan(prompt, mode)
      setSessionId(plan._sessionId ?? null)
      setSessionTitle(plan.sessionFocus || MODE_LABELS[mode])
      setChosenChoiceIds(new Set())
      setMessages([])
      setPhase('conversation')
      // Send the prompt as the first user message
      requestAnimationFrame(() => {
        sendMessage({ text: prompt })
      })
    } catch (err) {
      console.error('Failed to start session:', err)
      setError(err instanceof Error ? err.message : 'Failed to start session. Please try again.')
    }
    setIsLoading(false)
  }, [setMessages, sendMessage])

  const handleFreePromptSubmit = useCallback(async () => {
    if (!input.trim()) return
    const text = input.trim()
    setInput('')
    await handleStartSession(text, selectedMode)
  }, [input, selectedMode, handleStartSession])

  const handleSend = useCallback(async () => {
    if (!input.trim() || !sessionId || isSending) return
    const text = input.trim()
    setInput('')
    await sendMessage({ text })
  }, [input, sessionId, isSending, sendMessage])

  const handleSuggestionSelect = useCallback((text: string) => {
    setInput(text)
  }, [])

  const handleChoiceSelect = useCallback((text: string, blockId: string) => {
    setChosenChoiceIds((prev) => new Set(prev).add(blockId))
    sendMessage({ text })
  }, [sendMessage])

  const handleEscapeHatch = useCallback(() => {
    setInput("I'd like to switch to English for a moment: ")
  }, [])

  const handleEndSession = useCallback(async () => {
    if (!sessionId) return
    setIsLoading(true)
    try {
      await api.conversationEnd(sessionId)
    } catch (err) {
      console.error('Failed to end session:', err)
    }
    setIsLoading(false)
    setPhase('idle')
    setSessionId(null)
    setSessionTitle('Conversation')
    setMessages([])
  }, [sessionId, setMessages])

  // Idle Phase — experience launcher
  if (phase === 'idle') {
    const greeting = getGreeting()
    const modes = getAllModes()

    return (
      <div className="h-full flex flex-col items-center px-6 pt-12 pb-6 overflow-auto">
        <div className="max-w-[720px] w-full flex flex-col items-center">
          {/* Logo */}
          <h1 className="logo-shimmer text-[42px] italic font-serif font-semibold mb-6 select-none">
            Lingle
          </h1>

          {/* Japanese greeting */}
          <p className="text-[28px] font-jp font-medium text-text-primary mb-1.5">
            {greeting.japanese}
          </p>

          {/* English line */}
          <p className="text-[15px] text-text-secondary mb-8">
            {greeting.english}
          </p>

          {error && (
            <div className="mb-4 p-3 bg-warm-soft rounded-lg w-full">
              <span className="text-[13px] text-accent-warm">{error}</span>
            </div>
          )}

          {/* Loading overlay */}
          {isLoading ? (
            <div className="flex items-center gap-2.5 py-3 mb-6">
              <Spinner size={16} />
              <span className="text-[14px] text-text-muted">Starting session...</span>
            </div>
          ) : (
            <>
              {/* Mode tabs */}
              <div className="w-full mb-2 grid grid-cols-4 gap-2">
                {modes.map((mode) => (
                  <button
                    key={mode}
                    className={cn(
                      'flex flex-col items-center gap-0.5 px-3 py-2.5 rounded-lg text-[13px] font-medium border cursor-pointer transition-all',
                      selectedMode === mode
                        ? 'bg-accent-brand text-white border-accent-brand shadow-[var(--shadow-sm)]'
                        : 'bg-bg-pure text-text-secondary border-border-subtle hover:border-border-strong hover:bg-bg-hover'
                    )}
                    onClick={() => setSelectedMode(mode)}
                  >
                    <span>{MODE_LABELS[mode]}</span>
                    <span className={cn(
                      'text-[11px] font-normal',
                      selectedMode === mode ? 'text-white/70' : 'text-text-muted'
                    )}>
                      {MODE_DESCRIPTIONS[mode]}
                    </span>
                  </button>
                ))}
              </div>

              {/* Free prompt input */}
              <div className="w-full mt-4">
                <ChatInput
                  value={input}
                  onChange={setInput}
                  onSend={handleFreePromptSubmit}
                  disabled={isLoading}
                  placeholder={MODE_PLACEHOLDERS[selectedMode]}
                  showRomaji={showRomaji}
                  onToggleRomaji={toggleRomaji}
                  minRows={2}
                />
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  // Conversation Phase
  return (
    <div className="h-full flex flex-col -m-6">
      {/* Session info sticky bar */}
      <div className="flex items-center justify-between px-6 py-2.5 border-b border-border shrink-0 bg-bg">
        <span className="text-[13px] font-medium text-text-primary truncate">{sessionTitle}</span>
        <button
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg bg-warm-soft px-3 py-1.5 text-[13px] font-medium text-accent-warm border-none cursor-pointer transition-colors hover:bg-warm-med shrink-0',
            isLoading && 'opacity-50'
          )}
          onClick={handleEndSession}
          disabled={isLoading}
        >
          <Square size={12} />
          End Session
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto px-6 py-4">
          {messages.map((msg) => (
            <UIMessageRenderer
              key={msg.id}
              message={msg}
              showRomaji={showRomaji}
              getAnnotated={getAnnotated}
              chosenChoiceIds={chosenChoiceIds}
              onChoiceSelect={handleChoiceSelect}
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

          {/* Chat error */}
          {chatError && (
            <div className="mx-10 my-2 p-3 bg-red-soft rounded-lg">
              <span className="text-[13px] text-red">{chatError.message}</span>
            </div>
          )}

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

          {/* Suggestion chips */}
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
    </div>
  )
}

// Parts-based message rendering

function UIMessageRenderer({
  message,
  showRomaji,
  getAnnotated,
  chosenChoiceIds,
  onChoiceSelect,
  onPlay,
  onStop,
  isPlayingAudio,
  isStreaming,
}: {
  message: UIMessage
  showRomaji: boolean
  getAnnotated: (text: string) => string
  chosenChoiceIds: Set<string>
  onChoiceSelect: (text: string, blockId: string) => void
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
      {message.parts.map((part, i) => {
        const isLastTextPart = isStreaming && part.type === 'text' &&
          !message.parts.slice(i + 1).some((p) => p.type === 'text')
        return (
          <PartRenderer
            key={i}
            part={part}
            showRomaji={showRomaji}
            getAnnotated={getAnnotated}
            isStreaming={isLastTextPart || false}
            messageId={message.id}
            chosenChoiceIds={chosenChoiceIds}
            onChoiceSelect={onChoiceSelect}
          />
        )
      })}
    </MessageBlock>
  )
}

function PartRenderer({
  part,
  showRomaji,
  getAnnotated,
  isStreaming,
  messageId,
  chosenChoiceIds,
  onChoiceSelect,
}: {
  part: UIMessage['parts'][number]
  showRomaji: boolean
  getAnnotated: (text: string) => string
  isStreaming?: boolean
  messageId: string
  chosenChoiceIds: Set<string>
  onChoiceSelect: (text: string, blockId: string) => void
}) {
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

    const htmlText = rubyToHtml(displayText)

    return (
      <div className={cn(
        "chat-markdown text-text-primary leading-[1.7] text-[14.5px]",
        isStreaming && "[&>p:last-of-type]:inline"
      )}>
        <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
          {htmlText}
        </Markdown>
        {isStreaming && <span className="blink-cursor" />}
      </div>
    )
  }

  // Tool invocations — route by tool name
  const partType = (part as { type: string }).type
  if (partType.startsWith('tool-')) {
    const toolPart = part as { type: string; state: string; output?: unknown; args?: unknown }

    // suggestActions — still extracted for bottom chips, hidden inline
    if (partType === 'tool-suggestActions') return null

    // displayChoices
    if (partType === 'tool-displayChoices') {
      if (toolPart.state === 'output-available' && toolPart.output) {
        const output = toolPart.output as { choices: { text: string; hint?: string }[] }
        const choices: Choice[] = output.choices.map((c, i) => ({
          number: i + 1,
          text: c.text,
          hint: c.hint,
        }))
        const blockId = `${messageId}-choices`
        return (
          <ChoiceButtons
            choices={choices}
            blockId={blockId}
            isChosen={chosenChoiceIds.has(blockId)}
            onSelect={onChoiceSelect}
          />
        )
      }
      if (toolPart.state === 'input-available') return <ChoiceButtonsSkeleton />
      return null
    }

    // showCorrection
    if (partType === 'tool-showCorrection') {
      if (toolPart.state === 'output-available' && toolPart.output) {
        const output = toolPart.output as { original: string; corrected: string; explanation: string; grammarPoint?: string }
        return <CorrectionCard {...output} />
      }
      if (toolPart.state === 'input-available') return <CorrectionCardSkeleton />
      return null
    }

    // showVocabularyCard
    if (partType === 'tool-showVocabularyCard') {
      if (toolPart.state === 'output-available' && toolPart.output) {
        const output = toolPart.output as { word: string; reading?: string; meaning: string; partOfSpeech?: string; exampleSentence?: string; notes?: string }
        return <VocabularyCard {...output} />
      }
      if (toolPart.state === 'input-available') return <VocabularyCardSkeleton />
      return null
    }

    // showGrammarNote
    if (partType === 'tool-showGrammarNote') {
      if (toolPart.state === 'output-available' && toolPart.output) {
        const output = toolPart.output as { pattern: string; meaning: string; formation: string; examples: { japanese: string; english: string }[]; level?: string }
        return <GrammarNote {...output} />
      }
      if (toolPart.state === 'input-available') return <GrammarNoteSkeleton />
      return null
    }

    // Unknown tools — hidden
    return null
  }

  return null
}
