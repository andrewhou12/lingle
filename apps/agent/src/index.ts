/**
 * LiveKit Agent entry point for Lingle voice conversation.
 *
 * Pipeline: Silero VAD → Turn Detector (MultilingualModel) → Soniox/Deepgram STT → LLM → Cartesia/Rime TTS
 * Turn detection uses LiveKit's multilingual model for context-aware endpointing.
 * Adaptive interruption handling distinguishes real interruptions from backchanneling.
 */
import dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// Load .env from monorepo root (two levels up from apps/agent/src/)
const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '../../../.env') })

// LiveKit Cloud containers lack CA certificates. The Go/Rust FFI binary inside
// @livekit/rtc-node makes HTTPS calls for region detection and fails without them.
// Download Mozilla's CA bundle at startup and point the Go runtime at it.
import { existsSync, writeFileSync, mkdirSync } from 'node:fs'

const CA_BUNDLE_PATH = '/tmp/cacert.pem'

async function ensureCACerts(): Promise<void> {
  // Check standard locations first
  const standardPaths = [
    '/etc/ssl/certs/ca-certificates.crt',
    '/etc/pki/tls/certs/ca-bundle.crt',
    '/etc/ssl/cert.pem',
  ]
  for (const p of standardPaths) {
    if (existsSync(p)) {
      process.env.SSL_CERT_FILE = p
      console.log(`[agent] CA certs found at ${p}`)
      return
    }
  }

  // No system certs — download Mozilla's bundle
  if (existsSync(CA_BUNDLE_PATH)) {
    process.env.SSL_CERT_FILE = CA_BUNDLE_PATH
    console.log(`[agent] CA certs: using cached ${CA_BUNDLE_PATH}`)
    return
  }

  console.log('[agent] no CA certs found, downloading Mozilla bundle...')
  try {
    // Use Node.js built-in fetch (Node 22) — this works without CA certs
    // because Node.js has its own bundled root CAs
    const res = await fetch('https://curl.se/ca/cacert.pem')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const pem = await res.text()
    writeFileSync(CA_BUNDLE_PATH, pem)
    process.env.SSL_CERT_FILE = CA_BUNDLE_PATH
    console.log(`[agent] CA certs: downloaded to ${CA_BUNDLE_PATH} (${pem.length} bytes)`)
  } catch (err) {
    console.error(`[agent] FATAL: failed to download CA certs: ${err instanceof Error ? err.message : String(err)}`)
  }
}

await ensureCACerts()

// Polyfill WebSocket for Node.js < 22 (required by @soniox/node which uses the browser WS API)
if (typeof globalThis.WebSocket === 'undefined') {
  // @ts-ignore - ws is a transitive dep
  const { WebSocket } = await import('ws')
  // @ts-ignore
  globalThis.WebSocket = WebSocket
}

import { defineAgent, cli, WorkerOptions, type JobContext, type JobProcess } from '@livekit/agents'
import { voice, tts } from '@livekit/agents'
import * as deepgram from '@livekit/agents-plugin-deepgram'
import * as cartesia from '@livekit/agents-plugin-cartesia'
import * as rime from '@livekit/agents-plugin-rime'
import * as openai from '@livekit/agents-plugin-openai'
import * as google from '@livekit/agents-plugin-google'
import * as livekit from '@livekit/agents-plugin-livekit'

import { LingleAgent } from './lingle-agent.js'
import { ClaudeLLM } from './claude-llm.js'
import { TTS as CartesiaPersistentTTS } from './cartesia-tts.js'
import { TTS as RimePersistentTTS } from './rime-tts.js'
import {
  parseAgentMetadata,
  getCartesiaVoiceId,
  getRimeVoiceId,
  getDeepgramLanguage,
  getCartesiaLanguage,
  getRimeLanguage,
  getSonioxLanguageHints,
  resolveAgentTtsProvider,
  resolveAgentSttProvider,
  type AgentMetadata,
} from './config.js'
import { STT as SonioxSTT } from './soniox-stt.js'

// Deploy version — bump this on each deploy to confirm the right code is running
const DEPLOY_VERSION = '2025-03-19e'

// ── Diagnostic logger with elapsed time ──
const t0 = Date.now()
function log(msg: string) {
  const elapsed = ((Date.now() - t0) / 1000).toFixed(2)
  console.log(`[agent +${elapsed}s] ${msg}`)
}

// ── Per-turn latency tracker ──
// Collects timestamps at each pipeline stage and prints a consolidated breakdown.
class TurnLatencyTracker {
  private turnId = 0
  private eouTs = 0              // end-of-utterance committed
  private lastSpeakingTs = 0     // when user actually stopped speaking (from eou_metrics)
  private speakingTs = 0         // agent state → speaking (first audio sent to room)
  private sttFinalTs = 0         // STT final transcript received
  private llmFirstTs = 0         // LLM first token
  private ttsFirstTs = 0         // TTS first audio byte
  private eouDelayMs = 0         // total EOU delay (VAD silence + turn detector + endpointing)
  private transcriptionDelayMs = 0 // time to get transcript after speech ended
  private turnDetectorDelayMs = 0 // turn detector inference time (0 if not using turn detector)
  private llmTtftMs = 0          // LLM TTFT from its own metrics
  private ttsTtfbMs = 0          // TTS TTFB from its own metrics
  private llmTotalMs = 0
  private llmTokens = 0
  private ttsTotalMs = 0

  /** Called when agent state transitions to speaking (first audio going out) */
  markSpeaking() {
    this.speakingTs = Date.now()
    if (this.lastSpeakingTs) {
      const wallClockE2E = this.speakingTs - this.lastSpeakingTs
      log(`[latency] WALL-CLOCK E2E: ${wallClockE2E}ms  (user silent → agent speaking)`)
    }
  }

  /** Called when EOU is committed (after turn detector decision + endpointing delay) */
  markEOU(eouDelayMs: number, transcriptionDelayMs: number, lastSpeakingTimeMs: number, turnDetectorDelayMs?: number) {
    this.turnId++
    this.eouTs = Date.now()
    this.lastSpeakingTs = lastSpeakingTimeMs || Date.now() - eouDelayMs  // fallback: approximate from eouDelay
    this.eouDelayMs = eouDelayMs
    this.transcriptionDelayMs = transcriptionDelayMs
    this.turnDetectorDelayMs = turnDetectorDelayMs || 0
    this.sttFinalTs = 0
    this.llmFirstTs = 0
    this.ttsFirstTs = 0
    this.speakingTs = 0
    this.llmTtftMs = 0
    this.ttsTtfbMs = 0
    this.llmTotalMs = 0
    this.llmTokens = 0
    this.ttsTotalMs = 0
    log(`[latency] ──── TURN ${this.turnId} START ────`)
    const tdInfo = this.turnDetectorDelayMs ? `, turnDetector=${this.turnDetectorDelayMs.toFixed(0)}ms` : ''
    log(`[latency] EOU committed (eouDelay=${eouDelayMs.toFixed(0)}ms, transcriptionDelay=${transcriptionDelayMs.toFixed(0)}ms${tdInfo}, lastSpeakingTime=${lastSpeakingTimeMs.toFixed(0)})`)
  }

  /** Called when STT emits final transcript */
  markSTTFinal(transcript: string) {
    this.sttFinalTs = Date.now()
    const sinceEou = this.eouTs ? this.sttFinalTs - this.eouTs : 0
    log(`[latency] STT final: +${sinceEou}ms after EOU — "${transcript.slice(0, 60)}"`)
  }

  /** Called when LLM metrics arrive */
  markLLM(ttftMs: number, totalMs: number, tokens: number) {
    this.llmFirstTs = this.llmFirstTs || Date.now()
    this.llmTtftMs = ttftMs
    this.llmTotalMs = totalMs
    this.llmTokens = tokens
    const sinceEou = this.eouTs ? Date.now() - this.eouTs : 0
    log(`[latency] LLM: ttft=${ttftMs.toFixed(0)}ms total=${totalMs.toFixed(0)}ms tokens=${tokens} (+${sinceEou}ms since EOU)`)
  }

  /** Called when TTS metrics arrive */
  markTTS(ttfbMs: number, totalMs: number) {
    this.ttsFirstTs = this.ttsFirstTs || Date.now()
    this.ttsTtfbMs = ttfbMs
    this.ttsTotalMs = totalMs
    const sinceEou = this.eouTs ? Date.now() - this.eouTs : 0
    log(`[latency] TTS: ttfb=${ttfbMs.toFixed(0)}ms total=${totalMs.toFixed(0)}ms (+${sinceEou}ms since EOU)`)
    this.printSummary()
  }

  /** Print consolidated turn breakdown */
  private printSummary() {
    if (!this.eouTs) return

    const sttProcessing = this.sttFinalTs && this.eouTs ? this.sttFinalTs - this.eouTs : 0
    const estimatedE2E = this.eouDelayMs + this.llmTtftMs + this.ttsTtfbMs
    const wallClockE2E = this.lastSpeakingTs && this.speakingTs ? this.speakingTs - this.lastSpeakingTs : 0

    log(`[latency] ──── TURN ${this.turnId} SUMMARY ────`)
    log(`[latency]   EOU delay:          ${this.eouDelayMs.toFixed(0)}ms  (VAD silence + turn detector + endpointing)`)
    if (this.turnDetectorDelayMs) {
      const vadOnly = Math.max(0, this.eouDelayMs - this.turnDetectorDelayMs)
      log(`[latency]     ├─ VAD+endpointing: ${vadOnly.toFixed(0)}ms`)
      log(`[latency]     └─ Turn detector:   ${this.turnDetectorDelayMs.toFixed(0)}ms  (MultilingualModel inference)`)
    }
    log(`[latency]   Transcription delay: ${this.transcriptionDelayMs.toFixed(0)}ms`)
    log(`[latency]   EOU → STT final:    ${sttProcessing}ms`)
    log(`[latency]   LLM TTFT:           ${this.llmTtftMs.toFixed(0)}ms`)
    log(`[latency]   LLM total:          ${this.llmTotalMs.toFixed(0)}ms (${this.llmTokens} tokens)`)
    log(`[latency]   TTS TTFB:           ${this.ttsTtfbMs.toFixed(0)}ms`)
    log(`[latency]   TTS total:          ${this.ttsTotalMs.toFixed(0)}ms`)
    log(`[latency]   ─────────────────────────`)
    if (wallClockE2E) {
      log(`[latency]   🎯 WALL-CLOCK E2E:  ${wallClockE2E}ms  (VAD silence → agent speaking)`)
    }
    log(`[latency]   Sum E2E (stages):   ${estimatedE2E.toFixed(0)}ms  (EOU + LLM TTFT + TTS TTFB)`)
    log(`[latency]   * neither includes WebRTC transport or client-side audio playout`)
    log(`[latency] ──── END TURN ${this.turnId} ────`)
  }
}

const turnTracker = new TurnLatencyTracker()

function buildStt(metadata: AgentMetadata): deepgram.STT | SonioxSTT {
  const provider = resolveAgentSttProvider(metadata)
  const targetLang = metadata.targetLanguage || 'Japanese'

  if (provider === 'soniox') {
    const hints = getSonioxLanguageHints(targetLang)
    log(`STT=soniox hints=${hints.join(',')}`)
    return new SonioxSTT({
      languageHints: hints,
      sampleRate: 24000,
      enableEndpointDetection: true,
      maxEndpointDelayMs: 0,
    })
  }

  const deepgramLang = getDeepgramLanguage(targetLang)
  log(`STT=deepgram lang=${deepgramLang}`)
  return new deepgram.STT({ model: 'nova-3', language: deepgramLang })
}

function buildTts(metadata: AgentMetadata): tts.TTS {
  const provider = resolveAgentTtsProvider(metadata)
  const targetLang = metadata.targetLanguage || 'Japanese'

  if (provider === 'rime') {
    const rimeLang = getRimeLanguage(targetLang)
    const speaker = metadata.voiceId || getRimeVoiceId(rimeLang)
    log(`TTS=rime-persistent speaker=${speaker} lang=${rimeLang}`)
    return new RimePersistentTTS({
      speaker,
      lang: rimeLang,
      samplingRate: 24000,
      speedAlpha: 1.0,
      reduceLatency: true,
    })
  }

  const cartesiaLang = getCartesiaLanguage(targetLang)
  const voiceId = metadata.voiceId || getCartesiaVoiceId(cartesiaLang)
  log(`TTS=cartesia-persistent voice=${voiceId} lang=${cartesiaLang}`)
  return new CartesiaPersistentTTS({
    model: 'sonic-3',
    voice: voiceId,
    language: cartesiaLang,
    speed: cartesiaLang === 'ja' ? 0.8 : 1.15,
    sampleRate: 24000,
    wordTimestamps: false,
  })
}

// ── Network RTT probe ──
// Measures baseline round-trip time to each external service.
async function probeNetworkLatency(): Promise<void> {
  const targets: { name: string; url: string }[] = [
    { name: 'OpenAI', url: 'https://api.openai.com/v1/models' },
    { name: 'Cartesia', url: 'https://api.cartesia.ai/' },
    { name: 'Soniox', url: 'https://api.soniox.com/' },
    { name: 'Anthropic', url: 'https://api.anthropic.com/' },
  ]

  const results: string[] = []
  await Promise.all(
    targets.map(async ({ name, url }) => {
      const start = Date.now()
      try {
        await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000) })
        results.push(`${name}=${Date.now() - start}ms`)
      } catch {
        results.push(`${name}=ERR(${Date.now() - start}ms)`)
      }
    }),
  )

  // Try to detect agent region from metadata endpoint (works on most cloud providers)
  let region = 'unknown'
  try {
    // GCP
    const res = await fetch('http://metadata.google.internal/computeMetadata/v1/instance/zone', {
      headers: { 'Metadata-Flavor': 'Google' },
      signal: AbortSignal.timeout(1000),
    })
    if (res.ok) region = (await res.text()).split('/').pop() || 'gcp-unknown'
  } catch {
    try {
      // AWS
      const res = await fetch('http://169.254.169.254/latest/meta-data/placement/region', {
        signal: AbortSignal.timeout(1000),
      })
      if (res.ok) region = await res.text()
    } catch {
      // Not on GCP or AWS — that's fine
    }
  }

  log(`[network] RTT: ${results.join('  ')}  agent_region=${region}`)
}

export default defineAgent({
  prewarm: async (_proc: JobProcess) => {
    log('prewarm called (no-op)')
  },

  entry: async (ctx: JobContext) => {
    const entryStart = Date.now()
    const metadata = parseAgentMetadata(ctx.job.metadata)
    const targetLang = metadata.targetLanguage || 'Japanese'
    log(`entry START — deploy=${DEPLOY_VERSION} lang=${targetLang} pid=${process.pid}`)
    log(`job.id=${ctx.job.id ?? 'none'} metadata=${ctx.job.metadata?.slice(0, 200) ?? 'none'}`)

    // Probe network latency to external services (non-blocking)
    probeNetworkLatency().catch(() => {})

    // Raw Haiku TTFT test — bare API call, no framework overhead
    ;(async () => {
      try {
        const { default: Anthropic } = await import('@anthropic-ai/sdk')
        const client = new Anthropic()
        const t = Date.now()
        const stream = client.messages.stream({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 50,
          stream: true,
          messages: [{ role: 'user', content: 'Say hello in one sentence.' }],
        })
        let ttft = 0
        for await (const event of stream) {
          if (!ttft && event.type === 'content_block_delta') {
            ttft = Date.now() - t
          }
        }
        const total = Date.now() - t
        log(`[haiku-probe] raw TTFT=${ttft}ms total=${total}ms (no framework)`)
      } catch (err) {
        log(`[haiku-probe] failed: ${err instanceof Error ? err.message : String(err)}`)
      }
    })()

    // Log environment state
    log(`env: OPENAI_API_KEY=${process.env.OPENAI_API_KEY ? 'set' : 'MISSING'}`)
    log(`env: SONIOX_API_KEY=${process.env.SONIOX_API_KEY ? 'set' : 'MISSING'}`)
    log(`env: CARTESIA_API_KEY=${process.env.CARTESIA_API_KEY ? 'set' : 'MISSING'}`)
    log(`env: RIME_API_KEY=${process.env.RIME_API_KEY ? 'set' : 'MISSING'}`)
    log(`env: ANTHROPIC_API_KEY=${process.env.ANTHROPIC_API_KEY ? 'set' : 'MISSING'}`)

    // ── Step 1: Connect to room ──
    // LiveKit Cloud containers lack CA certificates, so the Go FFI binary
    // inside @livekit/rtc-node fails on the HTTPS /settings/regions call.
    // Monkey-patch room.connect to rewrite https:// → wss:// before the
    // URL reaches the FFI layer. The Rust/Go SDK skips region detection
    // for wss:// URLs and connects directly via WebSocket.
    const room = ctx.room
    const originalConnect = room.connect.bind(room)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    room.connect = async (url: string, token: string, opts?: any) => {
      const rewritten = url.replace(/^https:\/\//, 'wss://')
      log(`step 1: intercepted room.connect — ${url} → ${rewritten}`)
      return originalConnect(rewritten, token, opts)
    }

    log(`step 1: ctx.connect() starting... url=${ctx.info.url}`)
    const connectStart = Date.now()
    try {
      await Promise.race([
        ctx.connect(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('ctx.connect() timed out after 15s')), 15000)
        ),
      ])
    } catch (err) {
      log(`step 1: ctx.connect() FAILED after ${Date.now() - connectStart}ms: ${err instanceof Error ? err.message : String(err)}`)
      throw err
    }
    log(`step 1: ctx.connect() resolved in ${Date.now() - connectStart}ms`)

    if (!ctx.room) {
      throw new Error('ctx.room is undefined after connect — aborting')
    }
    log(`step 1: room.name=${ctx.room.name} remoteParticipants=${ctx.room.remoteParticipants?.size ?? '?'}`)

    // ── Step 2: Load VAD (safe now — DTLS done) ──
    log(`step 2: loading VAD model...`)
    const vadStart = Date.now()
    const { VAD } = await import('@livekit/agents-plugin-silero')
    const vad = await VAD.load({
      activationThreshold: 0.5,
      minSpeechDuration: 100,
      minSilenceDuration: 200,
      prefixPaddingDuration: 200,
    })
    log(`step 2: VAD loaded in ${Date.now() - vadStart}ms`)

    // Turn detector: required for preemptive generation to work correctly.
    // Without it, the framework starts LLM on partial transcripts → wrong responses.
    // Adds ~750ms to EOU, but preemptive gen runs the LLM during that window,
    // so the net latency impact is minimal (~LLM TTFT is hidden behind turn detector).
    const turnDetector = new livekit.turnDetector.MultilingualModel()

    // ── Step 3: Create AgentSession ──
    log(`step 3: creating AgentSession...`)
    const stt = buildStt(metadata)
    const ttsInstance = buildTts(metadata)

    // LLM provider selection via AGENT_LLM_PROVIDER env var.
    // Options: claude (default), openai, openai-nano, gemini
    const llmProvider = process.env.AGENT_LLM_PROVIDER || 'claude'
    let llm: InstanceType<typeof ClaudeLLM> | openai.LLM | google.LLM
    let llmLabel: string

    switch (llmProvider) {
      case 'openai':
        llm = new openai.LLM({ model: 'gpt-4.1-mini', maxCompletionTokens: 300 })
        llmLabel = 'openai/gpt-4.1-mini'
        break
      case 'openai-nano':
        llm = new openai.LLM({ model: 'gpt-4.1-nano', maxCompletionTokens: 300 })
        llmLabel = 'openai/gpt-4.1-nano'
        break
      case 'gemini':
        llm = new google.LLM({ model: 'gemini-2.5-flash', maxOutputTokens: 300 })
        llmLabel = 'google/gemini-2.5-flash'
        break
      default:
        llm = new ClaudeLLM({ model: 'claude-haiku-4-5-20251001', maxTokens: 200 })
        llmLabel = 'claude-haiku-4.5'
        break
    }

    log(`step 3: providers created (stt=${stt.constructor.name} llm=${llmLabel} tts=${ttsInstance.constructor.name})`)

    // Preemptive generation: only works with Cartesia, which supports concurrent
    // context_id isolation. Rime's protocol explicitly does NOT maintain multiple
    // simultaneous context IDs — preemptive streams contaminate the shared
    // connection and cause audio from wrong responses to leak through.
    const ttsProvider = resolveAgentTtsProvider(metadata)
    const usePreemptiveGen = ttsProvider === 'cartesia'

    const session = new voice.AgentSession({
      vad,
      stt,
      llm,
      tts: ttsInstance,
      turnDetection: turnDetector,
      voiceOptions: {
        preemptiveGeneration: usePreemptiveGen,
        // Node.js SDK uses MILLISECONDS (not seconds like Python)
        minEndpointingDelay: 500,
        maxEndpointingDelay: 3000,
        minInterruptionDuration: 500,
        minInterruptionWords: 0,
      },
    })
    log(`step 3: preemptiveGeneration=${usePreemptiveGen} (tts=${ttsProvider})`)
    log(`step 3: AgentSession created`)

    // ── Metrics + error logging ──
    session.on(voice.AgentSessionEventTypes.MetricsCollected, (ev) => {
      const m = ev.metrics
      if (m.type === 'eou_metrics') {
        const tdDelay = (m as unknown as { turnDetectorDelayMs?: number }).turnDetectorDelayMs
        turnTracker.markEOU(m.endOfUtteranceDelayMs, m.transcriptionDelayMs, m.lastSpeakingTimeMs, tdDelay)
      } else if (m.type === 'llm_metrics') {
        turnTracker.markLLM(m.ttftMs, m.durationMs, m.completionTokens)
      } else if (m.type === 'tts_metrics') {
        turnTracker.markTTS(m.ttfbMs, m.durationMs)
      }
    })

    session.on(voice.AgentSessionEventTypes.AgentStateChanged, (ev) => {
      const oldState = (ev as unknown as { oldState?: string }).oldState ?? '?'
      const newState = (ev as unknown as { newState?: string }).newState ?? '?'
      log(`[event] agent state: ${oldState} → ${newState}`)
      if (newState === 'speaking') {
        turnTracker.markSpeaking()
      }
    })

    session.on(voice.AgentSessionEventTypes.UserInputTranscribed, (ev) => {
      const transcript = (ev as unknown as { transcript?: string }).transcript ?? ''
      const isFinal = (ev as unknown as { isFinal?: boolean }).isFinal ?? false
      log(`[event] user transcribed (final=${isFinal}): "${transcript.slice(0, 100)}"`)
      if (isFinal && transcript.trim()) {
        turnTracker.markSTTFinal(transcript)
      }
    })

    session.on(voice.AgentSessionEventTypes.Error, (ev) => {
      log(`[event] ERROR: ${ev instanceof Error ? ev.message : JSON.stringify(ev)}`)
    })

    session.on(voice.AgentSessionEventTypes.Close, () => {
      log(`[event] session closed`)
    })

    // ── Step 4: Start session ──
    const agent = new LingleAgent(metadata)
    log(`step 4: session.start() starting...`)
    const startStart = Date.now()
    try {
      await Promise.race([
        session.start({ room: ctx.room, agent }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('session.start() timed out after 30s')), 30000)
        ),
      ])
    } catch (err) {
      log(`step 4: session.start() FAILED after ${Date.now() - startStart}ms: ${err instanceof Error ? err.message : String(err)}`)
      throw err
    }
    log(`step 4: session.start() resolved in ${Date.now() - startStart}ms`)

    // ── Step 5: Data channel listener ──
    log(`step 5: setting up data channel listener`)
    ctx.room.on('dataReceived', (payload: Uint8Array) => {
      try {
        const decoded = new TextDecoder().decode(payload)
        const message = JSON.parse(decoded)
        if (message.type === 'chat' && typeof message.text === 'string' && message.text.trim()) {
          log(`chat message received: "${message.text}"`)
          session.generateReply({ userInput: message.text.trim() })
        }
      } catch {
        // Not JSON or not a chat message — ignore
      }
    })

    // ── Step 6: Wait for participant ──
    log(`step 6: waiting for participant...`)
    const waitStart = Date.now()
    const participant = await ctx.waitForParticipant()
    log(`step 6: participant joined in ${Date.now() - waitStart}ms — identity=${participant.identity}`)

    // ── Step 7: Generate greeting ──
    log(`step 7: generating greeting...`)
    session.generateReply()

    log(`entry COMPLETE — total setup time: ${Date.now() - entryStart}ms`)
  },
})

// Boot the agent worker when run directly
const thisFile = fileURLToPath(import.meta.url)
if (resolve(process.argv[1]) === thisFile) {
  cli.runApp(new WorkerOptions({
    agent: thisFile,
    agentName: 'lingle-agent',
    numIdleProcesses: 1,
  }))
}
