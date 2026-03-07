'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { PaperAirplaneIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'

interface VoiceFallbackInputProps {
  isOpen: boolean
  onClose: () => void
  onSend: (text: string) => void
  disabled?: boolean
}

export function VoiceFallbackInput({ isOpen, onClose, onSend, disabled }: VoiceFallbackInputProps) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => inputRef.current?.focus())
    } else {
      setValue('')
    }
  }, [isOpen])

  const handleSubmit = useCallback(() => {
    if (!value.trim() || disabled) return
    onSend(value.trim())
    setValue('')
    onClose()
  }, [value, disabled, onSend, onClose])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
      if (e.key === 'Escape') {
        onClose()
      }
    },
    [handleSubmit, onClose],
  )

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 60, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="absolute bottom-20 left-6 right-6 z-20"
        >
          <div className="max-w-xl mx-auto flex items-center gap-2 bg-bg-pure border border-border rounded-xl px-4 py-2.5 shadow-lg">
            <input
              ref={inputRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your message..."
              className="flex-1 bg-transparent border-none outline-none text-[14px] text-text-primary placeholder:text-text-placeholder font-jp"
              disabled={disabled}
            />
            <button
              onClick={handleSubmit}
              disabled={!value.trim() || disabled}
              className={cn(
                'w-8 h-8 rounded-lg flex items-center justify-center border-none cursor-pointer transition-colors',
                value.trim()
                  ? 'bg-accent-brand text-white'
                  : 'bg-bg-secondary text-text-muted',
              )}
            >
              <PaperAirplaneIcon className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center bg-transparent border-none text-text-muted hover:text-text-primary cursor-pointer transition-colors"
            >
              <XMarkIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
