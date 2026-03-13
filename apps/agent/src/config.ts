/**
 * Voice/language configuration for the LiveKit agent worker.
 */

/** Default Cartesia voice IDs per language (from environment variables) */
export function getVoiceId(languageCode: string): string {
  const envKey = `CARTESIA_VOICE_${languageCode.toUpperCase()}`
  return process.env[envKey] || process.env.CARTESIA_VOICE_JA || ''
}

/** Map language IDs to Deepgram STT language codes */
export function getDeepgramLanguage(languageId: string): string {
  const map: Record<string, string> = {
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
