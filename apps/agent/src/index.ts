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
  resolveAgentTtsProvider,
  type AgentMetadata,
} from './config.js'

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
      speedAlpha: rimeLang === 'jpn' ? 1.0 : 0.87,
      samplingRate: 24000,
    })
  }

  // Default: Cartesia Sonic
  const cartesiaLang = getCartesiaLanguage(targetLang)
  const voiceId = metadata.voiceId || getCartesiaVoiceId(cartesiaLang)
  console.log(`[agent] TTS=cartesia voice=${voiceId} lang=${cartesiaLang}`)
  return new cartesia.TTS({
    model: 'sonic',
    voice: voiceId,
    language: cartesiaLang,
    speed: cartesiaLang === 'ja' ? 0.8 : 1.15,
    sampleRate: 24000,
    wordTimestamps: true,
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
    const deepgramLang = getDeepgramLanguage(targetLang)
    console.log(`[agent] language=${targetLang} deepgram=${deepgramLang}`)

    // Create the voice agent session
    // LLM: GPT-4o mini for conversation (290ms median TTFT vs ~600ms+ Claude Haiku)
    // Analysis still uses Claude Haiku (async, not latency-critical)
    const session = new voice.AgentSession({
      vad: ctx.proc.userData.vad as silero.VAD,
      stt: new deepgram.STT({ model: 'nova-3', language: deepgramLang }),
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
        // Wider endpoint window for language learners who pause while thinking
        minEndpointingDelay: 0.5,
        maxEndpointingDelay: 2.5,
        minInterruptionDuration: 0.3,
        minInterruptionWords: 1,
      },
    })

    // Log pipeline latency metrics for each turn
    session.on(voice.AgentSessionEventTypes.MetricsCollected, (ev) => {
      const m = ev.metrics
      if (m.type === 'eou_metrics') {
        console.log(`[metrics:EOU] endOfUtteranceDelay=${m.endOfUtteranceDelayMs.toFixed(0)}ms transcriptionDelay=${m.transcriptionDelayMs.toFixed(0)}ms`)
      } else if (m.type === 'llm_metrics') {
        console.log(`[metrics:LLM] ttft=${m.ttftMs.toFixed(0)}ms total=${m.durationMs.toFixed(0)}ms tokens=${m.completionTokens} cancelled=${m.cancelled} cached=${m.promptCachedTokens}`)
      } else if (m.type === 'tts_metrics') {
        console.log(`[metrics:TTS] ttfb=${m.ttfbMs.toFixed(0)}ms total=${m.durationMs.toFixed(0)}ms chars=${m.charactersCount} cancelled=${m.cancelled}`)
      }
    })

    // Start the agent with a room connection
    const agent = new LingleAgent(metadata)
    await session.start({
      room: ctx.room,
      agent,
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
