import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-helpers'
import { prisma } from '@linguist/db'
import { computeKnowledgeBubble, type BubbleItemInput } from '@linguist/core/curriculum/bubble'
import { generateCurriculumPlan } from '@linguist/core/curriculum/planner'
import { getItemsForLevel } from '@linguist/core/curriculum/reference-data'
import { createInitialFsrsState } from '@linguist/core/fsrs/scheduler'
import type { Prisma } from '@prisma/client'

/**
 * Seeds next-level corpus items as 'unseen' when the learner is ready to advance.
 */
async function seedNextLevelItems(userId: string, frontierLevel: string): Promise<number> {
  const frontier = getItemsForLevel(frontierLevel)
  let seeded = 0

  const existingLexical = await prisma.lexicalItem.findMany({
    where: { userId, cefrLevel: frontierLevel },
    select: { surfaceForm: true },
  })
  const existingGrammar = await prisma.grammarItem.findMany({
    where: { userId, cefrLevel: frontierLevel },
    select: { patternId: true },
  })
  const existingSurfaceForms = new Set(existingLexical.map((i) => i.surfaceForm))
  const existingPatternIds = new Set(existingGrammar.map((i) => i.patternId))

  const initialFsrs = createInitialFsrsState()

  for (const vocab of frontier.vocabulary) {
    if (existingSurfaceForms.has(vocab.surfaceForm)) continue
    await prisma.lexicalItem.create({
      data: {
        userId,
        surfaceForm: vocab.surfaceForm,
        reading: vocab.reading,
        meaning: vocab.meaning,
        partOfSpeech: vocab.partOfSpeech,
        masteryState: 'unseen',
        recognitionFsrs: initialFsrs as unknown as import('@prisma/client').Prisma.InputJsonValue,
        productionFsrs: initialFsrs as unknown as import('@prisma/client').Prisma.InputJsonValue,
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
    await prisma.grammarItem.create({
      data: {
        userId,
        patternId: grammar.patternId,
        name: grammar.name,
        description: grammar.description,
        cefrLevel: grammar.cefrLevel,
        frequencyRank: grammar.frequencyRank,
        masteryState: 'unseen',
        recognitionFsrs: initialFsrs as unknown as import('@prisma/client').Prisma.InputJsonValue,
        productionFsrs: initialFsrs as unknown as import('@prisma/client').Prisma.InputJsonValue,
        prerequisiteIds: grammar.prerequisiteIds,
      },
    })
    seeded++
  }

  return seeded
}

export const GET = withAuth(async (request, { userId }) => {
  const { searchParams } = new URL(request.url)
  const limit = parseInt(searchParams.get('limit') ?? '10')

  // Return existing queued items if any
  const existing = await prisma.curriculumItem.findMany({
    where: { userId, status: 'queued' },
    orderBy: { priority: 'desc' },
  })
  if (existing.length > 0) {
    return NextResponse.json(existing.map((item) => ({
      id: item.id,
      itemType: item.itemType,
      surfaceForm: item.surfaceForm ?? undefined,
      reading: item.reading ?? undefined,
      meaning: item.meaning ?? undefined,
      patternId: item.patternId ?? undefined,
      cefrLevel: item.cefrLevel ?? undefined,
      frequencyRank: item.frequencyRank ?? undefined,
      priority: item.priority,
      reason: item.reason,
      prerequisitesMet: true,
    })))
  }

  const allLexical = await prisma.lexicalItem.findMany({ where: { userId } })
  const allGrammar = await prisma.grammarItem.findMany({ where: { userId } })

  const bubbleItems: BubbleItemInput[] = [
    ...allLexical.map((i) => ({
      id: i.id, itemType: 'lexical' as const, surfaceForm: i.surfaceForm,
      cefrLevel: i.cefrLevel, masteryState: i.masteryState, productionWeight: i.productionWeight,
    })),
    ...allGrammar.map((i) => ({
      id: i.id, itemType: 'grammar' as const, patternId: i.patternId,
      cefrLevel: i.cefrLevel, masteryState: i.masteryState, productionWeight: i.productionWeight,
    })),
  ]

  const bubble = computeKnowledgeBubble(bubbleItems)
  const knownSurfaceForms = new Set(allLexical.map((i) => i.surfaceForm))
  const knownPatternIds = new Set(allGrammar.map((i) => i.patternId))

  // Compute due review count
  const now = new Date().toISOString()
  const dueReviews = allLexical.filter((i) => {
    const fsrs = i.recognitionFsrs as unknown as { due?: string }
    return fsrs?.due && fsrs.due <= now
  }).length + allGrammar.filter((i) => {
    const fsrs = i.recognitionFsrs as unknown as { due?: string }
    return fsrs?.due && fsrs.due <= now
  }).length

  // Compute recent accuracy
  const recentEvents = await prisma.reviewEvent.findMany({
    where: { userId },
    orderBy: { timestamp: 'desc' },
    take: 50,
  })
  const recentAccuracy = recentEvents.length > 0
    ? recentEvents.filter((e) => e.grade === 'good' || e.grade === 'easy').length / recentEvents.length
    : 0.8

  const plan = generateCurriculumPlan({
    bubble,
    items: bubbleItems,
    knownSurfaceForms,
    knownPatternIds,
    dailyNewItemLimit: limit,
    dueReviewCount: dueReviews,
    recentAccuracy,
    tomBriefInput: null,
  })

  // Trigger level-up seeding if ready
  if (plan.levelUpReady) {
    await seedNextLevelItems(userId, plan.frontierLevel)
  }

  // Persist to CurriculumItem so the frontend gets IDs for skip/introduce
  for (const rec of plan.newItems) {
    const created = await prisma.curriculumItem.create({
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

  return NextResponse.json(plan.newItems)
})
