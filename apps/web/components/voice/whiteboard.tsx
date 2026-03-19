'use client'

import { useState, useEffect, useCallback } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { cn } from '@/lib/utils'

// ── Message types matching whiteboard-tools.ts ──

interface CorrectionData {
  original: string
  corrected: string
  rule: string
  explanation?: string
}

interface VocabWord {
  word: string
  reading?: string
  meaning: string
}

interface VocabClusterData {
  title: string
  words: VocabWord[]
}

interface TableData {
  title: string
  headers: string[]
  rows: string[][]
}

interface ContentData {
  contentType: 'article' | 'dialogue' | 'instructions' | 'notes'
  title: string
  body: string
}

type WhiteboardContent =
  | { type: 'correction'; data: CorrectionData }
  | { type: 'vocab_cluster'; data: VocabClusterData }
  | { type: 'table'; data: TableData }
  | { type: 'content'; data: ContentData }

// ── Hook ──

export function useWhiteboard() {
  const [isOpen, setIsOpen] = useState(false)
  const [content, setContent] = useState<WhiteboardContent | null>(null)

  const handleMessage = useCallback((message: Record<string, unknown>) => {
    switch (message.type) {
      case 'whiteboard_open':
        setIsOpen(true)
        break
      case 'whiteboard_close':
        setIsOpen(false)
        break
      case 'whiteboard_correction':
        setContent({ type: 'correction', data: message.data as unknown as CorrectionData })
        setIsOpen(true)
        break
      case 'whiteboard_vocab_cluster':
        setContent({ type: 'vocab_cluster', data: message.data as unknown as VocabClusterData })
        setIsOpen(true)
        break
      case 'whiteboard_table':
        setContent({ type: 'table', data: message.data as unknown as TableData })
        setIsOpen(true)
        break
      case 'whiteboard_content':
        setContent({ type: 'content', data: message.data as unknown as ContentData })
        setIsOpen(true)
        break
      case 'whiteboard_clear':
        setContent(null)
        break
    }
  }, [])

  return { isOpen, setIsOpen, content, handleMessage }
}

// ── Renderers ──

function CorrectionCard({ data }: { data: CorrectionData }) {
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <div className="text-[11px] uppercase tracking-wider text-text-muted mb-1">Original</div>
          <div className="text-[16px] text-accent-warm line-through">{data.original}</div>
        </div>
        <div className="text-text-muted pt-4">→</div>
        <div className="flex-1">
          <div className="text-[11px] uppercase tracking-wider text-text-muted mb-1">Corrected</div>
          <div className="text-[16px] text-green font-medium">{data.corrected}</div>
        </div>
      </div>
      <div className="pt-2 border-t border-border">
        <div className="text-[12px] font-medium text-accent-brand">{data.rule}</div>
        {data.explanation && (
          <div className="text-[13px] text-text-secondary mt-1">{data.explanation}</div>
        )}
      </div>
    </div>
  )
}

function VocabClusterCard({ data }: { data: VocabClusterData }) {
  return (
    <div>
      <div className="text-[14px] font-semibold text-text-primary mb-3">{data.title}</div>
      <div className="grid grid-cols-2 gap-2">
        {data.words.map((w, i) => (
          <div key={i} className="p-2.5 rounded-lg bg-bg-secondary border border-border">
            <div className="text-[15px] font-medium text-text-primary">{w.word}</div>
            {w.reading && (
              <div className="text-[12px] text-text-muted">{w.reading}</div>
            )}
            <div className="text-[12px] text-text-secondary mt-0.5">{w.meaning}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function TableCard({ data }: { data: TableData }) {
  return (
    <div>
      <div className="text-[14px] font-semibold text-text-primary mb-3">{data.title}</div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr>
              {data.headers.map((h, i) => (
                <th key={i} className="text-left py-2 px-3 text-text-muted font-medium border-b border-border bg-bg-secondary">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j} className="py-2 px-3 border-b border-border text-text-primary">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ContentCard({ data }: { data: ContentData }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[11px] uppercase tracking-wider text-text-muted">{data.contentType}</span>
        <span className="text-[14px] font-semibold text-text-primary">{data.title}</span>
      </div>
      <div className="text-[14px] text-text-primary leading-relaxed whitespace-pre-wrap">
        {data.body}
      </div>
    </div>
  )
}

// ── Main Component ──

export function Whiteboard({
  isOpen,
  onClose,
  content,
}: {
  isOpen: boolean
  onClose: () => void
  content: WhiteboardContent | null
}) {
  if (!isOpen || !content) return null

  return (
    <div
      className={cn(
        'fixed right-0 top-0 h-full w-[380px] bg-bg-pure border-l border-border shadow-pop z-50',
        'animate-in slide-in-from-right duration-200',
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-[13px] font-semibold text-text-primary">Whiteboard</span>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-md bg-transparent border-none cursor-pointer flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
        >
          <XMarkIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="p-4 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 52px)' }}>
        {content.type === 'correction' && <CorrectionCard data={content.data} />}
        {content.type === 'vocab_cluster' && <VocabClusterCard data={content.data} />}
        {content.type === 'table' && <TableCard data={content.data} />}
        {content.type === 'content' && <ContentCard data={content.data} />}
      </div>
    </div>
  )
}
