import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-helpers'
import { prisma } from '@lingle/db'

/**
 * GET /api/profile — return user profile + learner model
 * POST /api/profile — create user profile during onboarding
 * PATCH /api/profile — update user preferences
 */

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
    lessonStylePreference: user.lessonStylePreference,
    ttsProvider: user.ttsProvider,
    sttProvider: user.sttProvider,
    voiceId: user.voiceId,
    totalLessons: user.totalLessons,
    cefrGrammar: user.learnerModel?.cefrGrammar ?? null,
    cefrFluency: user.learnerModel?.cefrFluency ?? null,
    sessionsCompleted: user.learnerModel?.sessionsCompleted ?? 0,
  })
})

export const POST = withAuth(async (request, { userId }) => {
  const body = await request.json()

  // Check if user already has a target language set (onboarded)
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (user?.onboardingComplete) {
    return NextResponse.json({ alreadyOnboarded: true })
  }

  // Update user with onboarding data + create learner model
  const [updatedUser] = await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        targetLanguage: body.targetLanguage,
        nativeLanguage: body.nativeLanguage || 'en',
        onboardingComplete: true,
        correctionStyle: body.correctionStyle || 'recast',
        lessonStylePreference: body.lessonStylePreference || 'conversational',
        sessionLengthMinutes: body.sessionLengthMinutes || 30,
        personalNotes: body.personalNotes || '',
      },
    }),
    prisma.learnerModel.create({
      data: {
        userId,
        cefrGrammar: body.cefrGrammar || 2.0,
        cefrFluency: body.cefrFluency || 2.0,
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

  // Only allow specific fields to be updated
  const allowedUserFields = [
    'targetLanguage', 'nativeLanguage', 'correctionStyle',
    'lessonStylePreference', 'sessionLengthMinutes', 'sessionsPerWeek',
    'topicFocusPreference', 'strugglePatience', 'nativeLanguageSupport',
    'personalNotes', 'ttsProvider', 'sttProvider', 'voiceId',
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
