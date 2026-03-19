import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-helpers'
import { prisma } from '@lingle/db'

export const GET = withAuth(async (_request, { userId }) => {
  const lessons = await prisma.lesson.findMany({
    where: { userId, endedAt: { not: null } },
    orderBy: { startedAt: 'desc' },
    take: 20,
    select: {
      id: true,
      summary: true,
      lessonGoal: true,
      startedAt: true,
      endedAt: true,
      durationMinutes: true,
      errorsCount: true,
      correctionsDoc: true,
      targetLanguage: true,
    },
  })

  return NextResponse.json({ lessons })
})
