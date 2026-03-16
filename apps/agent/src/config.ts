/**
 * Voice/language configuration for the LiveKit agent worker.
 */

/** Supported TTS providers for the LiveKit agent pipeline */
export type AgentTtsProvider = 'cartesia' | 'rime'

/** Default Cartesia voice IDs per language (from environment variables) */
export function getCartesiaVoiceId(languageCode: string): string {
  const envKey = `CARTESIA_VOICE_${languageCode.toUpperCase()}`
  return process.env[envKey] || process.env.CARTESIA_VOICE_JA || ''
}

/** Default Rime speaker ID per language (from environment variables) */
export function getRimeVoiceId(languageCode: string): string {
  const envKey = `RIME_VOICE_${languageCode.toUpperCase()}`
  return process.env[envKey] || process.env.RIME_VOICE_ID || 'luna'
}

/** Map language IDs to Deepgram STT language codes */
export function getDeepgramLanguage(languageId: string): string {
  const map: Record<string, string> = {
    English: 'en',
    Japanese: 'ja',
    Korean: 'ko',
    'Mandarin Chinese': 'zh',
    Spanish: 'es',
    French: 'fr',
    German: 'de',
    Italian: 'it',
    Portuguese: 'pt',
  }
  return map[languageId] || 'ja'
}

/** Map language IDs to Cartesia TTS language codes */
export function getCartesiaLanguage(languageId: string): string {
  const map: Record<string, string> = {
    English: 'en',
    Japanese: 'ja',
    Korean: 'ko',
    'Mandarin Chinese': 'zh',
    Spanish: 'es',
    French: 'fr',
    German: 'de',
    Italian: 'it',
    Portuguese: 'pt',
  }
  return map[languageId] || 'ja'
}

/** Map language IDs to Rime TTS language codes */
export function getRimeLanguage(languageId: string): string {
  const map: Record<string, string> = {
    English: 'eng',
    Japanese: 'jpn',
    Korean: 'kor',
    'Mandarin Chinese': 'cmn',
    Spanish: 'spa',
    French: 'fra',
    German: 'ger',
    Italian: 'ita',
    Portuguese: 'por',
  }
  return map[languageId] || 'jpn'
}

/** Resolve which TTS provider to use: metadata > env > default (cartesia) */
export function resolveAgentTtsProvider(metadata: AgentMetadata): AgentTtsProvider {
  if (metadata.ttsProvider === 'rime' || metadata.ttsProvider === 'cartesia') {
    return metadata.ttsProvider
  }
  const envProvider = process.env.AGENT_TTS_PROVIDER
  if (envProvider === 'rime' || envProvider === 'cartesia') {
    return envProvider
  }
  return 'cartesia'
}

/** Agent metadata passed from the web app via LiveKit job metadata */
export interface AgentMetadata {
  sessionId: string
  userId: string
  targetLanguage: string
  nativeLanguage: string
  voiceId?: string
  languageCode?: string
  sessionPlan?: unknown
  sessionMode?: string
  basePrompt?: string
  analyzeEndpoint?: string
  ttsProvider?: AgentTtsProvider
}

export function parseAgentMetadata(raw: string | undefined): AgentMetadata {
  try {
    return JSON.parse(raw || '{}') as AgentMetadata
  } catch {
    return {
      sessionId: '',
      userId: '',
      targetLanguage: 'Japanese',
      nativeLanguage: 'English',
    }
  }
}
