import { Suspense } from 'react'
import { VoiceConversationView } from '@/components/voice/voice-conversation-view'

export default function VoiceConversationPage() {
  return (
    <Suspense fallback={<div className="h-screen bg-bg" />}>
      <VoiceConversationView />
    </Suspense>
  )
}
