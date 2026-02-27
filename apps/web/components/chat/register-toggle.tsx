'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface RegisterVariant {
  register: 'casual' | 'polite' | 'formal'
  text: string
}

interface RegisterToggleProps {
  variants: RegisterVariant[]
  highlightDiffs?: boolean
  onClose?: () => void
}

const registerStyles: Record<string, { tag: string; bg: string; text: string }> = {
  casual: { tag: 'Casual', bg: 'bg-green-soft', text: 'text-green' },
  polite: { tag: 'Polite', bg: 'bg-blue-soft', text: 'text-blue' },
  formal: { tag: 'Formal', bg: 'bg-purple-soft', text: 'text-purple' },
}

export function RegisterToggle({ variants, onClose }: RegisterToggleProps) {
  const [visible, setVisible] = useState(true)

  if (!visible || variants.length === 0) return null

  const handleClose = () => {
    setVisible(false)
    onClose?.()
  }

  return (
    <div className="my-3 max-w-[480px] rounded-xl bg-bg-pure border border-border shadow-[var(--shadow-sm)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-subtle bg-bg-secondary/50">
        <span className="text-[12px] font-medium text-text-secondary">✦ Register comparison</span>
        <button
          onClick={handleClose}
          className="w-5 h-5 flex items-center justify-center rounded bg-transparent border-none cursor-pointer text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
        >
          <X size={12} />
        </button>
      </div>
      {/* Variants */}
      <div className="flex flex-col divide-y divide-border-subtle">
        {variants.map(({ register, text }) => {
          const style = registerStyles[register] || registerStyles.polite
          return (
            <div key={register} className="flex items-start gap-3 px-4 py-2.5">
              <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0 mt-0.5', style.bg, style.text)}>
                {style.tag}
              </span>
              <span className="text-[14px] font-jp text-text-primary leading-relaxed">{text}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
