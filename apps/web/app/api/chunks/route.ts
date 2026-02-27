import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-helpers'
import { prisma } from '@linguist/db'
import type { FsrsState, WordBankChunkEntry } from '@linguist/shared/types'
import { MasteryState } from '@linguist/shared/types'

function toChunkEntry(item: any): WordBankChunkEntry {
  return {
    id: item.id,
    itemKind: item.itemKind,
    referenceId: item.referenceId,
    phrase: item.phrase,
    reading: item.reading,
    meaning: item.meaning,
    componentItemIds: item.componentItemIds,
    grammarDependencies: item.grammarDependencies,
    register: item.register,
    domain: item.domain,
    cefrLevel: item.cefrLevel,
    masteryState: item.masteryState as MasteryState,
    recognitionFsrs: item.recognitionFsrs as unknown as FsrsState,
    productionFsrs: item.productionFsrs as unknown as FsrsState,
    firstSeen: item.firstSeen.toISOString(),
    lastReviewed: item.lastReviewed?.toISOString() ?? null,
    exposureCount: item.exposureCount,
    productionCount: item.productionCount,
    tags: item.tags,
    source: item.source,
  }
}

export const GET = withAuth(async (request, { userId }) => {
  const { searchParams } = new URL(request.url)
  const masteryState = searchParams.get('masteryState')
  const itemKind = searchParams.get('itemKind')
  const search = searchParams.get('search')

  const where: Record<string, unknown> = { userId }
  if (masteryState) where.masteryState = masteryState
  if (itemKind) where.itemKind = itemKind

  if (search) {
    where.OR = [
      { phrase: { contains: search, mode: 'insensitive' } },
      { meaning: { contains: search, mode: 'insensitive' } },
      { reading: { contains: search, mode: 'insensitive' } },
    ]
  }

  const items = await prisma.chunkItem.findMany({
    where,
    orderBy: { firstSeen: 'desc' },
  })

  return NextResponse.json(items.map(toChunkEntry))
})
