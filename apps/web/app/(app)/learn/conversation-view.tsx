'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { ArrowUp, Square } from 'lucide-react'
import type { ConversationMessage, ExpandedSessionPlan } from '@linguist/shared/types'
import { Spinner } from '@/components/spinner'
import { MessageBubble } from '@/components/message-bubble'
import { cn } from '@/lib/utils'

interface ConversationViewProps {
  plan: ExpandedSessionPlan
  messages: ConversationMessage[]
  isLoading: boolean
  onSend: (content: string) => void
  onEnd: () => void
}

export function ConversationView({
  plan,
  messages,
  isLoading,
  onSend,
  onEnd,
}: ConversationViewProps) {
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const adjustTextarea = useCallback(() => {
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = Math.min(el.scrollHeight, 200) + 'px'
    }
  }, [])

  const handleSend = useCallback(() => {
    if (!input.trim() || isLoading) return
    const text = input.trim()
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    onSend(text)
  }, [input, isLoading, onSend])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend]
  )

  return (
    <div className="h-full flex flex-col">
      {/* Session info bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-[13px] font-medium">
            {plan.sessionFocus}
          </span>
          <span className="inline-flex items-center py-0.5 px-2 rounded-full bg-bg-secondary text-[11px] font-medium text-text-secondary">
            {plan.difficultyLevel}
          </span>
          <span className="inline-flex items-center py-0.5 px-2 rounded-full border border-border text-[11px] text-text-muted">
            {plan.register}
          </span>
        </div>
        <button
          className="inline-flex items-center gap-1.5 rounded-md bg-[rgba(200,87,42,.06)] py-1.5 px-3 text-[13px] font-medium text-accent-warm border-none cursor-pointer transition-colors duration-150 hover:bg-[rgba(200,87,42,.12)]"
          onClick={onEnd}
        >
          <Square size={12} />
          End Session
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto px-6 py-4">
          {messages.map((msg, i) => (
            <MessageBubble key={i} message={msg} />
          ))}
          {isLoading && messages.length > 0 && messages[messages.length - 1].role === 'user' && (
            <div className="flex items-center gap-2 py-3">
              <Spinner size={16} />
              <span className="text-[13px] text-text-muted">
                Thinking...
              </span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area */}
      <div className="px-6 pt-3 pb-6">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-end gap-2 border border-border rounded-3xl py-2 pr-2 pl-5 bg-bg-secondary">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value)
                adjustTextarea()
              }}
              onKeyDown={handleKeyDown}
              placeholder="Type your message..."
              rows={1}
              className="flex-1 resize-none border-none bg-transparent text-text-primary text-[15px] leading-normal font-[inherit] outline-none py-1 max-h-[200px]"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className={cn(
                "flex items-center justify-center w-8 h-8 rounded-full shrink-0 bg-accent-brand text-white border-none cursor-pointer transition-opacity duration-150",
                (!input.trim() || isLoading) && "opacity-40"
              )}
            >
              <ArrowUp size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
