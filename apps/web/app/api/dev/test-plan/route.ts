/**
 * DEV ONLY — Test session planning with optional overrides.
 *
 * POST /api/dev/test-plan
 * Body: { cefrGrammar?: number, cefrFluency?: number }
 *
 * Returns the full plan + agentMetadata.
 */
import { NextResponse } from 'next/server'
import { devOnly } from '@/lib/api-helpers'
import { prisma } from '@lingle/db'

export const POST = devOnly(async (request, { userId }) => {
  let cefrOverride: { grammar?: number; fluency?: number } = {}
  try {
    const body = await request.json()
    if (body.cefrGrammar) cefrOverride.grammar = body.cefrGrammar
    if (body.cefrFluency) cefrOverride.fluency = body.cefrFluency
  } catch {}

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { learnerModel: true },
  })

  const cefrGrammar = cefrOverride.grammar ?? user.learnerModel?.cefrGrammar ?? 1.0
  const cefrFluency = cefrOverride.fluency ?? user.learnerModel?.cefrFluency ?? 1.0

  return NextResponse.json({
    _dev: true,
    cefrGrammar,
    cefrFluency,
    userProfile: {
      name: user.name,
      interests: user.interests,
      occupation: user.occupation,
      family: user.family,
      goals: user.goals,
      recentUpdates: user.recentUpdates,
    },
    learnerModel: user.learnerModel
      ? {
          cefrGrammar: user.learnerModel.cefrGrammar,
          cefrFluency: user.learnerModel.cefrFluency,
          sessionCount: user.learnerModel.sessionCount,
          skills: user.learnerModel.skills,
        }
      : null,
  })
})
