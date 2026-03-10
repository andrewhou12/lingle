'use client'

import type { ReactNode } from 'react'
import { SpeakerWaveIcon, StopIcon } from '@heroicons/react/24/outline'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'
import { getTargetFontClass, hasTargetLanguageText } from '@/lib/languages'
import { stripRubyAnnotations } from '@/lib/ruby-annotator'

interface MessageBlockProps {
  role: 'user' | 'assistant'
  content: string
  timestamp?: string
  isStreaming?: boolean
  children?: ReactNode
  onPlay?: () => void
  onStop?: () => void
  isPlayingAudio?: boolean
  targetLanguage?: string
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

export function MessageBlock({ role, content, timestamp, isStreaming, children, onPlay, onStop, isPlayingAudio, targetLanguage }: MessageBlockProps) {
  if (role === 'user') {
    const isTargetLang = targetLanguage ? hasTargetLanguageText(content, targetLanguage) : hasJapanese(content)
    return (
      <div className="flex justify-end py-1.5 group">
        <div className="flex flex-col items-end gap-0.5 max-w-[75%]">
          <div
            className={cn(
              'px-4 py-2.5 rounded-[14px_14px_4px_14px] bg-accent-brand text-white leading-relaxed whitespace-pre-wrap',
              isTargetLang ? `${getTargetFontClass(targetLanguage || '')} text-[15px]` : 'text-[14.5px]'
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
    )
  }

  // Assistant message
  return (
    <div className="flex py-2 group hover:bg-[rgba(0,0,0,.015)] -mx-2 px-2 rounded-lg transition-colors">
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {timestamp && (
            <span className="text-[10px] font-mono text-text-muted opacity-0 group-hover:opacity-100 transition-opacity">
              {formatTime(timestamp)}
            </span>
          )}
          {(onPlay || onStop) && !isStreaming && (
            <button
              className={cn(
                'flex items-center justify-center w-6 h-6 rounded-full border-none cursor-pointer transition-all',
                isPlayingAudio
                  ? 'bg-accent-brand/10 text-accent-brand opacity-100'
                  : 'bg-transparent text-text-muted opacity-0 group-hover:opacity-100 hover:text-text-primary hover:bg-bg-hover'
              )}
              onClick={isPlayingAudio ? onStop : onPlay}
              title={isPlayingAudio ? 'Stop' : 'Play aloud'}
            >
              {isPlayingAudio ? <StopIcon className="w-[11px] h-[11px]" /> : <SpeakerWaveIcon className="w-[13px] h-[13px]" />}
            </button>
          )}
        </div>
        {content && (
          <div className="chat-markdown text-text-primary leading-[1.7] text-[14.5px]">
            <Markdown remarkPlugins={[remarkGfm]}>{stripRubyAnnotations(content)}</Markdown>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
