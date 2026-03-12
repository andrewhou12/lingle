import { authenticate } from './auth'
import { parseFramesWithTiming, type FrameTimings } from './frame-parser'
import { type TestScenario } from './scenarios'

const BASE_URL = process.env.BENCH_BASE_URL || 'http://localhost:3000'

export interface IterationResult {
  scenario: string
  iteration: number
  sessionCreateMs: number | null
  timings: FrameTimings | null
  ttsTimings: { ttfb: number; total: number; bytes: number } | null
  error: string | null
}

export interface ScenarioResult {
  scenario: TestScenario
  iterations: IterationResult[]
  stats: ScenarioStats
}

export interface ScenarioStats {
  sessionCreate: StatsSummary | null
  ttft: StatsSummary | null
  ttfa: StatsSummary | null
  sentenceTtsP50: StatsSummary | null
  total: StatsSummary | null
  audioKB: StatsSummary | null
}

export interface StatsSummary {
  min: number
  max: number
  mean: number
  median: number
  p95: number
}

function computeStats(values: number[]): StatsSummary | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const sum = sorted.reduce((a, b) => a + b, 0)
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: sum / sorted.length,
    median: sorted[Math.floor(sorted.length / 2)],
    p95: sorted[Math.floor(sorted.length * 0.95)],
  }
}

function sentenceP50(timings: FrameTimings): number | null {
  const durations = timings.sentences
    .filter((s) => s.firstAudioTime !== null && s.startTime)
    .map((s) => s.firstAudioTime! - s.startTime)
  if (durations.length === 0) return null
  const sorted = [...durations].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

export async function runBenchmark(
  scenarios: TestScenario[],
  opts: { verbose: boolean; iterationOverride?: number },
): Promise<ScenarioResult[]> {
  console.log('Authenticating...')
  const { cookie } = await authenticate()
  console.log('Authenticated.\n')

  const results: ScenarioResult[] = []

  for (const scenario of scenarios) {
    const iterations = opts.iterationOverride ?? scenario.iterations
    console.log(`\n━━━ ${scenario.name}: ${scenario.description} (${iterations} iterations) ━━━`)

    const iterResults: IterationResult[] = []

    for (let i = 0; i < iterations; i++) {
      console.log(`  [${i + 1}/${iterations}]`)

      try {
        if (scenario.type === 'tts-only') {
          const result = await runTtsScenario(scenario, cookie, opts.verbose)
          iterResults.push({ ...result, scenario: scenario.name, iteration: i + 1 })
        } else {
          const result = await runVoiceStreamScenario(scenario, cookie, opts.verbose)
          iterResults.push({ ...result, scenario: scenario.name, iteration: i + 1 })
        }
      } catch (err) {
        console.error(`  ERROR: ${err}`)
        iterResults.push({
          scenario: scenario.name,
          iteration: i + 1,
          sessionCreateMs: null,
          timings: null,
          ttsTimings: null,
          error: String(err),
        })
      }
    }

    // Compute stats
    const successful = iterResults.filter((r) => !r.error)
    const stats: ScenarioStats = {
      sessionCreate: computeStats(successful.map((r) => r.sessionCreateMs).filter((v): v is number => v !== null)),
      ttft: computeStats(
        successful
          .map((r) => (r.timings?.firstTextDelta !== null ? r.timings!.firstTextDelta - r.timings!.requestStart : null))
          .filter((v): v is number => v !== null),
      ),
      ttfa: computeStats(
        successful
          .map((r) => {
            if (r.timings?.firstAudio !== null && r.timings) return r.timings.firstAudio - r.timings.requestStart
            if (r.ttsTimings) return r.ttsTimings.ttfb
            return null
          })
          .filter((v): v is number => v !== null),
      ),
      sentenceTtsP50: computeStats(
        successful.map((r) => (r.timings ? sentenceP50(r.timings) : null)).filter((v): v is number => v !== null),
      ),
      total: computeStats(
        successful
          .map((r) => {
            if (r.timings?.doneTime !== null && r.timings) return r.timings.doneTime - r.timings.requestStart
            if (r.ttsTimings) return r.ttsTimings.total
            return null
          })
          .filter((v): v is number => v !== null),
      ),
      audioKB: computeStats(
        successful
          .map((r) => {
            if (r.timings) return r.timings.totalAudioBytes / 1024
            if (r.ttsTimings) return r.ttsTimings.bytes / 1024
            return null
          })
          .filter((v): v is number => v !== null),
      ),
    }

    results.push({ scenario, iterations: iterResults, stats })
  }

  return results
}

async function runVoiceStreamScenario(
  scenario: TestScenario,
  cookie: string,
  verbose: boolean,
): Promise<Omit<IterationResult, 'scenario' | 'iteration'>> {
  // 1. Create session
  const planStart = performance.now()
  const planRes = await fetch(`${BASE_URL}/api/conversation/plan`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie,
    },
    body: JSON.stringify({
      prompt: scenario.planPrompt || 'Free conversation',
      mode: scenario.mode,
      inputMode: 'voice',
    }),
  })

  if (!planRes.ok) {
    const text = await planRes.text()
    throw new Error(`Plan creation failed (${planRes.status}): ${text}`)
  }

  const planData = await planRes.json()
  const sessionId = planData._sessionId
  const sessionCreateMs = performance.now() - planStart

  if (verbose) {
    console.log(`    Session: ${sessionId} (${sessionCreateMs.toFixed(0)}ms)`)
    console.log(`    Plan: ${planData.plan?.topic || planData.plan?.focus || '—'}`)
  }

  // 2. Warmup turns (for warm scenarios)
  let messageHistory: Array<{ role: string; content: string }> = []

  if (scenario.warmupTurns) {
    for (let w = 0; w < scenario.warmupTurns.length; w++) {
      const warmupMessages = [...messageHistory, ...scenario.warmupTurns[w]]
      if (verbose) console.log(`    Warmup turn ${w + 1}...`)

      const warmupRes = await fetch(`${BASE_URL}/api/conversation/voice-stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookie,
        },
        body: JSON.stringify({ sessionId, messages: warmupMessages }),
      })

      if (!warmupRes.ok || !warmupRes.body) {
        throw new Error(`Warmup turn ${w + 1} failed (${warmupRes.status})`)
      }

      // Parse the warmup response to get the assistant's reply
      const warmupTimings = await parseFramesWithTiming(warmupRes.body, performance.now())
      messageHistory = [
        ...warmupMessages,
        { role: 'assistant', content: warmupTimings.fullText },
      ]

      if (verbose) {
        console.log(`    Warmup ${w + 1} done: "${warmupTimings.fullText.slice(0, 60)}..."`)
      }
    }
  }

  // 3. Measured turn
  const measuredMessages = [...messageHistory, ...scenario.messages]
  const requestStart = performance.now()

  const streamRes = await fetch(`${BASE_URL}/api/conversation/voice-stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie,
    },
    body: JSON.stringify({ sessionId, messages: measuredMessages }),
  })

  if (!streamRes.ok || !streamRes.body) {
    throw new Error(`Voice stream failed (${streamRes.status})`)
  }

  const timings = await parseFramesWithTiming(streamRes.body, requestStart)

  if (verbose) {
    const ttft = timings.firstTextDelta !== null ? (timings.firstTextDelta - requestStart).toFixed(0) : '—'
    const ttfa = timings.firstAudio !== null ? (timings.firstAudio - requestStart).toFixed(0) : '—'
    const total = timings.doneTime !== null ? (timings.doneTime - requestStart).toFixed(0) : '—'
    console.log(`    TTFT: ${ttft}ms | TTFA: ${ttfa}ms | Total: ${total}ms`)
    console.log(`    Text: "${timings.fullText.slice(0, 80)}..."`)
    console.log(`    Sentences: ${timings.sentences.length} | Audio: ${(timings.totalAudioBytes / 1024).toFixed(1)}KB`)

    if (timings.error) console.log(`    ERROR: ${timings.error}`)

    for (const s of timings.sentences) {
      const sttfa = s.firstAudioTime !== null ? (s.firstAudioTime - s.startTime).toFixed(0) : '—'
      console.log(`      "${s.text.slice(0, 40)}" → TTS: ${sttfa}ms, ${(s.audioBytes / 1024).toFixed(1)}KB`)
    }
  }

  return {
    sessionCreateMs,
    timings,
    ttsTimings: null,
    error: timings.error,
  }
}

async function runTtsScenario(
  scenario: TestScenario,
  cookie: string,
  verbose: boolean,
): Promise<Omit<IterationResult, 'scenario' | 'iteration'>> {
  const text = scenario.ttsText!
  const requestStart = performance.now()

  const res = await fetch(`${BASE_URL}/api/tts/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie,
    },
    body: JSON.stringify({ text }),
  })

  if (!res.ok || !res.body) {
    throw new Error(`TTS stream failed (${res.status})`)
  }

  // Read the raw PCM stream and measure timing
  const reader = res.body.getReader()
  let firstChunkTime: number | null = null
  let totalBytes = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (firstChunkTime === null) firstChunkTime = performance.now()
    totalBytes += value.length
  }

  const endTime = performance.now()
  const ttfb = firstChunkTime !== null ? firstChunkTime - requestStart : endTime - requestStart
  const total = endTime - requestStart

  if (verbose) {
    console.log(`    TTFB: ${ttfb.toFixed(0)}ms | Total: ${total.toFixed(0)}ms | Audio: ${(totalBytes / 1024).toFixed(1)}KB`)
    console.log(`    Text: "${text.slice(0, 60)}"`)
  }

  return {
    sessionCreateMs: null,
    timings: null,
    ttsTimings: { ttfb, total, bytes: totalBytes },
    error: null,
  }
}
