export function DotMapLegend() {
  return (
    <div className="flex gap-4 items-center">
      <div className="flex items-center gap-1">
        <div className="w-2 h-2 rounded-full bg-accent-brand" />
        <span className="text-[11px] text-text-muted">Vocabulary</span>
      </div>
      <div className="flex items-center gap-1">
        <div className="w-2 h-2 rounded-full bg-[#8b5cf6]" />
        <span className="text-[11px] text-text-muted">Grammar</span>
      </div>
    </div>
  )
}
