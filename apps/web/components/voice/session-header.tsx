'use client'

interface SessionHeaderProps {
  isLessonMode: boolean
  lessonTitle?: string
  elapsed: number
  logoText?: string
}

function formatTime(s: number): string {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export function SessionHeader({
  isLessonMode,
  lessonTitle,
  elapsed,
  logoText = 'Lingle',
}: SessionHeaderProps) {
  return (
    <header className="fixed top-0 left-0 right-0 h-12 z-[500] flex items-center justify-between px-6 bg-bg-pure border-b border-border">
      <span className="text-[14px] font-semibold tracking-tight text-text-primary font-serif">
        {logoText}
      </span>

      {isLessonMode && lessonTitle && (
        <div
          className="flex items-center gap-1.5 text-[12px] text-text-muted"
          style={{ animation: 'session-fade-up 0.2s ease both' }}
        >
          <span>Conversation</span>
          <span className="text-border">›</span>
          <span className="text-text-secondary">{lessonTitle}</span>
        </div>
      )}

      <div className="flex items-center gap-1.5 text-[12px] text-text-muted font-mono">
        <span
          className="w-[5px] h-[5px] rounded-full bg-green inline-block"
          style={{ animation: 'session-ticker 1.5s step-end infinite' }}
        />
        {formatTime(elapsed)}
      </div>
    </header>
  )
}
