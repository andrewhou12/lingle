'use client'

import { useState, useEffect, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import type { ReviewQueueItem, ReviewGrade } from '@linguist/shared/types'
import { formatMasteryLabel } from '@/constants/mastery'

interface ReviewCardProps {
  item: ReviewQueueItem
  onGrade: (grade: ReviewGrade) => void
}

const GRADE_CONFIG: Array<{
  grade: ReviewGrade; label: string; color: string; bg: string; key: string
}> = [
  { grade: 'again', label: 'Again', color: 'var(--accent-warm)', bg: 'rgba(200,87,42,.06)', key: '1' },
  { grade: 'hard', label: 'Hard', color: '#f59e0b', bg: 'rgba(245,158,11,.06)', key: '2' },
  { grade: 'good', label: 'Good', color: '#16a34a', bg: 'rgba(22,163,106,.06)', key: '3' },
  { grade: 'easy', label: 'Easy', color: '#3b82f6', bg: 'rgba(59,130,246,.06)', key: '4' },
]

const MASTERY_STYLES: Record<string, { bg: string; color: string }> = {
  unseen: { bg: 'var(--bg-secondary)', color: 'var(--text-muted)' },
  introduced: { bg: 'var(--bg-secondary)', color: 'var(--text-muted)' },
  apprentice_1: { bg: 'rgba(245,158,11,.08)', color: '#f59e0b' },
  apprentice_2: { bg: 'rgba(245,158,11,.08)', color: '#f59e0b' },
  apprentice_3: { bg: 'rgba(245,158,11,.08)', color: '#f59e0b' },
  apprentice_4: { bg: 'rgba(245,158,11,.08)', color: '#f59e0b' },
  journeyman: { bg: 'rgba(59,130,246,.08)', color: '#3b82f6' },
  expert: { bg: 'rgba(22,163,106,.08)', color: '#16a34a' },
  master: { bg: 'rgba(139,92,246,.08)', color: '#8b5cf6' },
  burned: { bg: 'rgba(245,158,11,.08)', color: '#f59e0b' },
}

export function ReviewCard({ item, onGrade }: ReviewCardProps) {
  const [side, setSide] = useState<'front' | 'back'>('front')
  const [typedAnswer, setTypedAnswer] = useState('')

  const isProduction = item.modality === 'production'

  useEffect(() => {
    setSide('front')
    setTypedAnswer('')
  }, [item.id, item.modality])

  const showAnswer = useCallback(() => { setSide('back') }, [])

  const handleGrade = useCallback((grade: ReviewGrade) => { onGrade(grade) }, [onGrade])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (isProduction && side === 'front' && e.key !== 'Enter') return
      if (side === 'front' && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault()
        showAnswer()
        return
      }
      if (side === 'back') {
        const gradeMap: Record<string, ReviewGrade> = { '1': 'again', '2': 'hard', '3': 'good', '4': 'easy' }
        const grade = gradeMap[e.key]
        if (grade) { e.preventDefault(); handleGrade(grade) }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [side, isProduction, showAnswer, handleGrade])

  const masteryStyle = MASTERY_STYLES[item.masteryState] ?? { bg: 'var(--bg-secondary)', color: 'var(--text-muted)' }

  return (
    <div className="max-w-[500px] mx-auto rounded-xl border border-border bg-bg p-8 min-h-[300px]">
      {side === 'front' ? (
        <div className="flex flex-col items-center justify-center gap-4 min-h-[220px]">
          {isProduction ? (
            <>
              <span className="text-[13px] text-text-muted">Produce the word for:</span>
              <span className="text-[28px] font-bold text-center">{item.meaning}</span>
              {item.reading && <span className="text-[15px] text-text-muted">Reading: {item.reading}</span>}
              <div className="w-full max-w-[300px] mt-2">
                <Input
                  placeholder="Type your answer..."
                  value={typedAnswer}
                  onChange={(e) => setTypedAnswer(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); showAnswer() } }}
                  autoFocus
                  className="text-base"
                />
              </div>
              <button
                className="mt-2 inline-flex items-center gap-2 rounded-md bg-bg-secondary px-5 py-2.5 text-[15px] font-medium text-text-secondary border-none cursor-pointer transition-colors hover:bg-bg-hover"
                onClick={showAnswer}
              >
                Submit <kbd className="ml-1 rounded border border-border bg-bg-active px-1.5 py-0.5 text-[11px] font-mono">Enter</kbd>
              </button>
            </>
          ) : (
            <>
              <span className="text-[13px] text-text-muted">What does this mean?</span>
              <span className="text-[44px] font-bold text-center leading-tight">{item.surfaceForm}</span>
              {item.reading && <span className="text-lg text-text-muted">{item.reading}</span>}
              <button
                className="mt-4 inline-flex items-center gap-2 rounded-md bg-bg-secondary px-5 py-2.5 text-[15px] font-medium text-text-secondary border-none cursor-pointer transition-colors hover:bg-bg-hover"
                onClick={showAnswer}
              >
                Show Answer <kbd className="ml-1 rounded border border-border bg-bg-active px-1.5 py-0.5 text-[11px] font-mono">Space</kbd>
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 min-h-[220px]">
          <div className="flex flex-col items-center gap-2">
            <span className="text-[28px] font-bold">{item.surfaceForm}</span>
            {item.reading && <span className="text-lg text-text-muted">{item.reading}</span>}
          </div>
          <span className="text-xl text-center">{item.meaning}</span>
          <span
            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium"
            style={{ background: masteryStyle.bg, color: masteryStyle.color }}
          >
            {formatMasteryLabel(item.masteryState)}
          </span>
          {isProduction && typedAnswer && (
            <div
              className="w-full max-w-[300px] px-4 py-2 rounded-md text-center"
              style={{
                background: typedAnswer.trim() === item.surfaceForm ? 'rgba(22,163,106,.06)' : 'rgba(200,87,42,.06)',
              }}
            >
              <span className="text-[15px]">Your answer: <strong>{typedAnswer}</strong></span>
            </div>
          )}
          <div className="flex gap-2 mt-4 flex-wrap justify-center">
            {GRADE_CONFIG.map(({ grade, label, color, bg, key }) => (
              <button
                key={grade}
                className="min-w-[90px] inline-flex items-center justify-center gap-1.5 rounded-md px-4 py-2.5 text-[15px] font-medium border-none cursor-pointer transition-opacity hover:opacity-80"
                style={{ color, background: bg }}
                onClick={() => handleGrade(grade)}
              >
                {label}
                <kbd className="ml-1 rounded border border-border bg-white/50 px-1.5 py-0.5 text-[11px] font-mono">{key}</kbd>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
