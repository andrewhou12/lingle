'use client'

import { useCallback, useState } from 'react'
import { useLiveKitVoice } from '@/hooks/use-livekit-voice'
import { VoiceSessionLayout } from './session-layout'
import { AIOrb } from './ai-orb'
import { DevToolsPanel } from './dev-tools-panel'
import { cn } from '@/lib/utils'

const TEST_PROMPTS: Record<string, string> = {
  Japanese:
    'You are a friendly Japanese conversation partner. Have a casual chat in Japanese. ' +
    'Keep your responses short and natural. Use simple Japanese appropriate for an intermediate learner. ' +
    'Start by greeting the user in Japanese.',
  English:
    'You are a friendly English conversation partner. Have a casual chat in English. ' +
    'Keep your responses short and natural. Start by greeting the user.',
}

export function VoiceTestView() {
  const [lang, setLang] = useState<'Japanese' | 'English'>('Japanese')
  const [joined, setJoined] = useState(false)

  const voice = useLiveKitVoice({})

  const handleJoin = useCallback(async () => {
    try { new AudioContext().resume() } catch {}
    new Audio().play().catch(() => {})
    setJoined(true)
    await voice.startDirect({
      sessionMode: 'conversation',
      basePrompt: TEST_PROMPTS[lang],
      targetLanguage: lang,
    })
  }, [voice, lang])

  const handleEnd = useCallback(async () => {
    await voice.endSession()
    setJoined(false)
  }, [voice])

  // Pre-join screen
  if (!joined) {
    return (
      <div className="fixed inset-0 bg-bg-pure flex flex-col items-center justify-center gap-8 z-50">
        <AIOrb state="idle" size={120} />
        <div className="text-center">
          <div className="text-[16px] font-semibold text-text-primary tracking-tight mb-1">Voice Test</div>
          <div className="text-[13px] text-text-muted">Quick conversation practice</div>
        </div>

        {/* Language toggle */}
        <div className="flex items-center rounded-full border border-border bg-bg-pure p-0.5">
          {(['Japanese', 'English'] as const).map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              className={cn(
                'px-4 py-1.5 rounded-full text-[13px] font-medium transition-colors cursor-pointer border-none',
                lang === l
                  ? 'bg-accent-brand text-white'
                  : 'bg-transparent text-text-muted hover:text-text-primary',
              )}
            >
              {l === 'Japanese' ? 'Japanese' : 'English'}
            </button>
          ))}
        </div>

        <button
          onClick={handleJoin}
          className="px-8 py-3 rounded-xl bg-green/10 text-green text-[14px] font-medium cursor-pointer border border-green/20 hover:bg-green/20 transition-colors"
        >
          Start conversation
        </button>
      </div>
    )
  }

  // Active session — use shared layout
  const devTools = (
    <DevToolsPanel
      sessionId={voice.sessionId}
      voiceState={voice.voiceState}
      duration={voice.duration}
      isActive={voice.isActive}
      transcript={voice.transcript}
    />
  )

  return (
    <VoiceSessionLayout
      voice={voice}
      onEnd={handleEnd}
      isConnected={joined && voice.isActive}
      sessionTitle={`Voice Test · ${lang}`}
      devToolsSlot={devTools}
    />
  )
}
