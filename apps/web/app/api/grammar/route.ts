import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-helpers'
import { prisma } from '@linguist/db'
import type { FsrsState } from '@linguist/shared/types'

export const GET = withAuth(async (request, { userId }) => {
  const { searchParams } = new URL(request.url)
  const masteryState = searchParams.get('masteryState')
  const search = searchParams.get('search')

  const where: Record<string, unknown> = { userId }
  if (masteryState) where.masteryState = masteryState

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { patternId: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ]
  }

  const items = await prisma.grammarItem.findMany({
    where,
    orderBy: { firstSeen: 'desc' },
  })

  return NextResponse.json(
    items.map((item) => ({
      id: item.id,
      patternId: item.patternId,
      name: item.name,
      description: item.description,
      cefrLevel: item.cefrLevel,
      masteryState: item.masteryState,
      contextCount: item.contextCount,
      recognitionFsrs: item.recognitionFsrs as unknown as FsrsState,
      productionFsrs: item.productionFsrs as unknown as FsrsState,
      firstSeen: item.firstSeen.toISOString(),
      lastReviewed: item.lastReviewed?.toISOString() ?? null,
      productionWeight: item.productionWeight,
    }))
  )
})
