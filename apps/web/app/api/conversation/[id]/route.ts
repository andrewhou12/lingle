import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-helpers'
import { prisma } from '@linguist/db'

export const GET = withAuth(async (request, { userId }) => {
  const url = new URL(request.url)
  const id = url.pathname.split('/').pop()
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const session = await prisma.conversationSession.findFirst({
    where: { id, userId },
  })
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const contextLogs = await prisma.itemContextLog.findMany({
    where: { sessionId: id, userId },
    orderBy: { timestamp: 'asc' },
  })

  return NextResponse.json({
    id: session.id,
    timestamp: session.timestamp.toISOString(),
    durationSeconds: session.durationSeconds,
    transcript: session.transcript,
    sessionPlan: session.sessionPlan,
    targetsPlanned: session.targetsPlanned,
    targetsHit: session.targetsHit,
    errorsLogged: session.errorsLogged,
    avoidanceEvents: session.avoidanceEvents,
    systemPrompt: session.systemPrompt,
    contextLogs: contextLogs.map((cl) => ({
      id: cl.id,
      contextType: cl.contextType,
      modality: cl.modality,
      wasProduction: cl.wasProduction,
      wasSuccessful: cl.wasSuccessful,
      contextQuote: cl.contextQuote,
      lexicalItemId: cl.lexicalItemId,
      grammarItemId: cl.grammarItemId,
    })),
  })
})
