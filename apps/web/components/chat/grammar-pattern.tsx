'use client'

import { cn } from '@/lib/utils'

interface Slot {
  text: string
  type: 'filled' | 'fixed' | 'blank'
}

interface GrammarPatternProps {
  patternName: string
  slots: Slot[]
  example?: string
  exampleTranslation?: string
}

const slotStyles: Record<Slot['type'], string> = {
  filled: 'bg-bg-secondary border border-border text-text-primary',
  fixed: 'bg-warm-soft border border-warm-med text-warm',
  blank: 'border-2 border-dashed border-border text-text-placeholder',
}

export function GrammarPattern({ patternName, slots, example, exampleTranslation }: GrammarPatternProps) {
  return (
    <div className="my-3 max-w-[480px] rounded-xl bg-bg-pure border border-border shadow-[var(--shadow-sm)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border-subtle bg-bg-secondary/50">
        <span className="text-[12px] font-medium text-text-secondary">✦ Grammar</span>
        <span className="text-[12px] font-medium text-text-primary font-jp">{patternName}</span>
      </div>
      {/* Slot visualization */}
      <div className="px-4 py-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          {slots.map((slot, i) => (
            <div key={i} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-[12px] text-text-muted">+</span>}
              <span
                className={cn(
                  'inline-flex items-center px-2.5 py-1 rounded-md text-[13px] font-jp font-medium',
                  slotStyles[slot.type]
                )}
              >
                {slot.text || '\u00A0\u00A0\u00A0\u00A0'}
              </span>
            </div>
          ))}
        </div>
        {/* Example */}
        {example && (
          <div className="mt-3 p-2.5 bg-bg-secondary rounded-lg">
            <span className="text-[13px] font-jp text-text-primary block">{example}</span>
            {exampleTranslation && (
              <span className="text-[11px] text-text-muted block mt-1">{exampleTranslation}</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
