'use client'

import { cn } from '@/lib/utils'
import { getTargetFontClass } from '@/lib/languages'

interface VocabularyCardProps {
  word: string
  reading?: string
  meaning: string
  partOfSpeech?: string
  exampleSentence?: string
  notes?: string
  targetLanguage?: string
}

export function VocabularyCard({ word, reading, meaning, partOfSpeech, exampleSentence, notes, targetLanguage }: VocabularyCardProps) {
  return (
    <div className="my-3 rounded-xl bg-bg-pure border border-border px-4 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border-l-[3px] border-l-blue">
      <div className="flex items-baseline gap-2 mb-1">
        <span className={cn("text-[18px] font-semibold text-text-primary", getTargetFontClass(targetLanguage || ''))}>{word}</span>
        {reading && (
          <span className={cn("text-[13px] text-text-secondary", getTargetFontClass(targetLanguage || ''))}>{reading}</span>
        )}
        {partOfSpeech && (
          <span className="text-[11px] text-text-secondary bg-bg-secondary rounded-full px-2 py-0.5">
            {partOfSpeech}
          </span>
        )}
      </div>
      <p className="text-[14px] text-text-primary mb-1">{meaning}</p>
      {exampleSentence && (
        <p className={cn("text-[13px] text-text-secondary leading-snug mt-2 pl-3 border-l-2 border-border", getTargetFontClass(targetLanguage || ''))}>
          {exampleSentence}
        </p>
      )}
      {notes && (
        <p className="text-[12px] text-text-muted mt-2 italic">{notes}</p>
      )}
    </div>
  )
}

export function VocabularyCardSkeleton() {
  return (
    <div className="my-3 rounded-xl bg-bg-pure border border-border px-4 py-3 animate-pulse shadow-[0_1px_3px_rgba(0,0,0,0.04)] border-l-[3px] border-l-blue">
      <div className="flex items-baseline gap-2 mb-2">
        <div className="h-5 w-16 bg-bg-hover rounded" />
        <div className="h-3 w-12 bg-bg-hover rounded" />
      </div>
      <div className="h-4 w-40 bg-bg-hover rounded mb-1" />
      <div className="h-3 w-56 bg-bg-hover rounded mt-2" />
    </div>
  )
}
