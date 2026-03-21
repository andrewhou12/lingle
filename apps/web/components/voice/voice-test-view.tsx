'use client'

import { useCallback, useState, useEffect } from 'react'
import { useLiveKitVoice } from '@/hooks/use-livekit-voice'
import { VoiceSessionLayout } from './session-layout'
import { AIOrb } from './ai-orb'
import { DevToolsPanel } from './dev-tools-panel'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'

const TEST_PROMPTS: Record<string, string> = {
  Japanese:
    'You are a friendly Japanese conversation partner. Have a casual chat in Japanese. ' +
    'Keep your responses short and natural. Use simple Japanese appropriate for an intermediate learner. ' +
    'Start by greeting the user in Japanese.',
  English:
    'You are a friendly English conversation partner. Have a casual chat in English. ' +
    'Keep your responses short and natural. Start by greeting the user.',
}

const TTS_OPTIONS = [
  { value: '', label: 'Auto', description: 'Rime for English, Cartesia for others' },
  { value: 'cartesia', label: 'Cartesia', description: 'Sonic-3 — low latency, multilingual' },
  { value: 'rime', label: 'Rime', description: 'Arcana — natural English voices' },
]

const STT_OPTIONS = [
  { value: '', label: 'Auto', description: 'Deepgram Nova-3 (default)' },
  { value: 'deepgram', label: 'Deepgram', description: 'Nova-3 — fast finals' },
  { value: 'soniox', label: 'Soniox', description: 'stt-rt-preview — fast interims' },
]

export function VoiceTestView() {
  const [lang, setLang] = useState<'Japanese' | 'English'>('Japanese')
  const [joined, setJoined] = useState(false)
  const [ttsProvider, setTtsProvider] = useState('')
  const [sttProvider, setSttProvider] = useState('')
  const [voiceId, setVoiceId] = useState('')

  const voice = useLiveKitVoice({})

  // Load saved preferences from profile
  useEffect(() => {
    api.profileGet().then((p) => {
      if (p.ttsProvider) setTtsProvider(p.ttsProvider)
      if (p.sttProvider) setSttProvider(p.sttProvider)
      if (p.voiceId) setVoiceId(p.voiceId)
    }).catch(() => {})
  }, [])

  const handleJoin = useCallback(async () => {
    try { new AudioContext().resume() } catch {}
    new Audio().play().catch(() => {})
    setJoined(true)
    await voice.startDirect({
      sessionMode: 'conversation',
      basePrompt: TEST_PROMPTS[lang],
      targetLanguage: lang,
      ...(ttsProvider ? { ttsProvider } : {}),
      ...(sttProvider ? { sttProvider } : {}),
      ...(voiceId ? { voiceId } : {}),
    })
  }, [voice, lang, ttsProvider, sttProvider, voiceId])

  const handleEnd = useCallback(async () => {
    await voice.endSession()
    setJoined(false)
  }, [voice])

  // Pre-join screen
  if (!joined) {
    return (
      <div className="fixed inset-0 bg-bg-pure flex flex-col items-center justify-center gap-8 z-50 overflow-y-auto py-8">
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

        {/* Provider options */}
        <div className="w-[320px] flex flex-col gap-3">
          <div>
            <span className="text-[11px] font-medium text-text-muted block mb-1.5">TTS Provider</span>
            <div className="flex gap-1.5">
              {TTS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setTtsProvider(opt.value)}
                  className={cn(
                    'flex-1 px-2 py-1.5 rounded-lg text-[12px] font-medium cursor-pointer border transition-colors text-center',
                    ttsProvider === opt.value
                      ? 'bg-accent-brand/10 border-accent-brand/30 text-text-primary'
                      : 'bg-bg-pure border-border text-text-muted hover:border-border-strong',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="text-[11px] font-medium text-text-muted block mb-1.5">STT Provider</span>
            <div className="flex gap-1.5">
              {STT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setSttProvider(opt.value)}
                  className={cn(
                    'flex-1 px-2 py-1.5 rounded-lg text-[12px] font-medium cursor-pointer border transition-colors text-center',
                    sttProvider === opt.value
                      ? 'bg-accent-brand/10 border-accent-brand/30 text-text-primary'
                      : 'bg-bg-pure border-border text-text-muted hover:border-border-strong',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="text-[11px] font-medium text-text-muted block mb-1.5">Voice ID (optional)</span>
            <input
              type="text"
              value={voiceId}
              onChange={(e) => setVoiceId(e.target.value)}
              placeholder={ttsProvider === 'rime' ? 'e.g. yukiko, luna' : 'Leave blank for default'}
              className="w-full px-3 py-1.5 rounded-lg text-[12px] border border-border bg-bg-pure text-text-primary placeholder:text-text-muted/50 outline-none focus:border-accent-brand/50"
            />
          </div>
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
