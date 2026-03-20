/**
 * Redis client for the web server.
 * Used to read session state written by the agent during a lesson.
 */
import Redis from 'ioredis'
import type { SessionState } from '@lingle/shared'

let redis: Redis | null = null

function getRedis(): Redis | null {
  if (redis) return redis
  const url = process.env.REDIS_URL
  if (!url) return null
  redis = new Redis(url, {
    maxRetriesPerRequest: 2,
    retryStrategy(times) {
      if (times > 2) return null
      return Math.min(times * 200, 1000)
    },
  })
  redis.on('error', (err) => console.error('[redis] Error:', err.message))
  return redis
}

/**
 * Read the session state that the agent has been writing to during the lesson.
 */
export async function getSessionState(sessionId: string): Promise<SessionState | null> {
  const r = getRedis()
  if (!r) return null
  try {
    const raw = await r.get(`session:${sessionId}`)
    if (!raw) return null
    return JSON.parse(raw) as SessionState
  } catch (err) {
    console.error('[redis] Failed to read session state:', err)
    return null
  }
}

/**
 * Initialize session state in Redis before the agent connects.
 * Called at the end of the plan route so that per-turn state injection
 * and all agent tool mutations have a state object to work with.
 */
export async function writeSessionState(state: SessionState): Promise<void> {
  const r = getRedis()
  if (!r) return
  try {
    await r.set(`session:${state.sessionId}`, JSON.stringify(state), 'EX', 4 * 60 * 60)
  } catch (err) {
    console.error('[redis] Failed to write session state:', err)
  }
}

/**
 * Delete session state after post-session processing is complete.
 */
export async function deleteSessionState(sessionId: string): Promise<void> {
  const r = getRedis()
  if (!r) return
  try {
    await r.del(`session:${sessionId}`)
  } catch (err) {
    console.error('[redis] Failed to delete session state:', err)
  }
}
