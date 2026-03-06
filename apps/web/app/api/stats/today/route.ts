import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-helpers'
import { prisma } from '@lingle/db'

export const GET = withAuth(async (_request, { userId }) => {
  const profile = await prisma.learnerProfile.findUnique({ where: { userId } })
  const targetLanguage = profile?.targetLanguage ?? 'Japanese'

  const now = new Date()
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  const sessions = await prisma.conversationSession.findMany({
    where: {
      userId,
      targetLanguage,
      timestamp: { gte: startOfDay },
      durationSeconds: { not: null },
    },
    select: { durationSeconds: true },
  })

  const totalSeconds = sessions.reduce((sum, s) => sum + (s.durationSeconds ?? 0), 0)

  return NextResponse.json({ minutesToday: Math.round(totalSeconds / 60) })
})
