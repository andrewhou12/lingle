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
      temperature: 0.3,
      repetition_penalty: 1.1,
    })
  }

  const cartesiaLang = getCartesiaLanguage(targetLang)
  const voiceId = metadata.voiceId || getCartesiaVoiceId(cartesiaLang)
  console.log(`[agent] TTS=cartesia voice=${voiceId} lang=${cartesiaLang}`)
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
    // Intentionally lightweight — loading heavy models here spikes CPU and
    // causes concurrent DTLS handshakes to time out. VAD loaded in entry().
  },

  entry: async (ctx: JobContext) => {
    const metadata = parseAgentMetadata(ctx.job.metadata)
    const targetLang = metadata.targetLanguage || 'Japanese'
    console.log(`[agent] entry — lang=${targetLang}`)

    // Load VAD here (not in prewarm) to avoid racing with idle-process prewarm
    const { VAD } = await import('@livekit/agents-plugin-silero')
    const vad = await VAD.load({
      activationThreshold: 0.65,
      minSpeechDuration: 150,
    })

    const session = new voice.AgentSession({
      vad,
      stt: buildStt(metadata),
      llm: new openai.LLM({
        model: 'gpt-4o-mini',
        maxCompletionTokens: 300,
      }),
      tts: buildTts(metadata),
      voiceOptions: {
        preemptiveGeneration: true,
        minEndpointingDelay: 0.5,
        maxEndpointingDelay: 3.0,
        minInterruptionDuration: 0.3,
        minInterruptionWords: 1,
      },
    })

    // Simple metrics logging
    session.on(voice.AgentSessionEventTypes.MetricsCollected, (ev) => {
      const m = ev.metrics
      if (m.type === 'eou_metrics') {
        console.log(`[metrics] EOU delay=${m.endOfUtteranceDelayMs.toFixed(0)}ms`)
      } else if (m.type === 'llm_metrics') {
        console.log(`[metrics] LLM ttft=${m.ttftMs.toFixed(0)}ms total=${m.durationMs.toFixed(0)}ms tokens=${m.completionTokens}`)
      } else if (m.type === 'tts_metrics') {
        console.log(`[metrics] TTS ttfb=${m.ttfbMs.toFixed(0)}ms total=${m.durationMs.toFixed(0)}ms`)
      }
    })

    // Connect to the room
    await ctx.connect()
    if (!ctx.room) {
      throw new Error('ctx.room is undefined after connect — aborting')
    }
    console.log(`[agent] connected to room=${ctx.room.name}`)

    const agent = new LingleAgent(metadata)
    await session.start({ room: ctx.room, agent })
    console.log(`[agent] session started`)

    // Listen for text messages from the client via data channel
    ctx.room.on('dataReceived', (payload: Uint8Array) => {
      try {
        const decoded = new TextDecoder().decode(payload)
        const message = JSON.parse(decoded)
        if (message.type === 'chat' && typeof message.text === 'string' && message.text.trim()) {
          console.log(`[agent] chat message: "${message.text}"`)
          session.generateReply({ userInput: message.text.trim() })
        }
      } catch {
        // Not JSON or not a chat message — ignore
      }
    })

    // Wait for human participant before greeting
    await ctx.waitForParticipant()
    console.log(`[agent] participant joined, generating greeting`)
    session.generateReply()
  },
})

// Boot the agent worker when run directly
const thisFile = fileURLToPath(import.meta.url)
if (resolve(process.argv[1]) === thisFile) {
  cli.runApp(new WorkerOptions({
    agent: thisFile,
    agentName: 'lingle-agent',
    // Limit to 1 idle process to avoid CPU spike above cloud threshold
    numIdleProcesses: 1,
  }))
}
