'use client'

interface SuggestionChipsProps {
  suggestions: string[]
  onSelect: (text: string) => void
}

export function SuggestionChips({ suggestions, onSelect }: SuggestionChipsProps) {
  if (suggestions.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1.5">
      {suggestions.map((text) => (
        <button
          key={text}
          onClick={() => onSelect(text)}
          className="inline-flex items-center px-3 py-1.5 bg-bg-pure border border-border rounded-full text-[12px] text-text-secondary cursor-pointer transition-colors hover:bg-bg-hover hover:text-text-primary hover:border-border-strong"
        >
          {text}
        </button>
      ))}
    </div>
  )
}
