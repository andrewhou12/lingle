import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from './auth'

type AuthContext = { userId: string }

type AuthHandler = (
  request: NextRequest,
  context: AuthContext
) => Promise<NextResponse | Response>

/**
 * Get dev user ID from environment. Only works in development.
 * Set DEV_USER_ID in .env.local to bypass Supabase auth for curl/script testing.
 */
function getDevUserId(): string | null {
  if (process.env.NODE_ENV === 'production') {
    if (process.env.DEV_USER_ID) {
      throw new Error('DEV_USER_ID must not be set in production')
    }
    return null
  }
  return process.env.DEV_USER_ID || null
}

export function withAuth(handler: AuthHandler) {
  return async (request: NextRequest) => {
    let userId: string
    try {
      const devId = getDevUserId()
      userId = devId ?? await getUserId()
    } catch (err) {
      console.error('[withAuth] Auth failed:', err)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    try {
      return await handler(request, { userId })
    } catch (err) {
      console.error('[withAuth] Handler error:', err)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
  }
}

/** Guard for dev-only API routes. Returns 404 in production. */
export function devOnly(handler: AuthHandler) {
  if (process.env.NODE_ENV === 'production') {
    return async () => NextResponse.json(null, { status: 404 })
  }
  return withAuth(handler)
}
