import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-helpers'
import { prisma } from '@lingle/db'

export const GET = withAuth(async (_request, { userId }) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { learnerModel: true },
  })
  if (!user) return NextResponse.json(null)

  return NextResponse.json({
    targetLanguage: user.targetLanguage,
    nativeLanguage: user.nativeLanguage,
    sessionLengthMinutes: user.sessionLengthMinutes,
    correctionStyle: user.correctionStyle,
    interests: user.interests,
    occupation: user.occupation,
    family: user.family,
    goals: user.goals,
    ttsProvider: user.ttsProvider,
    sttProvider: user.sttProvider,
    voiceId: user.voiceId,
    totalLessons: user.totalLessons,
    cefrGrammar: user.learnerModel?.cefrGrammar ?? null,
    cefrFluency: user.learnerModel?.cefrFluency ?? null,
    sessionCount: user.learnerModel?.sessionCount ?? 0,
  })
})

export const POST = withAuth(async (request, { userId }) => {
  const body = await request.json()

  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (user?.onboardingComplete) {
    return NextResponse.json({ alreadyOnboarded: true })
  }

  const [updatedUser] = await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        targetLanguage: body.targetLanguage,
        nativeLanguage: body.nativeLanguage || 'en',
        onboardingComplete: true,
        correctionStyle: body.correctionStyle || 'recast',
        sessionLengthMinutes: body.sessionLengthMinutes || 30,
      },
    }),
    prisma.learnerModel.create({
      data: {
        userId,
        cefrGrammar: body.cefrGrammar || 1.0,
        cefrFluency: body.cefrFluency || 1.0,
      },
    }),
  ])

  return NextResponse.json({
    targetLanguage: updatedUser.targetLanguage,
    nativeLanguage: updatedUser.nativeLanguage,
    onboardingComplete: updatedUser.onboardingComplete,
  })
})

export const PATCH = withAuth(async (request, { userId }) => {
  const updates = await request.json()

  const allowedUserFields = [
    'targetLanguage', 'nativeLanguage', 'correctionStyle',
    'sessionLengthMinutes', 'interests', 'occupation',
    'family', 'goals', 'ttsProvider', 'sttProvider', 'voiceId',
  ] as const

  const userUpdates: Record<string, unknown> = {}
  for (const key of allowedUserFields) {
    if (updates[key] !== undefined) {
      userUpdates[key] = updates[key]
    }
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: userUpdates,
  })

  return NextResponse.json({
    targetLanguage: user.targetLanguage,
    nativeLanguage: user.nativeLanguage,
    correctionStyle: user.correctionStyle,
  })
})
