'use client'

import { useRef, useEffect } from 'react'
import { XMarkIcon, LanguageIcon, ArrowUpIcon } from '@heroicons/react/24/outline'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'

interface VoiceHelpPanelProps {
  isOpen: boolean
  messages: Array<{ role: 'user' | 'ai'; text: string }>
  input: string
  loading: boolean
  hasAiMessages: boolean
  onInputChange: (value: string) => void
  onSend: () => void
  onTranslateLastMessage: () => void
  onClose: () => void
}

export function VoiceHelpPanel({
  isOpen,
  messages,
  input,
  loading,
  hasAiMessages,
  onInputChange,
  onSend,
  onTranslateLastMessage,
  onClose,
}: VoiceHelpPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (scrollRef.current && isOpen) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, isOpen])

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
          <div className="text-[15px] font-semibold text-text-primary tracking-[-0.02em]">Need help?</div>
          <div className="text-[13px] text-text-muted mt-0.5">
            Describe what you're trying to say
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-lg flex items-center justify-center bg-transparent border-none text-text-muted cursor-pointer transition-colors hover:bg-bg-hover hover:text-text-primary"
        >
          <XMarkIcon className="w-[18px] h-[18px]" />
        </button>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4 [&::-webkit-scrollbar]:w-[3px] [&::-webkit-scrollbar-thumb]:bg-border-strong [&::-webkit-scrollbar-thumb]:rounded-sm"
      >
        {/* Translate action */}
        {hasAiMessages && (
          <button
            onClick={onTranslateLastMessage}
            disabled={loading}
            className="flex items-center gap-1.5 text-[13px] font-sans text-accent-brand hover:underline disabled:opacity-40 disabled:no-underline cursor-pointer disabled:cursor-default self-start"
          >
            <LanguageIcon className="w-4 h-4" />
            Translate last message
          </button>
        )}
        {messages.map((m, i) => (
          <div key={i}>
            {m.role === 'user' ? (
              <div className="bg-bg-secondary border border-border rounded-xl px-4 py-3 ml-8">
                <p className="text-[14px] text-text-primary leading-[1.6]">{m.text}</p>
              </div>
            ) : (
              <div className="text-[14px] text-text-secondary leading-[1.7] prose-help">
                <Markdown remarkPlugins={[remarkGfm]}>{m.text}</Markdown>
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-text-muted/50 animate-[voice-loading-dot_1.2s_ease-in-out_infinite]" />
              <div className="w-1.5 h-1.5 rounded-full bg-text-muted/50 animate-[voice-loading-dot_1.2s_ease-in-out_0.2s_infinite]" />
              <div className="w-1.5 h-1.5 rounded-full bg-text-muted/50 animate-[voice-loading-dot_1.2s_ease-in-out_0.4s_infinite]" />
            </div>
          </div>
        )}
      </div>

      {/* Input footer */}
      <div className="px-4 py-3 border-t border-border shrink-0">
        <div className="relative bg-bg-pure border border-border rounded-xl overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,.04),0_1px_4px_rgba(0,0,0,.03)] transition-[border-color,box-shadow] duration-150 focus-within:border-border-strong focus-within:shadow-[0_2px_8px_rgba(0,0,0,.06),0_1px_4px_rgba(0,0,0,.04)]">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => {
              onInputChange(e.target.value)
              e.target.style.height = 'auto'
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                onSend()
                if (inputRef.current) inputRef.current.style.height = 'auto'
              }
            }}
            placeholder="How do I say..."
            rows={1}
            className="w-full px-4 py-3 pr-12 text-[14px] text-text-primary bg-transparent border-none outline-none font-sans placeholder:text-text-muted resize-none leading-[1.5]"
          />
          <button
            onClick={() => {
              onSend()
              if (inputRef.current) inputRef.current.style.height = 'auto'
            }}
            disabled={!input.trim() || loading}
            className="absolute right-2 bottom-2 w-8 h-8 rounded-lg border-none bg-accent-brand flex items-center justify-center cursor-pointer text-white transition-all hover:bg-[#111] disabled:pointer-events-none shrink-0"
          >
            <ArrowUpIcon className="w-4 h-4" strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </div>
  )
}
