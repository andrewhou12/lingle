/**
 * LiveKit Agent entry point for Lingle voice conversation.
 *
 * Uses:
 * - Silero VAD for voice activity detection
 * - Deepgram Nova-3 for STT
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

import { defineAgent, cli, WorkerOptions, type JobContext, type JobProcess } from '@livekit/agents'
import { voice, tts } from '@livekit/agents'
import * as silero from '@livekit/agents-plugin-silero'
import * as deepgram from '@livekit/agents-plugin-deepgram'
import * as cartesia from '@livekit/agents-plugin-cartesia'
import * as rime from '@livekit/agents-plugin-rime'
import * as openai from '@livekit/agents-plugin-openai'
import { turnDetector } from '@livekit/agents-plugin-livekit'
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
  prewarm: async (proc: JobProcess) => {
    // Pre-load Silero VAD model during warmup
    proc.userData.vad = await silero.VAD.load({
      // Higher threshold = less likely to trigger on background noise (default: 0.5)
      activationThreshold: 0.65,
      // Require more speech before triggering (default: 50ms)
      minSpeechDuration: 150,
    })

    // Warm the OpenAI TCP+TLS connection so the first real LLM call
    // doesn't pay ~150ms handshake overhead
    new OpenAIClient().chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 1,
      messages: [{ role: 'user', content: '.' }],
    }).catch(() => {}) // best-effort, don't block on failure
  },

  entry: async (ctx: JobContext) => {
    // Parse job metadata (set by explicit agent dispatch from the web client)
    const metadata = parseAgentMetadata(ctx.job.metadata)
    console.log('[agent] metadata:', ctx.job.metadata)

    const targetLang = metadata.targetLanguage || 'Japanese'
    console.log(`[agent] language=${targetLang}`)

    // Create the voice agent session
    // LLM: GPT-4o mini for conversation (290ms median TTFT vs ~600ms+ Claude Haiku)
    // Analysis still uses Claude Haiku (async, not latency-critical)
    const session = new voice.AgentSession({
      vad: ctx.proc.userData.vad as silero.VAD,
      stt: buildStt(metadata),
      llm: new openai.LLM({
        model: 'gpt-4o-mini',
        maxCompletionTokens: 300,
      }),
      tts: buildTts(metadata),
      // Context-aware turn detection: uses a multilingual model to predict
      // end-of-turn based on linguistic context, not just silence duration.
      // Critical for language learners who pause mid-sentence while thinking.
      turnDetection: new turnDetector.MultilingualModel(),
      voiceOptions: {
        preemptiveGeneration: true,
        // Balance: low min lets the turn detector fire early when confident,
        // high max gives learners time to think. The MultilingualModel handles
        // the intelligence — these are just bounds.
        minEndpointingDelay: 0.3,
        maxEndpointingDelay: 2.0,
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

    // Start the agent with a room connection
    const agent = new LingleAgent(metadata)
    await session.start({
      room: ctx.room,
      agent,
    })

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

    // Wait for a participant to join
    await ctx.waitForParticipant()

    // Generate the initial greeting (agent's system prompt FIRST MESSAGE rules apply)
    session.generateReply()
  },
})

// Boot the agent worker when run directly
const thisFile = fileURLToPath(import.meta.url)
if (resolve(process.argv[1]) === thisFile) {
  cli.runApp(new WorkerOptions({ agent: thisFile, agentName: 'lingle-agent' }))
}
