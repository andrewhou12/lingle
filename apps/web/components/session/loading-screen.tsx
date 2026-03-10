'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Spinner } from '@/components/spinner'

const LOADING_SUBTITLES = [
  'Designing your session...',
  'Writing your conversation plan...',
  'Picking vocabulary targets...',
  'Setting the scene...',
]

function CyclingSubtitle() {
  const [index, setIndex] = useState(0)
  const [fade, setFade] = useState(true)

  useEffect(() => {
    const interval = setInterval(() => {
      setFade(false)
      setTimeout(() => {
        setIndex(i => (i + 1) % LOADING_SUBTITLES.length)
        setFade(true)
      }, 200)
    }, 2800)
    return () => clearInterval(interval)
  }, [])

  return (
    <p
      className="text-[13px] text-text-muted transition-opacity duration-200"
      style={{ opacity: fade ? 1 : 0 }}
    >
      {LOADING_SUBTITLES[index]}
    </p>
  )
}

export function LoadingScreen() {
  return createPortal(
    <div className="fixed inset-0 z-[99999] bg-bg flex flex-col items-center justify-center">
      <div className="flex flex-col items-center gap-5">
        <Spinner size={22} />
        <div className="flex flex-col items-center gap-1.5">
          <p className="text-[15px] font-medium text-text-primary tracking-[-0.01em]">
            Preparing your session
          </p>
          <CyclingSubtitle />
        </div>
      </div>
    </div>,
    document.body,
  )
}
