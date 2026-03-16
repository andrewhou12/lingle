'use client'

import { type ComponentProps } from 'react'
import type { AgentState } from '@livekit/components-react'
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation'
import { Message, MessageContent } from '@/components/ai-elements/message'
import { AgentChatIndicator } from '@/components/agents-ui/agent-chat-indicator'
import { AnimatePresence } from 'motion/react'
import { cn } from '@/lib/utils'
import { stripRubyAnnotations } from '@/lib/ruby-annotator'
import type { TranscriptLine } from '@/hooks/use-voice-conversation'

interface CorrectionInfo {
  original: string
  corrected: string
  explanation: string
}

export interface LingleTranscriptEntry extends TranscriptLine {
  correction?: CorrectionInfo | null
  formattedTime?: string
}

export interface LingleChatTranscriptProps extends ComponentProps<'div'> {
  agentState?: AgentState
  entries?: LingleTranscriptEntry[]
  className?: string
}

/**
 * Lingle-adapted chat transcript using agents-ui visual design.
 * Accepts our TranscriptLine[] data format instead of LiveKit ReceivedMessage[].
 */
export function LingleChatTranscript({
  agentState,
  entries = [],
  className,
  ...props
}: LingleChatTranscriptProps) {
  return (
    <Conversation className={className} {...props}>
      <ConversationContent>
        {entries.length === 0 ? (
          <div className="flex size-full flex-col items-center justify-center gap-3 p-8 text-center">
            <div className="space-y-1">
              <h3 className="font-medium text-sm text-muted-foreground">No messages yet</h3>
              <p className="text-muted-foreground text-sm">
                Start speaking and your transcript will appear here.
              </p>
            </div>
          </div>
        ) : (
          entries.map((entry, i) => {
            const isUser = entry.role === 'user'
            const displayText = stripRubyAnnotations(entry.text)

            return (
              <Message
                key={`${entry.timestamp}-${i}`}
                title={entry.formattedTime || ''}
                from={isUser ? 'user' : 'assistant'}
              >
                <MessageContent>
                  <p className="font-jp-clean leading-[1.7] whitespace-pre-wrap">
                    {displayText}
                  </p>
                </MessageContent>

                {/* Inline correction card */}
                {entry.correction && (
                  <div className="max-w-full rounded-xl border border-orange-200 bg-orange-50 dark:border-orange-800/40 dark:bg-orange-950/20 px-4 py-3 mt-1">
                    <div className="flex items-baseline gap-2 mb-1.5">
                      <span className="text-[12px] text-muted-foreground shrink-0">before</span>
                      <span className="text-[14px] font-jp-clean text-muted-foreground line-through">
                        {entry.correction.original}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-2 mb-1.5">
                      <span className="text-[12px] text-muted-foreground shrink-0">after</span>
                      <span className="text-[14px] font-jp-clean font-medium text-foreground">
                        {entry.correction.corrected}
                      </span>
                    </div>
                    <p className="text-[13px] text-muted-foreground leading-[1.6]">
                      {entry.correction.explanation}
                    </p>
                  </div>
                )}
              </Message>
            )
          })
        )}
        <AnimatePresence>
          {agentState === 'thinking' && <AgentChatIndicator size="sm" />}
        </AnimatePresence>
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  )
}
