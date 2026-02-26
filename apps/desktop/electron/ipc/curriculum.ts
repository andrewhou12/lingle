import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/types'
import type {
  KnowledgeBubble,
  CurriculumRecommendation,
  FsrsState,
  ItemType,
} from '@shared/types'
import type { Prisma } from '@prisma/client'
import { getDb } from '../db'
import { getCurrentUserId } from '../auth-state'
import { computeKnowledgeBubble } from '@core/curriculum/bubble'
import { generateCurriculumPlan, type CurriculumPlan } from '@core/curriculum/planner'
import { getItemsForLevel } from '@core/curriculum/reference-data'
import { createInitialFsrsState } from '@core/fsrs/scheduler'
import { gatherBubbleItems } from './_helpers/gather-items'
import { createLogger } from '../logger'

const log = createLogger('ipc:curriculum')

/**
 * Seeds next-level corpus items as 'unseen' when the learner is ready to advance.
 */
async function seedNextLevelItems(userId: string, frontierLevel: string): Promise<number> {
  const db = getDb()
  const frontier = getItemsForLevel(frontierLevel)
  let seeded = 0

  // Get existing items at the frontier level to avoid duplicates
  const existingLexical = await db.lexicalItem.findMany({
    where: { userId, cefrLevel: frontierLevel },
    select: { surfaceForm: true },
  })
  const existingGrammar = await db.grammarItem.findMany({
    where: { userId, cefrLevel: frontierLevel },
    select: { patternId: true },
  })
  const existingSurfaceForms = new Set(existingLexical.map((i) => i.surfaceForm))
  const existingPatternIds = new Set(existingGrammar.map((i) => i.patternId))

  const initialFsrs = createInitialFsrsState()

  for (const vocab of frontier.vocabulary) {
    if (existingSurfaceForms.has(vocab.surfaceForm)) continue
    await db.lexicalItem.create({
      data: {
        userId,
        surfaceForm: vocab.surfaceForm,
        reading: vocab.reading,
        meaning: vocab.meaning,
        partOfSpeech: vocab.partOfSpeech,
        masteryState: 'unseen',
        recognitionFsrs: initialFsrs as unknown as Prisma.InputJsonValue,
        productionFsrs: initialFsrs as unknown as Prisma.InputJsonValue,
        tags: [vocab.jlptLevel],
        cefrLevel: vocab.cefrLevel,
        frequencyRank: vocab.frequencyRank,
        source: 'curriculum',
      },
    })
    seeded++
  }

  for (const grammar of frontier.grammar) {
    if (existingPatternIds.has(grammar.patternId)) continue
    await db.grammarItem.create({
      data: {
        userId,
        patternId: grammar.patternId,
        name: grammar.name,
        description: grammar.description,
        cefrLevel: grammar.cefrLevel,
        frequencyRank: grammar.frequencyRank,
        masteryState: 'unseen',
        recognitionFsrs: initialFsrs as unknown as Prisma.InputJsonValue,
        productionFsrs: initialFsrs as unknown as Prisma.InputJsonValue,
        prerequisiteIds: grammar.prerequisiteIds,
      },
    })
    seeded++
  }

  return seeded
}

export function registerCurriculumHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.CURRICULUM_GET_BUBBLE,
    async (): Promise<KnowledgeBubble> => {
      log.info('curriculum:getBubble started')
      const items = await gatherBubbleItems()
      const bubble = computeKnowledgeBubble(items)
      log.info('curriculum:getBubble completed', { currentLevel: bubble.currentLevel, frontierLevel: bubble.frontierLevel, totalItems: items.length })
      return bubble
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.CURRICULUM_GET_RECOMMENDATIONS,
    async (): Promise<CurriculumRecommendation[]> => {
      log.info('curriculum:getRecommendations started')
      const db = getDb()
      const userId = getCurrentUserId()
      const items = await gatherBubbleItems()
      const bubble = computeKnowledgeBubble(items)

      const lexicalItems = await db.lexicalItem.findMany({ where: { userId } })
      const grammarItems = await db.grammarItem.findMany({ where: { userId } })

      const knownSurfaceForms = new Set(lexicalItems.map((i) => i.surfaceForm))
      const knownPatternIds = new Set(grammarItems.map((i) => i.patternId))

      const profile = await db.learnerProfile.findUnique({ where: { userId } })
      const dailyLimit = profile?.dailyNewItemLimit ?? 10

      // Return existing queued items if any
      const existing = await db.curriculumItem.findMany({
        where: { userId, status: 'queued' },
        orderBy: { priority: 'desc' },
      })
      if (existing.length > 0) {
        log.info('curriculum:getRecommendations returning existing', { count: existing.length })
        return existing.map((item) => ({
          id: item.id,
          itemType: item.itemType as ItemType,
          surfaceForm: item.surfaceForm ?? undefined,
          reading: item.reading ?? undefined,
          meaning: item.meaning ?? undefined,
          patternId: item.patternId ?? undefined,
          cefrLevel: item.cefrLevel ?? undefined,
          frequencyRank: item.frequencyRank ?? undefined,
          priority: item.priority,
          reason: item.reason,
          prerequisitesMet: true,
        }))
      }

      // Compute due review count for pacing
      const now = new Date().toISOString()
      const dueReviews = lexicalItems.filter((i) => {
        const fsrs = i.recognitionFsrs as unknown as FsrsState
        return fsrs?.due && fsrs.due <= now
      }).length + grammarItems.filter((i) => {
        const fsrs = i.recognitionFsrs as unknown as FsrsState
        return fsrs?.due && fsrs.due <= now
      }).length

      // Compute recent accuracy
      const recentEvents = await db.reviewEvent.findMany({
        where: { userId },
        orderBy: { timestamp: 'desc' },
        take: 50,
      })
      const recentAccuracy = recentEvents.length > 0
        ? recentEvents.filter((e) => e.grade === 'good' || e.grade === 'easy').length / recentEvents.length
        : 0.8 // default for new learners

      // Use the new planner
      const plan = generateCurriculumPlan({
        bubble,
        items,
        knownSurfaceForms,
        knownPatternIds,
        dailyNewItemLimit: dailyLimit,
        dueReviewCount: dueReviews,
        recentAccuracy,
        tomBriefInput: null,
      })

      // Trigger level-up seeding if ready
      if (plan.levelUpReady) {
        const seeded = await seedNextLevelItems(userId, plan.frontierLevel)
        log.info('Level-up seeding triggered', { frontierLevel: plan.frontierLevel, seeded })
      }

      // Persist recommendations
      for (const rec of plan.newItems) {
        const created = await db.curriculumItem.create({
          data: {
            userId,
            itemType: rec.itemType,
            surfaceForm: rec.surfaceForm,
            reading: rec.reading,
            meaning: rec.meaning,
            patternId: rec.patternId,
            cefrLevel: rec.cefrLevel,
            frequencyRank: rec.frequencyRank,
            priority: rec.priority,
            reason: rec.reason,
            status: 'queued',
          },
        })
        rec.id = created.id
      }

      log.info('curriculum:getRecommendations completed', {
        count: plan.newItems.length,
        pacing: plan.pacing.reason,
        reviewFocus: plan.reviewFocus.length,
      })
      return plan.newItems
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.CURRICULUM_INTRODUCE_ITEM,
    async (
      _event,
      curriculumItemId: number
    ): Promise<{ itemId: number; itemType: ItemType }> => {
      log.info('curriculum:introduceItem started', { curriculumItemId })
      const db = getDb()
      const userId = getCurrentUserId()

      const currItem = await db.curriculumItem.findUniqueOrThrow({
        where: { id: curriculumItemId },
      })

      const initialFsrs = createInitialFsrsState()

      if (currItem.itemType === 'lexical') {
        const created = await db.lexicalItem.create({
          data: {
            userId,
            surfaceForm: currItem.surfaceForm ?? '',
            reading: currItem.reading,
            meaning: currItem.meaning ?? '',
            masteryState: 'introduced',
            recognitionFsrs: initialFsrs as unknown as Prisma.InputJsonValue,
            productionFsrs: initialFsrs as unknown as Prisma.InputJsonValue,
            source: 'curriculum',
            cefrLevel: currItem.cefrLevel,
            frequencyRank: currItem.frequencyRank,
            tags: ['curriculum'],
          },
        })

        await db.curriculumItem.update({
          where: { id: curriculumItemId },
          data: { status: 'introduced', introducedAt: new Date() },
        })

        log.info('curriculum:introduceItem completed', { itemId: created.id, itemType: 'lexical' })
        return { itemId: created.id, itemType: 'lexical' }
      } else {
        const patternId = currItem.patternId ?? `grammar_${Date.now()}`
        const created = await db.grammarItem.upsert({
          where: { userId_patternId: { userId, patternId } },
          update: {
            masteryState: 'introduced',
          },
          create: {
            userId,
            patternId,
            name: currItem.surfaceForm ?? currItem.patternId ?? '',
            description: currItem.meaning,
            cefrLevel: currItem.cefrLevel,
            masteryState: 'introduced',
            recognitionFsrs: initialFsrs as unknown as Prisma.InputJsonValue,
            productionFsrs: initialFsrs as unknown as Prisma.InputJsonValue,
            frequencyRank: currItem.frequencyRank,
          },
        })

        await db.curriculumItem.update({
          where: { id: curriculumItemId },
          data: { status: 'introduced', introducedAt: new Date() },
        })

        log.info('curriculum:introduceItem completed', { itemId: created.id, itemType: 'grammar' })
        return { itemId: created.id, itemType: 'grammar' }
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.CURRICULUM_SKIP_ITEM,
    async (_event, curriculumItemId: number): Promise<void> => {
      log.info('curriculum:skipItem', { curriculumItemId })
      const db = getDb()
      await db.curriculumItem.update({
        where: { id: curriculumItemId },
        data: { status: 'skipped' },
      })
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.CURRICULUM_REGENERATE,
    async (): Promise<CurriculumRecommendation[]> => {
      log.info('curriculum:regenerate started')
      const db = getDb()
      const userId = getCurrentUserId()

      await db.curriculumItem.deleteMany({
        where: { userId, status: 'queued' },
      })

      const items = await gatherBubbleItems()
      const bubble = computeKnowledgeBubble(items)

      const lexicalItems = await db.lexicalItem.findMany({ where: { userId } })
      const grammarItems = await db.grammarItem.findMany({ where: { userId } })

      const knownSurfaceForms = new Set(lexicalItems.map((i) => i.surfaceForm))
      const knownPatternIds = new Set(grammarItems.map((i) => i.patternId))

      const profile = await db.learnerProfile.findUnique({ where: { userId } })
      const dailyLimit = profile?.dailyNewItemLimit ?? 10

      // Compute due review count
      const now = new Date().toISOString()
      const dueReviews = lexicalItems.filter((i) => {
        const fsrs = i.recognitionFsrs as unknown as FsrsState
        return fsrs?.due && fsrs.due <= now
      }).length + grammarItems.filter((i) => {
        const fsrs = i.recognitionFsrs as unknown as FsrsState
        return fsrs?.due && fsrs.due <= now
      }).length

      // Compute recent accuracy
      const recentEvents = await db.reviewEvent.findMany({
        where: { userId },
        orderBy: { timestamp: 'desc' },
        take: 50,
      })
      const recentAccuracy = recentEvents.length > 0
        ? recentEvents.filter((e) => e.grade === 'good' || e.grade === 'easy').length / recentEvents.length
        : 0.8

      const plan = generateCurriculumPlan({
        bubble,
        items,
        knownSurfaceForms,
        knownPatternIds,
        dailyNewItemLimit: dailyLimit,
        dueReviewCount: dueReviews,
        recentAccuracy,
        tomBriefInput: null,
      })

      // Trigger level-up seeding if ready
      if (plan.levelUpReady) {
        const seeded = await seedNextLevelItems(userId, plan.frontierLevel)
        log.info('Level-up seeding triggered during regenerate', { frontierLevel: plan.frontierLevel, seeded })
      }

      for (const rec of plan.newItems) {
        const created = await db.curriculumItem.create({
          data: {
            userId,
            itemType: rec.itemType,
            surfaceForm: rec.surfaceForm,
            reading: rec.reading,
            meaning: rec.meaning,
            patternId: rec.patternId,
            cefrLevel: rec.cefrLevel,
            frequencyRank: rec.frequencyRank,
            priority: rec.priority,
            reason: rec.reason,
            status: 'queued',
          },
        })
        rec.id = created.id
      }

      log.info('curriculum:regenerate completed', {
        count: plan.newItems.length,
        pacing: plan.pacing.reason,
      })
      return plan.newItems
    }
  )
}
