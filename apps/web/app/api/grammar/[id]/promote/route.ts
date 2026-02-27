import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-helpers'
import { prisma } from '@linguist/db'
import { createInitialFsrsState } from '@linguist/core/fsrs/scheduler'
import type { Prisma } from '@prisma/client'

export const POST = withAuth(async (request, { userId }) => {
  const url = new URL(request.url)
  const id = parseInt(url.pathname.split('/').at(-2) ?? '', 10)
  if (isNaN(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const item = await prisma.grammarItem.findFirst({ where: { id, userId } })
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (item.masteryState !== 'unseen' && item.masteryState !== 'introduced') {
    return NextResponse.json({ masteryState: item.masteryState })
  }

  const initialFsrs = createInitialFsrsState()
  const updated = await prisma.grammarItem.update({
    where: { id },
    data: {
      masteryState: 'apprentice_1',
      recognitionFsrs: initialFsrs as unknown as Prisma.InputJsonValue,
      productionFsrs: initialFsrs as unknown as Prisma.InputJsonValue,
    },
  })

  return NextResponse.json({ masteryState: updated.masteryState })
})
