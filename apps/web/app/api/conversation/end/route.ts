import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-helpers'
import { prisma } from '@linguist/db'
import Anthropic from '@anthropic-ai/sdk'
import type { ConversationMessage, ExpandedSessionPlan, PragmaticState, FsrsState } from '@linguist/shared/types'
import type { Prisma } from '@prisma/client'
import { buildAnalysisPrompt, parseAnalysis } from '@linguist/core/conversation/analyzer'
import { buildPragmaticAnalysisPrompt, parsePragmaticAnalysis, updatePragmaticState } from '@linguist/core/pragmatics/analyzer'
import { createInitialFsrsState, scheduleReview } from '@linguist/core/fsrs/scheduler'
import { computeNextMasteryState } from '@linguist/core/mastery/state-machine'
import { MasteryState } from '@linguist/shared/types'
import type { ReviewGrade } from '@linguist/shared/types'
import { recalculateProfile } from '@linguist/core/profile/calculator'

const anthropic = new Anthropic()

export const POST = withAuth(async (request, { userId }) => {
  const { sessionId } = await request.json()

  const dbSession = await prisma.conversationSession.findUnique({ where: { id: sessionId } })
  if (!dbSession) return NextResponse.json(null)

  const duration = Math.floor((Date.now() - dbSession.timestamp.getTime()) / 1000)
  await prisma.conversationSession.update({
    where: { id: sessionId },
    data: { durationSeconds: duration },
  })

  const transcript = (dbSession.transcript as unknown as ConversationMessage[]) ?? []
  if (transcript.length === 0) return NextResponse.json(null)

  const plan = dbSession.sessionPlan as unknown as ExpandedSessionPlan

  // Fetch learner's known vocabulary so the analysis can identify truly new items
  const knownItems = await prisma.lexicalItem.findMany({
    where: { userId },
    select: { surfaceForm: true },
  })
  const knownSurfaceForms = knownItems.map((i) => i.surfaceForm)

  // Post-session analysis
  const analysisPrompt = buildAnalysisPrompt(transcript, plan, knownSurfaceForms)
  const analysisResponse = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    messages: [{ role: 'user', content: analysisPrompt }],
  })

  const analysisText = analysisResponse.content.find((c) => c.type === 'text')
  if (!analysisText || analysisText.type !== 'text') return NextResponse.json(null)

  const analysis = parseAnalysis(analysisText.text)

  await prisma.conversationSession.update({
    where: { id: sessionId },
    data: {
      targetsHit: analysis.targetsHit,
      errorsLogged: analysis.errorsLogged as unknown as Prisma.InputJsonValue,
      avoidanceEvents: analysis.avoidanceEvents as unknown as Prisma.InputJsonValue,
    },
  })

  // Log context entries and update items
  for (const ctxLog of analysis.contextLogs) {
    // Validate the referenced item exists before creating context log
    if (ctxLog.itemType === 'lexical') {
      const exists = await prisma.lexicalItem.findUnique({ where: { id: ctxLog.itemId }, select: { id: true } })
      if (!exists) continue
    } else if (ctxLog.itemType === 'grammar') {
      const exists = await prisma.grammarItem.findUnique({ where: { id: ctxLog.itemId }, select: { id: true } })
      if (!exists) continue
    }

    await prisma.itemContextLog.create({
      data: {
        userId, contextType: 'conversation', modality: ctxLog.modality,
        wasProduction: ctxLog.wasProduction, wasSuccessful: ctxLog.wasSuccessful,
        sessionId,
        lexicalItemId: ctxLog.itemType === 'lexical' ? ctxLog.itemId : null,
        grammarItemId: ctxLog.itemType === 'grammar' ? ctxLog.itemId : null,
      },
    })

    if (ctxLog.itemType === 'lexical') {
      const item = await prisma.lexicalItem.findUnique({ where: { id: ctxLog.itemId } })
      if (item) {
        const updatedContextTypes = item.contextTypes.includes('conversation') ? item.contextTypes : [...item.contextTypes, 'conversation']
        const modalityUpdates: Record<string, { increment: number }> = {}
        if (ctxLog.modality === 'reading') modalityUpdates.readingExposures = { increment: 1 }
        if (ctxLog.modality === 'writing') modalityUpdates.writingProductions = { increment: 1 }
        if (ctxLog.modality === 'speaking') modalityUpdates.speakingProductions = { increment: 1 }
        if (ctxLog.modality === 'listening') modalityUpdates.listeningExposures = { increment: 1 }
        await prisma.lexicalItem.update({
          where: { id: ctxLog.itemId },
          data: {
            contextTypes: updatedContextTypes, contextCount: updatedContextTypes.length,
            ...modalityUpdates,
            ...(ctxLog.wasProduction ? { productionCount: { increment: 1 }, productionWeight: { increment: 1.0 } } : { exposureCount: { increment: 1 } }),
            ...(item.masteryState === 'unseen' ? { masteryState: 'introduced' } : {}),
          },
        })
      }
    } else {
      const item = await prisma.grammarItem.findUnique({ where: { id: ctxLog.itemId } })
      if (item) {
        const updatedContextTypes = item.contextTypes.includes('conversation') ? item.contextTypes : [...item.contextTypes, 'conversation']
        const isNovel = !item.contextTypes.includes('conversation') && item.contextTypes.length > 0
        const modalityUpdates: Record<string, { increment: number }> = {}
        if (ctxLog.modality === 'reading') modalityUpdates.readingExposures = { increment: 1 }
        if (ctxLog.modality === 'writing') modalityUpdates.writingProductions = { increment: 1 }
        if (ctxLog.modality === 'speaking') modalityUpdates.speakingProductions = { increment: 1 }
        if (ctxLog.modality === 'listening') modalityUpdates.listeningExposures = { increment: 1 }
        await prisma.grammarItem.update({
          where: { id: ctxLog.itemId },
          data: {
            contextTypes: updatedContextTypes, contextCount: updatedContextTypes.length,
            ...modalityUpdates,
            ...(isNovel ? { novelContextCount: { increment: 1 } } : {}),
            ...(ctxLog.wasProduction ? { productionWeight: { increment: 1.0 } } : {}),
            ...(item.masteryState === 'unseen' ? { masteryState: 'introduced' } : {}),
          },
        })
      }
    }
  }

  // FSRS + mastery transitions for items with production/error evidence
  for (const ctxLog of analysis.contextLogs) {
    if (!ctxLog.wasProduction) continue

    const grade: ReviewGrade = ctxLog.wasSuccessful ? 'good' : 'again'

    if (ctxLog.itemType === 'lexical') {
      const item = await prisma.lexicalItem.findUnique({ where: { id: ctxLog.itemId } })
      if (!item) continue
      const currentFsrs = item.productionFsrs as unknown as FsrsState
      const { nextState: nextFsrs } = scheduleReview(currentFsrs, grade)
      const nextMastery = computeNextMasteryState({
        currentState: item.masteryState as MasteryState,
        grade,
        modality: 'production',
        hasProductionEvidence: item.productionCount > 0 || ctxLog.wasSuccessful,
        productionCount: item.productionCount + (ctxLog.wasSuccessful ? 1 : 0),
        productionWeight: item.productionWeight + (ctxLog.wasSuccessful ? 1.0 : 0),
        contextCount: item.contextCount,
        novelContextCount: 0,
      })
      await prisma.lexicalItem.update({
        where: { id: ctxLog.itemId },
        data: {
          productionFsrs: nextFsrs as unknown as Prisma.InputJsonValue,
          lastReviewed: new Date(),
          masteryState: nextMastery,
        },
      })
      await prisma.reviewEvent.create({
        data: {
          userId, itemType: 'lexical', grade, modality: 'production',
          sessionId, productionWeight: 1.0, contextType: 'conversation',
          lexicalItemId: ctxLog.itemId,
        },
      })
    } else if (ctxLog.itemType === 'grammar') {
      const item = await prisma.grammarItem.findUnique({ where: { id: ctxLog.itemId } })
      if (!item) continue
      const currentFsrs = item.productionFsrs as unknown as FsrsState
      const { nextState: nextFsrs } = scheduleReview(currentFsrs, grade)
      const nextMastery = computeNextMasteryState({
        currentState: item.masteryState as MasteryState,
        grade,
        modality: 'production',
        hasProductionEvidence: true,
        productionCount: 0,
        productionWeight: item.productionWeight + (ctxLog.wasSuccessful ? 1.0 : 0),
        contextCount: item.contextCount,
        novelContextCount: item.novelContextCount,
      })
      await prisma.grammarItem.update({
        where: { id: ctxLog.itemId },
        data: {
          productionFsrs: nextFsrs as unknown as Prisma.InputJsonValue,
          lastReviewed: new Date(),
          masteryState: nextMastery,
        },
      })
      await prisma.reviewEvent.create({
        data: {
          userId, itemType: 'grammar', grade, modality: 'production',
          sessionId, productionWeight: 1.0, contextType: 'conversation',
          grammarItemId: ctxLog.itemId,
        },
      })
    }
  }

  // FSRS updates for errors logged by analysis
  for (const err of analysis.errorsLogged) {
    const lexItem = await prisma.lexicalItem.findUnique({ where: { id: err.itemId } })
    if (lexItem) {
      const currentFsrs = lexItem.productionFsrs as unknown as FsrsState
      const { nextState: nextFsrs } = scheduleReview(currentFsrs, 'again')
      await prisma.lexicalItem.update({
        where: { id: err.itemId },
        data: {
          productionFsrs: nextFsrs as unknown as Prisma.InputJsonValue,
          lastReviewed: new Date(),
        },
      })
      await prisma.reviewEvent.create({
        data: {
          userId, itemType: 'lexical', grade: 'again', modality: 'production',
          sessionId, productionWeight: 1.0, contextType: 'conversation',
          lexicalItemId: err.itemId,
        },
      })
      continue
    }
    const gramItem = await prisma.grammarItem.findUnique({ where: { id: err.itemId } })
    if (gramItem) {
      const currentFsrs = gramItem.productionFsrs as unknown as FsrsState
      const { nextState: nextFsrs } = scheduleReview(currentFsrs, 'again')
      await prisma.grammarItem.update({
        where: { id: err.itemId },
        data: {
          productionFsrs: nextFsrs as unknown as Prisma.InputJsonValue,
          lastReviewed: new Date(),
        },
      })
      await prisma.reviewEvent.create({
        data: {
          userId, itemType: 'grammar', grade: 'again', modality: 'production',
          sessionId, productionWeight: 1.0, contextType: 'conversation',
          grammarItemId: err.itemId,
        },
      })
    }
  }

  // Fallback: add new items from analysis (catches items used in conversation but not introduced via tool calls)
  for (const newItem of analysis.newItemsEncountered) {
    const existing = await prisma.lexicalItem.findFirst({ where: { userId, surfaceForm: newItem.surfaceForm } })
    if (!existing) {
      const initialFsrs = createInitialFsrsState()
      await prisma.lexicalItem.create({
        data: {
          userId, surfaceForm: newItem.surfaceForm, meaning: '',
          masteryState: 'introduced',
          recognitionFsrs: initialFsrs as unknown as Prisma.InputJsonValue,
          productionFsrs: initialFsrs as unknown as Prisma.InputJsonValue,
          source: 'conversation', tags: ['conversation'],
          contextTypes: ['conversation'], contextCount: 1,
        },
      })
    } else if (existing.masteryState === 'unseen') {
      const updatedContextTypes = existing.contextTypes.includes('conversation')
        ? existing.contextTypes
        : [...existing.contextTypes, 'conversation']
      await prisma.lexicalItem.update({
        where: { id: existing.id },
        data: {
          masteryState: 'introduced',
          exposureCount: { increment: 1 },
          contextTypes: updatedContextTypes,
          contextCount: updatedContextTypes.length,
        },
      })
    }
  }

  // Pragmatic analysis
  const profileData = await prisma.learnerProfile.findUniqueOrThrow({ where: { userId } })
  const pragmaticPrompt = buildPragmaticAnalysisPrompt({
    transcript,
    targetRegister: plan.pragmaticTargets?.targetRegister ?? 'polite',
    targetLanguage: profileData.targetLanguage,
    nativeLanguage: profileData.nativeLanguage,
  })

  const pragmaticResponse = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [{ role: 'user', content: pragmaticPrompt }],
  })

  const pragmaticText = pragmaticResponse.content.find((c) => c.type === 'text')
  if (pragmaticText?.type === 'text') {
    const pragResult = parsePragmaticAnalysis(pragmaticText.text)
    const currentPrag = await prisma.pragmaticProfile.findUnique({ where: { userId } })
    const currentState: PragmaticState = currentPrag ? {
      casualAccuracy: currentPrag.casualAccuracy, politeAccuracy: currentPrag.politeAccuracy,
      registerSlipCount: currentPrag.registerSlipCount, preferredRegister: currentPrag.preferredRegister,
      circumlocutionCount: currentPrag.circumlocutionCount, silenceEvents: currentPrag.silenceEvents,
      l1FallbackCount: currentPrag.l1FallbackCount, averageSpeakingPace: currentPrag.averageSpeakingPace,
      hesitationRate: currentPrag.hesitationRate, avoidedGrammarPatterns: currentPrag.avoidedGrammarPatterns,
      avoidedVocabIds: currentPrag.avoidedVocabIds,
    } : {
      casualAccuracy: 0, politeAccuracy: 0, registerSlipCount: 0, preferredRegister: 'polite',
      circumlocutionCount: 0, silenceEvents: 0, l1FallbackCount: 0,
      averageSpeakingPace: null, hesitationRate: null, avoidedGrammarPatterns: [], avoidedVocabIds: [],
    }
    const updatedState = updatePragmaticState(currentState, pragResult)
    await prisma.pragmaticProfile.upsert({ where: { userId }, create: { userId, ...updatedState }, update: updatedState })
  }

  // Recalculate profile
  const lexicalItems = await prisma.lexicalItem.findMany({ where: { userId, masteryState: { not: 'unseen' } } })
  const grammarItems = await prisma.grammarItem.findMany({ where: { userId, masteryState: { not: 'unseen' } } })
  const items = [
    ...lexicalItems.map((item) => ({ id: item.id, itemType: 'lexical' as const, cefrLevel: item.cefrLevel, masteryState: item.masteryState, recognitionFsrs: item.recognitionFsrs as unknown as FsrsState, productionFsrs: item.productionFsrs as unknown as FsrsState, writingProductions: item.writingProductions, readingExposures: item.readingExposures, listeningExposures: item.listeningExposures, speakingProductions: item.speakingProductions })),
    ...grammarItems.map((item) => ({ id: item.id, itemType: 'grammar' as const, cefrLevel: item.cefrLevel, masteryState: item.masteryState, recognitionFsrs: item.recognitionFsrs as unknown as FsrsState, productionFsrs: item.productionFsrs as unknown as FsrsState, writingProductions: item.writingProductions, readingExposures: item.readingExposures, listeningExposures: item.listeningExposures, speakingProductions: item.speakingProductions })),
  ]
  const totalReviewEvents = await prisma.reviewEvent.count({ where: { userId } })
  const update = recalculateProfile({ items, totalReviewEvents, lastActiveDate: new Date().toISOString(), previousStreak: profileData.currentStreak, previousLongestStreak: profileData.longestStreak, previousLastActiveDate: profileData.lastActiveDate?.toISOString() ?? null })
  await prisma.learnerProfile.update({ where: { userId }, data: { ...update, totalReviewEvents, lastActiveDate: new Date() } })

  return NextResponse.json({
    targetsHit: analysis.targetsHit,
    errorsLogged: analysis.errorsLogged,
    avoidanceEvents: analysis.avoidanceEvents,
    newItemsEncountered: analysis.newItemsEncountered,
    overallAssessment: analysis.overallAssessment,
  })
})
