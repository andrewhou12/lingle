import { app } from 'electron'
import { join } from 'path'
import { readFileSync, existsSync } from 'fs'

let cachedUserId: string | null = null

export function setCurrentUserId(id: string | null): void {
  cachedUserId = id
}

export function getCurrentUserId(): string {
  if (cachedUserId) return cachedUserId

  // Fall back to reading persisted session from disk
  try {
    const p = join(app.getPath('userData'), 'auth', 'session.json')
    if (existsSync(p)) {
      const session = JSON.parse(readFileSync(p, 'utf-8'))
      if (session?.user?.id) {
        cachedUserId = session.user.id
        return cachedUserId
      }
    }
  } catch {
    // ignore
  }

  throw new Error('No authenticated user — please sign in first')
}
