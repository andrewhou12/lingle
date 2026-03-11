'use client'

import { cn } from '@/lib/utils'
import { getTargetFontClass } from '@/lib/languages'

interface GrammarNoteProps {
  pattern: string
  meaning: string
  formation: string
  examples: { japanese: string; english: string }[]
  level?: string
  targetLanguage?: string
}

export function GrammarNote({ pattern, meaning, formation, examples, level, targetLanguage }: GrammarNoteProps) {
  return (
    <div className="my-3 rounded-xl bg-bg-pure border border-border px-4 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border-l-[3px] border-l-purple">
      <div className="flex items-center gap-2 mb-2">
        <span className={cn("text-[16px] font-semibold text-text-primary", getTargetFontClass(targetLanguage || ''))}>{pattern}</span>
        {level && (
          <span className="text-[11px] text-text-secondary bg-bg-secondary rounded-full px-2 py-0.5">
            {level}
          </span>
        )}
      </div>
      <p className="text-[14px] text-text-primary mb-1">{meaning}</p>
      <p className="text-[12px] text-text-muted mb-2">{formation}</p>
      <div className="flex flex-col gap-1.5">
        {examples.map((ex, i) => (
          <div key={i} className="pl-3 border-l-2 border-border">
            <p className={cn("text-[13px] text-text-primary leading-snug", getTargetFontClass(targetLanguage || ''))}>{ex.japanese}</p>
            <p className="text-[12px] text-text-muted">{ex.english}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

export function GrammarNoteSkeleton() {
  return (
    <div className="my-3 rounded-xl bg-bg-pure border border-border px-4 py-3 animate-pulse shadow-[0_1px_3px_rgba(0,0,0,0.04)] border-l-[3px] border-l-purple">
      <div className="flex items-center gap-2 mb-2">
        <div className="h-5 w-32 bg-bg-hover rounded" />
        <div className="h-4 w-8 bg-bg-hover rounded-full" />
      </div>
      <div className="h-4 w-48 bg-bg-hover rounded mb-1" />
      <div className="h-3 w-36 bg-bg-hover rounded mb-2" />
      <div className="pl-3 border-l-2 border-border">
        <div className="h-3 w-56 bg-bg-hover rounded mb-1" />
        <div className="h-3 w-40 bg-bg-hover rounded" />
      </div>
    </div>
  )
}
