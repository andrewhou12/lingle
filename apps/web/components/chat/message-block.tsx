'use client'

import type { ReactNode } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'

interface MessageBlockProps {
  role: 'user' | 'assistant'
  content: string
  timestamp?: string
  isStreaming?: boolean
  userName?: string
  children?: ReactNode
}

function hasJapanese(text: string): boolean {
  return /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf\u3400-\u4dbf]/.test(text)
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

export function MessageBlock({ role, content, timestamp, isStreaming, userName, children }: MessageBlockProps) {
  if (role === 'user') {
    const isJp = hasJapanese(content)
    return (
      <div className="flex justify-end py-1.5 group">
        <div className="flex items-start gap-2.5 max-w-[75%] flex-row-reverse">
          {/* User avatar */}
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-accent-brand to-accent-warm flex items-center justify-center shrink-0 mt-0.5">
            <span className="text-[10px] font-bold text-white leading-none">
              {(userName || 'You').charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="flex flex-col items-end gap-0.5">
            <div
              className={cn(
                'px-4 py-2.5 rounded-[14px_14px_4px_14px] bg-accent-brand text-white leading-relaxed whitespace-pre-wrap',
                isJp ? 'font-jp text-[15px]' : 'text-[14.5px]'
              )}
            >
              {content}
            </div>
            {timestamp && (
              <span className="text-[10px] font-mono text-text-muted opacity-0 group-hover:opacity-100 transition-opacity pr-1">
                {formatTime(timestamp)}
              </span>
            )}
            {children}
          </div>
        </div>
      </div>
    )
  }

  // Assistant message
  return (
    <div className="flex py-2 group hover:bg-[rgba(0,0,0,.015)] -mx-2 px-2 rounded-lg transition-colors">
      <div className="flex items-start gap-2.5 max-w-full">
        {/* Sensei avatar */}
        <div className="w-7 h-7 rounded-full bg-accent-brand flex items-center justify-center shrink-0 mt-0.5">
          <span className="text-[11px] font-jp font-bold text-white leading-none">先</span>
        </div>
        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-medium text-text-primary">Sensei</span>
            {timestamp && (
              <span className="text-[10px] font-mono text-text-muted">
                {formatTime(timestamp)}
              </span>
            )}
          </div>
          {(content || isStreaming) && (
            <div className="chat-markdown text-text-primary leading-[1.7] text-[14.5px]">
              {content && <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>}
              {isStreaming && <span className="blink-cursor" />}
            </div>
          )}
          {children}
        </div>
      </div>
    </div>
  )
}
