/**
 * LiveKit Agent entry point for Lingle voice conversation.
 *
 * Uses:
 * - Silero VAD for voice activity detection
 * - Soniox for STT (Deepgram available via AGENT_STT_PROVIDER=deepgram or metadata)
 * - GPT-4o mini for conversation LLM (optimized for voice latency)
 * - Claude Haiku for async analysis (post-turn, not latency-critical)
 * - Cartesia Sonic or Rime Arcana TTS (configurable via metadata or AGENT_TTS_PROVIDER env)
 */
import dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// Load .env from monorepo root (two levels up from apps/agent/src/)
const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '../../../.env') })

// Polyfill WebSocket for Node.js < 22 (required by @soniox/node which uses the browser WS API)
if (typeof globalThis.WebSocket === 'undefined') {
  // @ts-ignore - ws is a transitive dep; no types needed for this one-liner polyfill
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

import OpenAIClient from 'openai'
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

/** Build the STT instance based on the resolved provider */
function buildStt(metadata: AgentMetadata): deepgram.STT | SonioxSTT {
  const provider = resolveAgentSttProvider(metadata)
  const targetLang = metadata.targetLanguage || 'Japanese'

  if (provider === 'soniox') {
    const hints = getSonioxLanguageHints(targetLang)
    console.log(`[agent] STT=soniox hints=${hints.join(',')}`)
    return new SonioxSTT({
      languageHints: hints,
      sampleRate: 48000,
      enableEndpointDetection: true,
      maxEndpointDelayMs: 2000,
    })
  }

  const deepgramLang = getDeepgramLanguage(targetLang)
  console.log(`[agent] STT=deepgram lang=${deepgramLang}`)
  return new deepgram.STT({ model: 'nova-3', language: deepgramLang })
}

/** Build the TTS instance based on the resolved provider */
function buildTts(metadata: AgentMetadata): tts.TTS {
  const provider = resolveAgentTtsProvider(metadata)
  const targetLang = metadata.targetLanguage || 'Japanese'

  if (provider === 'rime') {
    const rimeLang = getRimeLanguage(targetLang)
    const speaker = metadata.voiceId || getRimeVoiceId(rimeLang)
    console.log(`[agent] TTS=rime speaker=${speaker} lang=${rimeLang}`)
    return new rime.TTS({
      modelId: 'arcana',
      speaker,
      lang: rimeLang,
      speedAlpha: 1.0,
      samplingRate: 24000,
      // Lower temperature = more consistent voice across separate synthesis calls.
      // Critical because the Rime plugin doesn't support streaming — each sentence
      // is an independent API call with no shared voice state.
      temperature: 0.3,
      repetition_penalty: 1.1,
    })
  }

  // Default: Cartesia Sonic
  const cartesiaLang = getCartesiaLanguage(targetLang)
  const voiceId = metadata.voiceId || getCartesiaVoiceId(cartesiaLang)
  console.log(`[agent] TTS=cartesia voice=${voiceId} lang=${cartesiaLang}`)
  return new cartesia.TTS({
    model: 'sonic-3',
    voice: voiceId,
    language: cartesiaLang,
    speed: cartesiaLang === 'ja' ? 0.8 : 1.15,
    sampleRate: 24000,
    // Cartesia only supports word timestamps for English
    wordTimestamps: cartesiaLang === 'en',
  })
}

export default defineAgent({
  prewarm: async (_proc: JobProcess) => {
    // Intentionally lightweight — do NOT load heavy models here.
    // A new idle process spawns immediately after each dispatch and its prewarm
    // runs concurrently with the active job's WebRTC DTLS handshake. Loading the
    // Silero ONNX model during prewarm spikes CPU to ~0.85, causing the DTLS
    // handshake to time out and room.connect() to fail silently.
    // VAD is loaded in entry() instead, before session.start().
  },

  entry: async (ctx: JobContext) => {
    console.log('[agent] entry started, job metadata:', ctx.job.metadata)
    const metadata = parseAgentMetadata(ctx.job.metadata)

    const targetLang = metadata.targetLanguage || 'Japanese'
    console.log(`[agent] language=${targetLang}`)

    // Load VAD here (not in prewarm) so it doesn't race with the idle-process
    // prewarm that spawns concurrently. By the time session.start() is called,
    // the idle process prewarm has finished and CPU is free for WebRTC.
    console.log('[agent] loading VAD model...')
    const { VAD } = await import('@livekit/agents-plugin-silero')
    const vad = await VAD.load({
      activationThreshold: 0.65,
      minSpeechDuration: 150,
    })
    console.log('[agent] VAD model loaded')

    // Create the voice agent session
    // LLM: GPT-4o mini for conversation (290ms median TTFT vs ~600ms+ Claude Haiku)
    // Analysis still uses Claude Haiku (async, not latency-critical)
    const session = new voice.AgentSession({
      vad,
      stt: buildStt(metadata),
      llm: new openai.LLM({
        model: 'gpt-4o-mini',
        maxCompletionTokens: 300,
      }),
      tts: buildTts(metadata),
      // MultilingualModel removed: its 396MB ONNX loads concurrently with
      // DTLS inside session.start(), spiking CPU above the 0.7 threshold and
      // killing the room connection. Using VAD-based turn detection for now.
      voiceOptions: {
        preemptiveGeneration: true,
        minEndpointingDelay: 0.5,
        maxEndpointingDelay: 3.0,
        minInterruptionDuration: 0.3,
        minInterruptionWords: 1,
      },
    })

    // ─── Comprehensive latency instrumentation ───
    // Track per-turn timing across the full STT→LLM→TTS pipeline
    let eouTimestamp = 0
    let llmFirstTokenAt = 0
    let preemptiveStartAt = 0

    session.on(voice.AgentSessionEventTypes.MetricsCollected, (ev) => {
      const m = ev.metrics
      if (m.type === 'eou_metrics') {
        eouTimestamp = Date.now()
        console.log(
          `[metrics:EOU] endOfUtteranceDelay=${m.endOfUtteranceDelayMs.toFixed(0)}ms` +
          ` transcriptionDelay=${m.transcriptionDelayMs.toFixed(0)}ms` +
          ` turnDetectionDelay=${(m.endOfUtteranceDelayMs - m.transcriptionDelayMs).toFixed(0)}ms`,
        )
      } else if (m.type === 'llm_metrics') {
        llmFirstTokenAt = Date.now() - m.durationMs + m.ttftMs
        const effectiveTtft = eouTimestamp ? Math.max(0, llmFirstTokenAt - eouTimestamp) : m.ttftMs
        console.log(
          `[metrics:LLM] ttft=${m.ttftMs.toFixed(0)}ms` +
          ` effectiveTtft=${effectiveTtft.toFixed(0)}ms` +
          ` total=${m.durationMs.toFixed(0)}ms` +
          ` tokens=${m.completionTokens}` +
          ` cached=${m.promptCachedTokens}` +
          ` cancelled=${m.cancelled}`,
        )
      } else if (m.type === 'tts_metrics') {
        console.log(
          `[metrics:TTS] ttfb=${m.ttfbMs.toFixed(0)}ms` +
          ` total=${m.durationMs.toFixed(0)}ms` +
          ` chars=${m.charactersCount}` +
          ` cancelled=${m.cancelled}`,
        )
      } else if (m.type === 'vad_metrics') {
        console.log(`[metrics:VAD] speechDuration=${(m as unknown as { speechDurationMs?: number }).speechDurationMs ?? '?'}ms`)
      }
    })

    // Track preemptive generation start
    session.on(voice.AgentSessionEventTypes.SpeechCreated, () => {
      preemptiveStartAt = Date.now()
    })

    // Track actual voice-to-voice: EOU → agent starts speaking (first audio playout)
    session.on(voice.AgentSessionEventTypes.AgentStateChanged, (ev) => {
      if (ev.newState === 'speaking' && eouTimestamp > 0) {
        const voiceToVoice = Date.now() - eouTimestamp
        const preemptiveSaved = preemptiveStartAt > 0 && preemptiveStartAt < eouTimestamp
          ? eouTimestamp - preemptiveStartAt
          : 0
        console.log(
          `[metrics:PIPELINE] voice-to-voice=${voiceToVoice}ms` +
          ` (EOU → first audio playout)` +
          (preemptiveSaved > 0 ? ` preemptiveSaved=${preemptiveSaved}ms` : ''),
        )
      }
    })

    // Start the agent session. session.start() internally calls ctx.connect()
    // concurrently with _updateActivity() (which publishes the audio track).
    // Both must run together — awaiting ctx.connect() standalone hangs because
    // the native rtc-node WebRTC negotiation only completes once a local track
    // is published.
    // Log the URL the agent uses to connect (from job context)
    console.log(`[agent] connect url=${('url' in ctx.info ? (ctx.info as Record<string, unknown>).url : 'n/a')}`)

    // Track room connection state changes in real time
    const roomAny = ctx.room as unknown as { on?: (e: string, cb: (...a: unknown[]) => void) => void, connectionState?: unknown }
    if (roomAny.on) {
      roomAny.on('connectionStateChanged', (state: unknown) => {
        console.log(`[agent] connectionStateChanged: ${state} room=${ctx.room.name ?? 'undefined'} remoteCount=${ctx.room.remoteParticipants.size}`)
      })
    }

    const agent = new LingleAgent(metadata)
    console.log('[agent] calling session.start...')
    await session.start({ room: ctx.room, agent })
    console.log(
      `[agent] session started — room=${ctx.room.name} sid=${'sid' in ctx.room ? (ctx.room as Record<string, unknown>).sid : 'n/a'}` +
      ` localIdentity=${ctx.room.localParticipant?.identity ?? 'none'}` +
      ` remoteCount=${ctx.room.remoteParticipants.size}` +
      ` connectionState=${roomAny.connectionState ?? 'n/a'}`,
    )

    // Poll room state every 2s for 20s to catch late JoinResponse
    let pollCount = 0
    const pollTimer = setInterval(() => {
      console.log(`[agent] poll#${++pollCount} room=${ctx.room.name ?? 'undefined'} remoteCount=${ctx.room.remoteParticipants.size} connectionState=${roomAny.connectionState ?? 'n/a'}`)
      if (pollCount >= 10) clearInterval(pollTimer)
    }, 2000)

    // Wait for the human participant before generating the greeting.
    // This prevents speaking into an empty room.
    await ctx.waitForParticipant()
    clearInterval(pollTimer)
    console.log('[agent] participant present, generating greeting...')

    // Listen for text messages from the client via data channel
    ctx.room.on('dataReceived', (payload: Uint8Array) => {
      try {
        const decoded = new TextDecoder().decode(payload)
        const message = JSON.parse(decoded)
        if (message.type === 'chat' && typeof message.text === 'string' && message.text.trim()) {
          console.log(`[agent] Received chat text: "${message.text}"`)
          session.generateReply({ userInput: message.text.trim() })
        }
      } catch {
        // Not JSON or not a chat message — ignore
      }
    })

    // Generate the initial greeting now that a participant is confirmed present
    session.generateReply()
  },
})

// Boot the agent worker when run directly
const thisFile = fileURLToPath(import.meta.url)
if (resolve(process.argv[1]) === thisFile) {
  cli.runApp(new WorkerOptions({
    agent: thisFile,
    agentName: 'lingle-agent',
    // Limit to 1 idle process to avoid CPU spike above the 0.70 cloud threshold.
    // Default is 3 concurrent prewarm processes which pushes CPU to ~0.79 and
    // causes the worker to mark itself unavailable right after registration,
    // dropping incoming dispatches on the floor.
    numIdleProcesses: 1,
  }))
}
