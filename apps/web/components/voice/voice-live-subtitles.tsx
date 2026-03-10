'use client'

import { useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { LanguageIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { cn } from '@/lib/utils'
import { stripRubyAnnotations } from '@/lib/ruby-annotator'
import type { TranscriptLine } from '@/hooks/use-voice-conversation'

const PAREN_LATIN = /\([^)]*[a-zA-Z][^)]*\)/g
const BRACKET_LATIN = /\[[^\]]*[a-zA-Z][^\]]*\]/g

function stripNonTargetLanguage(text: string): string {
  return text.replace(PAREN_LATIN, '').replace(BRACKET_LATIN, '').replace(/\s{2,}/g, ' ').trim()
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
  /** Whether lookup mode is active */
  isLookupActive?: boolean
  /** Callback when text is selected for lookup */
  onLookup?: (word: string, context: string) => void
  /** Callback to translate the AI text */
  onTranslate?: (text: string) => void
  /** Current translation to display */
  translation?: string | null
  /** X-ray token breakdown for the AI line */
  xrayTokens?: Array<{ surface: string; reading: string; meaning: string; pos: string }> | null
  /** Whether x-ray is loading */
  xrayLoading?: boolean
  /** Callback to trigger x-ray */
  onXray?: () => void
  className?: string
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
  isLookupActive,
  onLookup,
  onTranslate,
  translation,
  xrayTokens,
  xrayLoading,
  onXray,
  className,
}: VoiceLiveSubtitlesProps) {
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

  const handleMouseUp = useCallback(() => {
    if (!onLookup || !isLookupActive) return
    const sel = window.getSelection()
    const selected = sel?.toString().trim()
    if (selected) {
      onLookup(selected, cleanAiText)
    }
  }, [onLookup, isLookupActive, cleanAiText])

  // Determine what to show
  const showUser = !!userText
  const showAI = !!cleanAiText

  // Generate a key that changes per exchange (clears animation state)
  const exchangeKey = userLine?.timestamp || 'none'

  return (
    <div
      className={cn(
        'w-full max-w-[460px] mx-auto text-center min-h-[80px] flex flex-col items-center gap-2 transition-opacity duration-300',
        !isLookupActive && 'pointer-events-none',
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
            className="text-[15px] leading-[1.8] text-text-primary font-jp-clean"
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
            <div
              onMouseUp={isLookupActive ? handleMouseUp : undefined}
              className={cn(
                'text-[14.5px] leading-[1.7] text-text-secondary font-jp-clean italic',
                isLookupActive && 'cursor-text select-text lookup-select',
              )}
            >
              {cleanAiText}
              {aiLine && !aiLine.isFinal && (
                <span className="inline-block w-[2px] h-[0.88em] bg-text-secondary ml-px animate-[blink-cursor_0.65s_step-end_infinite] align-text-bottom" />
              )}
            </div>

            {/* Action buttons */}
            <div className="flex flex-col items-center gap-1.5 mt-1 pointer-events-auto">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => onTranslate?.(cleanAiText)}
                  className={cn(
                    'flex items-center gap-1 px-2.5 py-[3px] rounded-full text-[11px] font-sans transition-all',
                    translation
                      ? 'text-accent-brand bg-blue-soft border border-blue-med'
                      : 'text-text-muted border border-transparent hover:text-text-secondary hover:border-border-subtle hover:bg-bg-secondary',
                  )}
                >
                  <LanguageIcon className="w-3 h-3" />
                  Translate
                </button>
                <button
                  onClick={onXray}
                  disabled={xrayLoading}
                  className={cn(
                    'flex items-center gap-1 px-2.5 py-[3px] rounded-full text-[11px] font-sans transition-all',
                    xrayTokens
                      ? 'text-accent-brand bg-blue-soft border border-blue-med'
                      : 'text-text-muted border border-transparent hover:text-text-secondary hover:border-border-subtle hover:bg-bg-secondary',
                    xrayLoading && 'opacity-50',
                  )}
                >
                  <MagnifyingGlassIcon className="w-3 h-3" />
                  X-ray
                </button>
              </div>

              {/* Inline translation */}
              <AnimatePresence>
                {translation && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="text-[12px] text-text-muted font-sans leading-[1.5] max-w-[400px] overflow-hidden"
                  >
                    {translation}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Inline x-ray breakdown — flowing token chips */}
              <AnimatePresence>
                {xrayTokens && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="w-full max-w-[420px] overflow-hidden"
                  >
                    <div className="flex flex-wrap gap-1.5 justify-center py-2">
                      {xrayTokens
                        .filter(t => t.pos !== 'punct')
                        .map((t, i) => (
                        <div
                          key={i}
                          className="inline-flex flex-col items-center bg-bg-secondary rounded-lg px-2 py-1.5"
                        >
                          <span className="text-[13px] font-jp-clean font-medium text-text-primary leading-tight">{t.surface}</span>
                          {t.reading && t.reading !== t.surface && (
                            <span className="text-[10px] font-jp-clean text-text-muted leading-tight">{t.reading}</span>
                          )}
                          <span className="text-[10px] font-sans text-text-secondary leading-tight mt-px">{t.meaning}</span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
