'use client'

import { useReview } from '@/hooks/use-review'
import { ReviewCard } from './review-card'
import { SessionSummary } from './session-summary'
import { Spinner } from '@/components/spinner'
import type { ReviewGrade } from '@lingle/shared/types'

export default function ReviewPage() {
  const {
    queue, isLoading, currentItem, currentIndex, isComplete, sessionStats, submitReview,
  } = useReview()

  if (isLoading && queue.length === 0) {
    return (
      <div>
        <h1 className="text-[28px] font-bold mb-4">Review</h1>
        <div className="flex items-center gap-3 mt-6">
          <Spinner size={18} />
          <span className="text-[13px] text-text-muted">Loading review queue...</span>
        </div>
      </div>
    )
  }

  if (queue.length === 0) {
    return (
      <div>
        <h1 className="text-[28px] font-bold mb-4">Review</h1>
        <p>No items due for review. Check back later!</p>
      </div>
    )
  }

  if (isComplete) {
    return <SessionSummary stats={sessionStats} />
  }

  const progress = Math.round(((currentIndex) / queue.length) * 100)

  const handleGrade = (grade: ReviewGrade) => {
    if (!currentItem) return
    submitReview({
      itemId: currentItem.id,
      itemType: currentItem.itemType,
      grade,
      modality: currentItem.modality,
    })
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-xl font-bold">Review</h2>
        <span className="text-[13px] text-text-muted">{currentIndex + 1} / {queue.length}</span>
      </div>
      <div className="h-1 rounded-full bg-bg-active overflow-hidden mb-6">
        <div
          className="h-full rounded-full bg-accent-brand transition-[width] duration-300 ease-in-out"
          style={{ width: `${progress}%` }}
        />
      </div>
      {currentItem && <ReviewCard item={currentItem} onGrade={handleGrade} />}
    </div>
  )
}
