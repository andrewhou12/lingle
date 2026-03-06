import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-helpers'
import { prisma } from '@lingle/db'
import type { LearnerProfile } from '@lingle/shared/types'

type PerLangSettings = Record<string, { difficultyLevel?: number; dailyGoalMinutes?: number }>

function serialize(profile: {
  id: number; targetLanguage: string; nativeLanguage: string;
  dailyGoalMinutes: number; difficultyLevel: number; totalSessions: number;
  currentStreak: number; lastActiveDate: Date | null;
}): LearnerProfile {
  return {
    id: profile.id,
    targetLanguage: profile.targetLanguage,
    nativeLanguage: profile.nativeLanguage,
    dailyGoalMinutes: profile.dailyGoalMinutes,
    difficultyLevel: profile.difficultyLevel,
    totalSessions: profile.totalSessions,
    currentStreak: profile.currentStreak,
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
  const current = await prisma.learnerProfile.findUniqueOrThrow({ where: { userId } })
  const perLang = (current.perLanguageSettings ?? {}) as PerLangSettings

  // Language switch: save current settings under old language, restore new language's settings
  if (updates.targetLanguage && updates.targetLanguage !== current.targetLanguage) {
    const oldLang = current.targetLanguage
    const newLang = updates.targetLanguage

    // Save current top-level settings under old language
    perLang[oldLang] = {
      difficultyLevel: current.difficultyLevel,
      dailyGoalMinutes: current.dailyGoalMinutes,
    }

    // Restore new language's settings (or defaults)
    const newSettings = perLang[newLang]
    updates.difficultyLevel = newSettings?.difficultyLevel ?? 2
    updates.dailyGoalMinutes = newSettings?.dailyGoalMinutes ?? 30
    updates.perLanguageSettings = perLang
  }

  // When updating difficulty or daily goal, also persist to per-language JSON
  if (updates.difficultyLevel !== undefined || updates.dailyGoalMinutes !== undefined) {
    const lang = updates.targetLanguage ?? current.targetLanguage
    if (!perLang[lang]) perLang[lang] = {}
    if (updates.difficultyLevel !== undefined) perLang[lang].difficultyLevel = updates.difficultyLevel
    if (updates.dailyGoalMinutes !== undefined) perLang[lang].dailyGoalMinutes = updates.dailyGoalMinutes
    updates.perLanguageSettings = perLang
  }

  const profile = await prisma.learnerProfile.update({
    where: { userId },
    data: updates,
  })
  return NextResponse.json(serialize(profile))
})
