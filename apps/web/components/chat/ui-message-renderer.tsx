'use client'

import Markdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import remarkGfm from 'remark-gfm'
import type { UIMessage } from 'ai'
import { rubyToHtml } from '@/lib/ruby-annotator'
import { getToolZone } from '@/lib/tool-zones'
import type { DifficultyViolation } from '@/lib/difficulty-validator'
import { RomajiText } from '@/components/romaji-text'
import { MessageBlock } from '@/components/chat/message-block'
import { ChoiceButtons, ChoiceButtonsSkeleton } from '@/components/chat/choice-buttons'
import type { Choice } from '@/components/chat/choice-buttons'
import { CorrectionCard, CorrectionCardSkeleton } from '@/components/chat/correction-card'
import { VocabularyCard, VocabularyCardSkeleton } from '@/components/chat/vocabulary-card'
import { GrammarNote, GrammarNoteSkeleton } from '@/components/chat/grammar-note'
import { cn } from '@/lib/utils'

export function UIMessageRenderer({
  message,
  showRomaji,
  getAnnotated,
  chosenChoiceIds,
  onChoiceSelect,
  onPlay,
  onStop,
  isPlayingAudio,
  isStreaming,
  panelOpen,
  violations,
}: {
  message: UIMessage
  showRomaji: boolean
  getAnnotated: (text: string) => string
  chosenChoiceIds: Set<string>
  onChoiceSelect: (text: string, blockId: string) => void
  onPlay?: () => void
  onStop?: () => void
  isPlayingAudio?: boolean
  isStreaming?: boolean
  panelOpen?: boolean
  violations?: DifficultyViolation[]
}) {
  if (message.role === 'user') {
    const textContent = message.parts
      .filter((p) => p.type === 'text')
      .map((p) => (p as { type: 'text'; text: string }).text)
      .join('')
    return (
      <MessageBlock
        role="user"
        content={textContent}
      />
    )
  }

  // Assistant message -- render parts
  return (
    <MessageBlock
      role="assistant"
      content=""
      showRomaji={showRomaji}
      onPlay={onPlay}
      onStop={onStop}
      isPlayingAudio={isPlayingAudio}
      isStreaming={isStreaming}
    >
      {message.parts.map((part, i) => {
        const isLastTextPart = isStreaming && part.type === 'text' &&
          !message.parts.slice(i + 1).some((p) => p.type === 'text')
        return (
          <PartRenderer
            key={i}
            part={part}
            showRomaji={showRomaji}
            getAnnotated={getAnnotated}
            isStreaming={isLastTextPart || false}
            messageId={message.id}
            chosenChoiceIds={chosenChoiceIds}
            onChoiceSelect={onChoiceSelect}
            panelOpen={panelOpen}
          />
        )
      })}
      {violations && violations.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {violations.map((v, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-warm-soft text-[11px] text-accent-warm font-medium"
              title={`${v.baseForm} is N${v.jlptLevel} — above the target level`}
            >
              {v.surface}
              <span className="text-[10px] opacity-70">N{v.jlptLevel}</span>
            </span>
          ))}
        </div>
      )}
    </MessageBlock>
  )
}

function PartRenderer({
  part,
  showRomaji,
  getAnnotated,
  isStreaming,
  messageId,
  chosenChoiceIds,
  onChoiceSelect,
  panelOpen,
}: {
  part: UIMessage['parts'][number]
  showRomaji: boolean
  getAnnotated: (text: string) => string
  isStreaming?: boolean
  messageId: string
  chosenChoiceIds: Set<string>
  onChoiceSelect: (text: string, blockId: string) => void
  panelOpen?: boolean
}) {
  if (part.type === 'text') {
    const text = (part as { type: 'text'; text: string }).text
    if (!text.trim()) return null

    const displayText = showRomaji ? getAnnotated(text) : text
    if (showRomaji) {
      return (
        <RomajiText
          text={displayText}
          className="chat-markdown text-text-primary leading-[1.7] text-[14.5px]"
        />
      )
    }

    const htmlText = rubyToHtml(displayText)

    return (
      <div className={cn(
        "chat-markdown text-text-primary leading-[1.7] text-[14.5px]",
        isStreaming && "[&>p:last-of-type]:inline"
      )}>
        <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
          {htmlText}
        </Markdown>
        {isStreaming && <span className="blink-cursor" />}
      </div>
    )
  }

  // Tool invocations -- route by tool name
  const partType = (part as { type: string }).type
  if (partType.startsWith('tool-')) {
    const toolName = partType.replace('tool-', '')
    const toolPart = part as { type: string; state: string; output?: unknown; args?: unknown }
    const zone = getToolZone(toolName)

    // Chips zone -- extracted for bottom chips, hidden inline
    if (zone === 'chips') return null

    // Hidden zone -- no visual output
    if (zone === 'hidden') return null

    // Panel zone -- show reference pill inline when panel is open, full card when closed
    if (zone === 'panel' && panelOpen) {
      if (toolPart.state === 'output-available' && toolPart.output) {
        return <ReferencePill toolName={toolName} output={toolPart.output} />
      }
      if (toolPart.state === 'input-available') {
        return <ReferencePillSkeleton />
      }
      return null
    }

    // Inline zone (or panel zone with panel closed) -- render full cards
    if (toolName === 'displayChoices') {
      if (toolPart.state === 'output-available' && toolPart.output) {
        const output = toolPart.output as { choices: { text: string; hint?: string }[] }
        const choices: Choice[] = output.choices.map((c, i) => ({
          number: i + 1,
          text: c.text,
          hint: c.hint,
        }))
        const blockId = `${messageId}-choices`
        return (
          <ChoiceButtons
            choices={choices}
            blockId={blockId}
            isChosen={chosenChoiceIds.has(blockId)}
            onSelect={onChoiceSelect}
          />
        )
      }
      if (toolPart.state === 'input-available') return <ChoiceButtonsSkeleton />
      return null
    }

    if (toolName === 'showCorrection') {
      if (toolPart.state === 'output-available' && toolPart.output) {
        const output = toolPart.output as { original: string; corrected: string; explanation: string; grammarPoint?: string }
        return <CorrectionCard {...output} />
      }
      if (toolPart.state === 'input-available') return <CorrectionCardSkeleton />
      return null
    }

    if (toolName === 'showVocabularyCard') {
      if (toolPart.state === 'output-available' && toolPart.output) {
        const output = toolPart.output as { word: string; reading?: string; meaning: string; partOfSpeech?: string; exampleSentence?: string; notes?: string }
        return <VocabularyCard {...output} />
      }
      if (toolPart.state === 'input-available') return <VocabularyCardSkeleton />
      return null
    }

    if (toolName === 'showGrammarNote') {
      if (toolPart.state === 'output-available' && toolPart.output) {
        const output = toolPart.output as { pattern: string; meaning: string; formation: string; examples: { japanese: string; english: string }[]; level?: string }
        return <GrammarNote {...output} />
      }
      if (toolPart.state === 'input-available') return <GrammarNoteSkeleton />
      return null
    }

    // Unknown tools -- hidden
    return null
  }

  return null
}

// Reference pill for panel-zone tools shown inline in chat
export function ReferencePill({ toolName, output }: { toolName: string; output: unknown }) {
  const data = output as Record<string, unknown>
  let icon: string
  let label: string

  if (toolName === 'showVocabularyCard') {
    icon = '\uD83D\uDCD8'
    label = (data.word as string) || 'Vocabulary'
  } else if (toolName === 'showGrammarNote') {
    icon = '\uD83D\uDCD5'
    label = (data.pattern as string) || 'Grammar'
  } else if (toolName === 'showCorrection') {
    icon = '\u270F\uFE0F'
    label = 'Correction'
  } else {
    return null
  }

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-bg-secondary border border-border text-[12px] text-text-secondary font-medium font-jp mr-1 my-0.5">
      <span className="text-[11px]">{icon}</span>
      {label}
    </span>
  )
}

export function ReferencePillSkeleton() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-bg-secondary border border-border text-[12px] text-text-placeholder mr-1 my-0.5 animate-pulse">
      <span className="w-3 h-3 bg-border rounded-full" />
      <span className="w-12 h-3 bg-border rounded" />
    </span>
  )
}
