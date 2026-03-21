'use client'

import { useMemo, useCallback, useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Spinner } from '@/components/spinner'
import { useOnboarding } from '@/hooks/use-onboarding'
import { CoachMark } from '@/components/onboarding/coach-mark'
import { stripRubyAnnotations } from '@/lib/ruby-annotator'
import { getTargetFontCleanClass } from '@/lib/languages'
import { useLanguage } from '@/hooks/use-language'
import type { TranscriptLine } from '@/hooks/use-voice-conversation'

const PAREN_LATIN = /\([^)]*[a-zA-Z][^)]*\)/g
const BRACKET_LATIN = /\[[^\]]*[a-zA-Z][^\]]*\]/g

function stripNonTargetLanguage(text: string): string {
  return text.replace(PAREN_LATIN, '').replace(BRACKET_LATIN, '').replace(/\s{2,}/g, ' ').trim()
}

function tokenizeWords(text: string, lang: string): Array<{ segment: string; isWordLike: boolean }> {
  if (!text) return []
  try {
    const langCode = lang === 'Japanese' ? 'ja' : lang === 'Chinese' ? 'zh' : 'en'
    const segmenter = new Intl.Segmenter(langCode, { granularity: 'word' })
    return Array.from(segmenter.segment(text)).map(s => ({
      segment: s.segment,
      isWordLike: s.isWordLike ?? !/^\s+$/.test(s.segment),
    }))
  } catch {
    return [{ segment: text, isWordLike: true }]
  }
}

interface CorrectionInfo {
  original: string
  corrected: string
  explanation: string
  grammarPoint?: string
}

interface CorrectionSegment {
  text: string
  error: boolean
  correction?: string
  note?: string
}

interface VoiceLiveSubtitlesProps {
  /** The user's live partial text (streaming from STT) */
  partialText: string
  /** The finalized user transcript line for this exchange */
  userLine: TranscriptLine | null
  /** The AI transcript line for this exchange */
  aiLine: TranscriptLine | null
  /** Latest correction for the user's turn */
  correction: CorrectionInfo | null
  /** Whether subtitles are toggled on */
  visible: boolean
  /** Current voice state for phase logic */
  voiceState: string
  /** Whether user is actively holding PTT */
  isTalking: boolean
  /** Callback when a word is clicked for lookup */
  onLookup?: (word: string, context: string) => void
  /** Lookup result to display in popover */
  lookupResult?: { word: string; reading?: string; meaning: string; partOfSpeech?: string; exampleSentence?: string; notes?: string } | null
  /** Whether lookup is loading */
  lookupLoading?: boolean
  /** Open chat with lookup context */
  onOpenChat?: (context: string) => void
  /** Callback to translate the AI text */
  onTranslate?: (text: string) => void
  /** Current translation to display */
  translation?: string | null
  /** Callback to trigger suggestion */
  onSuggest?: () => void
  /** Current suggestion to display */
  suggestion?: string | null
  /** Whether suggestion is loading */
  suggestionLoading?: boolean
  className?: string
  targetLanguage?: string
}

function parseSegments(text: string, corrections: CorrectionInfo[]): CorrectionSegment[] {
  const segs: CorrectionSegment[] = []
  let remaining = text

  const sorted = [...corrections].sort(
    (a, b) => text.indexOf(a.original) - text.indexOf(b.original),
  )

  for (const c of sorted) {
    const i = remaining.indexOf(c.original)
    if (i === -1) continue
    if (i > 0) segs.push({ text: remaining.slice(0, i), error: false })
    segs.push({
      text: c.original,
      error: true,
      correction: c.corrected,
      note: c.explanation,
    })
    remaining = remaining.slice(i + c.original.length)
  }
  if (remaining) segs.push({ text: remaining, error: false })
  return segs
}

export function VoiceLiveSubtitles({
  partialText,
  userLine,
  aiLine,
  correction,
  visible,
  voiceState,
  isTalking,
  onLookup,
  lookupResult,
  lookupLoading,
  onOpenChat,
  onTranslate,
  translation,
  onSuggest,
  suggestion,
  suggestionLoading,
  className,
  targetLanguage,
}: VoiceLiveSubtitlesProps) {
  const { targetLanguage: ctxLang } = useLanguage()
  const lang = targetLanguage || ctxLang || 'Japanese'
  const fontClean = getTargetFontCleanClass(lang)

  // ── Onboarding hints ──
  const { isDismissed, dismiss } = useOnboarding()

  const hasCorrection = !!correction

  // User text: partial (live) while talking, finalized line otherwise
  const userText = isTalking || partialText ? partialText : (userLine?.text || '')

  const cleanAiText = useMemo(
    () => (aiLine ? stripNonTargetLanguage(stripRubyAnnotations(aiLine.text)) : ''),
    [aiLine],
  )

  const segments = useMemo(() => {
    if (!correction || !userLine) return []
    return parseSegments(userLine.text, [correction])
  }, [correction, userLine])

  // ── Inline word lookup ──
  const [lookupAnchor, setLookupAnchor] = useState<{ word: string; x: number; y: number } | null>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  // Dismiss when user starts talking
  useEffect(() => {
    if (isTalking) setLookupAnchor(null)
  }, [isTalking])

  // Dismiss on Escape
  useEffect(() => {
    if (!lookupAnchor) return
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLookupAnchor(null)
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [lookupAnchor])

  // Dismiss on click outside
  useEffect(() => {
    if (!lookupAnchor) return
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setLookupAnchor(null)
      }
    }
    // Delay to avoid immediate dismiss from the click that opened it
    const timer = setTimeout(() => {
      window.addEventListener('mousedown', handleClick)
    }, 50)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('mousedown', handleClick)
    }
  }, [lookupAnchor])

  const handleWordClick = useCallback((word: string, e: React.MouseEvent<HTMLSpanElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setLookupAnchor({
      word,
      x: rect.left + rect.width / 2,
      y: rect.bottom + 6,
    })
    onLookup?.(word, cleanAiText)
  }, [onLookup, cleanAiText])

  const tokens = useMemo(() => tokenizeWords(cleanAiText, lang), [cleanAiText, lang])

  // Phrase selection via drag
  const handleTextSelect = useCallback(() => {
    const sel = window.getSelection()
    if (!sel || sel.type !== 'Range') return
    const text = sel.toString().trim()
    if (!text || text.length < 2) return
    const range = sel.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    setLookupAnchor({
      word: text,
      x: rect.left + rect.width / 2,
      y: rect.bottom + 6,
    })
    onLookup?.(text, cleanAiText)
    sel.removeAllRanges()
  }, [onLookup, cleanAiText])

  // Determine what to show
  const showUser = !!userText
  const showAI = !!cleanAiText

  // Generate a key that changes per exchange (clears animation state)
  const exchangeKey = userLine?.timestamp || 'none'

  return (
    <div
      className={cn(
        'w-full max-w-[460px] mx-auto text-center min-h-[80px] flex flex-col items-center gap-2 transition-opacity duration-300 pointer-events-none',
        visible ? 'opacity-100' : 'opacity-0',
        className,
      )}
    >
      {/* User text */}
      <AnimatePresence mode="popLayout">
        {showUser && (
          <motion.div
            key={`user-${exchangeKey}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.25 }}
            className={cn("text-[15px] leading-[1.8] text-text-primary", fontClean)}
          >
            {hasCorrection && segments.length > 0
              ? segments.map((s, i) => (
                  <span
                    key={i}
                    className={cn(
                      'relative inline',
                      s.error && 'bg-warm-soft border-b-2 border-accent-warm rounded-sm pb-px',
                    )}
                  >
                    {s.text}
                    {s.error && s.correction && (
                      <span className="absolute bottom-[calc(100%+4px)] left-1/2 -translate-x-1/2 bg-accent-brand text-white text-[10px] px-2 py-[3px] rounded-md whitespace-nowrap font-medium font-sans animate-[voice-fade-up_0.2s_ease_both]">
                        &rarr; {s.correction}
                      </span>
                    )}
                  </span>
                ))
              : <span>{userText}</span>
            }
          </motion.div>
        )}
      </AnimatePresence>

      {/* AI text — shown underneath with visual separation */}
      <AnimatePresence>
        {showAI && (
          <motion.div
            key={`ai-${exchangeKey}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col items-center gap-1"
          >
            <div className="w-5 h-px bg-border-strong mb-0.5" />
            {!isDismissed('hint_click_words') && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.5, duration: 0.4 }}
                className="text-[11px] text-text-muted mb-1 pointer-events-auto cursor-pointer"
                onClick={() => dismiss('hint_click_words')}
              >
                click any word to look it up
              </motion.p>
            )}
            <div
              onMouseUp={handleTextSelect}
              onClick={() => { if (!isDismissed('hint_click_words')) dismiss('hint_click_words') }}
              className={cn(
                `text-[14.5px] leading-[1.7] text-text-secondary italic pointer-events-auto select-text`,
                fontClean,
              )}
            >
              {tokens.map((t, i) =>
                t.isWordLike ? (
                  <span
                    key={i}
                    onClick={(e) => handleWordClick(t.segment, e)}
                    className="cursor-pointer underline decoration-dotted decoration-border-strong/40 underline-offset-[3px] hover:decoration-solid hover:decoration-border-strong hover:underline-offset-2 transition-all duration-150 pointer-events-auto"
                  >
                    {t.segment}
                  </span>
                ) : (
                  <span key={i}>{t.segment}</span>
                )
              )}
              {aiLine && !aiLine.isFinal && (
                <span className="inline-block w-[2px] h-[0.88em] bg-text-secondary ml-px animate-[blink-cursor_0.65s_step-end_infinite] align-text-bottom" />
              )}
            </div>

            {/* Coach mark for word lookup hint */}
            <CoachMark
              hintId="hint_voice_subtitles"
              content="Tap any word above to look it up instantly. Select a phrase for multi-word lookup."
              side="bottom"
              show={isDismissed('hint_voice_feedback') && !isDismissed('hint_voice_subtitles') && !!cleanAiText}
              onDismiss={() => dismiss('hint_voice_subtitles')}
            >
            <div />
            </CoachMark>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Word lookup popover */}
      <AnimatePresence>
        {lookupAnchor && (lookupResult || lookupLoading) && (
          <motion.div
            ref={popoverRef}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15 }}
            className="fixed z-[100] pointer-events-auto"
            style={{
              left: lookupAnchor.x,
              top: lookupAnchor.y,
              transform: 'translateX(-50%)',
            }}
          >
            <div className="rounded-xl bg-bg-pure border border-border shadow-[0_4px_24px_rgba(0,0,0,.1),0_2px_8px_rgba(0,0,0,.06)] px-4 py-3 w-[260px] text-left not-italic">
              {lookupLoading ? (
                <div className="flex items-center justify-center py-2">
                  <Spinner size={16} />
                </div>
              ) : lookupResult ? (
                <div className="flex flex-col gap-1.5">
                  <div className={cn('text-[16px] font-semibold text-text-primary', fontClean)}>{lookupResult.word}</div>
                  {lookupResult.reading && (
                    <div className="text-[13px] text-text-secondary">{lookupResult.reading}</div>
                  )}
                  <div className="text-[14px] text-text-primary">{lookupResult.meaning}</div>
                  {lookupResult.partOfSpeech && (
                    <span className="inline-flex text-[10.5px] bg-bg-secondary rounded-full px-2 py-0.5 text-text-secondary font-medium w-fit">
                      {lookupResult.partOfSpeech}
                    </span>
                  )}
                  {onOpenChat && (
                    <button
                      onClick={() => {
                        onOpenChat(lookupResult.word)
                        setLookupAnchor(null)
                      }}
                      className="text-[12px] text-text-muted font-medium hover:text-text-secondary mt-1 text-left cursor-pointer bg-transparent border-none p-0 transition-colors"
                    >
                      Continue in chat &rarr;
                    </button>
                  )}
                </div>
              ) : null}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
