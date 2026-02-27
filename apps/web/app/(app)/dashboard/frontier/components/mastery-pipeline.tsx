import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { MASTERY_ORDER, MASTERY_LABELS, MASTERY_HEX } from '@/constants/mastery'

interface MasteryPipelineProps {
  distribution: Record<string, number>
}

export function MasteryPipeline({ distribution }: MasteryPipelineProps) {
  const total = Object.values(distribution).reduce((sum, n) => sum + n, 0)
  if (total === 0) {
    return <span className="text-[13px] text-text-muted">No items yet</span>
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-7 rounded-md overflow-hidden w-full">
        {MASTERY_ORDER.map((state) => {
          const count = distribution[state] ?? 0
          if (count === 0) return null
          const widthPct = (count / total) * 100
          const showLabel = widthPct > 8

          return (
            <Tooltip key={state}>
              <TooltipTrigger asChild>
                <div
                  className="flex items-center justify-center cursor-default transition-[width] duration-300 ease-in-out"
                  style={{
                    width: `${widthPct}%`,
                    backgroundColor: MASTERY_HEX[state],
                    minWidth: count > 0 ? 4 : 0,
                  }}
                >
                  {showLabel && (
                    <span className="text-[11px] text-white font-semibold">
                      {count}
                    </span>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent>{`${MASTERY_LABELS[state]}: ${count}`}</TooltipContent>
            </Tooltip>
          )
        })}
      </div>

      <div className="flex gap-3 flex-wrap">
        {MASTERY_ORDER.map((state) => {
          const count = distribution[state] ?? 0
          if (count === 0) return null
          return (
            <div key={state} className="flex items-center gap-1">
              <div
                className="w-2 h-2 rounded-[2px] shrink-0"
                style={{ backgroundColor: MASTERY_HEX[state] }}
              />
              <span className="text-[11px] text-text-muted">{MASTERY_LABELS[state]}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
