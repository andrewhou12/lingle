import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-helpers'
import { prisma } from '@lingle/db'
import type { LearnerProfile } from '@lingle/shared/types'

function serialize(profile: {
  id: number; targetLanguage: string; nativeLanguage: string;
  difficultyLevel: number; totalSessions: number; lastActiveDate: Date | null;
}): LearnerProfile {
  return {
    id: profile.id,
    targetLanguage: profile.targetLanguage,
    nativeLanguage: profile.nativeLanguage,
    difficultyLevel: profile.difficultyLevel,
    totalSessions: profile.totalSessions,
    lastActiveDate: profile.lastActiveDate?.toISOString() ?? null,
  }
}

export const GET = withAuth(async (_request, { userId }) => {
  const profile = await prisma.learnerProfile.findUnique({ where: { userId } })
  if (!profile) return NextResponse.json(null)
  return NextResponse.json(serialize(profile))
})

export const POST = withAuth(async (request, { userId }) => {
  const body = await request.json()

  // Check if profile already exists
  const existing = await prisma.learnerProfile.findUnique({ where: { userId } })
  if (existing) {
    return NextResponse.json(serialize(existing))
  }

  const profile = await prisma.learnerProfile.create({
    data: {
      userId,
      targetLanguage: body.targetLanguage || 'Japanese',
      nativeLanguage: body.nativeLanguage || 'English',
      selfReportedLevel: body.selfReportedLevel || 'beginner',
      difficultyLevel: body.difficultyLevel || 2,
      learningGoals: Array.isArray(body.goals) ? body.goals : [],
    },
  })
  return NextResponse.json(serialize(profile))
})

export const PATCH = withAuth(async (request, { userId }) => {
  const updates = await request.json()
  const profile = await prisma.learnerProfile.update({
    where: { userId },
    data: updates,
  })
  return NextResponse.json(serialize(profile))
})
