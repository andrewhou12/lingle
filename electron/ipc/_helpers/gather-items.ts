import type { ItemType, ExpandedLearnerProfile } from '@shared/types'
import type { BubbleItemInput } from '@core/curriculum/bubble'
import { getDb } from '../../db'
import { getCurrentUserId } from '../../auth-state'

export async function gatherBubbleItems(): Promise<BubbleItemInput[]> {
  const db = getDb()
  const userId = getCurrentUserId()

  const lexicalItems = await db.lexicalItem.findMany({ where: { userId } })
  const grammarItems = await db.grammarItem.findMany({ where: { userId } })

  return [
    ...lexicalItems.map((item) => ({
      id: item.id,
      itemType: 'lexical' as ItemType,
      surfaceForm: item.surfaceForm,
      cefrLevel: item.cefrLevel,
      masteryState: item.masteryState,
      productionWeight: item.productionWeight,
    })),
    ...grammarItems.map((item) => ({
      id: item.id,
      itemType: 'grammar' as ItemType,
      patternId: item.patternId,
      cefrLevel: item.cefrLevel,
      masteryState: item.masteryState,
      productionWeight: item.productionWeight,
    })),
  ]
}

export function toExpandedProfile(profile: {
  id: number
  targetLanguage: string
  nativeLanguage: string
  dailyNewItemLimit: number
  targetRetention: number
  computedLevel: string
  comprehensionCeiling: string
  productionCeiling: string
  readingLevel: number
  listeningLevel: number
  speakingLevel: number
  writingLevel: number
  totalSessions: number
  totalReviewEvents: number
  currentStreak: number
  longestStreak: number
  lastActiveDate: Date | null
  errorPatternSummary: unknown
  avoidancePatternSummary: unknown
}): ExpandedLearnerProfile {
  return {
    id: profile.id,
    targetLanguage: profile.targetLanguage,
    nativeLanguage: profile.nativeLanguage,
    dailyNewItemLimit: profile.dailyNewItemLimit,
    targetRetention: profile.targetRetention,
    computedLevel: profile.computedLevel,
    comprehensionCeiling: profile.comprehensionCeiling,
    productionCeiling: profile.productionCeiling,
    readingLevel: profile.readingLevel,
    listeningLevel: profile.listeningLevel,
    speakingLevel: profile.speakingLevel,
    writingLevel: profile.writingLevel,
    totalSessions: profile.totalSessions,
    totalReviewEvents: profile.totalReviewEvents,
    currentStreak: profile.currentStreak,
    longestStreak: profile.longestStreak,
    lastActiveDate: profile.lastActiveDate?.toISOString() ?? null,
    errorPatternSummary: profile.errorPatternSummary as Record<string, unknown>,
    avoidancePatternSummary: profile.avoidancePatternSummary as Record<string, unknown>,
  }
}
