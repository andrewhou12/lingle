'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { createPortal } from 'react-dom'

interface VoiceEndConfirmationProps {
  isOpen: boolean
  onConfirm: () => void
  onCancel: () => void
  duration: number
  turnsCount: number
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function VoiceEndConfirmation({
  isOpen,
  onConfirm,
  onCancel,
  duration,
  turnsCount,
}: VoiceEndConfirmationProps) {
  if (!isOpen) return null

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[999999] flex items-center justify-center"
          onClick={onCancel}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-[rgba(0,0,0,.3)] backdrop-blur-[6px]" />

          {/* Dialog */}
          <motion.div
            initial={{ scale: 0.95, y: 8 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 8 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-[340px] bg-bg-pure border border-border rounded-2xl shadow-[0_16px_48px_rgba(0,0,0,.12),0_4px_12px_rgba(0,0,0,.06)] overflow-hidden"
          >
            <div className="px-6 pt-6 pb-4">
              <h3 className="text-[16px] font-semibold text-text-primary tracking-[-0.02em]">
                End conversation?
              </h3>
              <p className="text-[13px] text-text-secondary mt-1.5 leading-[1.5]">
                You've been talking for {formatDuration(duration)} ({Math.floor(turnsCount / 2)} exchanges). Your session will be saved and you'll see a summary.
              </p>
            </div>

            <div className="flex gap-2 px-6 pb-5">
              <button
                onClick={onCancel}
                className="flex-1 py-2.5 rounded-xl text-[13px] font-medium text-text-secondary bg-bg-secondary border border-border cursor-pointer transition-colors hover:bg-bg-hover hover:text-text-primary"
              >
                Keep going
              </button>
              <button
                onClick={onConfirm}
                className="flex-1 py-2.5 rounded-xl text-[13px] font-medium text-white bg-accent-brand border-none cursor-pointer transition-all hover:bg-[#111] hover:shadow-[0_4px_12px_rgba(0,0,0,.15)]"
              >
                End & review
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
