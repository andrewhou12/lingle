'use client'

import { cn } from '@/lib/utils'

interface ChunkTokenProps {
  text: string
  reading?: string
  meaning?: string
  onClick?: () => void
}

export function ChunkToken({ text, reading, onClick }: ChunkTokenProps) {
  return (
    <span
      className={cn(
        'inline-block cursor-pointer font-jp group/chunk relative',
        'bg-purple-soft border-b-2 border-purple',
        'hover:bg-purple-med transition-colors'
      )}
      onClick={onClick}
      role="button"
      tabIndex={0}
    >
      {text}
      <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] font-sans font-semibold text-purple bg-bg-pure px-1.5 py-0.5 rounded opacity-0 group-hover/chunk:opacity-100 transition-opacity whitespace-nowrap pointer-events-none uppercase tracking-wider">
        Chunk
      </span>
      {reading && (
        <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] text-text-muted bg-bg-pure px-1 rounded opacity-0 group-hover/chunk:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
          {reading}
        </span>
      )}
    </span>
  )
}
