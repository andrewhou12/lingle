/**
 * Type-only module — the full useVoiceConversation hook was removed during cleanup.
 * These types are still used by voice components and use-livekit-voice.
 */

import type { Room } from 'livekit-client'

export type VoiceState = 'IDLE' | 'LISTENING' | 'THINKING' | 'SPEAKING' | 'INTERRUPTED'

export interface TranscriptLine {
  role: 'user' | 'assistant'
  text: string
  isFinal: boolean
  timestamp: number
}

export interface VoiceAnalysisResult {
  corrections: unknown[]
  vocabularyCards: unknown[]
  grammarNotes: unknown[]
  naturalnessFeedback: unknown[]
  registerMismatches: unknown[]
  l1Interference: unknown[]
  alternativeExpressions: unknown[]
  conversationalTips: unknown[]
  takeaways: unknown[]
  sectionTracking?: SectionTracking | null
}

export interface SectionTracking {
  currentSectionId: string
  completedSectionIds: string[]
}

export type InputMode = 'ptt' | 'vad'

type SessionPlan = Record<string, unknown> | null

export interface UseVoiceConversationReturn {
  room?: Room | null
  voiceState: VoiceState
  transcript: TranscriptLine[]
  partialText: string
  startSession: () => Promise<void>
  endSession: () => Promise<void>
  toggleMute: () => void
  isMuted: boolean
  duration: number
  speed: number
  setSpeed: (speed: number) => void
  sendTextMessage: (text: string) => void
  sendSilentMessage: (text: string) => void
  isActive: boolean
  error: string | null
  sessionId: string | null
  sessionPlan: SessionPlan | null
  messages: never[]
  isStreaming: boolean
  startNewSession: (prompt: string, mode: string) => Promise<void>
  startWithExistingPlan: (sessionId: string, plan: SessionPlan, prompt: string, steeringNotes?: string[]) => Promise<void>
  startDirect: (metadata: Record<string, unknown>) => Promise<void>
  startTalking: () => void
  stopTalking: () => void
  cancelTalking: () => void
  isTalking: boolean
  spokenSentences: string[]
  currentSentence: string | null
  currentProgress: number
  ttsPlaying: boolean
  analysisResults: Record<number, VoiceAnalysisResult>
  retryLast: () => void
  sectionTracking: SectionTracking | null
  isAnalyzing: boolean
  inputMode: InputMode
}
