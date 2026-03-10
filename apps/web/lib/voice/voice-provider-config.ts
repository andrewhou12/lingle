export type TtsProviderType = 'elevenlabs' | 'rime' | 'cartesia'

const TTS_STORAGE_KEY = 'lingle-tts-provider'

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
