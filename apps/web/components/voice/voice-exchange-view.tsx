'use client'

import { useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { TranscriptLine } from '@/hooks/use-voice-conversation'
import { cn } from '@/lib/utils'

interface CorrectionInfo {
  original: string
  corrected: string
  explanation: string
  grammarPoint?: string
}

interface VoiceExchangeViewProps {
  /** The most recent AI line */
  aiLine: TranscriptLine | null
  /** The most recent user line */
  userLine: TranscriptLine | null
  /** Partial text from user speaking */
  partialText: string
  /** Latest correction from tool output */
  correction: CorrectionInfo | null
  /** AI translation (if available) */
  aiTranslation?: string
  className?: string
}

export function VoiceExchangeView({
  aiLine, userLine, partialText, correction, aiTranslation, className,
}: VoiceExchangeViewProps) {
  const exchangeRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (exchangeRef.current) {
      exchangeRef.current.scrollTop = exchangeRef.current.scrollHeight
    }
  }, [aiLine, userLine, partialText, correction])

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
            <div className="w-[27px] h-[27px] rounded-lg shrink-0 flex items-center justify-center text-[13px] font-jp bg-bg-hover border border-border">
              花
            </div>
            <div className="max-w-[90%] flex flex-col gap-[5px]">
              <div className="px-[13px] py-[9px] text-[14px] leading-[1.72] rounded-xl rounded-bl-[3px] bg-[rgba(255,255,255,.9)] border border-border backdrop-blur-[8px] font-jp">
                {aiLine.text}
                {!aiLine.isFinal && (
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
              <div className="px-[13px] py-[9px] text-[13.5px] leading-[1.72] rounded-xl rounded-br-[3px] bg-accent-brand text-white font-jp">
                {userLine.text}
              </div>

              {/* Correction card */}
              {correction && (
                <CorrectionInline correction={correction} />
              )}
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
              <div className="px-[13px] py-[9px] text-[13.5px] leading-[1.72] rounded-xl rounded-br-[3px] bg-accent-brand/80 text-white/80 font-jp">
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
