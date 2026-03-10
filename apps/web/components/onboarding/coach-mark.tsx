'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { Popover, PopoverContent, PopoverTrigger, PopoverAnchor } from '@/components/ui/popover'

interface CoachMarkProps {
  hintId: string
  content: string
  side?: 'top' | 'bottom' | 'left' | 'right'
  show: boolean
  autoDismissMs?: number
  onDismiss: () => void
  children: ReactNode
}

export function CoachMark({
  hintId,
  content,
  side = 'bottom',
  show,
  autoDismissMs = 8000,
  onDismiss,
  children,
}: CoachMarkProps) {
  const [visible, setVisible] = useState(false)

  // Delay showing slightly so it feels sequential, not jarring
  useEffect(() => {
    if (!show) {
      setVisible(false)
      return
    }
    const delay = setTimeout(() => setVisible(true), 400)
    return () => clearTimeout(delay)
  }, [show])

  // Auto-dismiss
  useEffect(() => {
    if (!visible || autoDismissMs <= 0) return
    const timer = setTimeout(onDismiss, autoDismissMs)
    return () => clearTimeout(timer)
  }, [visible, autoDismissMs, onDismiss])

  return (
    <Popover open={visible}>
      <PopoverAnchor asChild>
        {children}
      </PopoverAnchor>
      <PopoverContent
        side={side}
        sideOffset={8}
        className="coach-mark-in w-auto max-w-[260px] bg-text-primary text-bg-pure border-none rounded-lg px-3.5 py-2.5 shadow-pop z-[60]"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <p className="text-[13px] leading-[1.5] m-0 mb-2">{content}</p>
        <button
          onClick={onDismiss}
          className="text-[12px] font-medium text-bg-pure/70 hover:text-bg-pure bg-transparent border-none cursor-pointer p-0 transition-colors duration-100"
        >
          Got it
        </button>
      </PopoverContent>
    </Popover>
  )
}
