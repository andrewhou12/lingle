import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/types'
import type { ExpandedLearnerProfile, FsrsState } from '@shared/types'
import { getDb } from '../db'
import { getCurrentUserId } from '../auth-state'
import { recalculateProfile, type ProfileItemInput } from '@core/profile/calculator'
import { createLogger } from '../logger'

const log = createLogger('ipc:profile')

export function registerProfileHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.PROFILE_GET,
    async (): Promise<ExpandedLearnerProfile | null> => {
      log.info('profile:get started')
      const db = getDb()
      const userId = getCurrentUserId()
      const profile = await db.learnerProfile.findUnique({ where: { userId } })
      if (!profile) {
        log.warn('profile:get - no profile found')
        return null
      }

      log.info('profile:get completed', { level: profile.computedLevel, streak: profile.currentStreak })
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
  )

  ipcMain.handle(
    IPC_CHANNELS.PROFILE_UPDATE,
    async (
      _event,
      updates: Partial<{
        dailyNewItemLimit: number
        targetRetention: number
        targetLanguage: string
        nativeLanguage: string
      }>
    ): Promise<ExpandedLearnerProfile> => {
      log.info('profile:update', { fields: Object.keys(updates) })
      const db = getDb()
      const userId = getCurrentUserId()
      const profile = await db.learnerProfile.update({
        where: { userId },
        data: updates,
      })

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
  )

  ipcMain.handle(IPC_CHANNELS.PROFILE_RECALCULATE, async (): Promise<ExpandedLearnerProfile> => {
    log.info('profile:recalculate started')
    const elapsed = log.timer()
    const db = getDb()
    const userId = getCurrentUserId()

    const lexicalItems = await db.lexicalItem.findMany({
      where: { userId, masteryState: { not: 'unseen' } },
    })
    const grammarItems = await db.grammarItem.findMany({
      where: { userId, masteryState: { not: 'unseen' } },
    })

    const items: ProfileItemInput[] = [
      ...lexicalItems.map((item) => ({
        id: item.id,
        itemType: 'lexical' as const,
        cefrLevel: item.cefrLevel,
        masteryState: item.masteryState,
        recognitionFsrs: item.recognitionFsrs as unknown as FsrsState,
        productionFsrs: item.productionFsrs as unknown as FsrsState,
        writingProductions: item.writingProductions,
        readingExposures: item.readingExposures,
        listeningExposures: item.listeningExposures,
        speakingProductions: item.speakingProductions,
      })),
      ...grammarItems.map((item) => ({
        id: item.id,
        itemType: 'grammar' as const,
        cefrLevel: item.cefrLevel,
        masteryState: item.masteryState,
        recognitionFsrs: item.recognitionFsrs as unknown as FsrsState,
        productionFsrs: item.productionFsrs as unknown as FsrsState,
        writingProductions: item.writingProductions,
        readingExposures: item.readingExposures,
        listeningExposures: item.listeningExposures,
        speakingProductions: item.speakingProductions,
      })),
    ]

    const profile = await db.learnerProfile.findUniqueOrThrow({ where: { userId } })
    const totalReviewEvents = await db.reviewEvent.count({ where: { userId } })

    const update = recalculateProfile({
      items,
      totalReviewEvents,
      lastActiveDate: new Date().toISOString(),
      previousStreak: profile.currentStreak,
      previousLongestStreak: profile.longestStreak,
      previousLastActiveDate: profile.lastActiveDate?.toISOString() ?? null,
    })

    const updated = await db.learnerProfile.update({
      where: { userId },
      data: {
        ...update,
        totalReviewEvents,
        lastActiveDate: new Date(),
      },
    })

    log.info('profile:recalculate completed', {
      computedLevel: update.computedLevel,
      comprehensionCeiling: update.comprehensionCeiling,
      productionCeiling: update.productionCeiling,
      streak: update.currentStreak,
      elapsedMs: elapsed(),
    })

    return {
      id: updated.id,
      targetLanguage: updated.targetLanguage,
      nativeLanguage: updated.nativeLanguage,
      dailyNewItemLimit: updated.dailyNewItemLimit,
      targetRetention: updated.targetRetention,
      computedLevel: updated.computedLevel,
      comprehensionCeiling: updated.comprehensionCeiling,
      productionCeiling: updated.productionCeiling,
      readingLevel: updated.readingLevel,
      listeningLevel: updated.listeningLevel,
      speakingLevel: updated.speakingLevel,
      writingLevel: updated.writingLevel,
      totalSessions: updated.totalSessions,
      totalReviewEvents: updated.totalReviewEvents,
      currentStreak: updated.currentStreak,
      longestStreak: updated.longestStreak,
      lastActiveDate: updated.lastActiveDate?.toISOString() ?? null,
      errorPatternSummary: updated.errorPatternSummary as Record<string, unknown>,
      avoidancePatternSummary: updated.avoidancePatternSummary as Record<string, unknown>,
    }
  })
}
