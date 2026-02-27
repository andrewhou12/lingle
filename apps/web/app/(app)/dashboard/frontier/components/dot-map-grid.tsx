import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { FrontierItem } from '@linguist/shared/types'
import { MASTERY_ORDER, MASTERY_LABELS } from '@/constants/mastery'
import { cn } from '@/lib/utils'

const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
const DOT_CAP = 50

export function DotMapGrid({ items }: { items: FrontierItem[] }) {
  const cells = new Map<string, FrontierItem[]>()
  for (const item of items) {
    const key = `${item.cefrLevel}|${item.masteryState}`
    const arr = cells.get(key)
    if (arr) { arr.push(item) } else { cells.set(key, [item]) }
  }

  return (
    <div className="overflow-x-auto">
      <div
        className="grid gap-px min-w-[400px]"
        style={{
          gridTemplateColumns: `80px repeat(${CEFR_LEVELS.length}, 1fr)`,
          gridTemplateRows: `auto repeat(${MASTERY_ORDER.length}, auto)`,
        }}
      >
        <div />
        {CEFR_LEVELS.map((level) => (
          <div key={level} className="flex justify-center py-1">
            <span className="text-[11px] font-bold text-text-muted">{level}</span>
          </div>
        ))}

        {MASTERY_ORDER.map((state) => (
          <MasteryRow key={state} state={state} cells={cells} />
        ))}
      </div>
    </div>
  )
}

function MasteryRow({ state, cells }: { state: string; cells: Map<string, FrontierItem[]> }) {
  return (
    <>
      <div className="flex items-center pr-2 py-1">
        <span className="text-[11px] text-text-muted whitespace-nowrap">{MASTERY_LABELS[state]}</span>
      </div>
      {CEFR_LEVELS.map((level) => {
        const key = `${level}|${state}`
        const cellItems = cells.get(key) ?? []
        return <DotCell key={key} items={cellItems} />
      })}
    </>
  )
}

function DotCell({ items }: { items: FrontierItem[] }) {
  const visible = items.slice(0, DOT_CAP)
  const overflow = items.length - DOT_CAP

  return (
    <div
      className={cn(
        'flex flex-wrap gap-1 p-1 items-start min-h-[24px] rounded-sm',
        items.length > 0 && 'bg-bg-secondary'
      )}
    >
      {visible.map((item) => (
        <Tooltip key={`${item.itemType}-${item.id}`}>
          <TooltipTrigger asChild>
            <div
              className={cn(
                'w-1.5 h-1.5 rounded-full shrink-0',
                item.itemType === 'lexical' ? 'bg-accent-brand' : 'bg-[#8b5cf6]'
              )}
            />
          </TooltipTrigger>
          <TooltipContent>{item.surfaceForm ?? item.patternId ?? `#${item.id}`}</TooltipContent>
        </Tooltip>
      ))}
      {overflow > 0 && <span className="text-[11px] text-text-muted">+{overflow}</span>}
    </div>
  )
}
