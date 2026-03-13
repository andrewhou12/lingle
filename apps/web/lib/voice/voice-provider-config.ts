export type TtsProviderType = 'elevenlabs' | 'rime' | 'cartesia'
export type VoiceProviderType = 'default' | 'hume' | 'livekit'

const TTS_STORAGE_KEY = 'lingle-tts-provider'
const VOICE_PROVIDER_STORAGE_KEY = 'lingle-voice-provider'

export function getTtsProvider(): TtsProviderType {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(TTS_STORAGE_KEY)
    if (stored === 'elevenlabs' || stored === 'rime' || stored === 'cartesia') return stored
  }
  return 'cartesia'
}

export function setTtsProvider(provider: TtsProviderType): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(TTS_STORAGE_KEY, provider)
  }
}

export function getVoiceProvider(): VoiceProviderType {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(VOICE_PROVIDER_STORAGE_KEY)
    if (stored === 'default' || stored === 'hume' || stored === 'livekit') return stored
  }
  return 'livekit'
}

export function setVoiceProvider(provider: VoiceProviderType): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(VOICE_PROVIDER_STORAGE_KEY, provider)
  }
}
