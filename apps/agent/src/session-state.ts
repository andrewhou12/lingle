import Redis from 'ioredis'
import type { SessionState, ErrorEntry, CorrectionEntry, MemoryEntry, LessonPhaseType } from '@lingle/shared'

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
    // v1 structured plan fields
    currentPhaseIndex: 0,
    phaseStartedAt: Date.now(),
    phasesCompleted: [],
    timePressure: 'on_track',
    deferredTopics: [],
    nextSessionPriority: [],
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

// ─── Phase Management ───────────────────────────────────────────────────────

/**
 * Compute time pressure for the current phase.
 */
function computeTimePressure(
  phaseElapsedMin: number,
  targetMin: number,
): SessionState['timePressure'] {
  if (targetMin <= 0) return 'on_track'
  const ratio = phaseElapsedMin / targetMin
  if (ratio <= 1.0) return 'on_track'
  if (ratio <= 1.5) return 'slightly_over'
  return 'significantly_over'
}

/**
 * Advance to the next phase in the structured lesson plan.
 * Updates phase index, records completed phase, resets timing.
 */
export function advanceToNextPhase(sessionId: string): void {
  updateSessionState(sessionId, (s) => {
    const plan = s.structuredPlan
    if (!plan) {
      // No structured plan — fall back to legacy behavior
      return {}
    }

    const currentPhase = plan.phases[s.currentPhaseIndex]
    const nextIndex = s.currentPhaseIndex + 1

    if (nextIndex >= plan.phases.length) {
      // Already on last phase
      console.log(`[lesson] All phases complete, session ending`)
      return { lessonPhase: 'close' as SessionState['lessonPhase'] }
    }

    const nextPhase = plan.phases[nextIndex]
    const completed: LessonPhaseType[] = currentPhase
      ? [...s.phasesCompleted, currentPhase.phase]
      : s.phasesCompleted

    console.log(
      `[lesson] Phase ${nextIndex + 1}/${plan.phases.length} ${nextPhase.phase.toUpperCase()} started (target: ${nextPhase.targetMinutes} min)`
    )

    return {
      currentPhaseIndex: nextIndex,
      lessonPhase: nextPhase.phase as SessionState['lessonPhase'],
      phaseStartedAt: Date.now(),
      phasesCompleted: completed,
      timePressure: 'on_track' as const,
    }
  }).catch((err) => console.error('[session-state] advanceToNextPhase failed:', err))
}

/**
 * Append a topic to the deferred queue (for next session).
 */
export function appendDeferredTopic(sessionId: string, topic: string): void {
  updateSessionState(sessionId, (s) => ({
    deferredTopics: [...s.deferredTopics, topic],
  })).catch((err) => console.error('[session-state] appendDeferredTopic failed:', err))
}

/**
 * Flag an error rule for priority review in the next session.
 */
export function flagForNextSession(sessionId: string, rule: string): void {
  updateSessionState(sessionId, (s) => ({
    nextSessionPriority: [...new Set([...s.nextSessionPriority, rule])],
  })).catch((err) => console.error('[session-state] flagForNextSession failed:', err))
}

// ─── Serialization for System Prompt Injection ──────────────────────────────

export function serializeForPrompt(state: SessionState): string {
  const plan = state.structuredPlan
  const currentPhase = plan?.phases[state.currentPhaseIndex]

  // Update phase elapsed time
  const phaseElapsedMin = state.phaseStartedAt
    ? Math.round((Date.now() - state.phaseStartedAt) / 60000 * 10) / 10
    : 0
  const sessionElapsedMin = Math.round((Date.now() - (state.phaseStartedAt - phaseElapsedMin * 60000)) / 60000)

  // Compute time pressure
  const timePressure = currentPhase
    ? computeTimePressure(phaseElapsedMin, currentPhase.targetMinutes)
    : 'on_track'

  // Error summary
  const recentErrors = state.errorsLogged.slice(-5)
  const errorSummary = recentErrors.length > 0
    ? recentErrors.map((e) => `- ${e.errorType}: "${e.phrase}" → "${e.correction}" (${e.rule})`).join('\n')
    : 'No errors logged yet.'

  const ruleCounts = new Map<string, number>()
  for (const e of state.errorsLogged) {
    ruleCounts.set(e.rule, (ruleCounts.get(e.rule) ?? 0) + 1)
  }
  const repeatedRules = [...ruleCounts.entries()]
    .filter(([, count]) => count >= 2)
    .map(([rule, count]) => `${rule} (${count}x)`)

  const c = state.difficultyConstraints

  // ── Build phase-aware state block ──
  const lines: string[] = [
    `=== SESSION STATE (read every turn) ===`,
  ]

  if (plan && currentPhase) {
    const phaseNum = state.currentPhaseIndex + 1
    const totalPhases = plan.phases.length
    const pressureLabel = timePressure === 'on_track'
      ? 'ON TRACK'
      : timePressure === 'slightly_over'
        ? 'SLIGHTLY OVER — wrap up this phase naturally'
        : 'SIGNIFICANTLY OVER — call advancePhase now'

    lines.push(
      `Phase: ${phaseNum}/${totalPhases} — ${currentPhase.phase.toUpperCase()}`,
      `Phase elapsed: ${phaseElapsedMin} min / ${currentPhase.targetMinutes} min target [${pressureLabel}]`,
      `Session elapsed: ${state.elapsedMinutes} min / ${state.lessonDurationTarget} min total`,
      ``,
      `── CURRENT PHASE INSTRUCTIONS ──`,
      currentPhase.instructions,
      ``,
      `CORRECTION MODE: ${currentPhase.correctionMode}`,
    )

    // Phase content details
    const content = currentPhase.content
    const materialLines: string[] = []
    if (content.vocabTargets?.length) materialLines.push(`- Vocab: ${content.vocabTargets.join(', ')}`)
    if (content.grammarPattern) materialLines.push(`- Grammar: ${content.grammarPattern}`)
    if (content.reviewErrors?.length) {
      for (const re of content.reviewErrors) {
        materialLines.push(`- Review error "${re.rule}": "${re.phrase}" → "${re.correction}"`)
      }
    }
    if (content.discussionPrompts?.length) {
      materialLines.push(``)
      materialLines.push(`Discussion prompts:`)
      content.discussionPrompts.forEach((p, i) => materialLines.push(`${i + 1}. ${p}`))
    }
    if (materialLines.length > 0) {
      lines.push(``, `TARGET MATERIAL:`, ...materialLines)
    }

    // Next phase preview
    const nextPhase = plan.phases[state.currentPhaseIndex + 1]
    if (nextPhase) {
      lines.push(``, `NEXT PHASE: ${nextPhase.phase.toUpperCase()}`)
    }
  } else {
    // No structured plan — legacy format
    lines.push(
      `Phase: ${state.lessonPhase}`,
      `Elapsed: ${state.elapsedMinutes} min / ${state.lessonDurationTarget} min target`,
    )
  }

  lines.push(
    ``,
    `Difficulty level: ${state.difficultyLevel}/5`,
    `Avg response latency: ${state.avgResponseLatencySec}s`,
    `Topics covered: ${state.topicsCovered.join(', ') || 'none yet'}`,
    `Vocab introduced: ${state.vocabIntroduced.join(', ') || 'none yet'}`,
    ``,
    `── ERRORS THIS SESSION (${state.errorsLogged.length} total) ──`,
    errorSummary,
  )
  if (repeatedRules.length > 0) {
    lines.push(`Repeated: ${repeatedRules.join(', ')}`)
  }

  lines.push(
    ``,
    `── DIFFICULTY CONSTRAINTS ──`,
    `- Your sentences: ${c.maxSentenceComplexity} structure max`,
    `- Vocabulary: ${c.vocabularyTier} tier only`,
    `- Grammar in scope: ${c.grammarStructuresInScope.join(', ') || 'all basic structures'}`,
    `- Native language support: ${c.allowL1Support ? 'allowed for vocabulary only' : 'not allowed'}`,
  )

  return lines.join('\n')
}
