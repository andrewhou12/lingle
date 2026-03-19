/**
 * DEV ONLY — Read session state from Redis for a live session.
 *
 * GET /api/dev/session-state?sessionId=xxx
 *
 * Returns the current SessionState from Redis, or null if not found.
 */
import { NextResponse } from 'next/server'
import { devOnly } from '@/lib/api-helpers'
import { getSessionState } from '@/lib/redis'

export const GET = devOnly(async (request) => {
  const { searchParams } = new URL(request.url)
  const sessionId = searchParams.get('sessionId')

  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId required' }, { status: 400 })
  }

  const state = await getSessionState(sessionId)

  return NextResponse.json({
    _dev: true,
    sessionId,
    found: !!state,
    state,
  })
})
