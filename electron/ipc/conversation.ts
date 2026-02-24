import { ipcMain } from 'electron'
import Anthropic from '@anthropic-ai/sdk'
import { IPC_CHANNELS } from '@shared/types'
import type {
  ConversationMessage,
  ExpandedSessionPlan,
  PostSessionAnalysis,
  FsrsState,
  PragmaticState,
  WordBankEntry,
} from '@shared/types'
import type { Prisma } from '@prisma/client'
import { MasteryState } from '@shared/types'
import { getDb } from '../db'
import { getCurrentUserId } from '../auth-state'
import { createLogger } from '../logger'

const log = createLogger('ipc:conversation')
import {
  buildPlanningPrompt,
  buildConversationSystemPrompt,
  parseSessionPlan,
  type LearnerSummary,
} from '@core/conversation/planner'
import { buildAnalysisPrompt, parseAnalysis } from '@core/conversation/analyzer'
import { generateExpandedDailyBrief, type ExpandedBriefInput } from '@core/tom/analyzer'
import {
  buildPragmaticAnalysisPrompt,
  parsePragmaticAnalysis,
  updatePragmaticState,
} from '@core/pragmatics/analyzer'
import { generateRecommendations } from '@core/curriculum/recommender'
import { computeKnowledgeBubble, type BubbleItemInput } from '@core/curriculum/bubble'
import { createInitialFsrsState } from '@core/fsrs/scheduler'
import { recalculateProfile, type ProfileItemInput } from '@core/profile/calculator'

const anthropic = new Anthropic()

const activeSessions = new Map<
  string,
  {
    plan: ExpandedSessionPlan
    systemPrompt: string
    messages: ConversationMessage[]
  }
>()

async function buildLearnerSummary(): Promise<LearnerSummary> {
  log.debug('Building learner summary')
  const db = getDb()
  const userId = getCurrentUserId()
  const profile = await db.learnerProfile.findUniqueOrThrow({ where: { userId } })

  const activeItems = await db.lexicalItem.findMany({
    where: {
      userId,
      masteryState: {
        in: [
          MasteryState.Apprentice1,
          MasteryState.Apprentice2,
          MasteryState.Apprentice3,
          MasteryState.Apprentice4,
          MasteryState.Journeyman,
        ],
      },
    },
  })

  const stableCount = await db.lexicalItem.count({
    where: { userId, masteryState: { in: [MasteryState.Expert, MasteryState.Master] } },
  })
  const burnedCount = await db.lexicalItem.count({
    where: { userId, masteryState: MasteryState.Burned },
  })

  let pragmaticState: PragmaticState | null = null
  const pragProfile = await db.pragmaticProfile.findUnique({ where: { userId } })
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

  const allLexical = await db.lexicalItem.findMany({ where: { userId } })
  const allGrammar = await db.grammarItem.findMany({ where: { userId } })
  const bubbleItems: BubbleItemInput[] = [
    ...allLexical.map((i) => ({
      id: i.id,
      itemType: 'lexical' as const,
      surfaceForm: i.surfaceForm,
      cefrLevel: i.cefrLevel,
      masteryState: i.masteryState,
      productionWeight: i.productionWeight,
    })),
    ...allGrammar.map((i) => ({
      id: i.id,
      itemType: 'grammar' as const,
      patternId: i.patternId,
      cefrLevel: i.cefrLevel,
      masteryState: i.masteryState,
      productionWeight: i.productionWeight,
    })),
  ]
  const bubble = computeKnowledgeBubble(bubbleItems)

  const knownSurfaceForms = new Set(allLexical.map((i) => i.surfaceForm))
  const knownPatternIds = new Set(allGrammar.map((i) => i.patternId))

  const curriculumNewItems = generateRecommendations({
    bubble,
    knownSurfaceForms,
    knownPatternIds,
    dailyNewItemLimit: 3,
    tomBriefInput: null,
  })

  const modalityGapDescription =
    bubble.levelBreakdowns.length > 0
      ? `Production ceiling: ${profile.productionCeiling}, Comprehension ceiling: ${profile.comprehensionCeiling}`
      : null

  const wordBankEntries: WordBankEntry[] = activeItems.map((item) => ({
    id: item.id,
    surfaceForm: item.surfaceForm,
    reading: item.reading,
    meaning: item.meaning,
    partOfSpeech: item.partOfSpeech,
    masteryState: item.masteryState as MasteryState,
    recognitionFsrs: item.recognitionFsrs as unknown as FsrsState,
    productionFsrs: item.productionFsrs as unknown as FsrsState,
    firstSeen: item.firstSeen.toISOString(),
    lastReviewed: item.lastReviewed?.toISOString() ?? null,
    exposureCount: item.exposureCount,
    productionCount: item.productionCount,
    tags: item.tags,
    source: item.source,
  }))

  log.info('Learner summary built', {
    level: profile.computedLevel,
    activeItems: wordBankEntries.length,
    stableItems: stableCount,
    burnedItems: burnedCount,
    curriculumNewItems: curriculumNewItems.length,
  })

  return {
    targetLanguage: profile.targetLanguage,
    nativeLanguage: profile.nativeLanguage,
    computedLevel: profile.computedLevel,
    comprehensionCeiling: profile.comprehensionCeiling,
    productionCeiling: profile.productionCeiling,
    activeItems: wordBankEntries,
    stableItemCount: stableCount,
    burnedItemCount: burnedCount,
    modalityGap: modalityGapDescription,
    pragmaticState,
    curriculumNewItems,
  }
}

async function buildExpandedTomBrief(): Promise<ReturnType<typeof generateExpandedDailyBrief>> {
  const db = getDb()
  const userId = getCurrentUserId()

  const lexicalItems = await db.lexicalItem.findMany({
    where: { userId, masteryState: { not: 'unseen' } },
    include: { reviewEvents: { orderBy: { timestamp: 'desc' }, take: 10 } },
  })
  const grammarItems = await db.grammarItem.findMany({
    where: { userId, masteryState: { not: 'unseen' } },
    include: { reviewEvents: { orderBy: { timestamp: 'desc' }, take: 10 } },
  })

  const conversationSessions = await db.conversationSession.findMany({
    where: { userId },
    orderBy: { timestamp: 'desc' },
    take: 50,
  })
  const totalSessionCount = conversationSessions.length

  const recentErrors = await db.reviewEvent.findMany({
    where: { userId, grade: { in: ['again', 'hard'] } },
    orderBy: { timestamp: 'desc' },
    take: 100,
  })

  let pragmaticState: PragmaticState | null = null
  const pragProfile = await db.pragmaticProfile.findUnique({ where: { userId } })
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

  const briefInput: ExpandedBriefInput = {
    items: [
      ...lexicalItems.map((item) => ({
        itemId: item.id,
        masteryState: item.masteryState as ExpandedBriefInput['items'][number]['masteryState'],
        productionCount: item.productionCount,
        conversationProductionCount: item.speakingProductions + item.writingProductions,
        sessionsInCurrentState: Math.min(totalSessionCount, 10),
        recentGrades: item.reviewEvents.map(
          (e) => e.grade as ExpandedBriefInput['items'][number]['recentGrades'][number]
        ),
      })),
      ...grammarItems.map((item) => ({
        itemId: item.id,
        masteryState: item.masteryState as ExpandedBriefInput['items'][number]['masteryState'],
        productionCount: 0,
        conversationProductionCount: item.speakingProductions + item.writingProductions,
        sessionsInCurrentState: Math.min(totalSessionCount, 10),
        recentGrades: item.reviewEvents.map(
          (e) => e.grade as ExpandedBriefInput['items'][number]['recentGrades'][number]
        ),
      })),
    ],
    errors: recentErrors
      .filter((e) => e.sessionId)
      .map((e) => ({
        itemId: e.lexicalItemId ?? e.grammarItemId ?? 0,
        sessionId: e.sessionId!,
        errorType: e.grade,
      })),
    modalityData: [
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
    ],
    grammarTransferData: grammarItems.map((item) => ({
      itemId: item.id,
      patternId: item.patternId,
      masteryState: item.masteryState as ExpandedBriefInput['grammarTransferData'][number]['masteryState'],
      contextCount: item.contextCount,
    })),
    pragmaticState,
    recommendedDifficulty: 'A1',
  }

  return generateExpandedDailyBrief(briefInput)
}

export function registerConversationHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.CONVERSATION_PLAN,
    async (): Promise<ExpandedSessionPlan> => {
      log.info('conversation:plan started')
      const elapsed = log.timer()
      const userId = getCurrentUserId()

      try {
        const learner = await buildLearnerSummary()
        const brief = await buildExpandedTomBrief()

        const planningPrompt = buildPlanningPrompt(learner, brief)

        const apiTimer = log.timer()
        const response = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          messages: [{ role: 'user', content: planningPrompt }],
        })
        log.info('API call: session planning', { model: 'claude-sonnet-4-20250514', elapsedMs: apiTimer() })

        const textContent = response.content.find((c) => c.type === 'text')
        if (!textContent || textContent.type !== 'text') {
          throw new Error('No text response from planning API')
        }

        const plan = parseSessionPlan(textContent.text)
        const db = getDb()

        const session = await db.conversationSession.create({
          data: {
            userId,
            transcript: [],
            targetsPlanned: {
              vocabulary: plan.targetVocabulary,
              grammar: plan.targetGrammar,
            },
            targetsHit: [],
            errorsLogged: [],
            avoidanceEvents: [],
            sessionPlan: plan as unknown as Prisma.InputJsonValue,
          },
        })

        const systemPrompt = buildConversationSystemPrompt(learner, plan, brief)

        activeSessions.set(session.id, {
          plan,
          systemPrompt,
          messages: [],
        })

        await db.learnerProfile.update({
          where: { userId },
          data: { totalSessions: { increment: 1 } },
        })

        log.info('conversation:plan completed', {
          sessionId: session.id,
          targetVocab: plan.targetVocabulary.length,
          targetGrammar: plan.targetGrammar.length,
          focus: plan.sessionFocus,
          elapsedMs: elapsed(),
        })

        return { ...plan, _sessionId: session.id } as ExpandedSessionPlan & { _sessionId: string }
      } catch (err) {
        log.error('conversation:plan failed', { error: err instanceof Error ? err.message : String(err) })
        throw err
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.CONVERSATION_SEND,
    async (
      _event,
      sessionId: string,
      message: string
    ): Promise<ConversationMessage> => {
      log.info('conversation:send started', { sessionId, turnCount: activeSessions.get(sessionId)?.messages.length ?? 0 })

      try {
        const session = activeSessions.get(sessionId)
        if (!session) {
          throw new Error(`No active session: ${sessionId}`)
        }

        const userMsg: ConversationMessage = {
          role: 'user',
          content: message,
          timestamp: new Date().toISOString(),
        }
        session.messages.push(userMsg)

        const recentMessages = session.messages.slice(-30)
        const apiMessages = recentMessages.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }))

        const apiTimer = log.timer()
        const response = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 512,
          system: session.systemPrompt,
          messages: apiMessages,
        })
        log.info('API call: conversation send', { model: 'claude-sonnet-4-20250514', elapsedMs: apiTimer(), contextMessages: apiMessages.length })

        const textContent = response.content.find((c) => c.type === 'text')
        const assistantContent = textContent?.type === 'text' ? textContent.text : ''

        const assistantMsg: ConversationMessage = {
          role: 'assistant',
          content: assistantContent,
          timestamp: new Date().toISOString(),
        }
        session.messages.push(assistantMsg)

        const db = getDb()
        await db.conversationSession.update({
          where: { id: sessionId },
          data: { transcript: session.messages as unknown as Prisma.InputJsonValue },
        })

        log.info('conversation:send completed', { sessionId, responseLength: assistantContent.length })
        return assistantMsg
      } catch (err) {
        log.error('conversation:send failed', { sessionId, error: err instanceof Error ? err.message : String(err) })
        throw err
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.CONVERSATION_END,
    async (_event, sessionId: string): Promise<PostSessionAnalysis | null> => {
      log.info('conversation:end started', { sessionId })
      const elapsed = log.timer()

      try {
        const db = getDb()
        const userId = getCurrentUserId()
        const session = activeSessions.get(sessionId)

        const dbSession = await db.conversationSession.findUnique({
          where: { id: sessionId },
        })

        if (dbSession) {
          const duration = Math.floor(
            (Date.now() - dbSession.timestamp.getTime()) / 1000
          )
          await db.conversationSession.update({
            where: { id: sessionId },
            data: { durationSeconds: duration },
          })
          log.info('Session duration recorded', { sessionId, durationSeconds: duration })
        }

        if (!session || session.messages.length === 0) {
          log.info('conversation:end completed (no messages)', { sessionId })
          activeSessions.delete(sessionId)
          return null
        }

        let result: PostSessionAnalysis | null = null

        const analysisPrompt = buildAnalysisPrompt(session.messages, session.plan)
        const analysisTimer = log.timer()
        const analysisResponse = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2048,
          messages: [{ role: 'user', content: analysisPrompt }],
        })
        log.info('API call: post-session analysis', { model: 'claude-sonnet-4-20250514', elapsedMs: analysisTimer() })

        const analysisText = analysisResponse.content.find((c) => c.type === 'text')
        if (analysisText?.type === 'text') {
          const analysis = parseAnalysis(analysisText.text)
          log.info('Analysis parsed', {
            targetsHit: analysis.targetsHit.length,
            errors: analysis.errorsLogged.length,
            avoidance: analysis.avoidanceEvents.length,
            newItems: analysis.newItemsEncountered.length,
            contextLogs: analysis.contextLogs.length,
          })

        result = {
          targetsHit: analysis.targetsHit,
          errorsLogged: analysis.errorsLogged,
          avoidanceEvents: analysis.avoidanceEvents,
          newItemsEncountered: analysis.newItemsEncountered,
          overallAssessment: analysis.overallAssessment,
        }

        await db.conversationSession.update({
          where: { id: sessionId },
          data: {
            targetsHit: analysis.targetsHit,
            errorsLogged: analysis.errorsLogged as unknown as Prisma.InputJsonValue,
            avoidanceEvents: analysis.avoidanceEvents as unknown as Prisma.InputJsonValue,
          },
        })

        for (const ctxLog of analysis.contextLogs) {
          await db.itemContextLog.create({
            data: {
              userId,
              contextType: 'conversation',
              modality: ctxLog.modality,
              wasProduction: ctxLog.wasProduction,
              wasSuccessful: ctxLog.wasSuccessful,
              sessionId,
              lexicalItemId: ctxLog.itemType === 'lexical' ? ctxLog.itemId : null,
              grammarItemId: ctxLog.itemType === 'grammar' ? ctxLog.itemId : null,
            },
          })

          if (ctxLog.itemType === 'lexical') {
            const item = await db.lexicalItem.findUnique({ where: { id: ctxLog.itemId } })
            if (item) {
              const updatedContextTypes = item.contextTypes.includes('conversation')
                ? item.contextTypes
                : [...item.contextTypes, 'conversation']

              const modalityUpdates: Record<string, { increment: number }> = {}
              if (ctxLog.modality === 'reading') modalityUpdates.readingExposures = { increment: 1 }
              if (ctxLog.modality === 'writing') modalityUpdates.writingProductions = { increment: 1 }
              if (ctxLog.modality === 'speaking') modalityUpdates.speakingProductions = { increment: 1 }
              if (ctxLog.modality === 'listening') modalityUpdates.listeningExposures = { increment: 1 }

              await db.lexicalItem.update({
                where: { id: ctxLog.itemId },
                data: {
                  contextTypes: updatedContextTypes,
                  contextCount: updatedContextTypes.length,
                  ...modalityUpdates,
                  ...(ctxLog.wasProduction
                    ? {
                        productionCount: { increment: 1 },
                        productionWeight: { increment: 1.0 },
                      }
                    : { exposureCount: { increment: 1 } }),
                },
              })
            }
          } else {
            const item = await db.grammarItem.findUnique({ where: { id: ctxLog.itemId } })
            if (item) {
              const updatedContextTypes = item.contextTypes.includes('conversation')
                ? item.contextTypes
                : [...item.contextTypes, 'conversation']
              const isNovel = !item.contextTypes.includes('conversation') && item.contextTypes.length > 0

              const modalityUpdates: Record<string, { increment: number }> = {}
              if (ctxLog.modality === 'reading') modalityUpdates.readingExposures = { increment: 1 }
              if (ctxLog.modality === 'writing') modalityUpdates.writingProductions = { increment: 1 }
              if (ctxLog.modality === 'speaking') modalityUpdates.speakingProductions = { increment: 1 }
              if (ctxLog.modality === 'listening') modalityUpdates.listeningExposures = { increment: 1 }

              await db.grammarItem.update({
                where: { id: ctxLog.itemId },
                data: {
                  contextTypes: updatedContextTypes,
                  contextCount: updatedContextTypes.length,
                  ...modalityUpdates,
                  ...(isNovel ? { novelContextCount: { increment: 1 } } : {}),
                  ...(ctxLog.wasProduction
                    ? { productionWeight: { increment: 1.0 } }
                    : {}),
                },
              })
            }
          }
        }

        for (const newItem of analysis.newItemsEncountered) {
          const existing = await db.lexicalItem.findFirst({
            where: { userId, surfaceForm: newItem.surfaceForm },
          })
          if (!existing) {
            const initialFsrs = createInitialFsrsState()
            await db.lexicalItem.create({
              data: {
                userId,
                surfaceForm: newItem.surfaceForm,
                meaning: '',
                masteryState: 'introduced',
                recognitionFsrs: initialFsrs as unknown as Prisma.InputJsonValue,
                productionFsrs: initialFsrs as unknown as Prisma.InputJsonValue,
                source: 'conversation',
                tags: ['conversation'],
                contextTypes: ['conversation'],
                contextCount: 1,
              },
            })
          }
        }

        const profile = await db.learnerProfile.findUniqueOrThrow({ where: { userId } })
        const pragmaticPrompt = buildPragmaticAnalysisPrompt({
          transcript: session.messages,
          targetRegister: session.plan.pragmaticTargets.targetRegister,
          targetLanguage: profile.targetLanguage,
          nativeLanguage: profile.nativeLanguage,
        })

        const pragTimer = log.timer()
        const pragmaticResponse = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          messages: [{ role: 'user', content: pragmaticPrompt }],
        })
        log.info('API call: pragmatic analysis', { model: 'claude-sonnet-4-20250514', elapsedMs: pragTimer() })

        const pragmaticText = pragmaticResponse.content.find((c) => c.type === 'text')
        if (pragmaticText?.type === 'text') {
          const pragResult = parsePragmaticAnalysis(pragmaticText.text)

          const currentPrag = await db.pragmaticProfile.findUnique({ where: { userId } })
          const currentState: PragmaticState = currentPrag
            ? {
                casualAccuracy: currentPrag.casualAccuracy,
                politeAccuracy: currentPrag.politeAccuracy,
                registerSlipCount: currentPrag.registerSlipCount,
                preferredRegister: currentPrag.preferredRegister,
                circumlocutionCount: currentPrag.circumlocutionCount,
                silenceEvents: currentPrag.silenceEvents,
                l1FallbackCount: currentPrag.l1FallbackCount,
                averageSpeakingPace: currentPrag.averageSpeakingPace,
                hesitationRate: currentPrag.hesitationRate,
                avoidedGrammarPatterns: currentPrag.avoidedGrammarPatterns,
                avoidedVocabIds: currentPrag.avoidedVocabIds,
              }
            : {
                casualAccuracy: 0,
                politeAccuracy: 0,
                registerSlipCount: 0,
                preferredRegister: 'polite',
                circumlocutionCount: 0,
                silenceEvents: 0,
                l1FallbackCount: 0,
                averageSpeakingPace: null,
                hesitationRate: null,
                avoidedGrammarPatterns: [],
                avoidedVocabIds: [],
              }

          const updatedState = updatePragmaticState(currentState, pragResult)

          await db.pragmaticProfile.upsert({
            where: { userId },
            create: {
              userId,
              ...updatedState,
            },
            update: updatedState,
          })
        }

        log.info('Triggering profile recalculation after conversation end')
        await triggerProfileRecalculation()
      }

      activeSessions.delete(sessionId)
      log.info('conversation:end completed', { sessionId, hasAnalysis: result !== null, elapsedMs: elapsed() })
      return result
      } catch (err) {
        log.error('conversation:end failed', { sessionId, error: err instanceof Error ? err.message : String(err) })
        throw err
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.CONVERSATION_LIST,
    async (): Promise<
      Array<{ id: string; timestamp: string; durationSeconds: number | null; sessionFocus: string }>
    > => {
      log.info('conversation:list started')
      const db = getDb()
      const userId = getCurrentUserId()
      const sessions = await db.conversationSession.findMany({
        where: { userId },
        orderBy: { timestamp: 'desc' },
        take: 20,
      })

      log.info('conversation:list completed', { count: sessions.length })
      return sessions.map((s) => ({
        id: s.id,
        timestamp: s.timestamp.toISOString(),
        durationSeconds: s.durationSeconds,
        sessionFocus: (s.sessionPlan as { sessionFocus?: string })?.sessionFocus ?? '',
      }))
    }
  )
}

async function triggerProfileRecalculation(): Promise<void> {
  log.debug('Profile recalculation triggered')
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

  await db.learnerProfile.update({
    where: { userId },
    data: {
      ...update,
      totalReviewEvents,
      lastActiveDate: new Date(),
    },
  })
}
