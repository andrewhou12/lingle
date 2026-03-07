'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { cn } from '@/lib/utils'

interface ToolToastProps {
  id: string
  children: React.ReactNode
  /** Auto-dismiss after this many ms (default: 8000). 0 = no auto-dismiss. */
  duration?: number
  onDismiss: (id: string) => void
}

export function ToolToast({ id, children, duration = 8000, onDismiss }: ToolToastProps) {
  const [isPinned, setIsPinned] = useState(false)
  const [progress, setProgress] = useState(100)

  useEffect(() => {
    if (isPinned || duration === 0) return

    const start = Date.now()
    const interval = setInterval(() => {
      const elapsed = Date.now() - start
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100)
      setProgress(remaining)
      if (remaining <= 0) {
        clearInterval(interval)
        onDismiss(id)
      }
    }, 50)

    return () => clearInterval(interval)
  }, [id, duration, isPinned, onDismiss])

  const handlePin = useCallback(() => {
    setIsPinned(true)
    setProgress(100)
  }, [])

  return (
    <motion.div
      layout
      initial={{ x: 300, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 300, opacity: 0 }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      className="relative bg-bg-pure border border-border rounded-xl shadow-lg overflow-hidden max-w-[300px] cursor-pointer"
      onClick={handlePin}
    >
      <div className="p-3">
        {children}
      </div>

      {/* Close button */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onDismiss(id)
        }}
        className="absolute top-2 right-2 w-5 h-5 rounded flex items-center justify-center bg-transparent border-none text-text-muted hover:text-text-primary cursor-pointer transition-colors"
      >
        <XMarkIcon className="w-3 h-3" />
      </button>

      {/* Progress bar */}
      {!isPinned && duration > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-border">
          <div
            className="h-full bg-accent-brand/40 transition-[width] duration-50"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </motion.div>
  )
}

// Toast container that manages active toasts
interface ToolToastContainerProps {
  toasts: Array<{
    id: string
    content: React.ReactNode
  }>
  onDismiss: (id: string) => void
  className?: string
}

export function ToolToastContainer({ toasts, onDismiss, className }: ToolToastContainerProps) {
  return (
    <div className={cn('fixed bottom-24 right-6 z-50 flex flex-col-reverse gap-2', className)}>
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <ToolToast key={toast.id} id={toast.id} onDismiss={onDismiss}>
            {toast.content}
          </ToolToast>
        ))}
      </AnimatePresence>
    </div>
  )
}
