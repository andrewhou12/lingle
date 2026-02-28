import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-helpers'
import { prisma } from '@linguist/db'

export const GET = withAuth(async (_request, { userId }) => {
  const items = await prisma.lexicalItem.findMany({
    where: { userId },
    select: {
      id: true,
      surfaceForm: true,
      masteryState: true,
    },
  })

  const result: Record<string, { masteryState: string; id: number }> = {}
  for (const item of items) {
    result[item.surfaceForm] = {
      masteryState: item.masteryState,
      id: item.id,
    }
  }

  return NextResponse.json(result)
})
