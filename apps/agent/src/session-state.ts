import Redis from 'ioredis'
import type { SessionState, ErrorEntry, CorrectionEntry, MemoryEntry } from '@lingle/shared'

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

export function createDefaultSessionState(
  sessionId: string,
  userId: string,
  lessonId: string,
  overrides: Partial<SessionState> = {}
): SessionState {
  return {
    sessionId,
    userId,
    lessonId,
    lessonPhase: 'warmup',
    targetLanguage: '',
    nativeLanguage: '',
    lessonGoal: '',
    difficultyLevel: 2,
    errorsLogged: [],
    topicsCovered: [],
    vocabIntroduced: [],
    strengthsNoted: [],
    corrections: [],
    memoriesQueued: [],
    elapsedMinutes: 0,
    lessonDurationTarget: 30,
    avgResponseLatencySec: 0,
    responseLatencies: [],
    difficultyConstraints: {
      grammarStructuresInScope: [],
      maxSentenceComplexity: 'simple',
      vocabularyTier: 'high_frequency',
      allowL1Support: true,
    },
    compactionCount: 0,
    conversationTokenEstimate: 0,
    ...overrides,
  }
}

export async function writeSessionState(state: SessionState): Promise<void> {
  const r = getRedis()
  if (!r) return
  await r.set(SESSION_KEY(state.sessionId), JSON.stringify(state), 'EX', SESSION_TTL)
}

export async function getSessionState(sessionId: string): Promise<SessionState | null> {
  const r = getRedis()
  if (!r) return null
  const raw = await r.get(SESSION_KEY(sessionId))
  if (!raw) return null
  return JSON.parse(raw) as SessionState
}

export async function updateSessionState(
  sessionId: string,
  updater: Partial<SessionState> | ((state: SessionState) => Partial<SessionState>)
): Promise<void> {
  const r = getRedis()
  if (!r) return
  const raw = await r.get(SESSION_KEY(sessionId))
  if (!raw) return
  const current = JSON.parse(raw) as SessionState
  const partial = typeof updater === 'function' ? updater(current) : updater
  const updated = { ...current, ...partial }
  await r.set(SESSION_KEY(updated.sessionId), JSON.stringify(updated), 'EX', SESSION_TTL)
}

export async function deleteSessionState(sessionId: string): Promise<void> {
  const r = getRedis()
  if (!r) return
  await r.del(SESSION_KEY(sessionId))
}

// ─── Convenience Mutators (fire-and-forget pattern) ─────────────────────────

export function appendError(sessionId: string, error: ErrorEntry): void {
  updateSessionState(sessionId, (s) => ({
    errorsLogged: [...s.errorsLogged, error],
  })).catch((err) => console.error('[session-state] appendError failed:', err))
}

export function appendStrength(sessionId: string, skill: string, example: string): void {
  updateSessionState(sessionId, (s) => ({
    strengthsNoted: [...s.strengthsNoted, `${skill}: ${example}`],
  })).catch((err) => console.error('[session-state] appendStrength failed:', err))
}

export function appendCorrection(sessionId: string, correction: CorrectionEntry): void {
  updateSessionState(sessionId, (s) => ({
    corrections: [...s.corrections, correction],
  })).catch((err) => console.error('[session-state] appendCorrection failed:', err))
}

export function queueMemory(sessionId: string, entry: MemoryEntry): void {
  updateSessionState(sessionId, (s) => ({
    memoriesQueued: [...s.memoriesQueued, entry],
  })).catch((err) => console.error('[session-state] queueMemory failed:', err))
}

export function setLessonPhase(sessionId: string, phase: SessionState['lessonPhase']): void {
  updateSessionState(sessionId, { lessonPhase: phase })
    .catch((err) => console.error('[session-state] setLessonPhase failed:', err))
}

export function adjustDifficulty(sessionId: string, direction: 'up' | 'down'): void {
  updateSessionState(sessionId, (s) => ({
    difficultyLevel: Math.max(1, Math.min(5, s.difficultyLevel + (direction === 'up' ? 1 : -1))),
  })).catch((err) => console.error('[session-state] adjustDifficulty failed:', err))
}

export function setVocabHomework(sessionId: string, words: string[]): void {
  updateSessionState(sessionId, { vocabIntroduced: words })
    .catch((err) => console.error('[session-state] setVocabHomework failed:', err))
}

export function addResponseLatency(sessionId: string, latencySec: number): void {
  updateSessionState(sessionId, (s) => {
    const latencies = [...s.responseLatencies.slice(-9), latencySec]
    const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length
    return {
      responseLatencies: latencies,
      avgResponseLatencySec: Math.round(avg * 10) / 10,
    }
  }).catch((err) => console.error('[session-state] addResponseLatency failed:', err))
}

// ─── Serialization for System Prompt Injection ──────────────────────────────

export function serializeForPrompt(state: SessionState): string {
  const recentErrors = state.errorsLogged.slice(-5)
  const errorSummary = recentErrors.length > 0
    ? recentErrors.map((e) => `- ${e.errorType}: "${e.phrase}" → "${e.correction}" (${e.rule})`).join('\n')
    : 'No errors logged yet.'

  // Count error rules for frequency detection
  const ruleCounts = new Map<string, number>()
  for (const e of state.errorsLogged) {
    ruleCounts.set(e.rule, (ruleCounts.get(e.rule) ?? 0) + 1)
  }
  const repeatedRules = [...ruleCounts.entries()]
    .filter(([, count]) => count >= 2)
    .map(([rule, count]) => `${rule} (${count}x)`)

  const c = state.difficultyConstraints
  return [
    `=== SESSION STATE (read every turn) ===`,
    `Phase: ${state.lessonPhase}`,
    `Elapsed: ${state.elapsedMinutes} min / ${state.lessonDurationTarget} min target`,
    `Difficulty level: ${state.difficultyLevel}/5`,
    `Avg response latency: ${state.avgResponseLatencySec}s`,
    `Topics covered: ${state.topicsCovered.join(', ') || 'none yet'}`,
    `Vocab introduced: ${state.vocabIntroduced.join(', ') || 'none yet'}`,
    ``,
    `Recent errors:`,
    errorSummary,
    repeatedRules.length > 0 ? `\nRepeated error patterns: ${repeatedRules.join(', ')}` : '',
    ``,
    `OPERATIONAL DIFFICULTY CONSTRAINTS — enforced every turn, do not drift:`,
    `- Your sentences: ${c.maxSentenceComplexity} structure max`,
    `- Vocabulary: ${c.vocabularyTier} tier only`,
    `- Grammar structures in scope: ${c.grammarStructuresInScope.join(', ') || 'all basic structures'}`,
    `- Native language support: ${c.allowL1Support ? 'allowed for vocabulary only' : 'not allowed'}`,
  ].join('\n')
}
