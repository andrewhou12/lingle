'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ToolTrayProps {
  items: Array<{
    id: string
    content: React.ReactNode
  }>
  className?: string
}

export function ToolTray({ items, className }: ToolTrayProps) {
  const [isOpen, setIsOpen] = useState(false)

  if (items.length === 0) return null

  return (
    <div className={cn('fixed bottom-24 right-6 z-40', className)}>
      {/* Pill indicator */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-bg-secondary border border-border text-[12px] font-medium text-text-secondary hover:bg-bg-hover cursor-pointer transition-colors"
        >
          <ChevronUp size={12} />
          {items.length} {items.length === 1 ? 'card' : 'cards'}
        </button>
      )}

      {/* Expanded tray */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="bg-bg-pure border border-border rounded-xl shadow-lg max-w-[340px] max-h-[50vh] overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
              <span className="text-[12px] font-medium text-text-secondary">
                Session Cards ({items.length})
              </span>
              <button
                onClick={() => setIsOpen(false)}
                className="w-5 h-5 rounded flex items-center justify-center bg-transparent border-none text-text-muted hover:text-text-primary cursor-pointer"
              >
                <X size={12} />
              </button>
            </div>

            {/* Scrollable content */}
            <div className="overflow-auto p-2 flex flex-col gap-2">
              {items.map((item) => (
                <div key={item.id} className="border border-border rounded-lg p-2">
                  {item.content}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
