'use client'

import dynamic from 'next/dynamic'

const SessionView = dynamic(
  () => import('@/components/session/session-view').then((m) => m.SessionView),
  { ssr: false, loading: () => <div className="h-screen bg-bg" /> },
)

export default function VoiceSessionPage() {
  return <SessionView />
}
