'use client'

import dynamic from 'next/dynamic'

const VoiceTestView = dynamic(
  () => import('@/components/voice/voice-test-view').then((m) => m.VoiceTestView),
  { ssr: false, loading: () => <div className="h-screen bg-bg" /> },
)

export default function VoiceTestPage() {
  return <VoiceTestView />
}
