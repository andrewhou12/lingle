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
import { LingleAgent } from './lingle-agent.js'
import { ClaudeLLM } from './claude-llm.js'
import { parseAgentMetadata, getVoiceId, getDeepgramLanguage, getCartesiaLanguage } from './config.js'

export default defineAgent({
  prewarm: async (proc: JobProcess) => {
    // Pre-load Silero VAD model during warmup
    proc.userData.vad = await silero.VAD.load()
  },

  entry: async (ctx: JobContext) => {
    // Parse job metadata (session info, learner profile, plan)
    const metadata = parseAgentMetadata(ctx.job.metadata)

    const targetLang = metadata.targetLanguage || 'Japanese'
    const voiceId = metadata.voiceId || getVoiceId(getCartesiaLanguage(targetLang))
    const deepgramLang = getDeepgramLanguage(targetLang)
    const cartesiaLang = getCartesiaLanguage(targetLang)

    // Create the voice agent session
    const session = new voice.AgentSession({
      vad: ctx.proc.userData.vad as silero.VAD,
      stt: new deepgram.STT({ model: 'nova-3', language: deepgramLang }),
      llm: new ClaudeLLM({
        model: 'claude-haiku-4-5-20251001',
        maxTokens: 300,
      }),
      tts: new cartesia.TTS({
        model: 'sonic-3',
        voice: voiceId,
        language: cartesiaLang,
        speed: 0.8,
        wordTimestamps: false,
      }),
      turnDetection: 'stt',
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
  cli.runApp(new WorkerOptions({ agent: thisFile }))
}
