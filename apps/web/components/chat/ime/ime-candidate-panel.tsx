'use client'

import { useEffect, useRef } from 'react'
import { IMECandidateRow } from './ime-candidate-row'
import type { EnrichedCandidate } from '@/hooks/use-ime-mastery'

interface IMECandidatePanelProps {
  candidates: EnrichedCandidate[]
  selectedIndex: number
  onSelect: (index: number) => void
  onDismiss: () => void
}

export function IMECandidatePanel({ candidates, selectedIndex, onSelect, onDismiss }: IMECandidatePanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const selectedRef = useRef<HTMLDivElement>(null)

  // Scroll selected item into view
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  // Click outside to dismiss
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onDismiss()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onDismiss])

  if (candidates.length === 0) return null

  return (
    <div
      ref={panelRef}
      className="absolute bottom-full left-0 mb-1 w-full max-w-[420px] bg-bg-pure border border-border rounded-lg shadow-[var(--shadow-md)] overflow-hidden z-50"
    >
      <div className="max-h-[252px] overflow-y-auto py-1">
        {candidates.map((candidate, index) => (
          <div key={`${candidate.surface}-${index}`} ref={index === selectedIndex ? selectedRef : undefined}>
            <IMECandidateRow
              candidate={candidate}
              index={index}
              isSelected={index === selectedIndex}
              onClick={() => onSelect(index)}
            />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 px-3 py-1.5 border-t border-border bg-bg-secondary/50">
        <span className="text-[10px] text-text-muted">
          1-9 select · Space/↓ next · ↑ prev · Enter confirm · Esc close
        </span>
      </div>
    </div>
  )
}
