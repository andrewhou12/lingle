import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from './auth'

type AuthContext = { userId: string }

type AuthHandler = (
  request: NextRequest,
  context: AuthContext
) => Promise<NextResponse | Response>

export function withAuth(handler: AuthHandler) {
  return async (request: NextRequest) => {
    let userId: string
    try {
      userId = await getUserId()
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
