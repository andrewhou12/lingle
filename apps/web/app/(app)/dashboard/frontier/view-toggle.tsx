import { cn } from '@/lib/utils'

export type FrontierView = 'levels' | 'map' | 'skills'

interface ViewToggleProps {
  value: FrontierView
  onChange: (value: FrontierView) => void
}

const OPTIONS: { value: FrontierView; label: string }[] = [
  { value: 'levels', label: 'Levels' },
  { value: 'map', label: 'Map' },
  { value: 'skills', label: 'Skills' },
]

export function ViewToggle({ value, onChange }: ViewToggleProps) {
  return (
    <div className="inline-flex rounded-md bg-bg-active p-0.5 gap-0.5">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            'px-3 py-1 text-[13px] font-medium rounded-[5px] transition-[background,color] duration-100 cursor-pointer border-none',
            value === option.value
              ? 'bg-bg text-text-primary shadow-sm'
              : 'bg-transparent text-text-secondary hover:text-text-primary'
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
