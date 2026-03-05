export type ToolZone = 'chips' | 'inline' | 'panel' | 'hidden'

const TOOL_ZONE_MAP: Record<string, ToolZone> = {
  suggestActions: 'chips',
  displayChoices: 'inline',
  showCorrection: 'panel',
  showVocabularyCard: 'panel',
  showGrammarNote: 'panel',
  updateSessionPlan: 'hidden',
}

export function getToolZone(toolName: string): ToolZone {
  return TOOL_ZONE_MAP[toolName] ?? 'inline'
}
