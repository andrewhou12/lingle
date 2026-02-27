'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Plus, ChevronDown, Trash2, ArrowUp, Square } from 'lucide-react'
import { useChat } from '@ai-sdk/react'
import { MessageBubble } from '@/components/message-bubble'
import { cn } from '@/lib/utils'

function getMessageText(msg: { parts: Array<{ type: string; text?: string }> }): string {
  return msg.parts
    .filter((p) => p.type === 'text' && p.text)
    .map((p) => p.text)
    .join('')
}

export default function ChatPage() {
  const [conversations, setConversations] = useState<Array<{ id: string; title: string }>>(() => [
    { id: crypto.randomUUID(), title: 'New Chat' },
  ])
  const [activeId, setActiveId] = useState<string | null>(() => conversations[0]?.id ?? null)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const { messages, sendMessage, stop, status, setMessages } = useChat({
    id: activeId ?? undefined,
  })

  const isLoading = status === 'streaming' || status === 'submitted'
  const activeConversation = conversations.find((c) => c.id === activeId) ?? null

  useEffect(() => {
    if (messages.length === 1 && messages[0].role === 'user') {
      const content = getMessageText(messages[0])
      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeId
            ? { ...c, title: content.slice(0, 40) + (content.length > 40 ? '...' : '') }
            : c
        )
      )
    }
  }, [messages, activeId])

  const createConversation = useCallback(() => {
    const current = conversations.find((c) => c.id === activeId)
    if (current && messages.length === 0) {
      setDropdownOpen(false)
      return
    }
    const id = crypto.randomUUID()
    setConversations((prev) => [{ id, title: 'New Chat' }, ...prev])
    setActiveId(id)
    setMessages([])
    setDropdownOpen(false)
  }, [conversations, activeId, messages.length, setMessages])

  const deleteConversation = useCallback(
    (id: string) => {
      setConversations((prev) => prev.filter((c) => c.id !== id))
      if (activeId === id) {
        setActiveId(null)
        setMessages([])
      }
    },
    [activeId, setMessages]
  )

  const switchConversation = useCallback((id: string) => {
    setActiveId(id)
    setMessages([])
    setDropdownOpen(false)
  }, [setMessages])

  useEffect(() => {
    if (!activeConversation) {
      if (conversations.length > 0) {
        setActiveId(conversations[0].id)
      } else {
        const id = crypto.randomUUID()
        setConversations([{ id, title: 'New Chat' }])
        setActiveId(id)
      }
    }
  }, [activeConversation, conversations])

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
    sendMessage({ text })
  }, [input, isLoading, sendMessage])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend]
  )

  const pastConversations = conversations.filter((c) => c.title !== 'New Chat' || (c.id === activeId && messages.length > 0))

  const messagesEndRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const isEmpty = messages.length === 0 && !isLoading

  const inputArea = (
    <div className="flex items-end gap-2 border border-border rounded-3xl py-2 pr-2 pl-5 bg-bg-secondary">
      <textarea
        ref={textareaRef}
        value={input}
        onChange={(e) => {
          setInput(e.target.value)
          adjustTextarea()
        }}
        onKeyDown={handleKeyDown}
        placeholder="Ask anything"
        rows={1}
        style={{ maxHeight: 200 }}
        className="flex-1 resize-none border-none bg-transparent text-text-primary text-[15px] leading-normal font-[inherit] outline-none py-1"
      />
      {isLoading ? (
        <button
          type="button"
          onClick={() => stop()}
          className="flex items-center justify-center w-8 h-8 rounded-full shrink-0 bg-[rgba(200,87,42,.08)] text-accent-warm border-none cursor-pointer"
        >
          <Square size={14} />
        </button>
      ) : (
        <button
          type="button"
          disabled={!input.trim()}
          onClick={handleSend}
          className={cn(
            'flex items-center justify-center w-8 h-8 rounded-full shrink-0 bg-accent-brand text-white border-none cursor-pointer transition-opacity',
            !input.trim() && 'opacity-40'
          )}
        >
          <ArrowUp size={16} />
        </button>
      )}
    </div>
  )

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <Popover open={dropdownOpen} onOpenChange={setDropdownOpen}>
          <PopoverTrigger asChild>
            <button className="inline-flex items-center gap-1 bg-transparent border-none cursor-pointer text-[13px] font-medium text-text-primary px-2 py-1.5 rounded-md transition-colors hover:bg-bg-hover">
              {activeConversation && messages.length > 0
                ? activeConversation.title
                : 'Chat'}
              <ChevronDown size={14} />
            </button>
          </PopoverTrigger>
          <PopoverContent className="max-h-[300px] w-[280px] p-2">
            <ScrollArea>
              <div className="flex flex-col gap-1">
                {pastConversations.length === 0 ? (
                  <span className="text-[13px] text-text-muted px-1 py-2">
                    No conversations yet
                  </span>
                ) : (
                  pastConversations.map((c) => (
                    <div
                      key={c.id}
                      className={cn(
                        'flex items-center justify-between px-2 py-1 rounded-md cursor-pointer',
                        c.id === activeId ? 'bg-bg-hover' : 'bg-transparent'
                      )}
                      onClick={() => switchConversation(c.id)}
                    >
                      <span className="text-[13px] flex-1 mr-2 overflow-hidden text-ellipsis whitespace-nowrap">
                        {c.title}
                      </span>
                      <button
                        className="flex items-center justify-center w-6 h-6 rounded-sm bg-transparent border-none cursor-pointer text-text-muted transition-colors hover:bg-bg-active"
                        onClick={(e) => {
                          e.stopPropagation()
                          deleteConversation(c.id)
                        }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </PopoverContent>
        </Popover>

        <button
          className="inline-flex items-center gap-1.5 bg-bg-secondary border-none cursor-pointer text-[13px] font-medium text-text-secondary px-3 py-1.5 rounded-md transition-colors hover:bg-bg-hover"
          onClick={createConversation}
        >
          <Plus size={14} />
          New Chat
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {isEmpty ? (
          <div className="h-full flex flex-col items-center justify-center p-6">
            <h2 className="text-[28px] font-normal text-text-secondary mb-8">
              What can I help with?
            </h2>
            <div className="w-full max-w-[640px]">{inputArea}</div>
          </div>
        ) : (
          <div className="h-full flex flex-col">
            <div className="flex-1 overflow-auto">
              <div className="max-w-3xl mx-auto px-6 py-4">
                {messages.map((msg) => (
                  <MessageBubble
                    key={msg.id}
                    message={{ role: msg.role as 'user' | 'assistant', content: getMessageText(msg) }}
                    isStreaming={isLoading && msg.role === 'assistant' && msg === messages[messages.length - 1]}
                  />
                ))}
                <div ref={messagesEndRef} />
              </div>
            </div>
            <div className="px-6 pt-3 pb-6">
              <div className="max-w-3xl mx-auto">{inputArea}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
