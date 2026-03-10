'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  MapPinIcon, BuildingStorefrontIcon, FireIcon, HomeIcon, TruckIcon,
  PencilIcon, HashtagIcon, FlagIcon, SpeakerWaveIcon,
  BookOpenIcon, ChatBubbleLeftIcon, ClockIcon, TrophyIcon,
  NewspaperIcon, FilmIcon, BookmarkIcon, MusicalNoteIcon,
  TvIcon, DocumentTextIcon, MicrophoneIcon,
  FolderOpenIcon, MagnifyingGlassIcon, GlobeAltIcon, LanguageIcon,
  ChartBarIcon, ClipboardDocumentListIcon, ShoppingCartIcon,
  StopIcon, Bars3Icon, SpeakerXMarkIcon, ChevronRightIcon,
  ArrowUpIcon, ArrowRightIcon,
} from '@heroicons/react/24/outline'
import { useRouter } from 'next/navigation'
import Markdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import remarkGfm from 'remark-gfm'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, type UIMessage } from 'ai'
import { api } from '@/lib/api'
import { rubyToHtml } from '@/lib/ruby-annotator'
import { getToolZone } from '@/lib/tool-zones'
import { validateDifficulty, type DifficultyViolation } from '@/lib/difficulty-validator'
import type { SessionPlan } from '@/lib/session-plan'
import { useRomaji, useAnnotatedTexts } from '@/hooks/use-romaji'
import { useTTS } from '@/hooks/use-tts'
import { useStreamingTTS } from '@/hooks/use-streaming-tts'
import { PanelProvider, usePanel } from '@/hooks/use-panel'
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
import { LearningPanel } from '@/components/panels/learning-panel'
import { Spinner } from '@/components/spinner'
import { useJapaneseIME } from '@/hooks/use-japanese-ime'
import { IMECandidatePanel } from '@/components/chat/ime/ime-candidate-panel'
import { cn } from '@/lib/utils'
import { UsageLimitError } from '@/lib/api'
import { UsageLimitModal } from '@/components/usage-limit-modal'
import type { UsageInfo } from '@lingle/shared/types'
import {
  type ScenarioMode,
  MODE_LABELS,
  MODE_DESCRIPTIONS,
  MODE_PLACEHOLDERS,
  getAllModes,
} from '@/lib/experience-scenarios'
import { getGreetingForLanguage } from '@/lib/languages'
import { useLanguage } from '@/hooks/use-language'

function getModeDefaultPrompts(language: string): Record<string, string> {
  return {
    conversation: `Let's have a casual conversation in ${language}.`,
    tutor: `I'd like to practice ${language} with a tutor.`,
    immersion: `Create an immersive ${language} listening exercise.`,
    reference: `I have some questions about ${language}.`,
  }
}

/* ── Icon shorthand ── */
const IC = 'w-[18px] h-[18px]'
const hi = {
  fire: <FireIcon className={IC} />, pin: <MapPinIcon className={IC} />, store: <BuildingStorefrontIcon className={IC} />,
  home: <HomeIcon className={IC} />, truck: <TruckIcon className={IC} />, trophy: <TrophyIcon className={IC} />,
  pencil: <PencilIcon className={IC} />, hash: <HashtagIcon className={IC} />, flag: <FlagIcon className={IC} />,
  speaker: <SpeakerWaveIcon className={IC} />, book: <BookOpenIcon className={IC} />, chat: <ChatBubbleLeftIcon className={IC} />,
  clock: <ClockIcon className={IC} />, news: <NewspaperIcon className={IC} />, film: <FilmIcon className={IC} />,
  bookmark: <BookmarkIcon className={IC} />, music: <MusicalNoteIcon className={IC} />, tv: <TvIcon className={IC} />,
  doc: <DocumentTextIcon className={IC} />, mic: <MicrophoneIcon className={IC} />, folder: <FolderOpenIcon className={IC} />,
  search: <MagnifyingGlassIcon className={IC} />, globe: <GlobeAltIcon className={IC} />, lang: <LanguageIcon className={IC} />,
  chart: <ChartBarIcon className={IC} />, clipboard: <ClipboardDocumentListIcon className={IC} />,
  cart: <ShoppingCartIcon className={IC} />,
}

/* ── Suggestions per mode per language ── */
type Suggestion = { icon: React.ReactNode; label: string }
const LANGUAGE_SUGGESTIONS: Record<string, Record<ScenarioMode, Suggestion[]>> = {
  Japanese: {
    conversation: [
      { icon: hi.fire, label: 'Order ramen at a busy Tokyo shop' },
      { icon: hi.pin, label: 'Ask for directions at Shinjuku station' },
      { icon: hi.store, label: 'Haggle at an Osaka flea market' },
      { icon: hi.globe, label: 'Small talk during hanami season' },
      { icon: hi.fire, label: 'Chat with a barista in Kyoto' },
      { icon: hi.home, label: 'Check into a ryokan in Hakone' },
      { icon: hi.truck, label: 'Give directions to a taxi driver' },
      { icon: hi.trophy, label: 'Make plans for a weekend trip' },
    ],
    tutor: [
      { icon: hi.pencil, label: 'Master the \u3066-form conjugation' },
      { icon: hi.hash, label: 'Learn 20 essential counters' },
      { icon: hi.flag, label: 'Keigo \u2014 polite speech patterns' },
      { icon: hi.speaker, label: 'Pitch accent fundamentals' },
      { icon: hi.book, label: 'Difference between \u306F and \u304C' },
      { icon: hi.chat, label: 'Casual vs. polite form practice' },
      { icon: hi.clock, label: 'Japanese time expressions' },
      { icon: hi.trophy, label: 'Common particle mistakes' },
    ],
    immersion: [
      { icon: hi.news, label: 'Read today\u2019s NHK Easy News' },
      { icon: hi.film, label: 'Analyze a scene from Your Name' },
      { icon: hi.bookmark, label: 'Manga panel \u2014 decode slang' },
      { icon: hi.music, label: 'Break down Yoasobi lyrics' },
      { icon: hi.trophy, label: 'Translate a game dialogue' },
      { icon: hi.tv, label: 'News clip listening practice' },
      { icon: hi.doc, label: 'Read a short story excerpt' },
      { icon: hi.mic, label: 'Podcast transcript breakdown' },
    ],
    reference: [
      { icon: hi.folder, label: 'JLPT N3 vocabulary deck' },
      { icon: hi.chart, label: 'Particle cheat sheet' },
      { icon: hi.lang, label: 'Kanji by radicals \u2014 RTK method' },
      { icon: hi.clipboard, label: 'Common set phrases \u2014 \u6163\u7528\u53E5' },
      { icon: hi.search, label: 'Verb conjugation table' },
      { icon: hi.book, label: 'Onomatopoeia dictionary' },
      { icon: hi.globe, label: 'Cultural etiquette notes' },
      { icon: hi.chart, label: 'JLPT grammar comparison chart' },
    ],
  },
  Korean: {
    conversation: [
      { icon: hi.fire, label: 'Order bibimbap at a Seoul restaurant' },
      { icon: hi.pin, label: 'Navigate the subway in Busan' },
      { icon: hi.cart, label: 'Shop at Myeongdong market' },
      { icon: hi.music, label: 'Chat about your favorite K-pop group' },
      { icon: hi.fire, label: 'Order drinks at a Korean caf\u00E9' },
      { icon: hi.home, label: 'Book a hanok guesthouse in Jeonju' },
      { icon: hi.truck, label: 'Hail a taxi in Gangnam' },
      { icon: hi.trophy, label: 'Plan a trip to Jeju Island' },
    ],
    tutor: [
      { icon: hi.pencil, label: 'Korean honorific speech levels' },
      { icon: hi.hash, label: 'Essential Korean counters (\uAC1C, \uBA85, \uBC88)' },
      { icon: hi.book, label: 'Difference between \uC740/\uB294 and \uC774/\uAC00' },
      { icon: hi.chat, label: '\uBC18\uB9D0 vs. \uC874\uB313\uB9D0 practice' },
      { icon: hi.hash, label: 'Sino-Korean vs. native numbers' },
      { icon: hi.trophy, label: 'Common particle mistakes' },
      { icon: hi.speaker, label: 'Korean pronunciation rules' },
      { icon: hi.book, label: 'Verb conjugation patterns' },
    ],
    immersion: [
      { icon: hi.tv, label: 'Analyze a K-drama dialogue scene' },
      { icon: hi.music, label: 'Break down BTS song lyrics' },
      { icon: hi.news, label: 'Read Korean news for beginners' },
      { icon: hi.film, label: 'Movie scene \u2014 decode slang' },
      { icon: hi.trophy, label: 'Translate a webtoon panel' },
      { icon: hi.doc, label: 'Read a short Korean story' },
      { icon: hi.mic, label: 'Korean podcast breakdown' },
      { icon: hi.bookmark, label: 'Webtoon dialogue practice' },
    ],
    reference: [
      { icon: hi.folder, label: 'TOPIK vocabulary by level' },
      { icon: hi.chart, label: 'Korean particle cheat sheet' },
      { icon: hi.search, label: 'Verb conjugation table' },
      { icon: hi.clipboard, label: 'Common Korean expressions' },
      { icon: hi.book, label: 'Korean onomatopoeia guide' },
      { icon: hi.globe, label: 'Cultural etiquette notes' },
      { icon: hi.chart, label: 'TOPIK grammar patterns' },
      { icon: hi.lang, label: 'Hangul reading practice' },
    ],
  },
}

const DEFAULT_SUGGESTIONS: Record<ScenarioMode, Suggestion[]> = {
  conversation: [
    { icon: hi.fire, label: 'Order coffee at a local caf\u00E9' },
    { icon: hi.pin, label: 'Ask for directions at a train station' },
    { icon: hi.cart, label: 'Go grocery shopping at a market' },
    { icon: hi.trophy, label: 'Make plans for a weekend trip' },
    { icon: hi.home, label: 'Check into a hotel' },
    { icon: hi.truck, label: 'Give directions to a taxi driver' },
    { icon: hi.fire, label: 'Order food at a restaurant' },
    { icon: hi.chat, label: 'Small talk with a new friend' },
  ],
  tutor: [
    { icon: hi.pencil, label: 'Key verb conjugation patterns' },
    { icon: hi.book, label: 'Essential grammar structures' },
    { icon: hi.chat, label: 'Formal vs. informal speech' },
    { icon: hi.hash, label: 'Numbers and counting' },
    { icon: hi.speaker, label: 'Pronunciation fundamentals' },
    { icon: hi.trophy, label: 'Common beginner mistakes' },
    { icon: hi.lang, label: 'Everyday vocabulary' },
    { icon: hi.book, label: 'Reading practice' },
  ],
  immersion: [
    { icon: hi.news, label: 'Read a news article for beginners' },
    { icon: hi.film, label: 'Analyze a movie dialogue scene' },
    { icon: hi.music, label: 'Break down song lyrics' },
    { icon: hi.trophy, label: 'Translate a game dialogue' },
    { icon: hi.tv, label: 'TV show listening practice' },
    { icon: hi.doc, label: 'Read a short story excerpt' },
    { icon: hi.mic, label: 'Podcast transcript breakdown' },
    { icon: hi.bookmark, label: 'Cultural reading passage' },
  ],
  reference: [
    { icon: hi.folder, label: 'Core vocabulary list' },
    { icon: hi.search, label: 'Verb conjugation table' },
    { icon: hi.chart, label: 'Grammar cheat sheet' },
    { icon: hi.clipboard, label: 'Common expressions and idioms' },
    { icon: hi.globe, label: 'Cultural etiquette notes' },
    { icon: hi.chart, label: 'Grammar comparison chart' },
    { icon: hi.lang, label: 'Writing system guide' },
    { icon: hi.speaker, label: 'Pronunciation guide' },
  ],
}

function getSuggestions(language: string): Record<ScenarioMode, Suggestion[]> {
  return LANGUAGE_SUGGESTIONS[language] ?? DEFAULT_SUGGESTIONS
}

const SUGGESTION_TITLES: Record<ScenarioMode, string> = {
  conversation: 'Suggested Scenarios',
  tutor: 'Suggested Lessons',
  immersion: 'Suggested Content',
  reference: 'Browse Topics',
}

function formatRelativeTime(timestamp: string): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return ''
  const mins = Math.round(seconds / 60)
  return `${mins} min`
}

const CHAT_DEFAULT_SUGGESTIONS = [
  'Hello!',
  'What should we talk about?',
  'Can you repeat that?',
]

type Phase = 'idle' | 'conversation'

export function ConversationView() {
  return (
    <PanelProvider>
      <ConversationViewInner />
    </PanelProvider>
  )
}

function ConversationViewInner() {
  const router = useRouter()
  const { targetLanguage } = useLanguage()
  const [phase, setPhase] = useState<Phase>('idle')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessionTitle, setSessionTitle] = useState<string>('Conversation')
  const [sessionPlan, setSessionPlan] = useState<SessionPlan | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [selectedMode, setSelectedMode] = useState<ScenarioMode>('conversation')
  const [activeMode, setActiveMode] = useState<ScenarioMode>('conversation')
  const [inputMode, setInputMode] = useState<'chat' | 'voice'>('voice')
  const [chosenChoiceIds, setChosenChoiceIds] = useState<Set<string>>(new Set())
  const [difficultyLevel, setDifficultyLevel] = useState(3) // default intermediate
  const [difficultyViolations, setDifficultyViolations] = useState<Map<string, DifficultyViolation[]>>(new Map())
  const [showAllSuggestions, setShowAllSuggestions] = useState(false)
  const [recentSessions, setRecentSessions] = useState<{ id: string; timestamp: string; durationSeconds: number | null; mode: string; sessionFocus: string }[]>([])
  const [showUsageLimitModal, setShowUsageLimitModal] = useState(false)
  const [usageLimitMinutes, setUsageLimitMinutes] = useState(10)
  const [usageRemainingSeconds, setUsageRemainingSeconds] = useState<number | null>(null)
  const sessionStartTimeRef = useRef<number | null>(null)
  const usageAtStartRef = useRef<UsageInfo | null>(null)
  const usageTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const idleTextareaRef = useRef<HTMLTextAreaElement>(null)
  const idleIme = useJapaneseIME(input, setInput, { initialActive: false })
  const sessionIdRef = useRef<string | null>(null)
  sessionIdRef.current = sessionId
  const { showRomaji, toggle: toggleRomaji } = useRomaji()
  const tts = useTTS()
  const panel = usePanel()
  const panelAutoOpenedRef = useRef(false)

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
      // Detect usage limit error from streaming transport
      if (err?.message?.includes('403') || err?.message?.includes('usage_limit_exceeded')) {
        setShowUsageLimitModal(true)
      }
    },
  })

  // Usage timer — track remaining time during active sessions
  useEffect(() => {
    if (phase !== 'conversation' || !sessionStartTimeRef.current || !usageAtStartRef.current) {
      return
    }
    const usage = usageAtStartRef.current
    if (usage.plan === 'pro' || usage.limitSeconds === -1) return

    const tick = () => {
      const elapsed = Math.floor((Date.now() - sessionStartTimeRef.current!) / 1000)
      const remaining = Math.max(0, usage.remainingSeconds - elapsed)
      setUsageRemainingSeconds(remaining)
      if (remaining <= 0) {
        setShowUsageLimitModal(true)
        if (usageTimerRef.current) clearInterval(usageTimerRef.current)
      }
    }
    tick()
    usageTimerRef.current = setInterval(tick, 15_000)
    return () => {
      if (usageTimerRef.current) clearInterval(usageTimerRef.current)
    }
  }, [phase])

  const isSending = status === 'streaming' || status === 'submitted'

  // Streaming TTS — get latest assistant text for sentence boundary detection
  const latestAssistantText = useMemo(() => {
    if (!isSending) return null
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (msg.role === 'assistant') {
        return msg.parts
          .filter((p) => p.type === 'text')
          .map((p) => (p as { type: 'text'; text: string }).text)
          .join('')
      }
    }
    return null
  }, [messages, isSending])
  const streamingTts = useStreamingTTS(latestAssistantText, isSending)

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

  // Auto-open panel on first panel-zone tool dispatch
  const hasPanelTools = useMemo(() => {
    for (const msg of messages) {
      if (msg.role !== 'assistant') continue
      for (const part of msg.parts) {
        const partType = (part as { type: string }).type
        if (partType.startsWith('tool-')) {
          const toolName = partType.replace('tool-', '')
          if (getToolZone(toolName) === 'panel') return true
        }
      }
    }
    return false
  }, [messages])

  useEffect(() => {
    if (hasPanelTools && !panelAutoOpenedRef.current) {
      panelAutoOpenedRef.current = true
      panel.open()
    }
  }, [hasPanelTools, panel])

  // Update plan from updateSessionPlan tool responses
  useEffect(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (msg.role !== 'assistant') continue
      for (const part of msg.parts) {
        const partType = (part as { type: string }).type
        if (partType === 'tool-updateSessionPlan') {
          const toolPart = part as { type: string; state: string; output?: unknown }
          if (toolPart.state === 'output-available' && toolPart.output) {
            const output = toolPart.output as { updated: boolean; plan: SessionPlan }
            if (output.updated && output.plan) {
              setSessionPlan(output.plan)
            }
          }
        }
      }
      break
    }
  }, [messages])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Run difficulty validation after assistant messages finish streaming
  const prevIsSendingRef = useRef(false)
  useEffect(() => {
    if (prevIsSendingRef.current && !isSending) {
      // Streaming just finished — validate the latest assistant message
      const lastMsg = messages[messages.length - 1]
      if (lastMsg?.role === 'assistant' && !difficultyViolations.has(lastMsg.id)) {
        const text = lastMsg.parts
          .filter((p) => p.type === 'text')
          .map((p) => (p as { type: 'text'; text: string }).text)
          .join('')
        if (text.trim()) {
          validateDifficulty(text, difficultyLevel).then((violations) => {
            if (violations.length > 0) {
              setDifficultyViolations((prev) => {
                const next = new Map(prev)
                next.set(lastMsg.id, violations)
                return next
              })
            }
          })
        }
      }
    }
    prevIsSendingRef.current = isSending
  }, [isSending, messages, difficultyLevel, difficultyViolations])

  // Fetch recent sessions for idle screen
  useEffect(() => {
    if (phase === 'idle') {
      api.conversationList().then(setRecentSessions).catch(() => {})
      api.profileGet().then((profile) => {
        if (profile?.difficultyLevel) setDifficultyLevel(profile.difficultyLevel)
      }).catch(() => {})
    }
  }, [phase, targetLanguage])

  // Pick up pending prompt from landing page / onboarding
  useEffect(() => {
    try {
      const stored = localStorage.getItem('lingle_pending_prompt')
      if (stored) {
        const { prompt, mode } = JSON.parse(stored)
        localStorage.removeItem('lingle_pending_prompt')
        if (prompt) {
          setInput(prompt)
          if (mode) setSelectedMode(mode as ScenarioMode)
        }
      }
    } catch {}
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleStartSession = useCallback(async (prompt: string, mode: ScenarioMode) => {
    setIsLoading(true)
    setError(null)
    try {
      // Fetch usage info and profile for difficulty level
      const [usageInfo, profile] = await Promise.all([
        api.usageGet().catch(() => null),
        Promise.resolve(api.peekCache<{ difficultyLevel?: number }>('/profile')),
      ])
      if (profile?.difficultyLevel) setDifficultyLevel(profile.difficultyLevel)

      // Check usage before starting
      if (usageInfo && usageInfo.isLimitReached) {
        setUsageLimitMinutes(usageInfo.limitSeconds === -1 ? 10 : Math.floor(usageInfo.limitSeconds / 60))
        setShowUsageLimitModal(true)
        setIsLoading(false)
        return
      }

      const result = await api.conversationPlan(prompt, mode)
      setSessionId(result._sessionId ?? null)
      setSessionTitle(result.sessionFocus || MODE_LABELS[mode])
      setSessionPlan(result.plan ?? null)
      setActiveMode(mode)
      setChosenChoiceIds(new Set())
      panelAutoOpenedRef.current = false
      setMessages([])
      setPhase('conversation')

      // Start usage timer
      sessionStartTimeRef.current = Date.now()
      usageAtStartRef.current = usageInfo
      if (usageInfo && usageInfo.limitSeconds !== -1) {
        setUsageRemainingSeconds(usageInfo.remainingSeconds)
        setUsageLimitMinutes(Math.floor(usageInfo.limitSeconds / 60))
      }

      // Send the prompt as the first user message
      requestAnimationFrame(() => {
        sendMessage({ text: prompt })
      })
    } catch (err) {
      if (err instanceof UsageLimitError) {
        setUsageLimitMinutes(Math.floor(err.limitSeconds / 60))
        setShowUsageLimitModal(true)
      } else {
        console.error('Failed to start session:', err)
        setError(err instanceof Error ? err.message : 'Failed to start session. Please try again.')
      }
    }
    setIsLoading(false)
  }, [setMessages, sendMessage])

  const handleFreePromptSubmit = useCallback(async () => {
    const defaults = getModeDefaultPrompts(targetLanguage)
    const text = input.trim() || defaults[selectedMode] || defaults.conversation
    setInput('')
    if (inputMode === 'voice') {
      const params = new URLSearchParams({ mode: selectedMode })
      if (text) params.set('prompt', text)
      router.push(`/conversation/voice?${params.toString()}`)
    } else {
      await handleStartSession(text, selectedMode)
    }
  }, [input, selectedMode, inputMode, targetLanguage, handleStartSession, router])

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

  const handleVoiceTranscript = useCallback((text: string) => {
    if (!sessionId || isSending) return
    sendMessage({ text })
  }, [sessionId, isSending, sendMessage])

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
    setSessionPlan(null)
    setActiveMode('conversation')
    setMessages([])
    panel.close()
  }, [sessionId, setMessages, panel])

  const handlePlanUpdate = useCallback(async (updates: Partial<SessionPlan>) => {
    if (!sessionId) return
    try {
      const result = await api.conversationPlanUpdate(sessionId, updates)
      setSessionPlan(result.plan)
    } catch (err) {
      console.error('Failed to update plan:', err)
    }
  }, [sessionId])


  // Idle Phase — experience launcher
  if (phase === 'idle') {
    const greeting = getGreetingForLanguage(targetLanguage)
    const modes = getAllModes()
    const allSuggestions = getSuggestions(targetLanguage)
    const suggestions = allSuggestions[selectedMode]
    const textareaRef = idleTextareaRef

    return (
      <div className="h-full flex flex-col items-center overflow-auto">
        <div className="w-full max-w-[620px] flex flex-col items-center pt-12 pb-12 px-6">

          {/* Greeting */}
          <div className="text-center mb-8 idle-entrance">
            <div className="font-jp text-[44px] font-light tracking-[0.04em] text-text-primary leading-[1.2] mb-2">
              {greeting.native}
            </div>
            <p className="text-[15px] text-text-secondary">{greeting.english}</p>
          </div>

          {error && (
            <div className="mb-6 p-3 bg-warm-soft rounded-xl w-full">
              <span className="text-[13px] text-accent-warm">{error}</span>
            </div>
          )}

          {/* Loading overlay */}
          {isLoading ? (
            <div className="flex items-center gap-2.5 py-3">
              <Spinner size={16} />
              <span className="text-[14px] text-text-muted">Starting session...</span>
            </div>
          ) : (
            <>
              {/* Tabs — pill style */}
              <div className="idle-entrance flex gap-0.5 p-[3px] bg-bg-hover border border-border rounded-[10px] mb-6" style={{ animationDelay: '0.07s', opacity: 0 }}>
                {modes.map((mode) => (
                  <button
                    key={mode}
                    className={cn(
                      'px-3.5 py-[5px] rounded-md text-[14px] font-medium cursor-pointer transition-[background,color] duration-100 whitespace-nowrap border-none',
                      selectedMode === mode
                        ? 'bg-accent-brand text-white'
                        : 'bg-transparent text-text-muted hover:bg-bg-hover hover:text-text-primary'
                    )}
                    onClick={() => { setSelectedMode(mode); setShowAllSuggestions(false) }}
                  >
                    {MODE_LABELS[mode]}
                  </button>
                ))}
              </div>

              {/* Coming soon for non-conversation modes */}
              {selectedMode !== 'conversation' && (
                <div className="w-full idle-entrance flex flex-col items-center py-12" style={{ animationDelay: '0.13s', opacity: 0 }}>
                  <div className="w-10 h-10 rounded-xl bg-bg-secondary border border-border flex items-center justify-center mb-4 text-text-muted">
                    {selectedMode === 'tutor' && <BookOpenIcon className="w-[18px] h-[18px]" />}
                    {selectedMode === 'immersion' && <MusicalNoteIcon className="w-[18px] h-[18px]" />}
                    {selectedMode === 'reference' && <MagnifyingGlassIcon className="w-[18px] h-[18px]" />}
                  </div>
                  <h3 className="text-[16px] font-semibold text-text-primary tracking-[-0.02em] mb-1">
                    Coming soon
                  </h3>
                  <p className="text-[13px] text-text-secondary text-center max-w-[320px] leading-[1.5]">
                    {selectedMode === 'tutor' && 'Structured lessons with step-by-step grammar and vocabulary guidance are on the way.'}
                    {selectedMode === 'immersion' && 'Immersive listening and reading exercises are being built. Stay tuned.'}
                    {selectedMode === 'reference' && 'A quick-reference tool for grammar, vocabulary, and usage questions is in the works.'}
                  </p>
                </div>
              )}

              {/* Input box */}
              {selectedMode === 'conversation' && <div className="w-full idle-entrance" style={{ animationDelay: '0.13s', opacity: 0 }}>
                <div className="relative">
                  <div className="bg-bg-pure border border-border rounded-xl overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,.04),0_1px_4px_rgba(0,0,0,.03)] transition-[border-color,box-shadow] duration-150 focus-within:border-border-strong focus-within:shadow-[0_2px_8px_rgba(0,0,0,.06),0_1px_4px_rgba(0,0,0,.04)]">
                    <div className="relative">
                      {/* IME composition highlight layer */}
                      {idleIme.mode !== 'direct' && idleIme.composedText && idleIme.compositionStart >= 0 && (
                        <div
                          className="absolute inset-0 pointer-events-none whitespace-pre-wrap break-words px-4 pt-3.5 pb-2.5 overflow-hidden text-left"
                          style={{ font: 'inherit', fontSize: '14.5px', lineHeight: '1.65' }}
                          aria-hidden="true"
                        >
                          <span style={{ color: 'transparent' }}>{input.slice(0, idleIme.compositionStart)}</span>
                          <span className="rounded-[3px]" style={{ color: 'transparent', backgroundColor: 'rgba(62, 99, 221, 0.12)' }}>
                            {idleIme.composedText}
                          </span>
                          <span style={{ color: 'transparent' }}>{input.slice(idleIme.compositionStart + idleIme.composedText.length)}</span>
                        </div>
                      )}

                      {/* IME suggestion overlay */}
                      {idleIme.mode !== 'direct' && idleIme.composedText && idleIme.compositionStart >= 0 && idleIme.suggestion && (
                        <div
                          className="absolute inset-0 pointer-events-none whitespace-pre-wrap break-words px-4 pt-3.5 pb-2.5 text-left"
                          style={{ font: 'inherit', fontSize: '14.5px', lineHeight: '1.65' }}
                          aria-hidden="true"
                        >
                          <span style={{ visibility: 'hidden' }}>{input.slice(0, idleIme.compositionStart)}</span>
                          <span className="relative inline-block">
                            <span className="absolute bottom-full left-0 mb-1 whitespace-nowrap bg-bg-secondary border border-border rounded-md px-2 py-0.5 text-[14px] font-jp text-text-primary shadow-sm z-20">
                              {idleIme.suggestion}
                            </span>
                          </span>
                        </div>
                      )}

                      <textarea
                        ref={textareaRef}
                        value={input}
                        onChange={(e) => {
                          if (idleIme.imeActive && idleIme.mode !== 'direct') return
                          setInput(e.target.value)
                          const ta = e.target
                          ta.style.height = 'auto'
                          ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'
                        }}
                        placeholder={idleIme.imeActive ? "Type romaji to write Japanese... (e.g., 'taberu' \u2192 \u98DF\u3079\u308B)" : MODE_PLACEHOLDERS[selectedMode]}
                        onKeyDown={(e) => {
                          const consumed = idleIme.handleKeyDown(e)
                          if (consumed) return
                          if (e.key === ' ' && (e.ctrlKey || e.metaKey)) {
                            e.preventDefault()
                            idleIme.toggleIME()
                            return
                          }
                          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                            e.preventDefault()
                            handleFreePromptSubmit()
                          }
                        }}
                        onBlur={() => {
                          if (idleIme.mode !== 'direct') idleIme.reset()
                        }}
                        className="block w-full border-none outline-none resize-none bg-transparent text-[14.5px] text-text-primary leading-[1.65] px-4 pt-3.5 pb-2.5 min-h-[56px] placeholder:text-text-placeholder relative z-10"
                        style={{ fontFamily: 'inherit' }}
                      />
                    </div>
                    <div className="flex items-center justify-between px-3 pb-2.5 pt-2 border-t border-bg-hover">
                      <div className="flex gap-1.5">
                        {/* IME toggle */}
                        <button
                          className={cn(
                            'w-7 h-7 rounded-md flex items-center justify-center border cursor-pointer text-[13px] font-bold font-jp transition-[border-color,color,background] duration-100',
                            idleIme.imeActive
                              ? 'border-accent-brand/30 bg-accent-brand/10 text-accent-brand'
                              : 'border-border bg-transparent text-text-muted hover:border-border-strong hover:text-text-primary hover:bg-bg-secondary'
                          )}
                          onClick={idleIme.toggleIME}
                          title={idleIme.imeActive ? 'Japanese IME on' : 'Japanese IME off'}
                        >
                          {idleIme.imeActive ? '\u3042' : 'A'}
                        </button>
                        {/* Voice */}
                        <button
                          className="w-7 h-7 rounded-md flex items-center justify-center border border-border bg-transparent cursor-pointer text-text-muted transition-[border-color,color,background] duration-100 hover:border-border-strong hover:text-text-primary hover:bg-bg-secondary"
                          title="Voice"
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" />
                          </svg>
                        </button>
                        {/* Attach */}
                        <button
                          className="w-7 h-7 rounded-md flex items-center justify-center border border-border bg-transparent cursor-pointer text-text-muted transition-[border-color,color,background] duration-100 hover:border-border-strong hover:text-text-primary hover:bg-bg-secondary"
                          title="Attach"
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                          </svg>
                        </button>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={cn("text-[12px] select-none", input.trim() ? "text-text-placeholder" : "text-text-muted/50")}>
                          {!input.trim()
                            ? 'No topic needed \u2014 just jump in'
                            : idleIme.imeActive
                              ? idleIme.mode !== 'direct'
                                ? 'Enter confirm \u00B7 Space candidates \u00B7 Esc revert'
                                : '\u23CE send \u00B7 \u2318Space toggle IME'
                              : '\u23CE send \u00B7 \u21E7\u23CE newline'
                          }
                        </span>
                        {input.trim() ? (
                          <button
                            className="h-8 px-2 rounded-lg bg-accent-brand border-none cursor-pointer flex items-center justify-center transition-all duration-150 shrink-0 hover:scale-105 hover:shadow-sm active:scale-[0.97]"
                            onClick={handleFreePromptSubmit}
                          >
                            <ArrowUpIcon className="w-3.5 h-3.5 text-white" />
                          </button>
                        ) : (
                          <button
                            className="h-8 px-3 rounded-lg bg-accent-brand border-none cursor-pointer flex items-center gap-1.5 text-[12.5px] font-semibold text-white transition-all duration-150 shrink-0 hover:scale-105 hover:shadow-sm active:scale-[0.97] whitespace-nowrap"
                            onClick={handleFreePromptSubmit}
                            style={{ fontFamily: 'inherit' }}
                          >
                            Just start
                            <ArrowRightIcon className="w-[13px] h-[13px]" />
                          </button>
                        )}
                    </div>
                  </div>
                </div>

                  {/* IME Candidate panel */}
                  {idleIme.showCandidates && idleIme.candidates.length > 0 && (
                    <IMECandidatePanel
                      candidates={idleIme.candidates}
                      selectedIndex={idleIme.selectedIndex}
                      onSelect={(index) => {
                        const ta = textareaRef.current
                        if (!ta) return
                        const candidate = idleIme.candidates[index]
                        if (candidate) {
                          idleIme.insertText(ta, candidate.surface)
                          idleIme.reset()
                        }
                      }}
                      onDismiss={() => idleIme.reset()}
                    />
                  )}
                </div>

                {/* Mode toggle — Chat / Voice */}
                <div className="flex justify-center mt-2.5">
                  <div className="flex gap-0.5 p-[3px] bg-bg-hover border border-border rounded-lg">
                    <button
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-[5px] rounded-md text-[13px] font-medium cursor-pointer transition-all duration-100 border-none',
                        inputMode === 'chat'
                          ? 'bg-bg-pure text-text-primary shadow-[0_1px_2px_rgba(0,0,0,.06)]'
                          : 'bg-transparent text-text-muted hover:text-text-primary'
                      )}
                      onClick={() => setInputMode('chat')}
                    >
                      <ChatBubbleLeftIcon className="w-3 h-3" />
                      Chat
                    </button>
                    <button
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-[5px] rounded-md text-[13px] font-medium cursor-pointer transition-all duration-100 border-none',
                        inputMode === 'voice'
                          ? 'bg-bg-pure text-text-primary shadow-[0_1px_2px_rgba(0,0,0,.06)]'
                          : 'bg-transparent text-text-muted hover:text-text-primary'
                      )}
                      onClick={() => setInputMode('voice')}
                    >
                      <MicrophoneIcon className="w-3 h-3" />
                      Voice
                    </button>
                  </div>
                </div>
              </div>}

              {/* Suggestions */}
              {selectedMode === 'conversation' && <>
              <div className="w-full mt-8 idle-entrance" style={{ animationDelay: '0.19s', opacity: 0 }}>
                <div className="flex justify-between items-center mb-2.5">
                  <span className="text-[11px] font-semibold tracking-[0.07em] uppercase text-text-muted">
                    {SUGGESTION_TITLES[selectedMode]}
                  </span>
                  <button
                    className="bg-transparent border-none cursor-pointer text-[13px] text-text-muted hover:text-text-primary transition-colors"
                    onClick={() => setShowAllSuggestions((v) => !v)}
                  >
                    {showAllSuggestions ? 'Show less' : 'See all \u2192'}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {suggestions.slice(0, showAllSuggestions ? suggestions.length : 4).map((s, i) => (
                    <button
                      key={i}
                      className="flex items-start gap-2.5 p-3 rounded-lg bg-bg-pure border border-border-subtle cursor-pointer text-left w-full shadow-[0_1px_2px_rgba(0,0,0,.04),0_1px_4px_rgba(0,0,0,.03)] transition-[box-shadow,border-color,transform] duration-150 hover:border-border-strong hover:shadow-[0_2px_8px_rgba(0,0,0,.06),0_1px_4px_rgba(0,0,0,.04)] hover:-translate-y-px"
                      onClick={() => {
                        setInput(s.label)
                        textareaRef.current?.focus()
                      }}
                      style={{ fontFamily: 'inherit' }}
                    >
                      <span className="mt-0.5 shrink-0 w-[18px] h-[18px] text-text-muted">{s.icon}</span>
                      <div className="text-[13px] font-medium text-text-primary leading-[1.4]">{s.label}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Recent sessions — hide sessions shorter than 60s */}
              {recentSessions.filter(s => s.durationSeconds !== null && s.durationSeconds >= 60).length > 0 && (
                <div className="w-full mt-7 idle-entrance" style={{ animationDelay: '0.25s', opacity: 0 }}>
                  <div className="text-[11px] font-semibold tracking-[0.07em] uppercase text-text-muted mb-1.5">
                    Recent Sessions
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {recentSessions.filter(s => s.durationSeconds !== null && s.durationSeconds >= 60).slice(0, 5).map((session) => {
                      const duration = formatDuration(session.durationSeconds)
                      const time = formatRelativeTime(session.timestamp)
                      const label = session.sessionFocus || MODE_LABELS[session.mode as ScenarioMode] || 'Session'
                      const modeLabel = MODE_LABELS[session.mode as ScenarioMode] || session.mode
                      return (
                        <button
                          key={session.id}
                          className="flex items-center gap-3 px-3.5 py-3 bg-bg-pure border border-border-subtle rounded-lg w-full cursor-pointer text-left transition-[box-shadow,border-color,transform] duration-150 hover:border-border-strong hover:shadow-[0_2px_8px_rgba(0,0,0,.06)] hover:-translate-y-px shadow-[0_1px_2px_rgba(0,0,0,.04)]"
                          style={{ fontFamily: 'inherit' }}
                          onClick={() => router.push(`/progress/${session.id}`)}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-[13px] font-medium text-text-primary truncate leading-snug">{label}</div>
                            <div className="text-[11.5px] text-text-muted mt-0.5">
                              {modeLabel} · {time}{duration ? ` · ${duration}` : ''}
                            </div>
                          </div>
                          <ChevronRightIcon className="w-[13px] h-[13px] text-text-muted/50 shrink-0" />
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
              </>}
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
        <div className="flex items-center gap-2 min-w-0">
          <span className="shrink-0 px-1.5 py-0.5 rounded bg-bg-secondary text-[11px] font-medium text-text-muted uppercase tracking-wide">
            {MODE_LABELS[activeMode]}
          </span>
          <span className="text-[13px] font-medium text-text-primary truncate">{sessionTitle}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            className={cn(
              'w-8 h-8 flex items-center justify-center rounded-lg transition-colors',
              streamingTts.voiceEnabled
                ? 'bg-accent-brand/10 text-accent-brand'
                : 'text-text-muted hover:text-text-primary hover:bg-bg-hover'
            )}
            onClick={streamingTts.toggleVoice}
            title={streamingTts.voiceEnabled ? 'Disable voice mode' : 'Enable voice mode'}
          >
            {streamingTts.voiceEnabled ? <SpeakerWaveIcon className="w-4 h-4" /> : <SpeakerXMarkIcon className="w-4 h-4" />}
          </button>
          <button
            className={cn(
              'w-8 h-8 flex items-center justify-center rounded-lg transition-colors',
              panel.isOpen
                ? 'bg-accent-brand/10 text-accent-brand'
                : 'text-text-muted hover:text-text-primary hover:bg-bg-hover'
            )}
            onClick={panel.toggle}
            title="Toggle session panel"
          >
            <Bars3Icon className="w-4 h-4" />
          </button>
          <button
            className="inline-flex items-center gap-1.5 rounded-lg bg-bg-secondary px-3 py-1.5 text-[13px] font-medium text-text-secondary border border-border cursor-pointer transition-colors hover:border-accent-brand hover:text-accent-brand"
            onClick={() => router.push(`/conversation/voice?sessionId=${sessionId}`)}
            title="Switch to voice mode"
          >
            <MicrophoneIcon className="w-3 h-3" />
            Voice
          </button>
          <button
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg bg-warm-soft px-3 py-1.5 text-[13px] font-medium text-accent-warm border-none cursor-pointer transition-colors hover:bg-warm-med',
              isLoading && 'opacity-50'
            )}
            onClick={handleEndSession}
            disabled={isLoading}
          >
            <StopIcon className="w-3 h-3" />
            End Session
          </button>
        </div>
      </div>

      {/* Main content: chat + panel */}
      <div className="flex-1 flex overflow-hidden">
        {/* Chat column */}
        <div className="flex-1 flex flex-col min-w-0">
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
                  panelOpen={panel.isOpen}
                  violations={difficultyViolations.get(msg.id)}
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
              {/* Escape hatch — hidden for reference/immersion modes */}
              {messages.length > 0 && !isSending && activeMode !== 'reference' && activeMode !== 'immersion' && (
                <EscapeHatch onUse={handleEscapeHatch} />
              )}

              {/* Suggestion chips */}
              {(messages.length === 0 || (messages.length > 0 && messages[messages.length - 1].role === 'assistant' && !isSending)) && (
                <SuggestionChips
                  suggestions={dynamicSuggestions ?? CHAT_DEFAULT_SUGGESTIONS}
                  onSelect={handleSuggestionSelect}
                />
              )}

              {/* Chat input */}
              <ChatInput
                value={input}
                onChange={setInput}
                onSend={handleSend}
                onVoiceTranscript={handleVoiceTranscript}
                disabled={isSending || showUsageLimitModal}
                placeholder={showUsageLimitModal ? 'Daily limit reached' : 'Type your message...'}
                showRomaji={showRomaji}
                onToggleRomaji={toggleRomaji}
              />
              {/* Usage countdown warning */}
              {usageRemainingSeconds !== null && usageRemainingSeconds > 0 && usageRemainingSeconds <= 120 && (
                <div className="flex items-center justify-center gap-1.5 py-1.5 text-[12px] text-accent-warm">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  {Math.floor(usageRemainingSeconds / 60)}:{String(usageRemainingSeconds % 60).padStart(2, '0')} remaining today
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Side panel */}
        {panel.isOpen && (
          <div className="w-[340px] border-l border-border shrink-0">
            <LearningPanel
              messages={messages}
              plan={sessionPlan}
              sessionId={sessionId}
              mode={activeMode}
              onPlanUpdate={handlePlanUpdate}
            />
          </div>
        )}
      </div>

      <UsageLimitModal
        open={showUsageLimitModal}
        onClose={() => setShowUsageLimitModal(false)}
        usedMinutes={usageLimitMinutes}
        limitMinutes={usageLimitMinutes}
      />
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
  panelOpen,
  violations,
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
  panelOpen?: boolean
  violations?: DifficultyViolation[]
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
            panelOpen={panelOpen}
          />
        )
      })}
      {violations && violations.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {violations.map((v, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-warm-soft text-[11px] text-accent-warm font-medium"
              title={`${v.baseForm} is N${v.jlptLevel} — above the target level`}
            >
              {v.surface}
              <span className="text-[10px] opacity-70">N{v.jlptLevel}</span>
            </span>
          ))}
        </div>
      )}
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
  panelOpen,
}: {
  part: UIMessage['parts'][number]
  showRomaji: boolean
  getAnnotated: (text: string) => string
  isStreaming?: boolean
  messageId: string
  chosenChoiceIds: Set<string>
  onChoiceSelect: (text: string, blockId: string) => void
  panelOpen?: boolean
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
    const toolName = partType.replace('tool-', '')
    const toolPart = part as { type: string; state: string; output?: unknown; args?: unknown }
    const zone = getToolZone(toolName)

    // Chips zone — extracted for bottom chips, hidden inline
    if (zone === 'chips') return null

    // Hidden zone — no visual output
    if (zone === 'hidden') return null

    // Panel zone — show reference pill inline when panel is open, full card when closed
    if (zone === 'panel' && panelOpen) {
      if (toolPart.state === 'output-available' && toolPart.output) {
        return <ReferencePill toolName={toolName} output={toolPart.output} />
      }
      if (toolPart.state === 'input-available') {
        return <ReferencePillSkeleton />
      }
      return null
    }

    // Inline zone (or panel zone with panel closed) — render full cards
    if (toolName === 'displayChoices') {
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

    if (toolName === 'showCorrection') {
      if (toolPart.state === 'output-available' && toolPart.output) {
        const output = toolPart.output as { original: string; corrected: string; explanation: string; grammarPoint?: string }
        return <CorrectionCard {...output} />
      }
      if (toolPart.state === 'input-available') return <CorrectionCardSkeleton />
      return null
    }

    if (toolName === 'showVocabularyCard') {
      if (toolPart.state === 'output-available' && toolPart.output) {
        const output = toolPart.output as { word: string; reading?: string; meaning: string; partOfSpeech?: string; exampleSentence?: string; notes?: string }
        return <VocabularyCard {...output} />
      }
      if (toolPart.state === 'input-available') return <VocabularyCardSkeleton />
      return null
    }

    if (toolName === 'showGrammarNote') {
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

// Reference pill for panel-zone tools shown inline in chat
function ReferencePill({ toolName, output }: { toolName: string; output: unknown }) {
  const data = output as Record<string, unknown>
  let icon: string
  let label: string

  if (toolName === 'showVocabularyCard') {
    icon = '\uD83D\uDCD8'
    label = (data.word as string) || 'Vocabulary'
  } else if (toolName === 'showGrammarNote') {
    icon = '\uD83D\uDCD5'
    label = (data.pattern as string) || 'Grammar'
  } else if (toolName === 'showCorrection') {
    icon = '\u270F\uFE0F'
    label = 'Correction'
  } else {
    return null
  }

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-bg-secondary border border-border text-[12px] text-text-secondary font-medium font-jp mr-1 my-0.5">
      <span className="text-[11px]">{icon}</span>
      {label}
    </span>
  )
}

function ReferencePillSkeleton() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-bg-secondary border border-border text-[12px] text-text-placeholder mr-1 my-0.5 animate-pulse">
      <span className="w-3 h-3 bg-border rounded-full" />
      <span className="w-12 h-3 bg-border rounded" />
    </span>
  )
}
