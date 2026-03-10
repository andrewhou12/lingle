'use client'

import { XMarkIcon } from '@heroicons/react/24/outline'
import { Spinner } from '@/components/spinner'
import { cn } from '@/lib/utils'

interface LookupResult {
  word: string
  reading?: string
  meaning: string
  partOfSpeech?: string
  exampleSentence?: string
  notes?: string
}

interface VoiceLookupPanelProps {
  isOpen: boolean
  result: LookupResult | null
  loading: boolean
  onClose: () => void
}

export function VoiceLookupPanel({ isOpen, result, loading, onClose }: VoiceLookupPanelProps) {
  return (
    <div
      className={cn(
        'fixed right-0 top-0 bottom-0 w-[380px] z-[100] flex flex-col transition-transform duration-[400ms] ease-[cubic-bezier(.76,0,.24,1)]',
        'bg-bg-pure border-l border-border',
        isOpen ? 'translate-x-0' : 'translate-x-full',
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border shrink-0">
        <div>
          <div className="text-[15px] font-semibold text-text-primary tracking-[-0.02em]">Look up</div>
          <div className="text-[13px] text-text-muted mt-0.5">
            Select text in subtitles
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-lg flex items-center justify-center bg-transparent border-none text-text-muted cursor-pointer transition-colors hover:bg-bg-hover hover:text-text-primary"
        >
          <XMarkIcon className="w-[18px] h-[18px]" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-5 [&::-webkit-scrollbar]:w-[3px] [&::-webkit-scrollbar-thumb]:bg-border-strong [&::-webkit-scrollbar-thumb]:rounded-sm">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10">
            <Spinner size={16} />
            <span className="text-[14px] text-text-muted">Looking up...</span>
          </div>
        ) : result ? (
          <div className="flex flex-col gap-3">
            <div className="text-[24px] font-jp-clean font-semibold text-text-primary">{result.word}</div>
            {result.reading && (
              <div className="text-[15px] font-jp-clean text-text-muted">{result.reading}</div>
            )}
            <div className="text-[14px] text-text-primary leading-[1.7]">{result.meaning}</div>
            {result.partOfSpeech && (
              <div className="text-[13px] text-text-muted">{result.partOfSpeech}</div>
            )}
            {result.exampleSentence && (
              <div className="text-[14px] font-jp-clean text-text-secondary leading-[1.7] mt-2 pt-3 border-t border-border">
                {result.exampleSentence}
              </div>
            )}
            {result.notes && (
              <div className="text-[13px] text-text-muted leading-[1.6] italic">{result.notes}</div>
            )}
          </div>
        ) : (
          <div className="text-center py-10 px-4 text-text-muted text-[14px] leading-[1.7]">
            Select text in the subtitles to look it up.
          </div>
        )}
      </div>
    </div>
  )
}
