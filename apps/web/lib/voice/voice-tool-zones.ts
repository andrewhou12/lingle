export type VoiceToolZone = 'toast' | 'hidden' | 'suppressed'

const VOICE_TOOL_ZONE_MAP: Record<string, VoiceToolZone> = {
  suggestActions: 'suppressed',
  displayChoices: 'suppressed',
  showCorrection: 'toast',
  showVocabularyCard: 'toast',
  showGrammarNote: 'toast',
  updateSessionPlan: 'hidden',
}

export function getVoiceToolZone(toolName: string): VoiceToolZone {
  return VOICE_TOOL_ZONE_MAP[toolName] ?? 'hidden'
}
