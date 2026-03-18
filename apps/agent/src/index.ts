/**
 * LiveKit Agent entry point for Lingle voice conversation.
 *
 * Pipeline: Silero VAD → Soniox/Deepgram STT → GPT-4o mini LLM → Cartesia/Rime TTS
 * Post-turn analysis runs async via Claude Haiku (not latency-critical).
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

import { LingleAgent } from './lingle-agent.js'
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
  private eouTs = 0        // end-of-utterance detected (VAD)
  private sttFinalTs = 0   // STT final transcript received
  private llmFirstTs = 0   // LLM first token
  private ttsFirstTs = 0   // TTS first audio byte
  private eouDelayMs = 0   // VAD's internal EOU delay
  private llmTtftMs = 0    // LLM TTFT from its own metrics
  private ttsTtfbMs = 0    // TTS TTFB from its own metrics
  private llmTotalMs = 0
  private llmTokens = 0
  private ttsTotalMs = 0

  /** Called when user speech ends (EOU detected by VAD) */
  markEOU(delayMs: number) {
    this.turnId++
    this.eouTs = Date.now()
    this.eouDelayMs = delayMs
    this.sttFinalTs = 0
    this.llmFirstTs = 0
    this.ttsFirstTs = 0
    this.llmTtftMs = 0
    this.ttsTtfbMs = 0
    this.llmTotalMs = 0
    this.llmTokens = 0
    this.ttsTotalMs = 0
    log(`[latency] ──── TURN ${this.turnId} START ────`)
    log(`[latency] EOU detected (VAD delay=${delayMs.toFixed(0)}ms)`)
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

    // Estimated end-to-end: EOU delay + STT processing + LLM TTFT + TTS TTFB
    const sttProcessing = this.sttFinalTs && this.eouTs ? this.sttFinalTs - this.eouTs : 0
    const estimatedE2E = this.eouDelayMs + this.llmTtftMs + this.ttsTtfbMs

    log(`[latency] ──── TURN ${this.turnId} SUMMARY ────`)
    log(`[latency]   VAD EOU delay:    ${this.eouDelayMs.toFixed(0)}ms`)
    log(`[latency]   EOU → STT final:  ${sttProcessing}ms`)
    log(`[latency]   LLM TTFT:         ${this.llmTtftMs.toFixed(0)}ms`)
    log(`[latency]   LLM total:        ${this.llmTotalMs.toFixed(0)}ms (${this.llmTokens} tokens)`)
    log(`[latency]   TTS TTFB:         ${this.ttsTtfbMs.toFixed(0)}ms`)
    log(`[latency]   TTS total:        ${this.ttsTotalMs.toFixed(0)}ms`)
    log(`[latency]   ─────────────────────────`)
    log(`[latency]   Estimated E2E*:   ${estimatedE2E.toFixed(0)}ms  (EOU + LLM TTFT + TTS TTFB)`)
    log(`[latency]   * does not include WebRTC transport or audio playout delay`)
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
      maxEndpointDelayMs: 2000,
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
    log(`TTS=rime speaker=${speaker} lang=${rimeLang}`)
    return new rime.TTS({
      modelId: 'arcana',
      speaker,
      lang: rimeLang,
      speedAlpha: 1.0,
      samplingRate: 24000,
      temperature: 0.3,
      repetition_penalty: 1.1,
    })
  }

  const cartesiaLang = getCartesiaLanguage(targetLang)
  const voiceId = metadata.voiceId || getCartesiaVoiceId(cartesiaLang)
  log(`TTS=cartesia voice=${voiceId} lang=${cartesiaLang}`)
  return new cartesia.TTS({
    model: 'sonic-3',
    voice: voiceId,
    language: cartesiaLang,
    speed: cartesiaLang === 'ja' ? 0.8 : 1.15,
    sampleRate: 24000,
    wordTimestamps: cartesiaLang === 'en',
  })
}

export default defineAgent({
  prewarm: async (_proc: JobProcess) => {
    log('prewarm called (no-op)')
  },

  entry: async (ctx: JobContext) => {
    const entryStart = Date.now()
    const metadata = parseAgentMetadata(ctx.job.metadata)
    const targetLang = metadata.targetLanguage || 'Japanese'
    log(`entry START — lang=${targetLang} pid=${process.pid}`)
    log(`job.id=${ctx.job.id ?? 'none'} metadata=${ctx.job.metadata?.slice(0, 200) ?? 'none'}`)

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
      activationThreshold: 0.65,
      minSpeechDuration: 150,
    })
    log(`step 2: VAD loaded in ${Date.now() - vadStart}ms`)

    // ── Step 3: Create AgentSession ──
    log(`step 3: creating AgentSession...`)
    const stt = buildStt(metadata)
    const ttsInstance = buildTts(metadata)
    const llm = new openai.LLM({
      model: 'gpt-4o-mini',
      maxCompletionTokens: 300,
    })
    log(`step 3: providers created (stt=${stt.constructor.name} llm=gpt-4o-mini tts=${ttsInstance.constructor.name})`)

    const session = new voice.AgentSession({
      vad,
      stt,
      llm,
      tts: ttsInstance,
      voiceOptions: {
        preemptiveGeneration: true,
        minEndpointingDelay: 0.5,
        maxEndpointingDelay: 3.0,
        minInterruptionDuration: 0.3,
        minInterruptionWords: 1,
      },
    })
    log(`step 3: AgentSession created`)

    // ── Metrics + error logging ──
    session.on(voice.AgentSessionEventTypes.MetricsCollected, (ev) => {
      const m = ev.metrics
      if (m.type === 'eou_metrics') {
        turnTracker.markEOU(m.endOfUtteranceDelayMs)
      } else if (m.type === 'llm_metrics') {
        turnTracker.markLLM(m.ttftMs, m.durationMs, m.completionTokens)
      } else if (m.type === 'tts_metrics') {
        turnTracker.markTTS(m.ttfbMs, m.durationMs)
      }
    })

    session.on(voice.AgentSessionEventTypes.AgentStateChanged, (ev) => {
      log(`[event] agent state: ${(ev as unknown as { oldState?: string }).oldState ?? '?'} → ${(ev as unknown as { newState?: string }).newState ?? '?'}`)
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
