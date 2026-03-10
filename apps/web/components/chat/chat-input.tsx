'use client'

import { useRef, useCallback, useState, useEffect } from 'react'
import { ArrowUpIcon } from '@heroicons/react/24/outline'
import { cn } from '@/lib/utils'
import { useJapaneseIME } from '@/hooks/use-japanese-ime'
import { IMECandidatePanel } from './ime/ime-candidate-panel'

interface ChatInputProps {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  disabled?: boolean
  placeholder?: string
  minRows?: number
  allowEmpty?: boolean
  targetLanguage?: string
}

const IME_TOOLTIP_KEY = 'lingle-ime-tooltip-dismissed'


export function ChatInput({ value, onChange, onSend, disabled, placeholder, minRows = 1, allowEmpty, targetLanguage }: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [showTooltip, setShowTooltip] = useState(false)
  const toggleKeyLabel = 'Ctrl+J'

  const isJapanese = !targetLanguage || targetLanguage === 'Japanese'
  const ime = useJapaneseIME(value, onChange, { initialActive: isJapanese })

  // First-time tooltip
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!localStorage.getItem(IME_TOOLTIP_KEY)) {
      setShowTooltip(true)
      const timer = setTimeout(() => {
        setShowTooltip(false)
        localStorage.setItem(IME_TOOLTIP_KEY, 'true')
      }, 8000)
      return () => clearTimeout(timer)
    }
  }, [])

  const dismissTooltip = useCallback(() => {
    setShowTooltip(false)
    localStorage.setItem(IME_TOOLTIP_KEY, 'true')
  }, [])

  const adjustTextarea = useCallback(() => {
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = Math.min(el.scrollHeight, 200) + 'px'
    }
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Let IME handle first — it consumes Enter during composition
      const consumed = ime.handleKeyDown(e)
      if (consumed) return

      // Ctrl+J toggle (catch if IME is off)
      if (e.key === 'j' && e.ctrlKey) {
        e.preventDefault()
        ime.toggleIME()
        return
      }

      // Send on Enter (only when NOT composing — IME consumes Enter during composition)
      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault()
        onSend()
      }
    },
    [ime, onSend]
  )

  const handleCandidateSelect = useCallback(
    (index: number) => {
      const textarea = textareaRef.current
      if (!textarea) return
      const candidate = ime.candidates[index]
      if (candidate) {
        ime.insertText(textarea, candidate.surface)
        ime.reset()
      }
    },
    [ime]
  )

  const handleCandidateDismiss = useCallback(() => {
    ime.reset()
  }, [ime])

  const canSend = (allowEmpty || value.trim().length > 0) && !disabled

  // Dynamic placeholder
  const dynamicPlaceholder = ime.imeActive
    ? "Type to write Japanese... (e.g., 'taberu' → 食べる)"
    : placeholder ?? `Type in English — press ${toggleKeyLabel} for Japanese input`

  // Composition highlight: split value into pre / composed / post
  const isComposing = ime.mode !== 'direct' && ime.composedText && ime.compositionStart >= 0
  const preText = isComposing ? value.slice(0, ime.compositionStart) : ''
  const highlightText = isComposing ? ime.composedText : ''
  const postText = isComposing ? value.slice(ime.compositionStart + ime.composedText.length) : ''

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <div
          className={cn(
            'flex items-end gap-2 bg-bg-pure border border-border rounded-[14px] py-2 pr-2 pl-4 transition-shadow',
            'focus-within:shadow-[0_0_0_2px_rgba(47,47,47,.08)]',
          )}
        >
          <div className="flex-1 relative">
            {/* Composition highlight layer — rendered behind textarea */}
            {isComposing && (
              <div
                className="absolute inset-0 pointer-events-none whitespace-pre-wrap break-words py-1.5 overflow-hidden text-left"
                style={{ font: 'inherit', fontSize: '14.5px', lineHeight: 'normal' }}
                aria-hidden="true"
              >
                <span style={{ color: 'transparent' }}>{preText}</span>
                <span
                  className="rounded-[3px]"
                  style={{
                    color: 'transparent',
                    backgroundColor: 'rgba(62, 99, 221, 0.12)',
                  }}
                >
                  {highlightText}
                </span>
                <span style={{ color: 'transparent' }}>{postText}</span>
              </div>
            )}

            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => {
                if (ime.imeActive && ime.mode !== 'direct') return
                onChange(e.target.value)
                adjustTextarea()
              }}
              onKeyDown={handleKeyDown}
              onBlur={() => {
                if (ime.mode !== 'direct') {
                  ime.reset()
                }
              }}
              placeholder={dynamicPlaceholder}
              rows={minRows}
              style={{ maxHeight: 200 }}
              className="w-full resize-none border-none bg-transparent text-text-primary text-[14.5px] leading-normal font-[inherit] outline-none py-1.5 placeholder:text-text-placeholder relative z-10"
            />
          </div>
          <button
            className={cn(
              'flex items-center justify-center w-8 h-8 rounded-full bg-accent-brand text-white shrink-0 border-none cursor-pointer transition-opacity',
              !canSend && 'opacity-30 cursor-default'
            )}
            onClick={onSend}
            disabled={!canSend}
          >
            <ArrowUpIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Candidate panel */}
        {ime.showCandidates && ime.candidates.length > 0 && (
          <IMECandidatePanel
            candidates={ime.candidates}
            selectedIndex={ime.selectedIndex}
            onSelect={handleCandidateSelect}
            onDismiss={handleCandidateDismiss}
          />
        )}
      </div>

      {/* Bottom toolbar + hint */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5">
          {/* IME toggle button */}
          <div className="relative">
            <button
              className={cn(
                'h-7 rounded-full border px-2.5 flex items-center justify-center text-[13px] font-bold font-jp transition-colors',
                ime.imeActive
                  ? 'border-accent-brand/30 bg-accent-brand/10 text-accent-brand'
                  : 'border-border bg-bg-pure text-text-muted hover:bg-bg-hover'
              )}
              onClick={ime.toggleIME}
              title={ime.imeActive ? `Japanese IME on (${toggleKeyLabel} to toggle)` : `Japanese IME off (${toggleKeyLabel} to toggle)`}
            >
              {ime.imeActive ? 'あ' : 'A'}
            </button>

            {/* First-time tooltip */}
            {showTooltip && (
              <div
                className="absolute bottom-full left-0 mb-2 w-[260px] bg-text-primary text-bg-pure text-[12px] leading-snug rounded-lg px-3 py-2.5 shadow-[var(--shadow-md)] z-50 cursor-pointer"
                onClick={dismissTooltip}
              >
                <span className="font-medium">Tip:</span> Type Japanese without switching keyboards — click{' '}
                <span className="font-jp font-bold">あ</span> or press {toggleKeyLabel}
                <div className="absolute top-full left-4 w-2 h-2 bg-text-primary rotate-45 -mt-1" />
              </div>
            )}
          </div>

          {/* Katakana toggle (visible when IME is active) */}
          {ime.imeActive && (
            <button
              className={cn(
                'h-7 rounded-full border px-2 flex items-center justify-center text-[11px] font-bold font-jp transition-colors',
                ime.katakanaMode
                  ? 'border-accent-brand/30 bg-accent-brand/10 text-accent-brand'
                  : 'border-border bg-bg-pure text-text-muted hover:bg-bg-hover'
              )}
              onClick={ime.toggleKatakana}
              title={ime.katakanaMode ? 'Switch to hiragana' : 'Switch to katakana'}
            >
              {ime.katakanaMode ? 'ア' : 'あ'}/{ime.katakanaMode ? 'あ' : 'ア'}
            </button>
          )}

        </div>
        <span className="text-[11px] text-text-placeholder select-none">
          {ime.imeActive
            ? ime.mode !== 'direct'
              ? 'Enter confirm · Space candidates · Esc revert'
              : `⏎ send · ${toggleKeyLabel} toggle IME`
            : '⏎ send · ⇧⏎ newline'
          }
        </span>
      </div>
    </div>
  )
}
