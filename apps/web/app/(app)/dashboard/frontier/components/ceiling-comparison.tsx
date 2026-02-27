import { cn } from '@/lib/utils'

interface CeilingComparisonProps {
  comprehensionCeiling: string
  productionCeiling: string
}

const LEVEL_VALUES: Record<string, number> = {
  A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6,
}

export function CeilingComparison({ comprehensionCeiling, productionCeiling }: CeilingComparisonProps) {
  const compValue = LEVEL_VALUES[comprehensionCeiling] ?? 0
  const prodValue = LEVEL_VALUES[productionCeiling] ?? 0
  const maxValue = 6

  return (
    <div className="flex gap-5 items-end">
      <CeilingBar label="Comprehension" level={comprehensionCeiling} value={compValue} max={maxValue} />
      <CeilingBar label="Production" level={productionCeiling} value={prodValue} max={maxValue} />
    </div>
  )
}

function CeilingBar({ label, level, value, max }: { label: string; level: string; value: number; max: number }) {
  const heightPct = max > 0 ? (value / max) * 100 : 0

  return (
    <div className="flex flex-col items-center gap-1 flex-1">
      <span className="text-[11px] font-bold">{level}</span>
      <div className="w-full max-w-[60px] h-20 rounded-md bg-bg-active relative overflow-hidden">
        <div
          className={cn(
            'absolute bottom-0 left-0 right-0 rounded-md transition-[height] duration-300 ease-in-out',
            label === 'Comprehension' ? 'bg-accent-brand' : 'bg-[#8b5cf6]'
          )}
          style={{ height: `${heightPct}%` }}
        />
      </div>
      <span className="text-[11px] text-text-muted">{label}</span>
    </div>
  )
}
