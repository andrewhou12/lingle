import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/types'
import type { ExpandedTomBrief, FsrsState, PragmaticState } from '@shared/types'
import { getDb } from '../db'
import { getCurrentUserId } from '../auth-state'
import { createLogger } from '../logger'

const log = createLogger('ipc:tom')
import {
  generateExpandedDailyBrief,
  type ItemReviewHistory,
  type ErrorRecord,
  type ModalityItemData,
  type GrammarTransferData,
} from '@core/tom/analyzer'

async function gatherAnalysisData() {
  log.debug('Gathering ToM analysis data')
  const db = getDb()

  // Gather item review histories
  const lexicalItems = await db.lexicalItem.findMany({
    where: { masteryState: { not: 'unseen' } },
    include: { reviewEvents: { orderBy: { timestamp: 'desc' }, take: 10 } },
  })

  const grammarItems = await db.grammarItem.findMany({
    where: { masteryState: { not: 'unseen' } },
    include: { reviewEvents: { orderBy: { timestamp: 'desc' }, take: 10 } },
  })

  // Count conversation sessions per item for sessionsInCurrentState approximation
  const conversationSessions = await db.conversationSession.findMany({
    orderBy: { timestamp: 'desc' },
    take: 50,
  })
  const totalSessionCount = conversationSessions.length

  const items: ItemReviewHistory[] = [
    ...lexicalItems.map((item) => ({
      itemId: item.id,
      masteryState: item.masteryState as ItemReviewHistory['masteryState'],
      productionCount: item.productionCount,
      conversationProductionCount: item.speakingProductions + item.writingProductions,
      sessionsInCurrentState: Math.min(totalSessionCount, 10), // approximate
      recentGrades: item.reviewEvents.map(
        (e) => e.grade as ItemReviewHistory['recentGrades'][number]
      ),
    })),
    ...grammarItems.map((item) => ({
      itemId: item.id,
      masteryState: item.masteryState as ItemReviewHistory['masteryState'],
      productionCount: 0,
      conversationProductionCount: item.speakingProductions + item.writingProductions,
      sessionsInCurrentState: Math.min(totalSessionCount, 10),
      recentGrades: item.reviewEvents.map(
        (e) => e.grade as ItemReviewHistory['recentGrades'][number]
      ),
    })),
  ]

  // Gather error records
  const recentErrors = await db.reviewEvent.findMany({
    where: { grade: { in: ['again', 'hard'] } },
    orderBy: { timestamp: 'desc' },
    take: 100,
  })

  const errors: ErrorRecord[] = recentErrors
    .filter((e) => e.sessionId)
    .map((e) => ({
      itemId: e.lexicalItemId ?? e.grammarItemId ?? 0,
      sessionId: e.sessionId!,
      errorType: e.grade,
    }))

  // Modality data for gap detection
  const modalityData: ModalityItemData[] = [
    ...lexicalItems.map((item) => ({
      itemId: item.id,
      recognitionFsrs: item.recognitionFsrs as unknown as FsrsState,
      productionFsrs: item.productionFsrs as unknown as FsrsState,
      readingExposures: item.readingExposures,
      listeningExposures: item.listeningExposures,
      speakingProductions: item.speakingProductions,
      writingProductions: item.writingProductions,
    })),
    ...grammarItems.map((item) => ({
      itemId: item.id,
      recognitionFsrs: item.recognitionFsrs as unknown as FsrsState,
      productionFsrs: item.productionFsrs as unknown as FsrsState,
      readingExposures: item.readingExposures,
      listeningExposures: item.listeningExposures,
      speakingProductions: item.speakingProductions,
      writingProductions: item.writingProductions,
    })),
  ]

  // Grammar transfer data
  const grammarTransferData: GrammarTransferData[] = grammarItems.map((item) => ({
    itemId: item.id,
    patternId: item.patternId,
    masteryState: item.masteryState as GrammarTransferData['masteryState'],
    contextCount: item.contextCount,
  }))

  // Pragmatic profile
  let pragmaticState: PragmaticState | null = null
  const pragProfile = await db.pragmaticProfile.findUnique({ where: { id: 1 } })
  if (pragProfile) {
    pragmaticState = {
      casualAccuracy: pragProfile.casualAccuracy,
      politeAccuracy: pragProfile.politeAccuracy,
      registerSlipCount: pragProfile.registerSlipCount,
      preferredRegister: pragProfile.preferredRegister,
      circumlocutionCount: pragProfile.circumlocutionCount,
      silenceEvents: pragProfile.silenceEvents,
      l1FallbackCount: pragProfile.l1FallbackCount,
      averageSpeakingPace: pragProfile.averageSpeakingPace,
      hesitationRate: pragProfile.hesitationRate,
      avoidedGrammarPatterns: pragProfile.avoidedGrammarPatterns,
      avoidedVocabIds: pragProfile.avoidedVocabIds,
    }
  }

  log.debug('Analysis data gathered', { items: items.length, errors: errors.length, modalityItems: modalityData.length, grammarItems: grammarTransferData.length })
  return { items, errors, modalityData, grammarTransferData, pragmaticState }
}

export function registerTomHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.TOM_RUN_ANALYSIS, async (): Promise<void> => {
    log.info('tom:runAnalysis started')
    const elapsed = log.timer()

    try {
    const db = getDb()
    const { items, errors, modalityData, grammarTransferData, pragmaticState } =
      await gatherAnalysisData()

    const brief = generateExpandedDailyBrief({
      items,
      errors,
      modalityData,
      grammarTransferData,
      pragmaticState,
      recommendedDifficulty: 'A1',
    })

    log.info('ToM brief generated', {
      avoidance: brief.avoidancePatterns.length,
      confusionPairs: brief.confusionPairs.length,
      regressions: brief.regressions.length,
      modalityGaps: brief.modalityGaps.length,
      transferGaps: brief.transferGaps.length,
    })

    // Store inferences in DB — clear old unresolved ones first, then create fresh
    const userId = getCurrentUserId()
    await db.tomInference.updateMany({
      where: { resolved: false },
      data: { resolved: true },
    })

    for (const avoidance of brief.avoidancePatterns) {
      await db.tomInference.create({
        data: {
          userId,
          type: 'avoidance',
          itemIds: [avoidance.itemId],
          confidence: 0.7,
          description: `Item avoided for ${avoidance.sessionsAvoided} sessions`,
        },
      })
    }

    for (const pair of brief.confusionPairs) {
      await db.tomInference.create({
        data: {
          userId,
          type: 'confusion_pair',
          itemIds: pair.itemIds,
          confidence: 0.6,
          description: pair.description,
        },
      })
    }

    for (const regression of brief.regressions) {
      await db.tomInference.create({
        data: {
          userId,
          type: 'regression',
          itemIds: [regression.itemId],
          confidence: 0.8,
          description: `Regression: recent grades ${regression.recentGrades.join(', ')}`,
        },
      })
    }

    for (const gap of brief.modalityGaps) {
      await db.tomInference.create({
        data: {
          userId,
          type: 'modality_gap',
          itemIds: [],
          confidence: 0.75,
          description: `${gap.modality} modality gap: ${gap.currentLevel} vs strongest ${gap.strongestLevel}`,
        },
      })
    }

    for (const transfer of brief.transferGaps) {
      await db.tomInference.create({
        data: {
          userId,
          type: 'transfer_gap',
          itemIds: [transfer.itemId],
          confidence: 0.65,
          description: `Grammar pattern ${transfer.patternId} needs novel context (${transfer.contextCount}/${transfer.needed})`,
        },
      })
    }

    // Update learner profile pattern summaries
    const profile = await db.learnerProfile.findUnique({ where: { id: 1 } })
    if (profile) {
      await db.learnerProfile.update({
        where: { id: 1 },
        data: {
          errorPatternSummary: {
            confusionPairs: brief.confusionPairs.length,
            regressions: brief.regressions.length,
            modalityGaps: brief.modalityGaps.map((g) => g.modality),
          },
          avoidancePatternSummary: {
            avoidanceCount: brief.avoidancePatterns.length,
            transferGaps: brief.transferGaps.length,
            avoidedItems: brief.avoidancePatterns.map((a) => a.itemId),
          },
        },
      })
    }

    log.info('tom:runAnalysis completed', { elapsedMs: elapsed() })
    } catch (err) {
      log.error('tom:runAnalysis failed', { error: err instanceof Error ? err.message : String(err) })
      throw err
    }
  })

  ipcMain.handle(IPC_CHANNELS.TOM_GET_BRIEF, async (): Promise<ExpandedTomBrief> => {
    log.info('tom:getBrief started')
    const { items, errors, modalityData, grammarTransferData, pragmaticState } =
      await gatherAnalysisData()

    const brief = generateExpandedDailyBrief({
      items,
      errors,
      modalityData,
      grammarTransferData,
      pragmaticState,
      recommendedDifficulty: 'A1',
    })
    log.info('tom:getBrief completed', { priorityTargets: brief.priorityTargets.length })
    return brief
  })

  ipcMain.handle(
    IPC_CHANNELS.TOM_GET_INFERENCES,
    async (): Promise<
      Array<{
        id: number
        type: string
        itemIds: number[]
        confidence: number
        description: string
        resolved: boolean
      }>
    > => {
      log.info('tom:getInferences started')
      const db = getDb()
      const inferences = await db.tomInference.findMany({
        where: { resolved: false },
        orderBy: { lastUpdated: 'desc' },
      })

      log.info('tom:getInferences completed', { count: inferences.length })
      return inferences.map((i) => ({
        id: i.id,
        type: i.type,
        itemIds: i.itemIds,
        confidence: i.confidence,
        description: i.description,
        resolved: i.resolved,
      }))
    }
  )
}
