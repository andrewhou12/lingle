'use client'

import { cn } from '@/lib/utils'

export interface VocabWord {
  word: string
  reading?: string
  meaning: string
  tag: 'new' | 'review'
}

interface VoiceVocabPanelProps {
  isOpen: boolean
  words: VocabWord[]
  onClose: () => void
}

export function VoiceVocabPanel({ isOpen, words, onClose }: VoiceVocabPanelProps) {
  return (
    <div
      className={cn(
        'fixed right-0 top-0 bottom-0 w-[272px] z-[110] flex flex-col transition-transform duration-[380ms] ease-[cubic-bezier(.76,0,.24,1)]',
        'bg-[rgba(255,255,255,.99)] backdrop-blur-[24px] border-l border-border',
        isOpen ? 'translate-x-0' : 'translate-x-full',
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3.5 pt-3.5 pb-[11px] border-b border-border">
        <div>
          <div className="text-[13px] font-semibold tracking-[-0.02em]">Vocabulary</div>
          <div className="text-[10.5px] text-text-muted mt-px">
            {words.length} word{words.length === 1 ? '' : 's'} collected
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-[24px] h-[24px] rounded-[7px] border-none bg-bg-hover cursor-pointer flex items-center justify-center text-text-secondary text-[14px] leading-none transition-colors hover:bg-bg-active"
        >
          &times;
        </button>
      </div>

      {/* Word list */}
      <div className="flex-1 overflow-y-auto p-[9px] flex flex-col gap-1.5">
        {words.length === 0 ? (
          <div className="text-center py-8 px-3 text-text-muted text-[11.5px] leading-[1.7]">
            Words you encounter will appear here automatically.
          </div>
        ) : (
          words.map((w, i) => (
            <div
              key={`${w.word}-${i}`}
              className="px-[11px] py-[9px] bg-bg-secondary border border-border rounded-[10px] animate-[voice-slide-in-right_0.3s_ease_both]"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <div className="font-jp text-[15px]">{w.word}</div>
              {w.reading && (
                <div className="font-mono text-[9.5px] text-text-muted mt-px">{w.reading}</div>
              )}
              <div className="text-[11.5px] text-text-secondary mt-[3px]">{w.meaning}</div>
              <span className={cn(
                'inline-block text-[9px] font-semibold tracking-[.06em] uppercase px-1.5 py-0.5 rounded mt-[5px]',
                w.tag === 'new' ? 'bg-green-soft text-green' : 'bg-bg-active text-text-secondary',
              )}>
                {w.tag === 'new' ? 'New' : 'Review'}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
