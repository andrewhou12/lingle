'use client'

import { Check, X, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface Annotation {
  type: 'target_hit' | 'error' | 'avoidance'
  label: string
}

interface AnnotatedMessageProps {
  children: React.ReactNode
  annotations: Annotation[]
}

const ANNOTATION_CONFIG: Record<Annotation['type'], { className: string; icon: typeof Check }> = {
  target_hit: { className: 'bg-green-500/[.08] text-green-600', icon: Check },
  error: { className: 'bg-accent-warm/[.07] text-accent-warm', icon: X },
  avoidance: { className: 'bg-amber-500/[.08] text-amber-500', icon: AlertTriangle },
}

export function AnnotatedMessage({ children, annotations }: AnnotatedMessageProps) {
  return (
    <div>
      {children}
      {annotations.length > 0 && (
        <div className="flex gap-1.5 mt-1 flex-wrap">
          {annotations.map((ann, i) => {
            const config = ANNOTATION_CONFIG[ann.type]
            const Icon = config.icon
            return (
              <span
                key={i}
                className={cn(
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium',
                  config.className
                )}
              >
                <Icon size={10} />
                {ann.label}
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}
