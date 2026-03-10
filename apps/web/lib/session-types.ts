// Shared types for both chat and voice session modes

export interface TranscriptLine {
  role: 'user' | 'assistant'
  text: string
  isFinal: boolean
  timestamp: number
}

export interface TurnAnalysisResult {
  corrections: Array<{
    original: string
    corrected: string
    explanation: string
    grammarPoint?: string
  }>
  vocabularyCards: Array<{
    word: string
    reading?: string
    meaning: string
    partOfSpeech?: string
    exampleSentence?: string
    notes?: string
  }>
  grammarNotes: Array<{
    pattern: string
    meaning: string
    formation: string
    examples: Array<{ japanese: string; english: string }>
    level?: string
  }>
  naturalnessFeedback: Array<{
    original: string
    suggestion: string
    explanation: string
  }>
  sectionTracking?: {
    currentSectionId: string
    completedSectionIds: string[]
  }
}

export interface SessionEndData {
  duration: number
  transcript: TranscriptLine[]
  analysisResults: Record<number, TurnAnalysisResult>
}

export type ViewState =
  | { type: 'prompt' }
  | { type: 'loading'; prompt: string }
  | { type: 'begin'; prompt: string; sessionId: string; plan: import('@/lib/session-plan').SessionPlan }
  | { type: 'active'; prompt: string; sessionId: string; plan: import('@/lib/session-plan').SessionPlan; steeringNotes: string[] }
  | { type: 'debrief'; data: SessionEndData }
