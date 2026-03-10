'use client'

import { useRef, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { TranscriptLine } from '@/hooks/use-voice-conversation'
import { stripRubyAnnotations } from '@/lib/ruby-annotator'
import { cn } from '@/lib/utils'
import { getTargetFontCleanClass, getLanguageById } from '@/lib/languages'
import { useLanguage } from '@/hooks/use-language'

interface CorrectionInfo {
  original: string
  corrected: string
  explanation: string
  grammarPoint?: string
}

interface VoiceExchangeViewProps {
  aiLine: TranscriptLine | null
  userLine: TranscriptLine | null
  partialText: string
  correction: CorrectionInfo | null
  aiTranslation?: string
  spokenSentences?: string[]
  currentSentence?: string | null
  currentProgress?: number
  /** Whether TTS audio is actively playing */
  ttsPlaying?: boolean
  className?: string
  targetLanguage?: string
}

// ── Word segmentation ──

/** Create an Intl.Segmenter for the given locale (falls back to null if unavailable) */
function getSegmenter(langCode: string): Intl.Segmenter | null {
  if (typeof Intl === 'undefined' || !('Segmenter' in Intl)) return null
  return new Intl.Segmenter(langCode, { granularity: 'word' })
}

interface WordSegment {
  text: string
  /** Start index in the original string */
  start: number
  /** End index (exclusive) in the original string */
  end: number
}

function segmentWords(text: string, segmenter: Intl.Segmenter | null): WordSegment[] {
  if (!segmenter) {
    // Fallback: treat each character as a segment
    return [...text].map((ch, i) => ({ text: ch, start: i, end: i + 1 }))
  }
  const segments: WordSegment[] = []
  for (const seg of segmenter.segment(text)) {
    segments.push({
      text: seg.segment,
      start: seg.index,
      end: seg.index + seg.segment.length,
    })
  }
  return segments
}

// ── Highlight position computation ──

/**
 * Compute the exact character position in `text` where karaoke highlighting should reach.
 * Finds each spoken sentence by substring match and interpolates within the current sentence.
 */
function computeHighlightPosition(
  text: string,
  spokenSentences: string[],
  currentSentence: string | null,
  currentProgress: number,
): number {
  let pos = 0

  for (const sentence of spokenSentences) {
    const idx = text.indexOf(sentence, pos)
    if (idx !== -1) {
      pos = idx + sentence.length
    } else {
      pos += sentence.length
    }
  }

  if (currentSentence && currentProgress > 0) {
    const idx = text.indexOf(currentSentence, pos)
    if (idx !== -1) {
      const charsInto = Math.floor(currentSentence.length * currentProgress)
      pos = idx + charsInto
    } else {
      pos += Math.floor(currentSentence.length * currentProgress)
    }
  }

  return Math.min(pos, text.length)
}

/**
 * Snap a character position to the nearest completed word boundary.
 * This prevents the highlight from cutting mid-character in CJK text.
 */
function snapToWordBoundary(charPos: number, words: WordSegment[]): number {
  if (words.length === 0) return charPos
  for (const word of words) {
    // If the position falls within this word, snap to either its start or end
    if (charPos >= word.start && charPos < word.end) {
      // If we're past the midpoint of the word, snap to end; otherwise snap to start
      const mid = word.start + (word.end - word.start) / 2
      return charPos >= mid ? word.end : word.start
    }
  }
  return charPos
}

// ── Component ──

export function VoiceExchangeView({
  aiLine, userLine, partialText, correction, aiTranslation,
  spokenSentences = [], currentSentence = null, currentProgress = 0,
  ttsPlaying = false, className, targetLanguage,
}: VoiceExchangeViewProps) {
  const { targetLanguage: ctxLang } = useLanguage()
  const lang = targetLanguage || ctxLang || 'Japanese'
  const fontClean = getTargetFontCleanClass(lang)
  const segmenterLocale = getLanguageById(lang)?.sttCode || 'ja'

  const segmenter = useMemo(() => getSegmenter(segmenterLocale), [segmenterLocale])

  const exchangeRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (exchangeRef.current) {
      exchangeRef.current.scrollTop = exchangeRef.current.scrollHeight
    }
  }, [aiLine, userLine, partialText, correction])

  const cleanAiText = useMemo(
    () => (aiLine ? stripRubyAnnotations(aiLine.text) : ''),
    [aiLine],
  )

  const words = useMemo(() => segmentWords(cleanAiText, segmenter), [cleanAiText, segmenter])

  // Show karaoke when TTS is actively playing audio for this turn
  // Skip karaoke when no sentence progress info is available
  const hasSentenceProgress = spokenSentences.length > 0 || currentSentence !== null
  const showKaraoke = ttsPlaying && cleanAiText.length > 0 && hasSentenceProgress

  const highlightChars = useMemo(() => {
    if (!showKaraoke) return cleanAiText.length
    const rawPos = computeHighlightPosition(cleanAiText, spokenSentences, currentSentence, currentProgress)
    return snapToWordBoundary(rawPos, words)
  }, [showKaraoke, cleanAiText, spokenSentences, currentSentence, currentProgress, words])

  return (
    <div ref={exchangeRef} className={cn('w-full max-w-[520px] mx-auto flex flex-col gap-[7px] px-4', className)}>
      <AnimatePresence mode="popLayout">
        {/* AI message */}
        {aiLine && (
          <motion.div
            key={`ai-${aiLine.timestamp}`}
            initial={{ opacity: 0, y: 7 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="flex gap-[9px] items-start"
          >
            <div className={cn("w-[27px] h-[27px] rounded-lg shrink-0 flex items-center justify-center text-[13px] bg-bg-hover border border-border", fontClean)}>
              花
            </div>
            <div className="max-w-[90%] flex flex-col gap-[5px]">
              <div className={cn("px-[13px] py-[9px] text-[14px] leading-[1.72] rounded-xl rounded-bl-[3px] bg-[rgba(255,255,255,.9)] border border-border backdrop-blur-[8px]", fontClean)}>
                {showKaraoke ? (
                  <KaraokeText text={cleanAiText} highlightChars={highlightChars} />
                ) : (
                  cleanAiText
                )}
                {!aiLine.isFinal && !showKaraoke && (
                  <span className="inline-block w-[2px] h-[0.88em] bg-text-primary ml-px animate-[blink-cursor_0.65s_step-end_infinite] align-text-bottom" />
                )}
              </div>
              {aiTranslation && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5, duration: 0.5 }}
                  className="text-[11.5px] text-text-muted italic px-[3px] leading-[1.5]"
                >
                  {aiTranslation}
                </motion.div>
              )}
            </div>
          </motion.div>
        )}

        {/* User message */}
        {userLine && (
          <motion.div
            key={`user-${userLine.timestamp}`}
            initial={{ opacity: 0, y: 7 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="flex gap-[9px] items-start flex-row-reverse"
          >
            <div className="w-[27px] h-[27px] rounded-lg shrink-0 flex items-center justify-center text-[11px] font-semibold bg-bg-hover border border-border text-text-secondary">
              YOU
            </div>
            <div className="max-w-[90%] flex flex-col gap-[5px]">
              <div className={cn("px-[13px] py-[9px] text-[13.5px] leading-[1.72] rounded-xl rounded-br-[3px] bg-accent-brand text-white", fontClean)}>
                {userLine.text}
              </div>
              {correction && <CorrectionInline correction={correction} />}
            </div>
          </motion.div>
        )}

        {/* Live partial text */}
        {partialText && !userLine && (
          <motion.div
            key="partial"
            initial={{ opacity: 0, y: 7 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="flex gap-[9px] items-start flex-row-reverse"
          >
            <div className="w-[27px] h-[27px] rounded-lg shrink-0 flex items-center justify-center text-[11px] font-semibold bg-bg-hover border border-border text-text-secondary">
              YOU
            </div>
            <div className="max-w-[90%]">
              <div className={cn("px-[13px] py-[9px] text-[13.5px] leading-[1.72] rounded-xl rounded-br-[3px] bg-accent-brand/80 text-white/80", fontClean)}>
                {partialText}
                <span className="inline-block w-[2px] h-[0.88em] bg-white/60 ml-px animate-pulse align-text-bottom" />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** Renders text with word-level karaoke highlight */
function KaraokeText({ text, highlightChars }: { text: string; highlightChars: number }) {
  if (highlightChars >= text.length) {
    return <>{text}</>
  }
  if (highlightChars <= 0) {
    return <span className="text-text-muted/40">{text}</span>
  }

  const spoken = text.slice(0, highlightChars)
  const unspoken = text.slice(highlightChars)

  return (
    <>
      <span>{spoken}</span>
      <span className="text-text-muted/40">{unspoken}</span>
    </>
  )
}

function CorrectionInline({ correction }: { correction: CorrectionInfo }) {
  return (
    <motion.div
      initial={{ opacity: 0, maxHeight: 0 }}
      animate={{ opacity: 1, maxHeight: 120 }}
      transition={{ duration: 0.5, ease: [0.2, 0.85, 0.4, 1] }}
      className={cn(
        'flex items-start gap-2 text-[12px] rounded-[10px] px-[11px] py-2 leading-[1.58] mt-px',
        'voice-correction-bad',
      )}
    >
      <span className="text-[14px] shrink-0 leading-[1.3]">&#10022;</span>
      <div className="flex flex-col gap-[2px]">
        <span className="text-[11px] text-text-muted">
          You said: <strong className="font-medium underline decoration-wavy decoration-accent-warm/50 underline-offset-[3px]">{correction.original}</strong>
        </span>
        <span className="text-[12px] text-text-primary">
          Try: <strong className="font-semibold">{correction.corrected}</strong>
        </span>
        <span className="text-[11px] text-text-muted">{correction.explanation}</span>
      </div>
    </motion.div>
  )
}
