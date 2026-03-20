'use client'

import { useMemo } from 'react'

interface NotesPanelProps {
  isOpen: boolean
  onClose: () => void
  notes: string
  onChange: (notes: string) => void
  sessionTitle?: string
}

export function NotesPanel({ isOpen, onClose, notes, onChange, sessionTitle }: NotesPanelProps) {
  const wordCount = useMemo(() => {
    const words = notes.trim().split(/\s+/).filter(Boolean)
    return words.length
  }, [notes])

  if (!isOpen) return null

  return (
    <div
      className="fixed top-12 right-0 bottom-[68px] w-[320px] bg-bg-pure border-l border-border flex flex-col z-[600]"
      style={{ animation: 'session-slide-right 0.18s ease both' }}
    >
      {/* Header */}
      <div className="px-6 pt-5 flex items-start justify-between">
        <div>
          <div className="text-[18px] font-semibold text-text-primary tracking-tight font-serif">
            Notes
          </div>
          <div className="text-[12px] text-text-muted mt-0.5">
            {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
            {sessionTitle && <> · {sessionTitle}</>}
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-[26px] h-[26px] flex items-center justify-center rounded-md border-none bg-transparent text-text-muted cursor-pointer hover:bg-bg-secondary transition-colors mt-0.5"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="h-px bg-border mt-4" />

      {/* Body */}
      <textarea
        value={notes}
        onChange={(e) => onChange(e.target.value)}
        placeholder={'Start writing…\n\nVocabulary, corrections, examples — anything you want to remember from this session.'}
        className="flex-1 resize-none border-none outline-none px-6 py-[18px] font-sans text-[14px] leading-[1.75] text-text-primary bg-bg-pure placeholder:text-text-muted"
        style={{ caretColor: 'var(--accent-warm)' }}
      />

      <div className="px-6 py-2.5 border-t border-border flex justify-between items-center">
        <span className="text-[11px] text-text-muted font-mono">
          {wordCount > 0 ? `${wordCount} word${wordCount !== 1 ? 's' : ''}` : ''}
        </span>
        <span className="text-[11px] text-text-muted">Auto-saved</span>
      </div>
    </div>
  )
}
