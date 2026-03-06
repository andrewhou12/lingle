export interface ConversationToolCall {
  toolName: string
  args: Record<string, unknown>
}

export interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  toolCalls?: ConversationToolCall[]
}

export interface LearnerProfile {
  id: number
  targetLanguage: string
  nativeLanguage: string
  dailyGoalMinutes: number
  difficultyLevel: number
  totalSessions: number
  currentStreak: number
  lastActiveDate: string | null
}

export interface AuthUser {
  id: string
  email: string | null
  name: string | null
  avatarUrl: string | null
  onboardingCompleted: boolean
}

export type PlanType = 'free' | 'pro'

export interface UsageInfo {
  usedSeconds: number
  limitSeconds: number
  remainingSeconds: number
  isLimitReached: boolean
  plan: PlanType
}

export interface SubscriptionInfo {
  plan: PlanType
  status: string
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
}
