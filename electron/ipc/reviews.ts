import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/types'
import type {
  ReviewSubmission,
  ReviewQueueItem,
  ReviewSummary,
  FsrsState,
  LearningModality,
} from '@shared/types'
import type { Prisma } from '@prisma/client'
import { getDb } from '../db'
import { computeReviewQueue, scheduleReview } from '@core/fsrs/scheduler'
import { computeNextMasteryState } from '@core/mastery/state-machine'
import { recalculateProfile } from '@core/profile/calculator'
import { MasteryState } from '@shared/types'
import { getCurrentUserId } from '../auth-state'
import { createLogger } from '../logger'

const log = createLogger('ipc:reviews')

const MAX_QUEUE_SIZE = 200
let reviewCount = 0

export function registerReviewHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.REVIEW_GET_QUEUE, async (): Promise<ReviewQueueItem[]> => {
    log.info('review:getQueue started')
    const db = getDb()

    const lexicalItems = await db.lexicalItem.findMany({
      where: { masteryState: { not: MasteryState.Unseen } },
    })

    const grammarItems = await db.grammarItem.findMany({
      where: { masteryState: { not: MasteryState.Unseen } },
    })

    const allItems = [
      ...lexicalItems.map((item) => ({
        id: item.id,
        itemType: 'lexical' as const,
        surfaceForm: item.surfaceForm,
        reading: item.reading,
        meaning: item.meaning,
        masteryState: item.masteryState,
        recognitionFsrs: item.recognitionFsrs as unknown as FsrsState,
        productionFsrs: item.productionFsrs as unknown as FsrsState,
      })),
      ...grammarItems.map((item) => ({
        id: item.id,
        itemType: 'grammar' as const,
        surfaceForm: item.name,
        reading: null,
        meaning: item.description ?? item.name,
        masteryState: item.masteryState,
        recognitionFsrs: item.recognitionFsrs as unknown as FsrsState,
        productionFsrs: item.productionFsrs as unknown as FsrsState,
      })),
    ]

    const queue = computeReviewQueue(allItems)
    const result = queue.slice(0, MAX_QUEUE_SIZE)
    log.info('review:getQueue completed', { totalItems: allItems.length, dueItems: queue.length, returned: result.length })
    return result
  })

  ipcMain.handle(
    IPC_CHANNELS.REVIEW_SUBMIT,
    async (_event, submission: ReviewSubmission): Promise<{ newMasteryState: string }> => {
      log.info('review:submit started', {
        itemId: submission.itemId,
        itemType: submission.itemType,
        grade: submission.grade,
        modality: submission.modality,
      })

      try {
      const db = getDb()
      const userId = getCurrentUserId()
      const prodWeight = submission.productionWeight ?? (submission.modality === 'production' ? 0.5 : 1.0)
      const contextType = submission.contextType ?? 'srs_review'

      // Log the review event
      await db.reviewEvent.create({
        data: {
          userId,
          itemType: submission.itemType,
          grade: submission.grade,
          modality: submission.modality,
          sessionId: submission.sessionId,
          productionWeight: prodWeight,
          contextType,
          lexicalItemId: submission.itemType === 'lexical' ? submission.itemId : null,
          grammarItemId: submission.itemType === 'grammar' ? submission.itemId : null,
        },
      })

      // Determine modality for context log
      const modality: LearningModality =
        submission.modality === 'production' ? 'writing' : 'reading'

      // Create ItemContextLog entry
      await db.itemContextLog.create({
        data: {
          userId,
          contextType,
          modality,
          wasProduction: submission.modality === 'production',
          wasSuccessful: submission.grade === 'good' || submission.grade === 'easy',
          lexicalItemId: submission.itemType === 'lexical' ? submission.itemId : null,
          grammarItemId: submission.itemType === 'grammar' ? submission.itemId : null,
        },
      })

      // Update FSRS state
      const fsrsField =
        submission.modality === 'production' ? 'productionFsrs' : 'recognitionFsrs'

      if (submission.itemType === 'lexical') {
        const item = await db.lexicalItem.findUniqueOrThrow({
          where: { id: submission.itemId },
        })
        const currentFsrs = item[fsrsField] as unknown as FsrsState
        const { nextState } = scheduleReview(currentFsrs, submission.grade)

        // Accumulate production weight
        const newProductionWeight =
          item.productionWeight +
          (submission.modality === 'production' ? prodWeight : 0)

        const hasProduction = newProductionWeight >= 1.0 || item.productionCount > 0

        // Update contextTypes if srs_review not already present
        const updatedContextTypes = item.contextTypes.includes(contextType)
          ? item.contextTypes
          : [...item.contextTypes, contextType]

        const newMastery = computeNextMasteryState({
          currentState: item.masteryState as MasteryState,
          grade: submission.grade,
          modality: submission.modality,
          hasProductionEvidence: hasProduction,
          productionCount: item.productionCount,
          productionWeight: newProductionWeight,
          contextCount: updatedContextTypes.length,
          novelContextCount: 0, // lexical items don't track novel contexts
        })

        if (newMastery !== item.masteryState) {
          log.info('Mastery transition', {
            itemId: submission.itemId,
            itemType: 'lexical',
            from: item.masteryState,
            to: newMastery,
            grade: submission.grade,
          })
        }

        // Build modality counter updates
        const modalityUpdates: Record<string, { increment: number }> = {}
        if (modality === 'reading') {
          modalityUpdates.readingExposures = { increment: 1 }
        } else if (modality === 'writing') {
          modalityUpdates.writingProductions = { increment: 1 }
        }

        await db.lexicalItem.update({
          where: { id: submission.itemId },
          data: {
            [fsrsField]: nextState as unknown as Prisma.InputJsonValue,
            masteryState: newMastery,
            lastReviewed: new Date(),
            exposureCount: { increment: 1 },
            productionWeight: newProductionWeight,
            contextTypes: updatedContextTypes,
            contextCount: updatedContextTypes.length,
            ...modalityUpdates,
            ...(submission.modality === 'production'
              ? { productionCount: { increment: 1 } }
              : {}),
          },
        })

        // Trigger async profile recalculation every 10 reviews
        reviewCount++
        if (reviewCount % 10 === 0) {
          log.info('Triggering profile recalculation', { reviewCount })
          triggerProfileRecalculation().catch((err) => {
            log.error('Profile recalculation failed', { error: err instanceof Error ? err.message : String(err) })
          })
        }

        log.info('review:submit completed', { itemId: submission.itemId, newMasteryState: newMastery })
        return { newMasteryState: newMastery }
      } else {
        const item = await db.grammarItem.findUniqueOrThrow({
          where: { id: submission.itemId },
        })
        const currentFsrs = item[fsrsField] as unknown as FsrsState
        const { nextState } = scheduleReview(currentFsrs, submission.grade)

        const newProductionWeight =
          item.productionWeight +
          (submission.modality === 'production' ? prodWeight : 0)

        const updatedContextTypes = item.contextTypes.includes(contextType)
          ? item.contextTypes
          : [...item.contextTypes, contextType]

        const newMastery = computeNextMasteryState({
          currentState: item.masteryState as MasteryState,
          grade: submission.grade,
          modality: submission.modality,
          hasProductionEvidence: newProductionWeight >= 1.0,
          productionCount: 0,
          productionWeight: newProductionWeight,
          contextCount: updatedContextTypes.length,
          novelContextCount: item.novelContextCount,
        })

        if (newMastery !== item.masteryState) {
          log.info('Mastery transition', {
            itemId: submission.itemId,
            itemType: 'grammar',
            from: item.masteryState,
            to: newMastery,
            grade: submission.grade,
          })
        }

        const modalityUpdates: Record<string, { increment: number }> = {}
        if (modality === 'reading') {
          modalityUpdates.readingExposures = { increment: 1 }
        } else if (modality === 'writing') {
          modalityUpdates.writingProductions = { increment: 1 }
        }

        await db.grammarItem.update({
          where: { id: submission.itemId },
          data: {
            [fsrsField]: nextState as unknown as Prisma.InputJsonValue,
            masteryState: newMastery,
            lastReviewed: new Date(),
            productionWeight: newProductionWeight,
            contextTypes: updatedContextTypes,
            contextCount: updatedContextTypes.length,
            ...modalityUpdates,
          },
        })

        reviewCount++
        if (reviewCount % 10 === 0) {
          log.info('Triggering profile recalculation', { reviewCount })
          triggerProfileRecalculation().catch((err) => {
            log.error('Profile recalculation failed', { error: err instanceof Error ? err.message : String(err) })
          })
        }

        log.info('review:submit completed', { itemId: submission.itemId, newMasteryState: newMastery })
        return { newMasteryState: newMastery }
      }
      } catch (err) {
        log.error('review:submit failed', { itemId: submission.itemId, error: err instanceof Error ? err.message : String(err) })
        throw err
      }
    }
  )

  ipcMain.handle(IPC_CHANNELS.REVIEW_GET_SUMMARY, async (): Promise<ReviewSummary> => {
    log.info('review:getSummary started')
    const db = getDb()
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const todayReviews = await db.reviewEvent.findMany({
      where: { timestamp: { gte: today } },
    })

    const correctCount = todayReviews.filter(
      (r) => r.grade === 'good' || r.grade === 'easy'
    ).length

    const accuracy = todayReviews.length > 0 ? correctCount / todayReviews.length : 0
    log.info('review:getSummary completed', { totalReviewed: todayReviews.length, accuracy: Math.round(accuracy * 100) })

    return {
      totalReviewed: todayReviews.length,
      accuracy,
      newItemsAdded: 0,
      masteryChanges: [],
    }
  })
}

async function triggerProfileRecalculation(): Promise<void> {
  log.debug('Profile recalculation triggered')
  const db = getDb()

  const lexicalItems = await db.lexicalItem.findMany({
    where: { masteryState: { not: 'unseen' } },
  })
  const grammarItems = await db.grammarItem.findMany({
    where: { masteryState: { not: 'unseen' } },
  })

  const items = [
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

  const profile = await db.learnerProfile.findUniqueOrThrow({ where: { id: 1 } })
  const totalReviewEvents = await db.reviewEvent.count()

  const update = recalculateProfile({
    items,
    totalReviewEvents,
    lastActiveDate: new Date().toISOString(),
    previousStreak: profile.currentStreak,
    previousLongestStreak: profile.longestStreak,
    previousLastActiveDate: profile.lastActiveDate?.toISOString() ?? null,
  })

  await db.learnerProfile.update({
    where: { id: 1 },
    data: {
      ...update,
      totalReviewEvents,
      lastActiveDate: new Date(),
    },
  })
}
