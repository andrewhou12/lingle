'use client'

import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { TranscriptLine } from '@/hooks/use-voice-conversation'
import { cn } from '@/lib/utils'

interface VoiceTranscriptProps {
  lines: TranscriptLine[]
  /** Current partial text from Soniox (user speaking, not yet finalized) */
  partialText: string
  className?: string
}

export function VoiceTranscript({ lines, partialText, className }: VoiceTranscriptProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [lines, partialText])

  return (
    <div className={cn('relative overflow-hidden', className)}>
      {/* Gradient fade at top */}
      <div className="absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-bg to-transparent z-10 pointer-events-none" />

      <div ref={scrollRef} className="h-full overflow-auto px-6 pt-16 pb-4">
        <div className="max-w-2xl mx-auto flex flex-col gap-3">
          <AnimatePresence initial={false}>
            {lines.map((line, i) => (
              <motion.div
                key={`${i}-${line.timestamp}`}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col gap-0.5"
              >
                <span className={cn(
                  'text-[11px] font-medium uppercase tracking-wider',
                  line.role === 'user' ? 'text-accent-brand' : 'text-text-muted',
                )}>
                  {line.role === 'user' ? 'You' : 'AI'}
                </span>
                <p className={cn(
                  'text-[16px] leading-relaxed font-jp',
                  line.role === 'user' ? 'text-text-primary' : 'text-text-primary',
                  !line.isFinal && 'text-text-secondary',
                )}>
                  {line.text}
                </p>
              </motion.div>
            ))}

            {/* Live partial text from user */}
            {partialText && (
              <motion.div
                key="partial"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex flex-col gap-0.5"
              >
                <span className="text-[11px] font-medium uppercase tracking-wider text-accent-brand">
                  You
                </span>
                <p className="text-[16px] leading-relaxed font-jp text-text-muted">
                  {partialText}
                  <span className="inline-block w-[2px] h-[1em] bg-accent-brand ml-0.5 animate-pulse align-text-bottom" />
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
