import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-helpers'
import { prisma } from '@lingle/db'

export const GET = withAuth(async (_request, { userId }) => {
  const profile = await prisma.learnerProfile.findUnique({ where: { userId } })
  const targetLanguage = profile?.targetLanguage ?? 'Japanese'

  const sessions = await prisma.conversationSession.findMany({
    where: { userId, targetLanguage, durationSeconds: { not: null } },
    select: { timestamp: true, durationSeconds: true },
    orderBy: { timestamp: 'desc' },
  })

  const totalSessions = sessions.length
  const totalSeconds = sessions.reduce((sum, s) => sum + (s.durationSeconds ?? 0), 0)
  const totalMinutes = Math.round(totalSeconds / 60)
  const averageSessionMinutes = totalSessions > 0 ? Math.round(totalSeconds / totalSessions / 60) : 0

  // Compute streak from session dates
  const sessionDates = new Set(
    sessions.map((s) => {
      const d = new Date(s.timestamp)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    })
  )

  let currentStreak = 0
  let longestStreak = 0
  const today = new Date()

  // Walk backwards from today
  for (let i = 0; i < 365; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    if (sessionDates.has(key)) {
      currentStreak++
    } else {
      // Allow today to be missing (user hasn't practiced yet today)
      if (i === 0) continue
      break
    }
  }

  // Compute longest streak
  const sortedDates = Array.from(sessionDates).sort()
  let streak = 0
  for (let i = 0; i < sortedDates.length; i++) {
    if (i === 0) {
      streak = 1
    } else {
      const prev = new Date(sortedDates[i - 1])
      const curr = new Date(sortedDates[i])
      const diffDays = Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24))
      streak = diffDays === 1 ? streak + 1 : 1
    }
    longestStreak = Math.max(longestStreak, streak)
  }

  return NextResponse.json({
    totalSessions,
    totalMinutes,
    currentStreak,
    longestStreak,
    averageSessionMinutes,
  })
})
