'use client'

interface SessionToastProps {
  message: string | null
}

export function SessionToast({ message }: SessionToastProps) {
  if (!message) return null

  return (
    <div
      className="fixed top-[62px] left-1/2 -translate-x-1/2 px-3.5 py-1.5 bg-text-primary text-bg-pure rounded-lg text-[12px] font-normal z-[9999] whitespace-nowrap pointer-events-none"
      style={{ animation: 'session-fade-up 0.15s ease both' }}
    >
      {message}
    </div>
  )
}
