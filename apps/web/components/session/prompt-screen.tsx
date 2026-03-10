'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  MapPinIcon, BuildingStorefrontIcon, FireIcon, HomeIcon, TruckIcon,
  PencilIcon, HashtagIcon, FlagIcon, SpeakerWaveIcon,
  BookOpenIcon, ChatBubbleLeftIcon, ClockIcon, TrophyIcon,
  NewspaperIcon, FilmIcon, BookmarkIcon, MusicalNoteIcon,
  TvIcon, DocumentTextIcon, MicrophoneIcon,
  FolderOpenIcon, MagnifyingGlassIcon, GlobeAltIcon, LanguageIcon,
  ChartBarIcon, ClipboardDocumentListIcon, ShoppingCartIcon,
  ChevronRightIcon,
  ArrowUpIcon, ArrowRightIcon,
} from '@heroicons/react/24/outline'
import { useRouter } from 'next/navigation'
import {
  type ScenarioMode,
  MODE_LABELS,
  MODE_PLACEHOLDERS,
  getAllModes,
} from '@/lib/experience-scenarios'
import { getGreetingForLanguage } from '@/lib/languages'
import { useJapaneseIME } from '@/hooks/use-japanese-ime'
import { useOnboarding } from '@/hooks/use-onboarding'
import { IMECandidatePanel } from '@/components/chat/ime/ime-candidate-panel'
import { WelcomeCard } from '@/components/onboarding/welcome-card'
import { CoachMark } from '@/components/onboarding/coach-mark'
import { Spinner } from '@/components/spinner'
import { cn } from '@/lib/utils'

interface PromptScreenProps {
  targetLanguage: string
  error: string | null
  isLoading: boolean
  onStart: (prompt: string, mode: ScenarioMode, inputMode: 'chat' | 'voice') => void
}

function getModeDefaultPrompts(language: string): Record<string, string> {
  return {
    conversation: `Let's have a casual conversation in ${language}.`,
    tutor: `I'd like to practice ${language} with a tutor.`,
    immersion: `Create an immersive ${language} listening exercise.`,
    reference: `I have some questions about ${language}.`,
  }
}

/* Icon shorthand */
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

export function PromptScreen({ targetLanguage, error, isLoading, onStart }: PromptScreenProps) {
  const router = useRouter()
  const [input, setInput] = useState('')
  const [selectedMode, setSelectedMode] = useState<ScenarioMode>('conversation')
  const [inputMode, setInputMode] = useState<'chat' | 'voice'>('voice')
  const [showAllSuggestions, setShowAllSuggestions] = useState(false)
  const [recentSessions, setRecentSessions] = useState<{ id: string; timestamp: string; durationSeconds: number | null; mode: string; sessionFocus: string }[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const idleIme = useJapaneseIME(input, setInput, { initialActive: false })
  const onboarding = useOnboarding()

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
  }, [])

  // Fetch recent sessions
  useEffect(() => {
    import('@/lib/api').then(({ api }) => {
      api.conversationList().then(setRecentSessions).catch(() => {})
    })
  }, [targetLanguage])

  const handleSubmit = useCallback(() => {
    const defaults = getModeDefaultPrompts(targetLanguage)
    const text = input.trim() || defaults[selectedMode] || defaults.conversation
    setInput('')
    onboarding.dismissAll()
    onStart(text, selectedMode, inputMode)
  }, [input, selectedMode, inputMode, targetLanguage, onStart, onboarding])

  const greeting = getGreetingForLanguage(targetLanguage)
  const modes = getAllModes()
  const allSuggestions = getSuggestions(targetLanguage)
  const suggestions = allSuggestions[selectedMode]

  return (
    <div className="h-full flex flex-col items-center overflow-auto">
      <div className="w-full max-w-[620px] flex flex-col items-center pt-12 pb-12 px-6">

        {/* Greeting / Welcome Card */}
        {onboarding.isFirstVisit && !onboarding.isDismissed('welcome_card') ? (
          <WelcomeCard
            onDismiss={() => onboarding.dismiss('welcome_card')}
            onStart={handleSubmit}
          />
        ) : (
          <div className="text-center mb-8 idle-entrance">
            <div className="font-jp text-[44px] font-light tracking-[0.04em] text-text-primary leading-[1.2] mb-2">
              {greeting.native}
            </div>
            <p className="text-[15px] text-text-secondary">{greeting.english}</p>
          </div>
        )}

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
            {/* Tabs -- pill style */}
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
                          handleSubmit()
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
                          onClick={handleSubmit}
                        >
                          <ArrowUpIcon className="w-3.5 h-3.5 text-white" />
                        </button>
                      ) : (
                        <button
                          className="h-8 px-3 rounded-lg bg-accent-brand border-none cursor-pointer flex items-center gap-1.5 text-[12.5px] font-semibold text-white transition-all duration-150 shrink-0 hover:scale-105 hover:shadow-sm active:scale-[0.97] whitespace-nowrap"
                          onClick={handleSubmit}
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

              {/* Mode toggle -- Chat / Voice */}
              <CoachMark
                hintId="hint_voice_toggle"
                content="Switch between typing and speaking here."
                side="bottom"
                show={onboarding.isDismissed('hint_suggestions') && !onboarding.isDismissed('hint_voice_toggle')}
                onDismiss={() => onboarding.dismiss('hint_voice_toggle')}
              >
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
              </CoachMark>
            </div>}

            {/* Suggestions */}
            {selectedMode === 'conversation' && <>
            <CoachMark
              hintId="hint_suggestions"
              content="Pick a scenario or just press 'Just start' — no topic needed."
              side="top"
              show={onboarding.isDismissed('welcome_card') && !onboarding.isDismissed('hint_suggestions')}
              onDismiss={() => onboarding.dismiss('hint_suggestions')}
            >
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
            </CoachMark>

            {/* Recent sessions */}
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
