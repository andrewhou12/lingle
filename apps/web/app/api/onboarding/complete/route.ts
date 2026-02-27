import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-helpers'
import { prisma } from '@linguist/db'
import { createInitialFsrsState } from '@linguist/core/fsrs/scheduler'
import type { OnboardingResult } from '@linguist/shared/types'
import type { Prisma } from '@prisma/client'
import {
  ASSESSMENT_ITEMS,
  getAssessmentItemsForLevel,
  computeLevelFromChallenges,
  getLevelCefrMapping,
} from '@linguist/core/onboarding/assessment-data'
import {
  getItemsBelowLevel,
  getItemsForLevel,
  getCollocationsByLevel,
  getChunksByLevel,
  getPragmaticFormulasByLevel,
} from '@linguist/core/curriculum/reference-data'

export const POST = withAuth(async (request, { userId }) => {
  const result: OnboardingResult = await request.json()

  const adjustedLevel = computeLevelFromChallenges(
    result.selfReportedLevel,
    result.readingChallengeResults,
    result.comprehensionResults,
  )
  const cefrLevel = getLevelCefrMapping(adjustedLevel)
  const assessmentItems = getAssessmentItemsForLevel(result.selfReportedLevel)
  const knownSet = new Set(result.knownItemIndices)

  // Build sets of known items from assessment
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
  await prisma.lexicalItem.deleteMany({ where: { userId, source: 'onboarding' } })
  await prisma.grammarItem.deleteMany({
    where: {
      userId,
      patternId: { in: ASSESSMENT_ITEMS.filter((i) => i.patternId).map((i) => i.patternId!) },
    },
  })

  await prisma.learnerProfile.upsert({
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

  await prisma.pragmaticProfile.upsert({
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

  for (const vocab of belowLevel.vocabulary) {
    const isKnownFromAssessment = knownSurfaceForms.has(vocab.surfaceForm)
    await prisma.lexicalItem.create({
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
  }

  for (const grammar of belowLevel.grammar) {
    const isKnownFromAssessment = knownPatternIds.has(grammar.patternId)
    await prisma.grammarItem.create({
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
  }

  // 2. Items AT the learner's computed level → assessment-known as 'apprentice_2', rest as 'unseen'
  const atLevel = getItemsForLevel(cefrLevel)

  for (const vocab of atLevel.vocabulary) {
    const isKnown = knownSurfaceForms.has(vocab.surfaceForm)
    await prisma.lexicalItem.create({
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
  }

  for (const grammar of atLevel.grammar) {
    const isKnown = knownPatternIds.has(grammar.patternId)
    await prisma.grammarItem.create({
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
  }

  // Items ABOVE the learner's level are NOT seeded — the curriculum generator
  // introduces these when the learner is ready (level-up seeding)

  // ── Seed chunk items (collocations, chunks, pragmatic formulas) ──
  await prisma.chunkItem.deleteMany({ where: { userId, source: 'onboarding' } })

  const CEFR_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1']
  const levelIdx = CEFR_ORDER.indexOf(cefrLevel)
  const levelsToSeed = levelIdx >= 0 ? CEFR_ORDER.slice(0, levelIdx + 1) : ['A1']

  for (const level of levelsToSeed) {
    const isBelowLevel = level !== cefrLevel

    const collocations = getCollocationsByLevel(level)
    for (const coll of collocations) {
      await prisma.chunkItem.create({
        data: {
          userId,
          itemKind: 'collocation',
          referenceId: coll.id,
          phrase: coll.phrase,
          reading: coll.reading,
          meaning: coll.meaning,
          componentItemIds: [],
          grammarDependencies: [],
          cefrLevel: coll.cefrLevel,
          frequencyRank: coll.frequencyRank,
          masteryState: isBelowLevel ? 'introduced' : 'unseen',
          recognitionFsrs: initialFsrs as unknown as Prisma.InputJsonValue,
          productionFsrs: initialFsrs as unknown as Prisma.InputJsonValue,
          tags: coll.tags ?? [],
          domain: coll.domain,
          source: 'onboarding',
        },
      })
    }

    const chunks = getChunksByLevel(level)
    for (const chunk of chunks) {
      await prisma.chunkItem.create({
        data: {
          userId,
          itemKind: 'chunk',
          referenceId: chunk.id,
          phrase: chunk.phrase,
          reading: chunk.reading,
          meaning: chunk.meaning,
          componentItemIds: [],
          grammarDependencies: chunk.grammarDependencies ?? [],
          cefrLevel: chunk.cefrLevel,
          frequencyRank: chunk.frequencyRank,
          masteryState: isBelowLevel ? 'introduced' : 'unseen',
          recognitionFsrs: initialFsrs as unknown as Prisma.InputJsonValue,
          productionFsrs: initialFsrs as unknown as Prisma.InputJsonValue,
          tags: chunk.tags ?? [],
          domain: chunk.domain,
          source: 'onboarding',
        },
      })
    }

    const formulas = getPragmaticFormulasByLevel(level)
    for (const formula of formulas) {
      await prisma.chunkItem.create({
        data: {
          userId,
          itemKind: 'pragmatic_formula',
          referenceId: formula.id,
          phrase: formula.phrase,
          reading: formula.reading,
          meaning: formula.meaning,
          componentItemIds: [],
          grammarDependencies: [],
          register: formula.register,
          cefrLevel: formula.cefrLevel,
          frequencyRank: formula.frequencyRank,
          masteryState: isBelowLevel ? 'introduced' : 'unseen',
          recognitionFsrs: initialFsrs as unknown as Prisma.InputJsonValue,
          productionFsrs: initialFsrs as unknown as Prisma.InputJsonValue,
          tags: formula.tags ?? [],
          domain: formula.domain,
          source: 'onboarding',
        },
      })
    }
  }

  // Wipe stale curriculum so it regenerates from the new knowledge state
  await prisma.curriculumItem.deleteMany({ where: { userId } })

  await prisma.user.update({
    where: { id: userId },
    data: { onboardingCompleted: true },
  })

  return NextResponse.json({ computedLevel: cefrLevel })
})
