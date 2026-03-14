/**
 * LiveKit Agent entry point for Lingle voice conversation.
 *
 * Uses:
 * - Silero VAD for voice activity detection
 * - Deepgram Nova-3 for STT
 * - Custom Claude LLM (Anthropic SDK)
 * - Cartesia Sonic TTS (token streaming, no sentence batching)
 */
import dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// Load .env from monorepo root (two levels up from apps/agent/src/)
const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '../../../.env') })

import { defineAgent, cli, WorkerOptions, type JobContext, type JobProcess } from '@livekit/agents'
import { voice } from '@livekit/agents'
import * as silero from '@livekit/agents-plugin-silero'
import * as deepgram from '@livekit/agents-plugin-deepgram'
import * as cartesia from '@livekit/agents-plugin-cartesia'
import Anthropic from '@anthropic-ai/sdk'
import { LingleAgent } from './lingle-agent.js'
import { ClaudeLLM } from './claude-llm.js'
import { parseAgentMetadata, getVoiceId, getDeepgramLanguage, getCartesiaLanguage } from './config.js'

export default defineAgent({
  prewarm: async (proc: JobProcess) => {
    // Pre-load Silero VAD model during warmup
    proc.userData.vad = await silero.VAD.load({
      // Higher threshold = less likely to trigger on background noise (default: 0.5)
      activationThreshold: 0.65,
      // Require more speech before triggering (default: 50ms)
      minSpeechDuration: 150,
    })

    // Warm the Anthropic TCP+TLS connection so the first real LLM call
    // doesn't pay ~150ms handshake overhead
    new Anthropic().messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1,
      messages: [{ role: 'user', content: '.' }],
    }).catch(() => {}) // best-effort, don't block on failure
  },

  entry: async (ctx: JobContext) => {
    // Parse job metadata (set by explicit agent dispatch from the web client)
    const metadata = parseAgentMetadata(ctx.job.metadata)
    console.log('[agent] metadata:', ctx.job.metadata)

    const targetLang = metadata.targetLanguage || 'Japanese'
    const voiceId = metadata.voiceId || getVoiceId(getCartesiaLanguage(targetLang))
    const deepgramLang = getDeepgramLanguage(targetLang)
    const cartesiaLang = getCartesiaLanguage(targetLang)
    console.log(`[agent] language=${targetLang} deepgram=${deepgramLang} cartesia=${cartesiaLang}`)

    // Create the voice agent session
    const session = new voice.AgentSession({
      vad: ctx.proc.userData.vad as silero.VAD,
      stt: new deepgram.STT({ model: 'nova-3', language: deepgramLang }),
      llm: new ClaudeLLM({
        model: 'claude-haiku-4-5-20251001',
        maxTokens: 300,
      }),
      tts: new cartesia.TTS({
        model: 'sonic-3-2026-01-12',
        voice: voiceId,
        language: cartesiaLang,
        speed: cartesiaLang === 'ja' ? 0.8 : 1.15,
        wordTimestamps: false,
      }),
      turnDetection: 'stt',
      voiceOptions: {
        preemptiveGeneration: true,
        minEndpointingDelay: 0.3,
        maxEndpointingDelay: 1.5,
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
