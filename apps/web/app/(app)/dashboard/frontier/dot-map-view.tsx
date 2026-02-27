import type { FrontierData } from '@linguist/shared/types'
import { DotMapGrid } from './components/dot-map-grid'
import { DotMapLegend } from './components/dot-map-legend'

export function DotMapView({ data }: { data: FrontierData }) {
  const { items } = data

  if (items.length === 0) {
    return (
      <span className="text-[13px] text-text-muted">
        No items in your knowledge base yet. Complete onboarding or add items to see the map.
      </span>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-between items-center">
        <span className="text-[13px] font-bold text-text-muted">
          Knowledge Map
        </span>
        <DotMapLegend />
      </div>
      <DotMapGrid items={items} />
      <span className="text-[11px] text-text-muted">
        Each dot is one item. Columns = CEFR level. Rows = mastery state.
      </span>
    </div>
  )
}
