import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/types'
import type { AssessmentItem, OnboardingResult } from '@shared/types'
import type { Prisma } from '@prisma/client'
import { getDb } from '../db'
import { getCurrentUserId } from '../auth-state'
import { createLogger } from '../logger'
import {
  ASSESSMENT_ITEMS,
  getAssessmentItemsForLevel,
  getLevelCefrMapping,
} from '@core/onboarding'
import { createInitialFsrsState } from '@core/fsrs/scheduler'

const log = createLogger('ipc:onboarding')

export function registerOnboardingHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.ONBOARDING_GET_STATUS,
    async (): Promise<{ completed: boolean }> => {
      const userId = getCurrentUserId()
      const db = getDb()
      const user = await db.user.findUnique({ where: { id: userId } })
      return { completed: user?.onboardingCompleted ?? false }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.ONBOARDING_GET_ASSESSMENT,
    async (_event, selfReportedLevel: string): Promise<AssessmentItem[]> => {
      log.info('onboarding:getAssessment', { selfReportedLevel })
      const items = getAssessmentItemsForLevel(selfReportedLevel)
      return items.map((item, index) => ({
        index,
        surfaceForm: item.surfaceForm,
        reading: item.reading,
        meaning: item.meaning,
        partOfSpeech: item.partOfSpeech,
        level: item.level,
        type: item.type,
        patternId: item.patternId,
      }))
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.ONBOARDING_COMPLETE,
    async (_event, result: OnboardingResult): Promise<void> => {
      const userId = getCurrentUserId()
      const db = getDb()
      log.info('onboarding:complete started', {
        userId,
        level: result.selfReportedLevel,
        knownCount: result.knownItemIndices.length,
      })
      const elapsed = log.timer()

      const cefrLevel = getLevelCefrMapping(result.selfReportedLevel)
      const assessmentItems = getAssessmentItemsForLevel(result.selfReportedLevel)

      const knownSet = new Set(result.knownItemIndices)

      // Create learner profile
      await db.learnerProfile.create({
        data: {
          userId,
          targetLanguage: result.targetLanguage,
          nativeLanguage: result.nativeLanguage,
          selfReportedLevel: result.selfReportedLevel,
          dailyNewItemLimit: result.dailyNewItemLimit,
          computedLevel: cefrLevel,
          comprehensionCeiling: cefrLevel,
          productionCeiling: cefrLevel,
        },
      })

      // Create pragmatic profile
      await db.pragmaticProfile.create({
        data: {
          userId,
          preferredRegister: 'polite',
        },
      })

      const initialFsrs = createInitialFsrsState()
      const knownFsrs = {
        ...initialFsrs,
        stability: 2,
        difficulty: 5.5,
        elapsed_days: 1,
        scheduled_days: 2,
        reps: 1,
        state: 2,
        last_review: new Date().toISOString(),
      }

      // Seed items based on assessment results
      for (let i = 0; i < assessmentItems.length; i++) {
        const item = assessmentItems[i]
        const isKnown = knownSet.has(i)

        if (item.type === 'vocabulary') {
          await db.lexicalItem.create({
            data: {
              userId,
              surfaceForm: item.surfaceForm,
              reading: item.reading,
              meaning: item.meaning,
              partOfSpeech: item.partOfSpeech,
              masteryState: isKnown ? 'apprentice_2' : 'unseen',
              recognitionFsrs: (isKnown ? knownFsrs : initialFsrs) as unknown as Prisma.InputJsonValue,
              productionFsrs: initialFsrs as unknown as Prisma.InputJsonValue,
              tags: [item.level],
              cefrLevel: getLevelCefrMapping(item.level),
              source: 'onboarding',
              exposureCount: isKnown ? 1 : 0,
            },
          })
        } else if (item.type === 'grammar' && item.patternId) {
          await db.grammarItem.create({
            data: {
              userId,
              patternId: item.patternId,
              name: item.surfaceForm,
              description: item.meaning,
              cefrLevel: getLevelCefrMapping(item.level),
              masteryState: isKnown ? 'apprentice_2' : 'unseen',
              recognitionFsrs: (isKnown ? knownFsrs : initialFsrs) as unknown as Prisma.InputJsonValue,
              productionFsrs: initialFsrs as unknown as Prisma.InputJsonValue,
            },
          })
        }
      }

      // Also seed items from levels below the self-reported level as "introduced"
      // (the user presumably knows these but we haven't tested them)
      const levelOrder = ['N5', 'N4', 'N3', 'N2', 'N1']
      const reportedIdx = levelOrder.indexOf(result.selfReportedLevel)
      if (reportedIdx > 0) {
        const lowerLevels = levelOrder.slice(0, reportedIdx)
        const lowerItems = ASSESSMENT_ITEMS.filter(
          (item) =>
            lowerLevels.includes(item.level) &&
            !assessmentItems.some(
              (a) => a.surfaceForm === item.surfaceForm && a.level === item.level
            )
        )

        for (const item of lowerItems) {
          if (item.type === 'vocabulary') {
            await db.lexicalItem.create({
              data: {
                userId,
                surfaceForm: item.surfaceForm,
                reading: item.reading,
                meaning: item.meaning,
                partOfSpeech: item.partOfSpeech,
                masteryState: 'introduced',
                recognitionFsrs: initialFsrs as unknown as Prisma.InputJsonValue,
                productionFsrs: initialFsrs as unknown as Prisma.InputJsonValue,
                tags: [item.level],
                cefrLevel: getLevelCefrMapping(item.level),
                source: 'onboarding',
              },
            })
          } else if (item.type === 'grammar' && item.patternId) {
            await db.grammarItem.create({
              data: {
                userId,
                patternId: item.patternId,
                name: item.surfaceForm,
                description: item.meaning,
                cefrLevel: getLevelCefrMapping(item.level),
                masteryState: 'introduced',
                recognitionFsrs: initialFsrs as unknown as Prisma.InputJsonValue,
                productionFsrs: initialFsrs as unknown as Prisma.InputJsonValue,
              },
            })
          }
        }
      }

      // Mark onboarding as completed
      await db.user.update({
        where: { id: userId },
        data: { onboardingCompleted: true },
      })

      log.info('onboarding:complete finished', {
        userId,
        itemsSeeded: assessmentItems.length,
        elapsedMs: elapsed(),
      })
    }
  )
}
