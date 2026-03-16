'use client'

import { useEffect, useRef, useState, type ComponentProps } from 'react'
import { MicIcon, MicOffIcon, MessageSquareTextIcon, SendHorizontal, Loader } from 'lucide-react'
import { ArrowPathIcon } from '@heroicons/react/24/outline'
import { motion, type MotionProps } from 'motion/react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Toggle } from '@/components/ui/toggle'
import { agentTrackToggleVariants } from '@/components/agents-ui/agent-track-toggle'
import type { VoiceState, InputMode } from '@/hooks/use-voice-conversation'

const MOTION_PROPS: MotionProps = {
  variants: {
    hidden: { height: 0, opacity: 0, marginBottom: 0 },
    visible: { height: 'auto', opacity: 1, marginBottom: 12 },
  },
  initial: 'hidden',
  transition: { duration: 0.3, ease: 'easeOut' },
}

interface ChatInputProps {
  chatOpen: boolean
  onSend: (message: string) => void
  className?: string
}

function ChatInput({ chatOpen, onSend, className }: ChatInputProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [isSending, setIsSending] = useState(false)
  const [message, setMessage] = useState('')
  const isDisabled = isSending || message.trim().length === 0

  const handleSend = async () => {
    if (isDisabled) return
    try {
      setIsSending(true)
      onSend(message.trim())
      setMessage('')
    } finally {
      setIsSending(false)
    }
  }

  useEffect(() => {
    if (chatOpen) inputRef.current?.focus()
  }, [chatOpen])

  return (
    <div className={cn('mb-3 flex grow items-end gap-2 rounded-md pl-1 text-sm', className)}>
      <textarea
        autoFocus
        ref={inputRef}
        value={message}
        disabled={!chatOpen || isSending}
        placeholder="Type something..."
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSend()
          }
        }}
        onChange={(e) => setMessage(e.target.value)}
        className="field-sizing-content max-h-16 min-h-8 flex-1 resize-none py-2 [scrollbar-width:thin] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      />
      <Button
        size="icon"
        type="button"
        disabled={isDisabled}
        variant={isDisabled ? 'secondary' : 'default'}
        title={isSending ? 'Sending...' : 'Send'}
        onClick={handleSend}
        className="self-end disabled:cursor-not-allowed"
      >
        {isSending ? <Loader className="animate-spin" /> : <SendHorizontal />}
      </Button>
    </div>
  )
}

export interface LingleControlBarProps {
  variant?: 'default' | 'livekit'
  voiceState: VoiceState
  isMuted: boolean
  onToggleMute: () => void
  onEnd: () => void
  isConnected?: boolean
  /** Unviewed corrections/feedback count for the chat badge */
  feedbackCount?: number
  /** Whether the chat overlay is open */
  isChatOpen?: boolean
  onToggleChat?: () => void
  /** Retry the last exchange */
  onRetry?: () => void
  canRetry?: boolean
  /** Send a text message (fallback input) */
  onSendText?: (text: string) => void
  /** Flash animation when new feedback arrives */
  newFeedbackFlash?: boolean
  inputMode?: InputMode
  className?: string
}

/**
 * Lingle-adapted control bar using agents-ui visual design.
 * Works without LiveKit context — takes props directly.
 */
export function LingleControlBar({
  variant = 'livekit',
  voiceState,
  isMuted,
  onToggleMute,
  onEnd,
  isConnected = true,
  feedbackCount = 0,
  isChatOpen = false,
  onToggleChat,
  onRetry,
  canRetry,
  onSendText,
  newFeedbackFlash,
  inputMode = 'vad',
  className,
}: LingleControlBarProps) {
  const isLivekit = variant === 'livekit'

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return

      if (e.key === 'm' || e.key === 'M') {
        e.preventDefault()
        onToggleMute()
      }
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault()
        onToggleChat?.()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onToggleMute, onToggleChat])

  return (
    <div
      aria-label="Voice assistant controls"
      className={cn(
        'bg-background border-input/50 dark:border-muted flex flex-col border p-3 drop-shadow-md/3',
        isLivekit ? 'rounded-[31px]' : 'rounded-lg',
        className,
      )}
    >
      {/* Expandable chat input */}
      {onSendText && (
        <motion.div
          {...MOTION_PROPS}
          inert={!isChatOpen}
          animate={isChatOpen ? 'visible' : 'hidden'}
          className="border-input/50 flex w-full items-start overflow-hidden border-b"
        >
          <ChatInput
            chatOpen={isChatOpen}
            onSend={onSendText}
            className={cn(isLivekit && '[&_button]:rounded-full')}
          />
        </motion.div>
      )}

      <div className="flex gap-1">
        <div className="flex grow gap-1">
          {/* Mic toggle */}
          <Toggle
            pressed={!isMuted}
            onPressedChange={() => onToggleMute()}
            aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
            className={agentTrackToggleVariants({
              variant: 'default',
              className: cn(
                isLivekit && [
                  'data-[state=off]:bg-accent data-[state=off]:hover:bg-foreground/10',
                  'data-[state=off]:border-border data-[state=off]:hover:border-foreground/12',
                  'data-[state=off]:text-destructive data-[state=off]:hover:text-destructive',
                  'rounded-full',
                ],
              ),
            })}
          >
            {isMuted ? <MicOffIcon /> : <MicIcon />}
          </Toggle>

          {/* Retry */}
          {canRetry && (
            <Toggle
              pressed={false}
              onPressedChange={() => onRetry?.()}
              aria-label="Retry last exchange"
              className={agentTrackToggleVariants({
                variant: 'default',
                className: cn(isLivekit && 'rounded-full'),
              })}
            >
              <ArrowPathIcon className="w-4 h-4" />
            </Toggle>
          )}

          {/* Chat / feedback toggle */}
          {onToggleChat && (
            <Toggle
              pressed={isChatOpen}
              onPressedChange={() => onToggleChat()}
              aria-label="Toggle chat"
              className={agentTrackToggleVariants({
                variant: 'default',
                className: cn(
                  isLivekit && [
                    'data-[state=on]:bg-blue-500/20 data-[state=on]:hover:bg-blue-500/30',
                    'data-[state=on]:border-blue-700/10 data-[state=on]:text-blue-700',
                    'rounded-full',
                  ],
                  newFeedbackFlash && 'scale-[1.08] shadow-[0_0_8px_rgba(200,87,42,.3)]',
                ),
              })}
            >
              <MessageSquareTextIcon />
              {feedbackCount > 0 && (
                <span className="min-w-[18px] h-[18px] inline-flex items-center justify-center rounded-full text-[11px] font-bold px-1 bg-destructive/15 text-destructive">
                  {feedbackCount}
                </span>
              )}
            </Toggle>
          )}
        </div>

        {/* End session */}
        <Button
          size="default"
          variant="destructive"
          onClick={onEnd}
          disabled={!isConnected}
          className={cn(
            isLivekit &&
              'bg-destructive/10 dark:bg-destructive/10 text-destructive hover:bg-destructive/20 dark:hover:bg-destructive/20 focus:bg-destructive/20 focus-visible:ring-destructive/20 rounded-full font-mono text-xs font-bold tracking-wider',
          )}
        >
          <span className="hidden md:inline">END</span>
          <span className="inline md:hidden">END</span>
        </Button>
      </div>

      {/* Keyboard hints */}
      <div className="flex items-center justify-center gap-1.5 mt-2 text-[11px] text-muted-foreground">
        <kbd className="font-mono text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-muted border border-border">M</kbd>
        <span>{isMuted ? 'unmute' : 'mute'}</span>
        <span className="mx-0.5 text-border">&middot;</span>
        <kbd className="font-mono text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-muted border border-border">F</kbd>
        <span>chat</span>
        {inputMode === 'vad' && voiceState === 'IDLE' && !isMuted && (
          <>
            <span className="mx-0.5 text-border">&middot;</span>
            <span>speak naturally</span>
          </>
        )}
      </div>
    </div>
  )
}
