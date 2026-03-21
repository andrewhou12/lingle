import Redis from 'ioredis'
import type { RedisSessionState, LessonPhase, ErrorLog, SlideContent, WhiteboardItem, WhiteboardContent } from '@lingle/shared'

// ─── Redis Connection ───────────────────────────────────────────────────────

let redis: Redis | null = null

function getRedis(): Redis | null {
  if (redis) return redis
  const url = process.env.REDIS_URL
  if (!url) {
    console.warn('[session-state] REDIS_URL not set — session state disabled')
    return null
  }
  redis = new Redis(url, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      if (times > 3) return null
      return Math.min(times * 200, 2000)
    },
  })
  redis.on('error', (err) => console.error('[session-state] Redis error:', err.message))
  redis.on('connect', () => console.log('[session-state] Redis connected'))
  return redis
}

// ─── Session State Keys ─────────────────────────────────────────────────────

const SESSION_KEY = (id: string) => `session:${id}`
const SESSION_TTL = 4 * 60 * 60 // 4 hours

// ─── Public API ─────────────────────────────────────────────────────────────

export async function writeSessionState(state: RedisSessionState): Promise<void> {
  const r = getRedis()
  if (!r) return
  await r.set(SESSION_KEY(state.sessionId), JSON.stringify(state), 'EX', SESSION_TTL)
}

export async function getSessionState(sessionId: string): Promise<RedisSessionState | null> {
  const r = getRedis()
  if (!r) return null
  const raw = await r.get(SESSION_KEY(sessionId))
  if (!raw) return null
  return JSON.parse(raw) as RedisSessionState
}

export async function updateSessionState(
  sessionId: string,
  updater: Partial<RedisSessionState> | ((state: RedisSessionState) => Partial<RedisSessionState>)
): Promise<void> {
  const r = getRedis()
  if (!r) return
  const raw = await r.get(SESSION_KEY(sessionId))
  if (!raw) return
  const current = JSON.parse(raw) as RedisSessionState
  const partial = typeof updater === 'function' ? updater(current) : updater
  const updated = { ...current, ...partial }
  await r.set(SESSION_KEY(updated.sessionId), JSON.stringify(updated), 'EX', SESSION_TTL)
}

export async function deleteSessionState(sessionId: string): Promise<void> {
  const r = getRedis()
  if (!r) return
  await r.del(SESSION_KEY(sessionId))
}

// ─── flagError: fire-and-forget write ───────────────────────────────────────

export function appendFlaggedError(sessionId: string, error: ErrorLog): void {
  updateSessionState(sessionId, (s) => ({
    errorsLogged: [...s.errorsLogged, error],
    correctionsQueued: [...s.correctionsQueued, error],
  })).catch((err) => console.error('[session-state] appendFlaggedError failed:', err))
}

// ─── updateLessonPhase: blocking write ──────────────────────────────────────

export async function setLessonPhase(
  sessionId: string,
  phase: LessonPhase,
  slide: SlideContent,
): Promise<void> {
  await updateSessionState(sessionId, (s) => ({
    currentPhase: phase,
    phaseStartTimeMs: Date.now(),
    phaseExtensionGranted: false,
    currentSlide: slide,
  }))
  console.log(`[session-state] phase → ${phase}`)
}

// ─── writeWhiteboard: soft-blocking write ───────────────────────────────────

export async function writeWhiteboard(
  sessionId: string,
  params: {
    itemId: string
    section: 'new_material' | 'corrections'
    content: string
    type: 'vocab' | 'grammar' | 'correction' | 'phrase'
    action: 'add' | 'update' | 'delete'
    phase: LessonPhase
  },
): Promise<void> {
  // Map tool param name to TypeScript key
  const sectionKey = params.section === 'new_material' ? 'newMaterial' : 'corrections'

  await updateSessionState(sessionId, (s) => {
    const wb = { ...s.whiteboardContent }
    const sectionItems = [...wb[sectionKey]]

    if (params.action === 'add') {
      const item: WhiteboardItem = {
        id: params.itemId,
        addedAtPhase: params.phase,
        content: params.content,
        type: params.type,
      }
      sectionItems.push(item)
    } else if (params.action === 'update') {
      const idx = sectionItems.findIndex((i) => i.id === params.itemId)
      if (idx >= 0) {
        sectionItems[idx] = { ...sectionItems[idx], content: params.content }
      }
    } else if (params.action === 'delete') {
      const idx = sectionItems.findIndex((i) => i.id === params.itemId)
      if (idx >= 0) sectionItems.splice(idx, 1)
    }

    wb[sectionKey] = sectionItems
    return { whiteboardContent: wb }
  })
  console.log(`[session-state] whiteboard ${params.action}: ${params.section}/${params.itemId}`)
}

// ─── grantPhaseExtension ────────────────────────────────────────────────────

export async function grantPhaseExtension(sessionId: string): Promise<void> {
  await updateSessionState(sessionId, { phaseExtensionGranted: true })
}

// ─── Serialization for System Prompt Injection ──────────────────────────────

export function serializeForPrompt(state: RedisSessionState): string {
  const phase = state.currentPhase
  const plan = state.lessonPlan
  const budget = plan.phaseBudgetMinutes

  // Phase elapsed time
  const phaseElapsedMs = Date.now() - state.phaseStartTimeMs
  const phaseElapsedMin = Math.round(phaseElapsedMs / 60000 * 10) / 10
  const phaseBudget = budget[phase] || 0
  const phaseStr = `${phaseElapsedMin.toFixed(1)}/${phaseBudget}`

  // Error summary
  const recentErrors = state.errorsLogged.slice(-5)
  const errorSummary = recentErrors.length > 0
    ? recentErrors.map((e) => `- ${e.errorType}: "${e.userUtterance}" → "${e.correction}" (${e.severity})`).join('\n')
    : 'No errors logged yet.'

  // Whiteboard state (from whiteboardContent, the authoritative record)
  const wb = state.whiteboardContent
  const newMaterialStr = wb.newMaterial.length > 0
    ? wb.newMaterial.map((i) => `  - [${i.type}] ${i.content}`).join('\n')
    : '  (empty)'
  const correctionsStr = wb.corrections.length > 0
    ? wb.corrections.map((i) => `  - ${i.content}`).join('\n')
    : '  (empty)'

  // Slide state
  const slide = state.currentSlide
  const slideStr = slide
    ? `${slide.title} | ${slide.bullets.join('; ')}`
    : 'none'

  const lines: string[] = [
    `=== SESSION STATE (read every turn) ===`,
    `Current phase: ${phase.toUpperCase()} (elapsed: ${phaseStr} min)`,
    `Current slide: ${slideStr}`,
    ``,
    `── WHITEBOARD (what the learner sees) ──`,
    `New Material (${wb.newMaterial.length} items):`,
    newMaterialStr,
    `Corrections (${wb.corrections.length} items):`,
    correctionsStr,
    ``,
    `Errors flagged this session: ${state.errorsLogged.length}`,
    `Phase extension granted: ${state.phaseExtensionGranted}`,
    ``,
    `── ERRORS THIS SESSION (${state.errorsLogged.length} total) ──`,
    errorSummary,
  ]

  return lines.join('\n')
}
