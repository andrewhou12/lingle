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

  // Wipe stale curriculum so it regenerates from the new knowledge state
  await prisma.curriculumItem.deleteMany({ where: { userId } })

  await prisma.user.update({
    where: { id: userId },
    data: { onboardingCompleted: true },
  })

  return NextResponse.json({ computedLevel: cefrLevel })
})
