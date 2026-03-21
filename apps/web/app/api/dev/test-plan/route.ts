/**
 * DEV ONLY — Test session planning with optional overrides.
 *
 * POST /api/dev/test-plan
 * Body: { topic?: string, cefrGrammar?: number, cefrFluency?: number }
 *
 * Returns the full plan + agentMetadata that would be sent to the agent.
 */
import { NextResponse } from 'next/server'
import { devOnly } from '@/lib/api-helpers'
import { prisma } from '@lingle/db'
import {
  getVocabTargets,
  getNextGrammarFocus,
  selectNextDomain,
  getGrammarStructuresInScope,
} from '@/lib/curriculum'
import { searchMemories } from '@/lib/memory'

export const POST = devOnly(async (request, { userId }) => {
  let topic = 'Free conversation'
  let cefrOverride: { grammar?: number; fluency?: number } = {}
  try {
    const body = await request.json()
    if (body.topic) topic = body.topic
    if (body.cefrGrammar) cefrOverride.grammar = body.cefrGrammar
    if (body.cefrFluency) cefrOverride.fluency = body.cefrFluency
  } catch {}

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: {
      learnerModel: {
        include: {
          errorPatterns: { orderBy: { occurrenceCount: 'desc' }, take: 10 },
        },
      },
    },
  })

  const targetLanguage = user.targetLanguage ?? 'Japanese'
  const cefrGrammar = cefrOverride.grammar ?? user.learnerModel?.cefrGrammar ?? 2.0
  const cefrFluency = cefrOverride.fluency ?? user.learnerModel?.cefrFluency ?? 2.0

  const [vocabTargets, grammarFocus, grammarInScope, memoriesText] = await Promise.all([
    getVocabTargets(userId, targetLanguage, cefrGrammar, 5),
    getNextGrammarFocus(userId, targetLanguage, cefrGrammar),
    getGrammarStructuresInScope(targetLanguage, cefrGrammar),
    searchMemories(userId, topic, 10),
  ])

  const domain = selectNextDomain(user.learnerModel?.domainsVisited ?? [])

  const errorPatterns = (user.learnerModel?.errorPatterns ?? []).map((ep) => ({
    rule: ep.rule,
    occurrenceCount: ep.occurrenceCount,
    sessionCount: ep.sessionsSeen.length,
  }))

  const plan = {
    domain,
    targetVocab: vocabTargets,
    grammarFocus: grammarFocus ? grammarFocus.displayName : null,
    reviewPatterns: errorPatterns.slice(0, 3).map((ep) => ep.rule),
  }

  const agentMetadata = {
    learnerModel: user.learnerModel
      ? {
          cefrGrammar,
          cefrFluency,
          sessionsCompleted: user.learnerModel.sessionsCompleted,
          weakAreas: user.learnerModel.priorityFocus ? [user.learnerModel.priorityFocus] : undefined,
        }
      : undefined,
    errorPatterns: errorPatterns.length > 0 ? errorPatterns : undefined,
    lessonPlan: {
      warmupTopic: topic,
      mainActivity: topic,
      targetVocab: vocabTargets,
      grammarFocus: grammarFocus ? [grammarFocus.displayName] : [],
      reviewPatterns: errorPatterns.slice(0, 3).map((ep) => ep.rule),
    },
    difficultyConstraints: {
      grammarStructuresInScope: grammarInScope.slice(0, 15),
    },
    correctionStyle: user.correctionStyle || 'recast',
    personalNotes: user.personalNotes || undefined,
    memories: memoriesText || undefined,
  }

  return NextResponse.json({
    _dev: true,
    topic,
    cefrGrammar,
    cefrFluency,
    plan,
    agentMetadata,
  })
})
