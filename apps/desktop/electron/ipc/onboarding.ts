import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/types'
import type { AssessmentItem, ReadingChallengeItem, ComprehensionItem, OnboardingResult } from '@shared/types'
import type { Prisma } from '@prisma/client'
import { getDb } from '../db'
import { getCurrentUserId } from '../auth-state'
import { createLogger } from '../logger'
import {
  ASSESSMENT_ITEMS,
  getAssessmentItemsForLevel,
  getReadingChallengeItems,
  getComprehensionItemsForLevel,
  computeLevelFromChallenges,
  getLevelCefrMapping,
} from '@core/onboarding'
import {
  getItemsBelowLevel,
  getItemsForLevel,
  loadJapaneseReferenceCorpus,
} from '@core/curriculum/reference-data'
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
    IPC_CHANNELS.ONBOARDING_GET_READING_CHALLENGE,
    async (_event, selfReportedLevel: string): Promise<ReadingChallengeItem[]> => {
      log.info('onboarding:getReadingChallenge', { selfReportedLevel })
      const items = getReadingChallengeItems(selfReportedLevel)
      return items.map((item, index) => ({
        index,
        surfaceForm: item.surfaceForm,
        meaning: item.meaning,
        level: item.level,
      }))
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.ONBOARDING_GET_COMPREHENSION,
    async (_event, selfReportedLevel: string): Promise<ComprehensionItem[]> => {
      log.info('onboarding:getComprehension', { selfReportedLevel })
      const items = getComprehensionItemsForLevel(selfReportedLevel)
      return items.map((item, index) => ({
        index,
        sentence: item.sentence,
        level: item.level,
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

      const adjustedLevel = computeLevelFromChallenges(
        result.selfReportedLevel,
        result.readingChallengeResults,
        result.comprehensionResults,
      )
      const cefrLevel = getLevelCefrMapping(adjustedLevel)
      const assessmentItems = getAssessmentItemsForLevel(result.selfReportedLevel)

      log.info('Level computed from challenges', {
        selfReported: result.selfReportedLevel,
        adjusted: adjustedLevel,
        cefr: cefrLevel,
        readingResults: result.readingChallengeResults.length,
        comprehensionResults: result.comprehensionResults.length,
      })

      const knownSet = new Set(result.knownItemIndices)

      // Build a set of surface forms / pattern IDs the learner marked as known
      const knownSurfaceForms = new Set<string>()
      const knownPatternIds = new Set<string>()
      for (let i = 0; i < assessmentItems.length; i++) {
        if (knownSet.has(i)) {
          if (assessmentItems[i].type === 'vocabulary') {
            knownSurfaceForms.add(assessmentItems[i].surfaceForm)
          } else if (assessmentItems[i].patternId) {
            knownPatternIds.add(assessmentItems[i].patternId!)
          }
        }
      }

      // Clean slate: remove items seeded by a previous onboarding run
      await db.lexicalItem.deleteMany({ where: { userId, source: 'onboarding' } })
      await db.grammarItem.deleteMany({
        where: {
          userId,
          patternId: { in: ASSESSMENT_ITEMS.filter((i) => i.patternId).map((i) => i.patternId!) },
        },
      })

      await db.learnerProfile.upsert({
        where: { userId },
        update: {
          targetLanguage: result.targetLanguage,
          nativeLanguage: result.nativeLanguage,
          selfReportedLevel: result.selfReportedLevel,
          dailyNewItemLimit: result.dailyNewItemLimit,
          computedLevel: cefrLevel,
          comprehensionCeiling: cefrLevel,
          productionCeiling: cefrLevel,
        },
        create: {
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

      await db.pragmaticProfile.upsert({
        where: { userId },
        update: { preferredRegister: 'polite' },
        create: { userId, preferredRegister: 'polite' },
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

      // ── Seed from the full corpus ──

      // 1. Items BELOW the learner's computed level → 'introduced' (bulk seed)
      const belowLevel = getItemsBelowLevel(cefrLevel)
      let seededBelow = 0

      for (const vocab of belowLevel.vocabulary) {
        const isKnownFromAssessment = knownSurfaceForms.has(vocab.surfaceForm)
        await db.lexicalItem.create({
          data: {
            userId,
            surfaceForm: vocab.surfaceForm,
            reading: vocab.reading,
            meaning: vocab.meaning,
            partOfSpeech: vocab.partOfSpeech,
            masteryState: isKnownFromAssessment ? 'apprentice_2' : 'introduced',
            recognitionFsrs: (isKnownFromAssessment ? knownFsrs : initialFsrs) as unknown as Prisma.InputJsonValue,
            productionFsrs: initialFsrs as unknown as Prisma.InputJsonValue,
            tags: [vocab.jlptLevel],
            cefrLevel: vocab.cefrLevel,
            frequencyRank: vocab.frequencyRank,
            source: 'onboarding',
            exposureCount: isKnownFromAssessment ? 1 : 0,
          },
        })
        seededBelow++
      }

      for (const grammar of belowLevel.grammar) {
        const isKnownFromAssessment = knownPatternIds.has(grammar.patternId)
        await db.grammarItem.create({
          data: {
            userId,
            patternId: grammar.patternId,
            name: grammar.name,
            description: grammar.description,
            cefrLevel: grammar.cefrLevel,
            frequencyRank: grammar.frequencyRank,
            masteryState: isKnownFromAssessment ? 'apprentice_2' : 'introduced',
            recognitionFsrs: (isKnownFromAssessment ? knownFsrs : initialFsrs) as unknown as Prisma.InputJsonValue,
            productionFsrs: initialFsrs as unknown as Prisma.InputJsonValue,
            prerequisiteIds: grammar.prerequisiteIds,
          },
        })
        seededBelow++
      }

      // 2. Items AT the learner's computed level → assessment-known as 'apprentice_2', rest as 'unseen'
      const atLevel = getItemsForLevel(cefrLevel)
      let seededAtLevel = 0

      for (const vocab of atLevel.vocabulary) {
        const isKnown = knownSurfaceForms.has(vocab.surfaceForm)
        await db.lexicalItem.create({
          data: {
            userId,
            surfaceForm: vocab.surfaceForm,
            reading: vocab.reading,
            meaning: vocab.meaning,
            partOfSpeech: vocab.partOfSpeech,
            masteryState: isKnown ? 'apprentice_2' : 'unseen',
            recognitionFsrs: (isKnown ? knownFsrs : initialFsrs) as unknown as Prisma.InputJsonValue,
            productionFsrs: initialFsrs as unknown as Prisma.InputJsonValue,
            tags: [vocab.jlptLevel],
            cefrLevel: vocab.cefrLevel,
            frequencyRank: vocab.frequencyRank,
            source: 'onboarding',
            exposureCount: isKnown ? 1 : 0,
          },
        })
        seededAtLevel++
      }

      for (const grammar of atLevel.grammar) {
        const isKnown = knownPatternIds.has(grammar.patternId)
        await db.grammarItem.create({
          data: {
            userId,
            patternId: grammar.patternId,
            name: grammar.name,
            description: grammar.description,
            cefrLevel: grammar.cefrLevel,
            frequencyRank: grammar.frequencyRank,
            masteryState: isKnown ? 'apprentice_2' : 'unseen',
            recognitionFsrs: (isKnown ? knownFsrs : initialFsrs) as unknown as Prisma.InputJsonValue,
            productionFsrs: initialFsrs as unknown as Prisma.InputJsonValue,
            prerequisiteIds: grammar.prerequisiteIds,
          },
        })
        seededAtLevel++
      }

      // Items ABOVE the learner's level are NOT seeded — the curriculum generator
      // introduces these when the learner is ready (level-up seeding)

      // Wipe stale curriculum so it regenerates from the new knowledge state
      await db.curriculumItem.deleteMany({ where: { userId } })

      await db.user.update({
        where: { id: userId },
        data: { onboardingCompleted: true },
      })

      log.info('onboarding:complete finished', {
        userId,
        computedLevel: cefrLevel,
        seededBelow,
        seededAtLevel,
        totalSeeded: seededBelow + seededAtLevel,
        elapsedMs: elapsed(),
      })

      return { computedLevel: cefrLevel }
    }
  )
}
