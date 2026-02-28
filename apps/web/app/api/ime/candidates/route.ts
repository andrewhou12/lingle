import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-helpers'
import { prisma } from '@linguist/db'

export const POST = withAuth(async (request, { userId }) => {
  const { surfaceForms } = (await request.json()) as { surfaceForms: string[] }

  if (!Array.isArray(surfaceForms) || surfaceForms.length === 0) {
    return NextResponse.json({})
  }

  const items = await prisma.lexicalItem.findMany({
    where: {
      userId,
      surfaceForm: { in: surfaceForms },
    },
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
