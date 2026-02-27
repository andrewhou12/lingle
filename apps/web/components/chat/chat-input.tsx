'use client'

import { useRef, useCallback } from 'react'
import { ArrowUp } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ChatInputProps {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  disabled?: boolean
  placeholder?: string
  showRomaji?: boolean
  onToggleRomaji?: () => void
}

export function ChatInput({ value, onChange, onSend, disabled, placeholder, showRomaji, onToggleRomaji }: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const adjustTextarea = useCallback(() => {
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = Math.min(el.scrollHeight, 200) + 'px'
    }
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault()
        onSend()
      }
    },
    [onSend]
  )

  const canSend = value.trim().length > 0 && !disabled

  return (
    <div className="flex flex-col gap-2">
      <div
        className={cn(
          'flex items-end gap-2 bg-bg-pure border border-border rounded-[14px] py-2 pr-2 pl-4 transition-shadow',
          'focus-within:shadow-[0_0_0_2px_rgba(47,47,47,.08)]'
        )}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => {
            onChange(e.target.value)
            adjustTextarea()
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder ?? 'Type your message...'}
          rows={1}
          style={{ maxHeight: 200 }}
          className="flex-1 resize-none border-none bg-transparent text-text-primary text-[14.5px] leading-normal font-[inherit] outline-none py-1.5 placeholder:text-text-placeholder"
        />
        <button
          className={cn(
            'flex items-center justify-center w-8 h-8 rounded-full bg-accent-brand text-white shrink-0 border-none cursor-pointer transition-opacity',
            !canSend && 'opacity-30 cursor-default'
          )}
          onClick={onSend}
          disabled={!canSend}
        >
          <ArrowUp size={16} />
        </button>
      </div>

      {/* Bottom toolbar + hint */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5">
          {onToggleRomaji && (
            <button
              className={cn(
                'h-7 rounded-full border px-2.5 flex items-center gap-1 text-[11px] font-medium transition-colors',
                showRomaji
                  ? 'border-accent-brand/30 bg-accent-brand/10 text-accent-brand'
                  : 'border-border bg-bg-pure text-text-muted hover:bg-bg-hover'
              )}
              onClick={onToggleRomaji}
              title={showRomaji ? 'Hide romaji' : 'Show romaji above all text'}
            >
              <span className="text-[12px] font-jp font-bold leading-none">あ</span>
              <span>→ a</span>
            </button>
          )}
          <button className="w-7 h-7 rounded-full border border-border bg-bg-pure flex items-center justify-center text-text-muted text-[13px] cursor-default hover:bg-bg-hover transition-colors" title="Voice input">
            🎤
          </button>
          <button className="w-7 h-7 rounded-full border border-border bg-bg-pure flex items-center justify-center text-text-muted text-[15px] leading-none cursor-default hover:bg-bg-hover transition-colors" title="Attach">
            +
          </button>
        </div>
        <span className="text-[11px] text-text-placeholder select-none">
          ⏎ send · ⇧⏎ newline
        </span>
      </div>
    </div>
  )
}
