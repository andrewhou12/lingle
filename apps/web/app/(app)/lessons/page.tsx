import {
  PencilSquareIcon,
  LanguageIcon,
  ChartBarIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline'

const FEATURES = [
  {
    icon: <PencilSquareIcon className="w-4 h-4" />,
    label: 'Grammar lessons',
    description: 'Step-by-step explanations with interactive exercises',
  },
  {
    icon: <LanguageIcon className="w-4 h-4" />,
    label: 'Vocabulary drills',
    description: 'Targeted practice based on your knowledge gaps',
  },
  {
    icon: <ChartBarIcon className="w-4 h-4" />,
    label: 'Progress tracking',
    description: 'See your mastery level for each grammar point',
  },
  {
    icon: <ArrowPathIcon className="w-4 h-4" />,
    label: 'Spaced repetition',
    description: 'Review schedule optimized for long-term retention',
  },
]

export default function LessonsPage() {
  return (
    <div className="max-w-[640px] mx-auto pt-8 flex flex-col items-center">
      <div className="w-14 h-14 rounded-xl bg-bg-secondary border border-border flex items-center justify-center mb-5">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted">
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
        </svg>
      </div>

      <h1 className="text-[24px] font-bold text-text-primary tracking-[-0.03em] mb-2">
        Lessons
      </h1>
      <p className="text-[14px] text-text-secondary text-center max-w-[380px] leading-[1.6] mb-6">
        Structured lessons with guided grammar explanations, vocabulary drills, and practice exercises are coming soon.
      </p>

      <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-bg-secondary border border-border">
        <div className="w-1.5 h-1.5 rounded-full bg-accent-warm" />
        <span className="text-[13px] text-text-muted font-medium">Under construction</span>
      </div>

      <div className="mt-10 w-full max-w-[440px] grid grid-cols-2 gap-3">
        {FEATURES.map((feature) => (
          <div
            key={feature.label}
            className="p-4 rounded-xl bg-bg-pure border border-border-subtle shadow-[0_1px_2px_rgba(0,0,0,.04)]"
          >
            <div className="w-7 h-7 rounded-md bg-bg-secondary flex items-center justify-center mb-3 text-text-secondary">
              {feature.icon}
            </div>
            <div className="text-[13px] font-medium text-text-primary mb-0.5">
              {feature.label}
            </div>
            <div className="text-[12px] text-text-muted leading-[1.5]">
              {feature.description}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
