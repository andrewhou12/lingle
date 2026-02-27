'use client'

interface EscapeHatchProps {
  onUse: () => void
  visible?: boolean
}

export function EscapeHatch({ onUse, visible = true }: EscapeHatchProps) {
  if (!visible) return null

  return (
    <button
      onClick={onUse}
      className="flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed border-border text-[13px] text-text-muted bg-transparent cursor-pointer transition-colors hover:border-border-strong hover:text-text-secondary hover:bg-bg-hover/50 w-full"
    >
      <span className="text-[16px]">💬</span>
      <span>Stuck? Say it in English</span>
    </button>
  )
}
