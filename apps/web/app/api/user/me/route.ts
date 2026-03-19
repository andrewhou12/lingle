import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-helpers'
import { prisma } from '@lingle/db'

export const GET = withAuth(async (_request, { userId }) => {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) return NextResponse.json(null)
  return NextResponse.json({
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    onboardingCompleted: user.onboardingComplete,
  })
})
