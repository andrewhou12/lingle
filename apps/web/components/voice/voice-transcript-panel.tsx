'use client'

import { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import type { TranscriptLine } from '@/hooks/use-voice-conversation'

type FilterType = 'all' | 'corrections' | 'ai'

interface CorrectionInfo {
  original: string
  corrected: string
  explanation: string
}

interface TranscriptEntry extends TranscriptLine {
  correction?: CorrectionInfo | null
  formattedTime?: string
}

interface VoiceTranscriptPanelProps {
  isOpen: boolean
  entries: TranscriptEntry[]
  onClose: () => void
}

export function VoiceTranscriptPanel({ isOpen, entries, onClose }: VoiceTranscriptPanelProps) {
  const [filter, setFilter] = useState<FilterType>('all')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current && isOpen) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [entries, isOpen])

  const filtered = entries.filter(e => {
    if (filter === 'all') return true
    if (filter === 'corrections') return !!e.correction
    if (filter === 'ai') return e.role === 'assistant'
    return true
  })

  return (
    <div
      className={cn(
        'fixed right-0 top-0 bottom-0 w-[308px] z-[100] flex flex-col transition-transform duration-[400ms] ease-[cubic-bezier(.76,0,.24,1)]',
        'bg-[rgba(255,255,255,.98)] backdrop-blur-[24px] border-l border-border',
        isOpen ? 'translate-x-0' : 'translate-x-full',
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-[15px] pt-[15px] pb-[11px] border-b border-border shrink-0">
        <div>
          <div className="text-[13.5px] font-semibold tracking-[-0.02em]">Transcript</div>
          <div className="text-[10.5px] text-text-muted mt-0.5">
            {entries.length} message{entries.length === 1 ? '' : 's'}
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-[26px] h-[26px] rounded-lg border-none bg-bg-hover cursor-pointer flex items-center justify-center text-text-secondary text-[15px] leading-none transition-colors hover:bg-bg-active"
        >
          &times;
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-1 px-[11px] py-2 border-b border-border shrink-0">
        {(['all', 'corrections', 'ai'] as FilterType[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'font-sans text-[11.5px] text-text-muted bg-transparent border border-transparent px-[9px] py-[3px] rounded-full cursor-pointer transition-all hover:bg-bg-hover hover:text-text-secondary',
              filter === f && 'bg-bg-active border-border text-text-primary font-medium',
            )}
          >
            {f === 'all' ? 'All' : f === 'corrections' ? 'Corrections' : 'AI only'}
          </button>
        ))}
      </div>

      {/* Transcript entries */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-[11px] flex flex-col gap-2.5 [&::-webkit-scrollbar]:w-[3px] [&::-webkit-scrollbar-thumb]:bg-border-strong [&::-webkit-scrollbar-thumb]:rounded-sm">
        {filtered.length === 0 ? (
          <div className="text-center py-9 px-3.5 text-text-muted text-[12px] leading-[1.7]">
            {entries.length === 0
              ? 'Start the conversation and your full transcript will appear here in real time.'
              : 'No matching entries.'}
          </div>
        ) : (
          filtered.map((entry, i) => (
            <div key={i} className={cn('flex gap-[7px] items-start', entry.role === 'user' && 'flex-row-reverse')}>
              <div className={cn(
                'w-[23px] h-[23px] rounded-[7px] shrink-0 flex items-center justify-center text-[10px] font-semibold bg-bg-hover border border-border text-text-secondary',
                entry.role === 'assistant' && 'font-jp text-[11px]',
              )}>
                {entry.role === 'assistant' ? '花' : 'YOU'}
              </div>
              <div className="max-w-[87%] flex flex-col gap-[3px]">
                <div className={cn(
                  'px-2.5 py-[7px] text-[12px] leading-[1.65] rounded-[9px]',
                  entry.role === 'assistant'
                    ? 'bg-bg-secondary border border-border rounded-bl-[3px]'
                    : 'bg-accent-brand text-white rounded-br-[3px]',
                )}>
                  {entry.text}
                </div>

                {/* Correction inline */}
                {entry.correction && (
                  <div className="flex gap-[5px] items-start text-[11px] px-2 py-[5px] rounded-[7px] leading-[1.5] text-text-secondary voice-correction-bad">
                    <span>&#10022;</span>
                    <span>
                      <span className="underline decoration-wavy decoration-accent-warm/50 underline-offset-[3px]">
                        {entry.correction.original}
                      </span>
                      {' '}&rarr;{' '}
                      <strong className="font-semibold">{entry.correction.corrected}</strong>
                      <span className="block text-[10px] text-text-muted mt-0.5">
                        {entry.correction.explanation}
                      </span>
                    </span>
                  </div>
                )}

                {entry.formattedTime && (
                  <div className={cn('font-mono text-[9px] text-text-muted px-0.5', entry.role === 'user' && 'text-right')}>
                    {entry.formattedTime}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
