export type VoiceProviderType = 'soniox' | 'hume'
export type TtsProviderType = 'elevenlabs' | 'rime'

const VOICE_STORAGE_KEY = 'lingle-voice-provider'
const TTS_STORAGE_KEY = 'lingle-tts-provider'

export function getDefaultVoiceProvider(): VoiceProviderType {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(VOICE_STORAGE_KEY)
    if (stored === 'hume' || stored === 'soniox') return stored
  }
  return process.env.NEXT_PUBLIC_VOICE_PROVIDER === 'hume' ? 'hume' : 'soniox'
}

export function setVoiceProvider(provider: VoiceProviderType): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(VOICE_STORAGE_KEY, provider)
  }
}

export function getTtsProvider(): TtsProviderType {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(TTS_STORAGE_KEY)
    if (stored === 'elevenlabs' || stored === 'rime') return stored
  }
  return 'rime'
}

export function setTtsProvider(provider: TtsProviderType): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(TTS_STORAGE_KEY, provider)
  }
}
