/**
 * Standalone latency test script for the Lingle voice pipeline.
 *
 * Tests each stage independently and then simulates the full pipeline:
 *   1. Raw LLM TTFT (Claude Haiku streaming)
 *   2. Raw Cartesia TTS TTFB (persistent WebSocket)
 *   3. Raw Rime TTS TTFB (persistent WebSocket)
 *   4. Full pipeline simulation: LLM streaming → TTS → measure E2E
 *
 * Usage:
 *   cd apps/agent
 *   node --import tsx src/latency-test.ts [cartesia|rime|llm|pipeline|all]
 *
 * Requires: ANTHROPIC_API_KEY, CARTESIA_API_KEY, RIME_API_KEY in .env
 */
import dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '../../../.env') })

// @ts-ignore
import WebSocket from 'ws'
import Anthropic from '@anthropic-ai/sdk'

// Polyfill WebSocket for @soniox/node (uses browser WS API)
if (typeof globalThis.WebSocket === 'undefined') {
  // @ts-ignore
  globalThis.WebSocket = WebSocket
}

// ── Helpers ──

function hrMs(): number {
  return performance.now()
}

function fmt(ms: number): string {
  return `${ms.toFixed(0)}ms`
}

function separator(title: string) {
  console.log(`\n${'═'.repeat(60)}`)
  console.log(`  ${title}`)
  console.log('═'.repeat(60))
}

function resultRow(label: string, value: string) {
  console.log(`  ${label.padEnd(28)} ${value}`)
}

interface TestResult {
  name: string
  ttfb: number
  total: number
  details: Record<string, number | string>
}

const results: TestResult[] = []

// ── Test 1: Raw LLM TTFT ──

async function testLlmTtft(prompt: string = 'Say hello in Japanese in one sentence.'): Promise<TestResult> {
  separator('TEST: Claude Haiku TTFT')
  const anthropic = new Anthropic()

  const trials = 3
  const ttfts: number[] = []
  const totals: number[] = []

  for (let i = 0; i < trials; i++) {
    const t0 = hrMs()
    let ttft = 0
    let tokens = 0
    let text = ''

    const stream = anthropic.messages.stream({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 100,
      stream: true,
      messages: [{ role: 'user', content: prompt }],
    })

    for await (const event of stream) {
      if (!ttft && event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        ttft = hrMs() - t0
        text = event.delta.text
      }
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        tokens++
      }
    }
    const total = hrMs() - t0
    ttfts.push(ttft)
    totals.push(total)
    console.log(`  trial ${i + 1}: TTFT=${fmt(ttft)} total=${fmt(total)} tokens=${tokens} first="${text.slice(0, 30)}"`)
  }

  const avgTtft = ttfts.reduce((a, b) => a + b, 0) / ttfts.length
  const avgTotal = totals.reduce((a, b) => a + b, 0) / totals.length
  const minTtft = Math.min(...ttfts)

  resultRow('Avg TTFT:', fmt(avgTtft))
  resultRow('Min TTFT:', fmt(minTtft))
  resultRow('Avg total:', fmt(avgTotal))

  const result: TestResult = {
    name: 'LLM TTFT',
    ttfb: avgTtft,
    total: avgTotal,
    details: { minTtft, avgTtft, avgTotal, trials },
  }
  results.push(result)
  return result
}

// ── Test 2: Raw Cartesia TTS TTFB ──

async function testCartesiaTtfb(): Promise<TestResult> {
  separator('TEST: Cartesia Sonic-3 TTFB')

  const apiKey = process.env.CARTESIA_API_KEY || ''
  const voiceId = process.env.CARTESIA_VOICE_JA || process.env.CARTESIA_VOICE_EN || ''
  const apiVersion = '2025-04-16'
  const wsUrl = `wss://api.cartesia.ai/tts/websocket?api_key=${apiKey}&cartesia_version=${apiVersion}`

  if (!apiKey) {
    console.log('  SKIP: CARTESIA_API_KEY not set')
    return { name: 'Cartesia TTFB', ttfb: 0, total: 0, details: { skipped: 'true' } }
  }

  // Connect WebSocket once (persistent connection test)
  const connectStart = hrMs()
  const ws = await new Promise<WebSocket>((resolve, reject) => {
    const socket = new WebSocket(wsUrl)
    const timeout = setTimeout(() => { socket.close(); reject(new Error('timeout')) }, 10000)
    socket.on('open', () => { clearTimeout(timeout); resolve(socket) })
    socket.on('error', (err: Error) => { clearTimeout(timeout); reject(err) })
  })
  const connectTime = hrMs() - connectStart
  console.log(`  WebSocket connected in ${fmt(connectTime)}`)

  const testPhrases = [
    { text: 'こんにちは、元気ですか？今日は何をしましたか？', lang: 'ja', label: 'Japanese' },
    { text: 'Hello, how are you doing today? What have you been up to?', lang: 'en', label: 'English' },
    { text: 'すみません、もう一度言ってもらえますか？', lang: 'ja', label: 'Japanese short' },
  ]

  const allTtfbs: number[] = []

  for (const phrase of testPhrases) {
    const trials = 2
    const ttfbs: number[] = []

    for (let i = 0; i < trials; i++) {
      const contextId = `test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

      const ttfbPromise = new Promise<{ ttfb: number; total: number; audioBytes: number }>((resolve) => {
        let ttfb = 0
        let audioBytes = 0
        const t0 = hrMs()

        const onMessage = (data: WebSocket.Data) => {
          try {
            const msg = JSON.parse(data.toString())
            if (msg.context_id !== contextId) return

            if (msg.type === 'chunk' && msg.data) {
              if (!ttfb) ttfb = hrMs() - t0
              audioBytes += Buffer.from(msg.data, 'base64').length
            } else if (msg.type === 'done') {
              ws.off('message', onMessage)
              resolve({ ttfb, total: hrMs() - t0, audioBytes })
            } else if (msg.error) {
              console.error(`  error: ${msg.error}`)
              ws.off('message', onMessage)
              resolve({ ttfb: 0, total: 0, audioBytes: 0 })
            }
          } catch { /* ignore */ }
        }

        ws.on('message', onMessage)

        // Send the full text in one shot (simulating a complete sentence arriving)
        ws.send(JSON.stringify({
          model_id: 'sonic-3',
          voice: { mode: 'id', id: voiceId },
          output_format: { container: 'raw', encoding: 'pcm_s16le', sample_rate: 24000 },
          language: phrase.lang,
          max_buffer_delay_ms: 0,
          context_id: contextId,
          transcript: phrase.text + ' ',
          continue: false,
        }))
      })

      const result = await ttfbPromise
      ttfbs.push(result.ttfb)
      const audioSec = (result.audioBytes / (24000 * 2)).toFixed(1)
      console.log(`  ${phrase.label} trial ${i + 1}: TTFB=${fmt(result.ttfb)} total=${fmt(result.total)} audio=${audioSec}s`)
    }

    const avgTtfb = ttfbs.reduce((a, b) => a + b, 0) / ttfbs.length
    allTtfbs.push(avgTtfb)
  }

  // Now test streaming mode (continue: true → continue: false)
  console.log(`\n  Streaming mode test (chunked text):`)
  const streamContextId = `test-stream-${Date.now()}`
  const streamTtfbPromise = new Promise<{ ttfb: number; total: number; audioBytes: number }>((resolve) => {
    let ttfb = 0
    let audioBytes = 0
    const t0 = hrMs()

    const onMessage = (data: WebSocket.Data) => {
      try {
        const msg = JSON.parse(data.toString())
        if (msg.context_id !== streamContextId) return
        if (msg.type === 'chunk' && msg.data) {
          if (!ttfb) ttfb = hrMs() - t0
          audioBytes += Buffer.from(msg.data, 'base64').length
        } else if (msg.type === 'done') {
          ws.off('message', onMessage)
          resolve({ ttfb, total: hrMs() - t0, audioBytes })
        }
      } catch { /* ignore */ }
    }
    ws.on('message', onMessage)
  })

  // Simulate LLM streaming: send words with delays
  const words = ['Hello, ', 'how are ', 'you doing ', 'today? ']
  const basePacket = {
    model_id: 'sonic-3',
    voice: { mode: 'id', id: voiceId },
    output_format: { container: 'raw', encoding: 'pcm_s16le', sample_rate: 24000 },
    language: 'en',
    max_buffer_delay_ms: 0,
    context_id: streamContextId,
  }
  const streamSendStart = hrMs()

  for (let i = 0; i < words.length; i++) {
    ws.send(JSON.stringify({
      ...basePacket,
      transcript: words[i],
      continue: true,
    }))
    if (i < words.length - 1) {
      await new Promise(r => setTimeout(r, 30)) // simulate ~30ms between LLM tokens
    }
  }
  const firstSendToLastSend = hrMs() - streamSendStart
  // Close the context
  ws.send(JSON.stringify({
    ...basePacket,
    transcript: ' ',
    continue: false,
  }))

  const streamResult = await streamTtfbPromise
  console.log(`  Streaming: TTFB=${fmt(streamResult.ttfb)} total=${fmt(streamResult.total)} sendDuration=${fmt(firstSendToLastSend)}`)

  ws.close()

  const avgTtfb = allTtfbs.reduce((a, b) => a + b, 0) / allTtfbs.length
  const result: TestResult = {
    name: 'Cartesia TTFB',
    ttfb: avgTtfb,
    total: 0,
    details: { connectTime, avgTtfb, streamingTtfb: streamResult.ttfb },
  }
  results.push(result)
  return result
}

// ── Test 3: Raw Rime TTS TTFB ──

async function testRimeTtfb(): Promise<TestResult> {
  separator('TEST: Rime Arcana TTFB')

  const apiKey = process.env.RIME_API_KEY || ''
  const speaker = process.env.RIME_VOICE_ID || 'luna'

  if (!apiKey) {
    console.log('  SKIP: RIME_API_KEY not set')
    return { name: 'Rime TTFB', ttfb: 0, total: 0, details: { skipped: 'true' } }
  }

  const params = new URLSearchParams({
    speaker,
    modelId: 'arcana',
    audioFormat: 'pcm',
    lang: 'eng',
    samplingRate: '24000',
    segment: 'never',
  })
  const wsUrl = `wss://users-ws.rime.ai/ws3?${params.toString()}`

  const connectStart = hrMs()
  const ws = await new Promise<WebSocket>((resolve, reject) => {
    const socket = new WebSocket(wsUrl, { headers: { Authorization: `Bearer ${apiKey}` } })
    const timeout = setTimeout(() => { socket.close(); reject(new Error('timeout')) }, 10000)
    socket.on('open', () => { clearTimeout(timeout); resolve(socket) })
    socket.on('error', (err: Error) => { clearTimeout(timeout); reject(err) })
  })
  const connectTime = hrMs() - connectStart
  console.log(`  WebSocket connected in ${fmt(connectTime)}`)

  const testPhrases = [
    { text: 'Hello, how are you doing today?', label: 'English medium' },
    { text: 'Sure, let me help you with that.', label: 'English short' },
    { text: "That's a great question! I think the answer depends on the context.", label: 'English long' },
  ]

  const allTtfbs: number[] = []

  for (const phrase of testPhrases) {
    const trials = 2
    const ttfbs: number[] = []

    for (let i = 0; i < trials; i++) {
      const contextId = `test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

      // Clear any prior state
      ws.send(JSON.stringify({ operation: 'clear' }))
      await new Promise(r => setTimeout(r, 50))

      const ttfbPromise = new Promise<{ ttfb: number; total: number; audioBytes: number; chunks: number }>((resolve) => {
        let ttfb = 0
        let audioBytes = 0
        let chunks = 0
        const t0 = hrMs()
        let idleTimer: ReturnType<typeof setTimeout> | null = null

        const onMessage = (data: WebSocket.Data) => {
          try {
            const msg = JSON.parse(data.toString())
            if (msg.type === 'chunk' && msg.data) {
              if (!ttfb) ttfb = hrMs() - t0
              chunks++
              audioBytes += Buffer.from(msg.data, 'base64').length
              // Reset idle timer on each chunk
              if (idleTimer) clearTimeout(idleTimer)
              idleTimer = setTimeout(() => {
                ws.off('message', onMessage)
                resolve({ ttfb, total: hrMs() - t0, audioBytes, chunks })
              }, 1500) // Rime has no done signal — idle timeout
            } else if (msg.type === 'error') {
              console.error(`  error: ${msg.message}`)
            }
          } catch { /* ignore */ }
        }

        ws.on('message', onMessage)

        // Send text then flush (segment=never mode)
        ws.send(JSON.stringify({ text: phrase.text, contextId }))
        ws.send(JSON.stringify({ operation: 'flush', contextId }))
      })

      const result = await ttfbPromise
      ttfbs.push(result.ttfb)
      const audioSec = (result.audioBytes / (24000 * 2)).toFixed(1)
      console.log(`  ${phrase.label} trial ${i + 1}: TTFB=${fmt(result.ttfb)} total=${fmt(result.total)} chunks=${result.chunks} audio=${audioSec}s`)
    }

    const avgTtfb = ttfbs.reduce((a, b) => a + b, 0) / ttfbs.length
    allTtfbs.push(avgTtfb)
  }

  // Now test streaming mode (per-token text + flush)
  console.log(`\n  Streaming mode test (per-token text + flush):`)
  ws.send(JSON.stringify({ operation: 'clear' }))
  await new Promise(r => setTimeout(r, 50))

  const streamContextId = `test-stream-${Date.now()}`
  const streamTtfbPromise = new Promise<{ ttfb: number; total: number; audioBytes: number }>((resolve) => {
    let ttfb = 0
    let audioBytes = 0
    const t0 = hrMs()
    let idleTimer: ReturnType<typeof setTimeout> | null = null

    const onMessage = (data: WebSocket.Data) => {
      try {
        const msg = JSON.parse(data.toString())
        if (msg.type === 'chunk' && msg.data) {
          if (!ttfb) ttfb = hrMs() - t0
          audioBytes += Buffer.from(msg.data, 'base64').length
          if (idleTimer) clearTimeout(idleTimer)
          idleTimer = setTimeout(() => {
            ws.off('message', onMessage)
            resolve({ ttfb, total: hrMs() - t0, audioBytes })
          }, 1500)
        }
      } catch { /* ignore */ }
    }
    ws.on('message', onMessage)
  })

  // Simulate LLM streaming: send tokens, flush after 2 words, then at sentence end
  const tokens = ['Hello, ', 'how ', 'are ', 'you ', 'doing ', 'today? ', 'I ', 'hope ', "you're ", 'well.']
  const streamStart = hrMs()

  for (let i = 0; i < tokens.length; i++) {
    ws.send(JSON.stringify({ text: tokens[i], contextId: streamContextId }))
    // Flush after 2 words (first flush) and at sentence end
    if (i === 1 || i === tokens.length - 1) {
      ws.send(JSON.stringify({ operation: 'flush', contextId: streamContextId }))
      console.log(`    flush at token ${i + 1}: "${tokens.slice(0, i + 1).join('')}" (+${fmt(hrMs() - streamStart)})`)
    }
    if (i < tokens.length - 1) {
      await new Promise(r => setTimeout(r, 25))
    }
  }

  const streamResult = await streamTtfbPromise
  console.log(`  Streaming: TTFB=${fmt(streamResult.ttfb)} total=${fmt(streamResult.total)}`)

  ws.close()

  const avgTtfb = allTtfbs.reduce((a, b) => a + b, 0) / allTtfbs.length
  const result: TestResult = {
    name: 'Rime TTFB',
    ttfb: avgTtfb,
    total: 0,
    details: { connectTime, avgTtfb, streamingTtfb: streamResult.ttfb },
  }
  results.push(result)
  return result
}

// ── Test 4: Full Pipeline Simulation ──

async function testFullPipeline(ttsProvider: 'cartesia' | 'rime' = 'cartesia'): Promise<TestResult> {
  separator(`TEST: Full Pipeline (LLM → ${ttsProvider} TTS)`)

  const anthropic = new Anthropic()
  const prompt = 'You are a Japanese language tutor. Respond in one short sentence in Japanese.'

  // Set up TTS WebSocket
  let ws: WebSocket
  let ttsSetupTime: number

  if (ttsProvider === 'cartesia') {
    const apiKey = process.env.CARTESIA_API_KEY || ''
    const voiceId = process.env.CARTESIA_VOICE_JA || ''
    const wsUrl = `wss://api.cartesia.ai/tts/websocket?api_key=${apiKey}&cartesia_version=2025-04-16`
    const t0 = hrMs()
    ws = await new Promise<WebSocket>((resolve, reject) => {
      const socket = new WebSocket(wsUrl)
      const timeout = setTimeout(() => { socket.close(); reject(new Error('timeout')) }, 10000)
      socket.on('open', () => { clearTimeout(timeout); resolve(socket) })
      socket.on('error', (err: Error) => { clearTimeout(timeout); reject(err) })
    })
    ttsSetupTime = hrMs() - t0
    console.log(`  ${ttsProvider} WS connected in ${fmt(ttsSetupTime)}`)

    // Run the pipeline
    const contextId = `pipeline-${Date.now()}`
    const pipelineStart = hrMs()
    let llmTtft = 0
    let firstTtsSend = 0
    let firstTtsAudio = 0
    let llmTokens = 0
    let llmText = ''
    let ttsAudioBytes = 0
    let ttsChunks = 0
    let ttsDone = false

    // Set up TTS receiver
    const ttsComplete = new Promise<void>((resolve) => {
      ws.on('message', (data: WebSocket.Data) => {
        try {
          const msg = JSON.parse(data.toString())
          if (msg.context_id !== contextId) return
          if (msg.type === 'chunk' && msg.data) {
            if (!firstTtsAudio) {
              firstTtsAudio = hrMs() - pipelineStart
            }
            ttsChunks++
            ttsAudioBytes += Buffer.from(msg.data, 'base64').length
          } else if (msg.type === 'done') {
            ttsDone = true
            resolve()
          }
        } catch { /* ignore */ }
      })
    })

    // Start LLM streaming
    const stream = anthropic.messages.stream({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 100,
      stream: true,
      messages: [{ role: 'user', content: prompt }],
    })

    let buffer = ''
    const basePacket = {
      model_id: 'sonic-3',
      voice: { mode: 'id', id: voiceId },
      output_format: { container: 'raw', encoding: 'pcm_s16le', sample_rate: 24000 },
      language: 'ja',
      max_buffer_delay_ms: 0,
      context_id: contextId,
    }

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        if (!llmTtft) llmTtft = hrMs() - pipelineStart
        llmTokens++
        llmText += event.delta.text
        buffer += event.delta.text

        // Buffering logic matching cartesia-tts.ts optimized version:
        // First chunk: aggressive (6 CJK chars, 2 Latin words, any punctuation, or 80ms timer)
        // Subsequent: natural boundaries (punctuation, 12 CJK chars, 4 Latin words)
        const words = buffer.trim().split(/\s+/)
        const hasPunctuation = /[.!?。！？、,;:—\n]/.test(buffer)
        const charCount = buffer.trim().length

        let shouldSend = false
        if (!firstTtsSend) {
          // First chunk: aggressive for low TTFB
          if (hasPunctuation && charCount >= 1) shouldSend = true
          else if (charCount >= 6) shouldSend = true  // CJK: ~2 Japanese words
          else if (words.length >= 2 && /\s$/.test(buffer)) shouldSend = true  // Latin: 2 words
        } else {
          // Subsequent: natural boundaries
          if (hasPunctuation) shouldSend = true
          else if (charCount >= 12) shouldSend = true
          else if (words.length >= 4) shouldSend = true
        }

        if (shouldSend) {
          if (!firstTtsSend) firstTtsSend = hrMs() - pipelineStart
          ws.send(JSON.stringify({ ...basePacket, transcript: buffer + ' ', continue: true }))
          buffer = ''
        }
      }
    }

    // Send remaining buffer
    if (buffer.trim()) {
      if (!firstTtsSend) firstTtsSend = hrMs() - pipelineStart
      ws.send(JSON.stringify({ ...basePacket, transcript: buffer + ' ', continue: true }))
    }

    // Close context
    ws.send(JSON.stringify({ ...basePacket, transcript: ' ', continue: false }))

    // Wait for TTS to complete
    await Promise.race([ttsComplete, new Promise(r => setTimeout(r, 10000))])
    const pipelineTotal = hrMs() - pipelineStart

    const audioSec = (ttsAudioBytes / (24000 * 2)).toFixed(1)
    console.log(`\n  Pipeline results:`)
    resultRow('LLM TTFT:', fmt(llmTtft))
    resultRow('LLM → first TTS send:', fmt(firstTtsSend))
    resultRow('First TTS audio:', fmt(firstTtsAudio))
    resultRow('Pipeline E2E:', fmt(pipelineTotal))
    resultRow('LLM tokens:', `${llmTokens}`)
    resultRow('TTS chunks:', `${ttsChunks}`)
    resultRow('Audio duration:', `${audioSec}s`)
    resultRow('LLM text:', `"${llmText.slice(0, 60)}"`)
    console.log(`\n  Breakdown:`)
    resultRow('  LLM TTFT:', fmt(llmTtft))
    resultRow('  + client buffer:', fmt(firstTtsSend - llmTtft))
    resultRow('  + Cartesia TTFB:', fmt(firstTtsAudio - firstTtsSend))
    resultRow('  = First audio:', fmt(firstTtsAudio))

    ws.close()

    const result: TestResult = {
      name: `Pipeline (${ttsProvider})`,
      ttfb: firstTtsAudio,
      total: pipelineTotal,
      details: { llmTtft, firstTtsSend, firstTtsAudio, pipelineTotal, llmTokens, ttsChunks },
    }
    results.push(result)
    return result
  } else {
    // Rime pipeline
    const apiKey = process.env.RIME_API_KEY || ''
    const speaker = process.env.RIME_VOICE_ID || 'luna'
    const params = new URLSearchParams({
      speaker, modelId: 'arcana', audioFormat: 'pcm', lang: 'eng',
      samplingRate: '24000', segment: 'never',
    })
    const wsUrl = `wss://users-ws.rime.ai/ws3?${params.toString()}`
    const t0 = hrMs()
    ws = await new Promise<WebSocket>((resolve, reject) => {
      const socket = new WebSocket(wsUrl, { headers: { Authorization: `Bearer ${apiKey}` } })
      const timeout = setTimeout(() => { socket.close(); reject(new Error('timeout')) }, 10000)
      socket.on('open', () => { clearTimeout(timeout); resolve(socket) })
      socket.on('error', (err: Error) => { clearTimeout(timeout); reject(err) })
    })
    ttsSetupTime = hrMs() - t0
    console.log(`  ${ttsProvider} WS connected in ${fmt(ttsSetupTime)}`)

    const contextId = `pipeline-${Date.now()}`
    const pipelineStart = hrMs()
    let llmTtft = 0
    let firstFlush = 0
    let firstTtsAudio = 0
    let llmTokens = 0
    let llmText = ''
    let ttsAudioBytes = 0
    let ttsChunks = 0

    // Set up TTS receiver
    const ttsComplete = new Promise<void>((resolve) => {
      let idleTimer: ReturnType<typeof setTimeout> | null = null
      ws.on('message', (data: WebSocket.Data) => {
        try {
          const msg = JSON.parse(data.toString())
          if (msg.type === 'chunk' && msg.data) {
            if (!firstTtsAudio) firstTtsAudio = hrMs() - pipelineStart
            ttsChunks++
            ttsAudioBytes += Buffer.from(msg.data, 'base64').length
            if (idleTimer) clearTimeout(idleTimer)
            idleTimer = setTimeout(resolve, 2000)
          }
        } catch { /* ignore */ }
      })
    })

    // Start LLM
    const stream = anthropic.messages.stream({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 100,
      stream: true,
      messages: [{ role: 'user', content: 'Respond in one short English sentence greeting the student.' }],
    })

    let textBuffer = ''
    let flushCount = 0
    const SENTENCE_END = /[.!?]\s*$/
    const WORD_BOUNDARY = /[\s.!?,;:]\s*$/

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        if (!llmTtft) llmTtft = hrMs() - pipelineStart
        llmTokens++
        llmText += event.delta.text

        // Send token to Rime immediately (segment=never buffers without synthesizing)
        ws.send(JSON.stringify({ text: event.delta.text, contextId }))
        textBuffer += event.delta.text

        // Flush logic matching rime-tts.ts
        if (SENTENCE_END.test(textBuffer)) {
          if (!firstFlush) firstFlush = hrMs() - pipelineStart
          flushCount++
          ws.send(JSON.stringify({ operation: 'flush', contextId }))
          textBuffer = ''
        } else if (flushCount === 0) {
          const wordCount = textBuffer.trim().split(/\s+/).length
          if (wordCount >= 2 && WORD_BOUNDARY.test(textBuffer)) {
            firstFlush = hrMs() - pipelineStart
            flushCount++
            ws.send(JSON.stringify({ operation: 'flush', contextId }))
            textBuffer = ''
          }
        }
      }
    }

    // Final flush
    if (textBuffer.trim()) {
      if (!firstFlush) firstFlush = hrMs() - pipelineStart
      flushCount++
      ws.send(JSON.stringify({ operation: 'flush', contextId }))
    }

    await Promise.race([ttsComplete, new Promise(r => setTimeout(r, 10000))])
    const pipelineTotal = hrMs() - pipelineStart

    const audioSec = (ttsAudioBytes / (24000 * 2)).toFixed(1)
    console.log(`\n  Pipeline results:`)
    resultRow('LLM TTFT:', fmt(llmTtft))
    resultRow('First flush:', fmt(firstFlush))
    resultRow('First TTS audio:', fmt(firstTtsAudio))
    resultRow('Pipeline E2E:', fmt(pipelineTotal))
    resultRow('LLM tokens:', `${llmTokens}`)
    resultRow('Flushes:', `${flushCount}`)
    resultRow('TTS chunks:', `${ttsChunks}`)
    resultRow('Audio duration:', `${audioSec}s`)
    resultRow('LLM text:', `"${llmText.slice(0, 60)}"`)
    console.log(`\n  Breakdown:`)
    resultRow('  LLM TTFT:', fmt(llmTtft))
    resultRow('  + client buffer:', fmt(firstFlush - llmTtft))
    resultRow('  + Rime TTFB:', fmt(firstTtsAudio - firstFlush))
    resultRow('  = First audio:', fmt(firstTtsAudio))

    ws.close()

    const result: TestResult = {
      name: `Pipeline (${ttsProvider})`,
      ttfb: firstTtsAudio,
      total: pipelineTotal,
      details: { llmTtft, firstFlush, firstTtsAudio, pipelineTotal, llmTokens, flushCount, ttsChunks },
    }
    results.push(result)
    return result
  }
}

// ── Test 5: Audio Cutoff Detection ──
// Sends known text to TTS, measures the received audio duration, and compares
// against a one-shot (non-streaming) synthesis of the same text. If streaming
// audio is significantly shorter, the tail is being cut off.

async function testAudioCutoff(): Promise<void> {
  separator('TEST: Audio Cutoff Detection (Cartesia)')

  const apiKey = process.env.CARTESIA_API_KEY || ''
  const voiceId = process.env.CARTESIA_VOICE_JA || process.env.CARTESIA_VOICE_EN || ''
  if (!apiKey) { console.log('  SKIP: CARTESIA_API_KEY not set'); return }

  const wsUrl = `wss://api.cartesia.ai/tts/websocket?api_key=${apiKey}&cartesia_version=2025-04-16`
  const ws = await new Promise<WebSocket>((resolve, reject) => {
    const socket = new WebSocket(wsUrl)
    const timeout = setTimeout(() => { socket.close(); reject(new Error('timeout')) }, 10000)
    socket.on('open', () => { clearTimeout(timeout); resolve(socket) })
    socket.on('error', (err: Error) => { clearTimeout(timeout); reject(err) })
  })

  const basePacket = {
    model_id: 'sonic-3',
    voice: { mode: 'id', id: voiceId },
    output_format: { container: 'raw', encoding: 'pcm_s16le', sample_rate: 24000 },
    language: 'ja',
    max_buffer_delay_ms: 0,
  }

  // Helper: synthesize text and return audio bytes + whether we got a done signal
  const synthesize = (
    text: string,
    mode: 'oneshot' | 'streaming-no-delay' | 'streaming-with-delay',
  ): Promise<{ audioBytes: number; gotDone: boolean; durationMs: number; audioSec: number }> => {
    return new Promise((resolve) => {
      const contextId = `cutoff-${mode}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      let audioBytes = 0
      let gotDone = false
      const t0 = hrMs()

      const timeout = setTimeout(() => {
        ws.off('message', onMessage)
        resolve({ audioBytes, gotDone, durationMs: hrMs() - t0, audioSec: audioBytes / (24000 * 2) })
      }, 8000)

      const onMessage = (data: WebSocket.Data) => {
        try {
          const msg = JSON.parse(data.toString())
          if (msg.context_id !== contextId) return
          if (msg.type === 'chunk' && msg.data) {
            audioBytes += Buffer.from(msg.data, 'base64').length
          } else if (msg.type === 'done') {
            gotDone = true
            clearTimeout(timeout)
            ws.off('message', onMessage)
            resolve({ audioBytes, gotDone, durationMs: hrMs() - t0, audioSec: audioBytes / (24000 * 2) })
          } else if (msg.error) {
            console.error(`    error (${mode}): ${msg.error}`)
          }
        } catch { /* ignore */ }
      }
      ws.on('message', onMessage)

      if (mode === 'oneshot') {
        // Single message with continue: false — the baseline reference
        ws.send(JSON.stringify({ ...basePacket, context_id: contextId, transcript: text, continue: false }))
      } else {
        // Simulate streaming: send text in chunks, then close
        const chunks = text.match(/.{1,8}/g) || [text]
        for (let i = 0; i < chunks.length; i++) {
          ws.send(JSON.stringify({ ...basePacket, context_id: contextId, transcript: chunks[i], continue: true }))
        }
        if (mode === 'streaming-with-delay') {
          // Old approach: flush + 100ms delay + close
          ws.send(JSON.stringify({ ...basePacket, context_id: contextId, transcript: '', continue: true, flush: true }))
          setTimeout(() => {
            ws.send(JSON.stringify({ ...basePacket, context_id: contextId, transcript: ' ', continue: false }))
          }, 100)
        } else {
          // New approach: just close immediately (no flush delay)
          ws.send(JSON.stringify({ ...basePacket, context_id: contextId, transcript: ' ', continue: false }))
        }
      }
    })
  }

  const testTexts = [
    { text: 'こんにちは、元気ですか？今日は何をしましたか？', label: 'Japanese medium' },
    { text: 'Hello, how are you doing today? I hope you are well.', label: 'English medium' },
    { text: 'すみません、もう一度言ってもらえますか？ゆっくりお願いします。', label: 'Japanese long' },
  ]

  for (const { text, label } of testTexts) {
    console.log(`\n  ${label}: "${text.slice(0, 50)}..."`)

    const oneshot = await synthesize(text, 'oneshot')
    const noDelay = await synthesize(text, 'streaming-no-delay')
    const withDelay = await synthesize(text, 'streaming-with-delay')

    const noDelayRatio = oneshot.audioBytes > 0 ? noDelay.audioBytes / oneshot.audioBytes : 0
    const withDelayRatio = oneshot.audioBytes > 0 ? withDelay.audioBytes / oneshot.audioBytes : 0

    const noDelayCutoff = noDelayRatio < 0.90
    const withDelayCutoff = withDelayRatio < 0.90

    console.log(`    oneshot:           ${oneshot.audioSec.toFixed(2)}s (${oneshot.audioBytes} bytes) done=${oneshot.gotDone}`)
    console.log(`    stream (no delay): ${noDelay.audioSec.toFixed(2)}s (${noDelay.audioBytes} bytes) done=${noDelay.gotDone} ratio=${(noDelayRatio * 100).toFixed(1)}% ${noDelayCutoff ? '⚠ CUTOFF' : '✓ OK'}`)
    console.log(`    stream (+100ms):   ${withDelay.audioSec.toFixed(2)}s (${withDelay.audioBytes} bytes) done=${withDelay.gotDone} ratio=${(withDelayRatio * 100).toFixed(1)}% ${withDelayCutoff ? '⚠ CUTOFF' : '✓ OK'}`)
  }

  ws.close()
}

// ── Test 5b: Audio Cutoff Detection (Rime) ──
// The critical Rime cutoff scenario: LLM streams slowly over 3-6 seconds,
// multiple flushes fire at sentence boundaries, but there's a long gap
// between early audio chunks and the final flush. The idle timeout must
// not fire during this gap.

async function testRimeAudioCutoff(): Promise<void> {
  separator('TEST: Audio Cutoff Detection (Rime — slow LLM simulation)')

  const apiKey = process.env.RIME_API_KEY || ''
  const speaker = process.env.RIME_VOICE_ID || 'luna'
  if (!apiKey) { console.log('  SKIP: RIME_API_KEY not set'); return }

  const params = new URLSearchParams({
    speaker, modelId: 'arcana', audioFormat: 'pcm', lang: 'eng',
    samplingRate: '24000', segment: 'never',
  })
  const wsUrl = `wss://users-ws.rime.ai/ws3?${params.toString()}`
  const ws = await new Promise<WebSocket>((resolve, reject) => {
    const socket = new WebSocket(wsUrl, { headers: { Authorization: `Bearer ${apiKey}` } })
    const timeout = setTimeout(() => { socket.close(); reject(new Error('timeout')) }, 10000)
    socket.on('open', () => { clearTimeout(timeout); resolve(socket) })
    socket.on('error', (err: Error) => { clearTimeout(timeout); reject(err) })
  })

  // Helper: synthesize with Rime and collect all audio
  const synthesizeRime = async (
    _label: string,
    sentences: string[],
    interSentenceDelayMs: number,
  ): Promise<{ audioBytes: number; audioSec: number; chunks: number; durationMs: number }> => {
    ws.send(JSON.stringify({ operation: 'clear' }))
    await new Promise(r => setTimeout(r, 100))

    const contextId = `cutoff-rime-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    let audioBytes = 0
    let chunks = 0
    const t0 = hrMs()

    const audioComplete = new Promise<void>((resolve) => {
      let idleTimer: ReturnType<typeof setTimeout> | null = null
      const onMessage = (data: WebSocket.Data) => {
        try {
          const msg = JSON.parse(data.toString())
          if (msg.type === 'chunk' && msg.data) {
            chunks++
            audioBytes += Buffer.from(msg.data, 'base64').length
            if (idleTimer) clearTimeout(idleTimer)
            idleTimer = setTimeout(() => {
              ws.off('message', onMessage)
              resolve()
            }, 3000) // Match the IDLE_TIMEOUT_MS in rime-tts.ts
          }
        } catch { /* ignore */ }
      }
      ws.on('message', onMessage)
      // Safety timeout
      setTimeout(() => { ws.off('message', onMessage); resolve() }, 30000)
    })

    // Simulate LLM streaming: send tokens word-by-word with delays,
    // flush at sentence boundaries (matching rime-tts.ts behavior)
    for (let s = 0; s < sentences.length; s++) {
      const words = sentences[s].split(/(?<=\s)/) // split keeping trailing spaces
      for (const word of words) {
        ws.send(JSON.stringify({ text: word, contextId }))
        // Simulate LLM token delay: ~80-150ms per token (realistic for Haiku)
        await new Promise(r => setTimeout(r, 80 + Math.random() * 70))
      }
      // Flush at sentence boundary
      ws.send(JSON.stringify({ operation: 'flush', contextId }))

      // Wait between sentences (simulates LLM generating next sentence)
      if (s < sentences.length - 1 && interSentenceDelayMs > 0) {
        await new Promise(r => setTimeout(r, interSentenceDelayMs))
      }
    }

    await audioComplete
    const durationMs = hrMs() - t0
    const audioSec = audioBytes / (24000 * 2)
    return { audioBytes, audioSec, chunks, durationMs }
  }

  // Test 1: Baseline — all text sent instantly (no cutoff expected)
  const baselineSentences = [
    "Hello, how are you doing today? ",
    "I hope you're having a great time. ",
    "So tell me, what do you like to do in your free time? ",
  ]
  console.log('\n  Baseline (instant send):')
  ws.send(JSON.stringify({ operation: 'clear' }))
  await new Promise(r => setTimeout(r, 100))
  const baseCtx = `cutoff-base-${Date.now()}`
  let baseAudioBytes = 0
  let baseChunks = 0
  const basePromise = new Promise<void>((resolve) => {
    let idleTimer: ReturnType<typeof setTimeout> | null = null
    const onMsg = (data: WebSocket.Data) => {
      try {
        const msg = JSON.parse(data.toString())
        if (msg.type === 'chunk' && msg.data) {
          baseChunks++
          baseAudioBytes += Buffer.from(msg.data, 'base64').length
          if (idleTimer) clearTimeout(idleTimer)
          idleTimer = setTimeout(() => { ws.off('message', onMsg); resolve() }, 3000)
        }
      } catch { /* ignore */ }
    }
    ws.on('message', onMsg)
    setTimeout(() => { ws.off('message', onMsg); resolve() }, 15000)
  })
  for (const s of baselineSentences) {
    ws.send(JSON.stringify({ text: s, contextId: baseCtx }))
  }
  ws.send(JSON.stringify({ operation: 'flush', contextId: baseCtx }))
  await basePromise
  const baseAudioSec = baseAudioBytes / (24000 * 2)
  console.log(`    audio: ${baseAudioSec.toFixed(2)}s (${baseAudioBytes} bytes) chunks: ${baseChunks}`)

  // Test 2: Slow LLM simulation (realistic — this is where cutoff happens)
  console.log('\n  Slow LLM simulation (~100ms/token, sentence flushes):')
  const slowResult = await synthesizeRime(
    'slow',
    baselineSentences,
    500, // 500ms gap between sentences (LLM thinking between sentences)
  )
  const ratio = baseAudioBytes > 0 ? slowResult.audioBytes / baseAudioBytes : 0
  const cutoff = ratio < 0.85
  console.log(`    audio: ${slowResult.audioSec.toFixed(2)}s (${slowResult.audioBytes} bytes) chunks: ${slowResult.chunks} duration: ${fmt(slowResult.durationMs)}`)
  console.log(`    ratio vs baseline: ${(ratio * 100).toFixed(1)}% ${cutoff ? '⚠ CUTOFF DETECTED' : '✓ OK'}`)

  // Test 3: Very slow LLM (worst case — long gap between sentence 1 audio and sentence 2 flush)
  console.log('\n  Very slow LLM simulation (~100ms/token, 2s inter-sentence gap):')
  const verySlowResult = await synthesizeRime(
    'very-slow',
    baselineSentences,
    2000, // 2s gap between sentences
  )
  const ratio2 = baseAudioBytes > 0 ? verySlowResult.audioBytes / baseAudioBytes : 0
  const cutoff2 = ratio2 < 0.85
  console.log(`    audio: ${verySlowResult.audioSec.toFixed(2)}s (${verySlowResult.audioBytes} bytes) chunks: ${verySlowResult.chunks} duration: ${fmt(verySlowResult.durationMs)}`)
  console.log(`    ratio vs baseline: ${(ratio2 * 100).toFixed(1)}% ${cutoff2 ? '⚠ CUTOFF DETECTED' : '✓ OK'}`)

  // Test 4: FAST LLM with many sentences (the real production scenario)
  // LLM streams at 30-40 tok/s, 3 sentences arrive in <1s, each triggers a flush.
  // This is what caused "You know" cutoff — 6 flushes pile up and Rime drops them.
  // With the fix (first + final flush only), this should pass.
  console.log('\n  Fast LLM simulation (~25ms/token, 3 sentences, flush per sentence):')
  ws.send(JSON.stringify({ operation: 'clear' }))
  await new Promise(r => setTimeout(r, 100))
  {
    const fastCtx = `cutoff-fast-${Date.now()}`
    let fastAudioBytes = 0
    let fastChunks = 0
    const fastT0 = hrMs()
    const fastDone = new Promise<void>((resolve) => {
      let idleTimer2: ReturnType<typeof setTimeout> | null = null
      const onMsg2 = (data: WebSocket.Data) => {
        try {
          const msg = JSON.parse(data.toString())
          if (msg.type === 'chunk' && msg.data) {
            fastChunks++
            fastAudioBytes += Buffer.from(msg.data, 'base64').length
            if (idleTimer2) clearTimeout(idleTimer2)
            idleTimer2 = setTimeout(() => { ws.off('message', onMsg2); resolve() }, 4000)
          }
        } catch { /* ignore */ }
      }
      ws.on('message', onMsg2)
      setTimeout(() => { ws.off('message', onMsg2); resolve() }, 20000)
    })

    // Simulate: send tokens at 25ms intervals, flush at first sentence + final only
    // (matching the new rime-tts.ts strategy)
    const fullText = "You know, just chatting with people and having conversations like this one. It's pretty fun! Do you have any hobbies or interests you like to do in your free time?"
    const tokens = fullText.split(/(?<=\s)/)
    let firstFlushed = false
    for (const token of tokens) {
      ws.send(JSON.stringify({ text: token, contextId: fastCtx }))
      await new Promise(r => setTimeout(r, 25))

      // First flush: after first sentence boundary
      if (!firstFlushed && /[.!?]\s*$/.test(token)) {
        ws.send(JSON.stringify({ operation: 'flush', contextId: fastCtx }))
        firstFlushed = true
        console.log(`    first flush after: "${tokens.slice(0, tokens.indexOf(token) + 1).join('').slice(0, 50)}"`)
      }
    }
    // Final flush
    ws.send(JSON.stringify({ operation: 'flush', contextId: fastCtx }))

    await fastDone
    const fastDuration = hrMs() - fastT0
    const fastAudioSec = fastAudioBytes / (24000 * 2)
    const fastRatio = baseAudioBytes > 0 ? fastAudioBytes / baseAudioBytes : 0
    const fastCutoff = fastRatio < 0.85
    console.log(`    audio: ${fastAudioSec.toFixed(2)}s (${fastAudioBytes} bytes) chunks: ${fastChunks} duration: ${fmt(fastDuration)}`)
    console.log(`    ratio vs baseline: ${(fastRatio * 100).toFixed(1)}% ${fastCutoff ? '⚠ CUTOFF DETECTED' : '✓ OK'}`)

    // Test NEW strategy: single flush at end only (matching rime-tts.ts)
    console.log('\n  Fast LLM — NEW strategy (single flush at end only):')
    ws.send(JSON.stringify({ operation: 'clear' }))
    await new Promise(r => setTimeout(r, 100))
    {
      const newCtx = `cutoff-new-${Date.now()}`
      let newAudioBytes = 0
      let newChunks = 0
      const newDone = new Promise<void>((resolve) => {
        let idleTimer4: ReturnType<typeof setTimeout> | null = null
        const onMsg4 = (data: WebSocket.Data) => {
          try {
            const msg = JSON.parse(data.toString())
            if (msg.type === 'chunk' && msg.data) {
              newChunks++
              newAudioBytes += Buffer.from(msg.data, 'base64').length
              if (idleTimer4) clearTimeout(idleTimer4)
              idleTimer4 = setTimeout(() => { ws.off('message', onMsg4); resolve() }, 4000)
            }
          } catch { /* ignore */ }
        }
        ws.on('message', onMsg4)
        setTimeout(() => { ws.off('message', onMsg4); resolve() }, 20000)
      })

      // Send ALL tokens first, then ONE flush at the end
      for (const token of tokens) {
        ws.send(JSON.stringify({ text: token, contextId: newCtx }))
        await new Promise(r => setTimeout(r, 25))
      }
      // Single flush after all text sent
      ws.send(JSON.stringify({ operation: 'flush', contextId: newCtx }))

      await newDone
      const newAudioSec = newAudioBytes / (24000 * 2)
      const newRatio = baseAudioBytes > 0 ? newAudioBytes / baseAudioBytes : 0
      const newCutoff = newRatio < 0.85
      console.log(`    audio: ${newAudioSec.toFixed(2)}s (${newAudioBytes} bytes) chunks: ${newChunks}`)
      console.log(`    ratio vs baseline: ${(newRatio * 100).toFixed(1)}% ${newCutoff ? '⚠ CUTOFF DETECTED' : '✓ OK'}`)
    }

    // Also test the OLD way (flush per sentence)
    console.log('\n  Fast LLM — OLD strategy (flush every sentence):')
    ws.send(JSON.stringify({ operation: 'clear' }))
    await new Promise(r => setTimeout(r, 100))

    const oldCtx = `cutoff-old-${Date.now()}`
    let oldAudioBytes = 0
    let oldChunks = 0
    const oldDone = new Promise<void>((resolve) => {
      let idleTimer3: ReturnType<typeof setTimeout> | null = null
      const onMsg3 = (data: WebSocket.Data) => {
        try {
          const msg = JSON.parse(data.toString())
          if (msg.type === 'chunk' && msg.data) {
            oldChunks++
            oldAudioBytes += Buffer.from(msg.data, 'base64').length
            if (idleTimer3) clearTimeout(idleTimer3)
            idleTimer3 = setTimeout(() => { ws.off('message', onMsg3); resolve() }, 4000)
          }
        } catch { /* ignore */ }
      }
      ws.on('message', onMsg3)
      setTimeout(() => { ws.off('message', onMsg3); resolve() }, 20000)
    })

    let sentenceBuffer = ''
    for (const token of tokens) {
      ws.send(JSON.stringify({ text: token, contextId: oldCtx }))
      sentenceBuffer += token
      await new Promise(r => setTimeout(r, 25))
      // Flush at EVERY sentence boundary (old behavior)
      if (/[.!?]\s*$/.test(sentenceBuffer)) {
        ws.send(JSON.stringify({ operation: 'flush', contextId: oldCtx }))
        sentenceBuffer = ''
      }
    }
    if (sentenceBuffer.trim()) {
      ws.send(JSON.stringify({ operation: 'flush', contextId: oldCtx }))
    }

    await oldDone
    const oldAudioSec = oldAudioBytes / (24000 * 2)
    const oldRatio = baseAudioBytes > 0 ? oldAudioBytes / baseAudioBytes : 0
    const oldCutoff = oldRatio < 0.85
    console.log(`    audio: ${oldAudioSec.toFixed(2)}s (${oldAudioBytes} bytes) chunks: ${oldChunks}`)
    console.log(`    ratio vs baseline: ${(oldRatio * 100).toFixed(1)}% ${oldCutoff ? '⚠ CUTOFF (confirms bug in old strategy)' : '✓ OK'}`)
  }

  ws.close()

  if (cutoff || cutoff2) {
    console.log('\n  ⚠ AUDIO CUTOFF DETECTED in slow LLM scenarios')
  } else {
    console.log('\n  ✓ No cutoff detected — Rime produces complete audio')
  }
}

// ── Test 6: Realistic Conversation Simulation ──
// Simulates a multi-turn voice conversation with:
// - Varied response lengths (short greetings, medium explanations, long corrections)
// - Interruption handling (abort mid-stream)
// - Consecutive turns on persistent WebSocket (no reconnection)

async function testRealisticConversation(): Promise<void> {
  separator('TEST: Realistic Multi-Turn Conversation')

  const apiKey = process.env.CARTESIA_API_KEY || ''
  const voiceId = process.env.CARTESIA_VOICE_JA || ''
  if (!apiKey) { console.log('  SKIP: CARTESIA_API_KEY not set'); return }

  const anthropic = new Anthropic()
  const wsUrl = `wss://api.cartesia.ai/tts/websocket?api_key=${apiKey}&cartesia_version=2025-04-16`
  const ws = await new Promise<WebSocket>((resolve, reject) => {
    const socket = new WebSocket(wsUrl)
    const timeout = setTimeout(() => { socket.close(); reject(new Error('timeout')) }, 10000)
    socket.on('open', () => { clearTimeout(timeout); resolve(socket) })
    socket.on('error', (err: Error) => { clearTimeout(timeout); reject(err) })
  })
  console.log('  Persistent WS connected')

  const basePacket = {
    model_id: 'sonic-3',
    voice: { mode: 'id', id: voiceId },
    output_format: { container: 'raw', encoding: 'pcm_s16le', sample_rate: 24000 },
    language: 'ja',
    max_buffer_delay_ms: 0,
  }

  // Simulate different turn types
  const turns = [
    {
      label: 'Turn 1 — greeting (short)',
      prompt: 'You are a Japanese tutor. Say hello in Japanese in one very short sentence.',
      maxTokens: 50,
    },
    {
      label: 'Turn 2 — question (medium)',
      prompt: 'You are a Japanese tutor. Ask the student what they did today, in Japanese. Keep it to one sentence.',
      maxTokens: 80,
    },
    {
      label: 'Turn 3 — correction (longer)',
      prompt: 'You are a Japanese tutor. The student said "watashi wa kinou eiga wo mita". Gently recast the correct form in Japanese with a brief follow-up question. Two sentences max.',
      maxTokens: 120,
    },
    {
      label: 'Turn 4 — INTERRUPTED (simulated)',
      prompt: 'You are a Japanese tutor. Give a detailed explanation of te-form in Japanese. Use at least three sentences.',
      maxTokens: 200,
      interruptAfterMs: 300, // Abort after 300ms of LLM streaming
    },
    {
      label: 'Turn 5 — recovery after interruption',
      prompt: 'You are a Japanese tutor. The student interrupted you. Say "ah, what would you like to say?" in Japanese. Very short.',
      maxTokens: 50,
    },
  ]

  const turnResults: { label: string; ttfb: number; total: number; audioSec: number; llmTokens: number; text: string; interrupted: boolean; gotDone: boolean }[] = []

  for (const turn of turns) {
    const contextId = `conv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const t0 = hrMs()
    let llmTtft = 0
    let firstSend = 0
    let firstAudio = 0
    let llmTokens = 0
    let llmText = ''
    let audioBytes = 0
    let gotDone = false
    let interrupted = false

    // Set up TTS receiver
    const ttsComplete = new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, 15000)
      const onMessage = (data: WebSocket.Data) => {
        try {
          const msg = JSON.parse(data.toString())
          if (msg.context_id !== contextId) return
          if (msg.type === 'chunk' && msg.data) {
            if (!firstAudio) firstAudio = hrMs() - t0
            audioBytes += Buffer.from(msg.data, 'base64').length
          } else if (msg.type === 'done') {
            gotDone = true
            clearTimeout(timeout)
            ws.off('message', onMessage)
            resolve()
          }
        } catch { /* ignore */ }
      }
      ws.on('message', onMessage)
    })

    // Start LLM streaming
    const abortController = new AbortController()
    const stream = anthropic.messages.stream({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: turn.maxTokens,
      stream: true,
      messages: [{ role: 'user', content: turn.prompt }],
    })

    let buffer = ''
    let sentAnything = false
    let firstChunkSent = false

    // Set up interruption timer if configured
    if (turn.interruptAfterMs) {
      setTimeout(() => {
        interrupted = true
        abortController.abort()
        // Send close signal immediately (simulating interruption)
        ws.send(JSON.stringify({ ...basePacket, context_id: contextId, transcript: ' ', continue: false }))
      }, (turn.interruptAfterMs) + (llmTtft || 500))
    }

    try {
      for await (const event of stream) {
        if (abortController.signal.aborted) break
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          if (!llmTtft) llmTtft = hrMs() - t0
          llmTokens++
          llmText += event.delta.text
          buffer += event.delta.text

          const charCount = buffer.trim().length
          const hasPunctuation = /[.!?。！？、,;:—\n]/.test(buffer)
          const words = buffer.trim().split(/\s+/)

          let shouldSend = false
          if (!firstChunkSent) {
            if (hasPunctuation && charCount >= 1) shouldSend = true
            else if (charCount >= 6) shouldSend = true
            else if (words.length >= 2 && /\s$/.test(buffer)) shouldSend = true
          } else {
            if (hasPunctuation) shouldSend = true
            else if (charCount >= 12) shouldSend = true
            else if (words.length >= 4) shouldSend = true
          }

          if (shouldSend) {
            if (!firstSend) firstSend = hrMs() - t0
            ws.send(JSON.stringify({ ...basePacket, context_id: contextId, transcript: buffer + ' ', continue: true }))
            buffer = ''
            sentAnything = true
            firstChunkSent = true
          }
        }
      }
    } catch { /* stream aborted */ }

    if (!interrupted) {
      if (buffer.trim()) {
        if (!firstSend) firstSend = hrMs() - t0
        ws.send(JSON.stringify({ ...basePacket, context_id: contextId, transcript: buffer + ' ', continue: true }))
        sentAnything = true
      }
      if (sentAnything) {
        ws.send(JSON.stringify({ ...basePacket, context_id: contextId, transcript: ' ', continue: false }))
      }
    }

    await Promise.race([ttsComplete, new Promise(r => setTimeout(r, 10000))])
    const total = hrMs() - t0
    const audioSec = audioBytes / (24000 * 2)

    const status = interrupted ? '⚡' : (firstAudio && firstAudio < 800) ? '✓' : '~'
    console.log(`  ${status} ${turn.label}`)
    console.log(`      TTFB: ${fmt(firstAudio)} (LLM=${fmt(llmTtft)} buf=${fmt(firstSend - llmTtft)} TTS=${fmt(firstAudio - firstSend)})`)
    console.log(`      total: ${fmt(total)} audio: ${audioSec.toFixed(1)}s tokens: ${llmTokens} done: ${gotDone} text: "${llmText.slice(0, 50)}"`)
    if (interrupted) console.log(`      ⚡ INTERRUPTED after ~${turn.interruptAfterMs}ms of LLM streaming`)

    turnResults.push({ label: turn.label, ttfb: firstAudio, total, audioSec, llmTokens, text: llmText.slice(0, 60), interrupted, gotDone })
  }

  ws.close()

  console.log(`\n  Turn summary:`)
  for (const r of turnResults) {
    const marker = r.interrupted ? '⚡' : r.gotDone ? '✓' : '⚠'
    console.log(`    ${marker} ${r.label.padEnd(40)} TTFB=${fmt(r.ttfb).padStart(7)} audio=${r.audioSec.toFixed(1)}s done=${r.gotDone}`)
  }

  const nonInterrupted = turnResults.filter(r => !r.interrupted)
  const avgTtfb = nonInterrupted.reduce((sum, r) => sum + r.ttfb, 0) / nonInterrupted.length
  const allGotDone = nonInterrupted.every(r => r.gotDone)
  console.log(`\n  Avg TTFB (non-interrupted): ${fmt(avgTtfb)}`)
  console.log(`  All non-interrupted got done signal: ${allGotDone ? '✓ YES' : '⚠ NO — possible audio cutoff!'}`)
}

// ── Test 7: Soniox STT Connection + Latency ──
// Tests Soniox connection time and sends synthetic audio to measure
// STT processing latency. Uses the @soniox/node SDK.

async function testSonioxLatency(): Promise<TestResult> {
  separator('TEST: Soniox STT Connection + Latency')

  const apiKey = process.env.SONIOX_API_KEY
  if (!apiKey) {
    console.log('  SKIP: SONIOX_API_KEY not set')
    return { name: 'Soniox STT', ttfb: 0, total: 0, details: { skipped: 'true' } }
  }

  try {
    const { SonioxNodeClient } = await import('@soniox/node')
    const client = new SonioxNodeClient({ api_key: apiKey })

    // Test 1: Connection time
    const connectStart = hrMs()
    const session = client.realtime.stt({
      model: 'stt-rt-preview',
      audio_format: 'pcm_s16le',
      sample_rate: 24000,
      num_channels: 1,
      enable_endpoint_detection: true,
      language_hints: ['ja', 'en'],
      language_hints_strict: true,
    })

    let firstResultTs = 0
    let endpointTs = 0
    let resultText = ''
    let resultCount = 0

    session.on('result', (result: { tokens: { text: string; is_final: boolean }[] }) => {
      if (!firstResultTs) firstResultTs = hrMs()
      resultCount++
      const text = result.tokens.map((t: { text: string }) => t.text).join('')
      if (text.trim()) resultText = text
    })

    session.on('endpoint', () => {
      if (!endpointTs) endpointTs = hrMs()
    })

    await session.connect()
    const connectTime = hrMs() - connectStart
    console.log(`  Soniox connected in ${fmt(connectTime)}`)

    // Test 2: Send synthetic speech-like audio (1 second of 440Hz sine wave)
    // This won't produce meaningful transcription but measures processing latency
    const sampleRate = 24000
    const durationSec = 1.0
    const numSamples = Math.floor(sampleRate * durationSec)
    const audioBuffer = Buffer.alloc(numSamples * 2) // 16-bit PCM

    // Generate 440Hz sine wave (speech-like frequency)
    for (let i = 0; i < numSamples; i++) {
      const sample = Math.sin(2 * Math.PI * 440 * i / sampleRate) * 16000
      audioBuffer.writeInt16LE(Math.round(sample), i * 2)
    }

    // Send audio in 100ms chunks (matching the soniox-stt.ts chunk size)
    const chunkSize = Math.floor(sampleRate / 10) * 2  // 100ms of 16-bit PCM
    const audioStart = hrMs()

    for (let offset = 0; offset < audioBuffer.length; offset += chunkSize) {
      const chunk = audioBuffer.subarray(offset, Math.min(offset + chunkSize, audioBuffer.length))
      if (session.state === 'connected') {
        session.sendAudio(chunk)
      }
      // Small delay to simulate real-time audio
      await new Promise(r => setTimeout(r, 10))
    }

    const audioSendTime = hrMs() - audioStart
    console.log(`  Sent ${(audioBuffer.length / 2 / sampleRate).toFixed(1)}s of audio in ${fmt(audioSendTime)}`)

    // Wait for any results
    await new Promise(r => setTimeout(r, 2000))

    // Finish session
    try { await session.finish() } catch { /* ignore */ }

    const totalTime = hrMs() - audioStart
    console.log(`  Results: ${resultCount} result events, endpoint=${endpointTs ? fmt(endpointTs - audioStart) : 'none'}`)
    console.log(`  Text: "${resultText.slice(0, 60)}"`)

    // Test 3: Connection time for a second session (should be faster)
    const reconnectStart = hrMs()
    const session2 = client.realtime.stt({
      model: 'stt-rt-preview',
      audio_format: 'pcm_s16le',
      sample_rate: 24000,
      num_channels: 1,
      enable_endpoint_detection: true,
      language_hints: ['ja', 'en'],
      language_hints_strict: true,
    })
    await session2.connect()
    const reconnectTime = hrMs() - reconnectStart
    try { await session2.finish() } catch { /* ignore */ }
    console.log(`  Second connection: ${fmt(reconnectTime)}`)

    resultRow('First connect:', fmt(connectTime))
    resultRow('Second connect:', fmt(reconnectTime))
    resultRow('Audio send time:', fmt(audioSendTime))
    resultRow('Results received:', `${resultCount}`)

    const result: TestResult = {
      name: 'Soniox STT',
      ttfb: connectTime,
      total: totalTime,
      details: { connectTime, reconnectTime, audioSendTime, resultCount },
    }
    results.push(result)
    return result
  } catch (err) {
    console.error(`  ERROR: ${err instanceof Error ? err.message : String(err)}`)
    return { name: 'Soniox STT', ttfb: 0, total: 0, details: { error: String(err) } }
  }
}

// ── Test 8: STT Provider Comparison (Soniox vs Deepgram) ──
// Uses the actual LiveKit STT plugins with synthetic audio to compare
// connection time and processing characteristics.

async function testSttComparison(): Promise<void> {
  separator('TEST: STT Provider Comparison (Soniox vs Deepgram)')

  const sampleRate = 24000
  const durationSec = 2.0
  const numSamples = Math.floor(sampleRate * durationSec)

  // Generate speech-like audio: mix of frequencies that resemble voice formants
  // This won't produce real transcription but exercises the full STT pipeline
  const audioBuffer = Buffer.alloc(numSamples * 2)
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate
    // Simulate speech: fundamental + formants + noise
    const f0 = Math.sin(2 * Math.PI * 150 * t) * 8000  // fundamental
    const f1 = Math.sin(2 * Math.PI * 800 * t) * 4000   // first formant
    const f2 = Math.sin(2 * Math.PI * 2500 * t) * 2000  // second formant
    const noise = (Math.random() - 0.5) * 1000            // aspiration noise
    // Amplitude envelope (fade in/out)
    const env = Math.min(t * 10, 1, (durationSec - t) * 10)
    const sample = (f0 + f1 + f2 + noise) * env
    audioBuffer.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(sample))), i * 2)
  }

  // ── Test Deepgram ──
  const deepgramKey = process.env.DEEPGRAM_API_KEY
  if (deepgramKey) {
    console.log('\n  Deepgram Nova-3:')
    try {
      // Use Deepgram's REST API for a simple latency test
      // Streaming WebSocket would be more accurate but requires more setup
      const trials = 3
      const latencies: number[] = []

      for (let i = 0; i < trials; i++) {
        const t0 = hrMs()
        const res = await fetch('https://api.deepgram.com/v1/listen?model=nova-3&language=ja&punctuate=true', {
          method: 'POST',
          headers: {
            'Authorization': `Token ${deepgramKey}`,
            'Content-Type': 'audio/raw;encoding=linear16;sample_rate=24000;channels=1',
          },
          body: audioBuffer,
          signal: AbortSignal.timeout(10000),
        })
        const elapsed = hrMs() - t0

        if (res.ok) {
          const data = await res.json() as { results?: { channels?: { alternatives?: { transcript?: string }[] }[] } }
          const transcript = data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || ''
          latencies.push(elapsed)
          console.log(`    trial ${i + 1}: ${fmt(elapsed)} transcript="${transcript.slice(0, 40)}"`)
        } else {
          console.log(`    trial ${i + 1}: HTTP ${res.status} ${await res.text().then(t => t.slice(0, 100))}`)
        }
      }

      if (latencies.length > 0) {
        const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length
        const min = Math.min(...latencies)
        resultRow('Deepgram avg (REST):', fmt(avg))
        resultRow('Deepgram min (REST):', fmt(min))
        console.log(`    Note: REST latency includes upload + processing. Streaming WS is faster.`)
      }
    } catch (err) {
      console.log(`    ERROR: ${err instanceof Error ? err.message : String(err)}`)
    }
  } else {
    console.log('\n  Deepgram: SKIP (no DEEPGRAM_API_KEY)')
  }

  // ── Test Soniox ──
  const sonioxKey = process.env.SONIOX_API_KEY
  if (sonioxKey) {
    console.log('\n  Soniox stt-rt-preview:')
    try {
      const { SonioxNodeClient } = await import('@soniox/node')
      const client = new SonioxNodeClient({ api_key: sonioxKey })

      const trials = 3
      const latencies: number[] = []

      for (let i = 0; i < trials; i++) {
        const session = client.realtime.stt({
          model: 'stt-rt-preview',
          audio_format: 'pcm_s16le',
          sample_rate: sampleRate,
          num_channels: 1,
          enable_endpoint_detection: true,
          language_hints: ['ja', 'en'],
          language_hints_strict: true,
        })

        let firstResultTs = 0
        let resultText = ''
        const t0 = hrMs()

        session.on('result', (result: { tokens: { text: string; is_final: boolean }[] }) => {
          if (!firstResultTs) firstResultTs = hrMs()
          const text = result.tokens.map((t: { text: string }) => t.text).join('')
          if (text.trim()) resultText = text
        })

        const connectStart = hrMs()
        await session.connect()
        const connectTime = hrMs() - connectStart

        // Send audio in real-time-ish chunks
        const chunkSize = Math.floor(sampleRate / 10) * 2  // 100ms chunks
        for (let offset = 0; offset < audioBuffer.length; offset += chunkSize) {
          const chunk = audioBuffer.subarray(offset, Math.min(offset + chunkSize, audioBuffer.length))
          if (session.state === 'connected') {
            session.sendAudio(chunk)
          }
          await new Promise(r => setTimeout(r, 5))
        }

        // Wait for results
        await new Promise(r => setTimeout(r, 1500))
        try { await session.finish() } catch { /* ignore */ }

        const totalTime = hrMs() - t0
        const firstResult = firstResultTs ? firstResultTs - t0 : 0
        latencies.push(firstResult || totalTime)
        console.log(`    trial ${i + 1}: connect=${fmt(connectTime)} firstResult=${fmt(firstResult)} total=${fmt(totalTime)} text="${resultText.slice(0, 40)}"`)
      }

      if (latencies.length > 0) {
        const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length
        const min = Math.min(...latencies)
        resultRow('Soniox avg (streaming):', fmt(avg))
        resultRow('Soniox min (streaming):', fmt(min))
      }
    } catch (err) {
      console.log(`    ERROR: ${err instanceof Error ? err.message : String(err)}`)
    }
  } else {
    console.log('\n  Soniox: SKIP (no SONIOX_API_KEY)')
  }

  // ── Test Deepgram WebSocket (streaming, apples-to-apples with Soniox) ──
  if (deepgramKey) {
    console.log('\n  Deepgram Nova-3 (WebSocket streaming — apples-to-apples):')
    try {
      const trials = 3
      const latencies: number[] = []
      const connectTimes: number[] = []

      for (let i = 0; i < trials; i++) {
        const wsUrl = `wss://api.deepgram.com/v1/listen?model=nova-3&language=ja&punctuate=true&encoding=linear16&sample_rate=${sampleRate}&channels=1`

        const connectStart = hrMs()
        const ws = await new Promise<WebSocket>((resolve, reject) => {
          const socket = new WebSocket(wsUrl, {
            headers: { Authorization: `Token ${deepgramKey}` },
          })
          const timeout = setTimeout(() => { socket.close(); reject(new Error('timeout')) }, 10000)
          socket.on('open', () => { clearTimeout(timeout); resolve(socket) })
          socket.on('error', (err: Error) => { clearTimeout(timeout); reject(err) })
        })
        const connectTime = hrMs() - connectStart
        connectTimes.push(connectTime)

        let firstResultTs = 0
        let resultText = ''
        const t0 = hrMs()

        const resultPromise = new Promise<void>((resolve) => {
          const timeout = setTimeout(resolve, 5000)
          ws.on('message', (data: WebSocket.Data) => {
            try {
              const msg = JSON.parse(data.toString()) as {
                type?: string
                channel?: { alternatives?: { transcript?: string }[] }
                is_final?: boolean
              }
              if (msg.type === 'Results' && msg.channel?.alternatives?.[0]?.transcript) {
                if (!firstResultTs) firstResultTs = hrMs()
                const transcript = msg.channel.alternatives[0].transcript
                if (transcript.trim()) resultText = transcript
                if (msg.is_final && transcript.trim()) {
                  clearTimeout(timeout)
                  resolve()
                }
              }
            } catch { /* ignore */ }
          })
        })

        // Send audio in real-time-ish chunks
        const chunkSize = Math.floor(sampleRate / 10) * 2
        for (let offset = 0; offset < audioBuffer.length; offset += chunkSize) {
          const chunk = audioBuffer.subarray(offset, Math.min(offset + chunkSize, audioBuffer.length))
          ws.send(chunk)
          await new Promise(r => setTimeout(r, 5))
        }

        // Signal end of audio
        ws.send(JSON.stringify({ type: 'CloseStream' }))

        await resultPromise
        const totalTime = hrMs() - t0
        const firstResult = firstResultTs ? firstResultTs - t0 : 0
        latencies.push(firstResult || totalTime)

        ws.close()
        console.log(`    trial ${i + 1}: connect=${fmt(connectTime)} firstResult=${fmt(firstResult)} total=${fmt(totalTime)} text="${resultText.slice(0, 40)}"`)
      }

      if (latencies.length > 0) {
        const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length
        const min = Math.min(...latencies)
        const avgConnect = connectTimes.reduce((a, b) => a + b, 0) / connectTimes.length
        resultRow('Deepgram WS avg:', fmt(avg))
        resultRow('Deepgram WS min:', fmt(min))
        resultRow('Deepgram WS connect:', fmt(avgConnect))
      }
    } catch (err) {
      console.log(`    ERROR: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // ── Test with REAL speech audio (synthesized by Cartesia) ──
  const cartesiaKey = process.env.CARTESIA_API_KEY || ''
  const voiceId = process.env.CARTESIA_VOICE_EN || process.env.CARTESIA_VOICE_JA || ''

  if (cartesiaKey && voiceId && deepgramKey && sonioxKey) {
    console.log('\n  ── Real speech test (Cartesia-synthesized audio → both STTs) ──')

    // Step 1: Synthesize a known phrase with Cartesia
    const testPhrase = 'Hello, how are you doing today? I hope you are well.'
    console.log(`  Synthesizing: "${testPhrase}"`)

    const cartesiaWs = await new Promise<WebSocket>((resolve, reject) => {
      const wsUrl = `wss://api.cartesia.ai/tts/websocket?api_key=${cartesiaKey}&cartesia_version=2025-04-16`
      const socket = new WebSocket(wsUrl)
      const timeout = setTimeout(() => { socket.close(); reject(new Error('timeout')) }, 10000)
      socket.on('open', () => { clearTimeout(timeout); resolve(socket) })
      socket.on('error', (err: Error) => { clearTimeout(timeout); reject(err) })
    })

    const speechAudio = await new Promise<Buffer>((resolve) => {
      const chunks: Buffer[] = []
      const contextId = `stt-test-${Date.now()}`
      cartesiaWs.on('message', (data: WebSocket.Data) => {
        try {
          const msg = JSON.parse(data.toString())
          if (msg.context_id !== contextId) return
          if (msg.type === 'chunk' && msg.data) {
            chunks.push(Buffer.from(msg.data, 'base64'))
          } else if (msg.type === 'done') {
            resolve(Buffer.concat(chunks))
          }
        } catch { /* ignore */ }
      })
      cartesiaWs.send(JSON.stringify({
        model_id: 'sonic-3',
        voice: { mode: 'id', id: voiceId },
        output_format: { container: 'raw', encoding: 'pcm_s16le', sample_rate: 24000 },
        language: 'en',
        context_id: contextId,
        transcript: testPhrase,
        continue: false,
      }))
    })
    cartesiaWs.close()
    const speechDurationSec = speechAudio.length / (24000 * 2)
    console.log(`  Synthesized ${speechDurationSec.toFixed(1)}s of speech (${speechAudio.length} bytes)\n`)

    // Step 2: Feed to Deepgram WebSocket
    console.log('  Deepgram Nova-3 (WebSocket, real speech):')
    for (let trial = 0; trial < 3; trial++) {
      const wsUrl = `wss://api.deepgram.com/v1/listen?model=nova-3&language=en&punctuate=true&encoding=linear16&sample_rate=24000&channels=1`
      const ws = await new Promise<WebSocket>((resolve, reject) => {
        const socket = new WebSocket(wsUrl, { headers: { Authorization: `Token ${deepgramKey}` } })
        const timeout = setTimeout(() => { socket.close(); reject(new Error('timeout')) }, 10000)
        socket.on('open', () => { clearTimeout(timeout); resolve(socket) })
        socket.on('error', (err: Error) => { clearTimeout(timeout); reject(err) })
      })

      let firstResultTs = 0
      let finalResultTs = 0
      let transcript = ''
      const t0 = hrMs()

      const done = new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, 8000)
        ws.on('message', (data: WebSocket.Data) => {
          try {
            const msg = JSON.parse(data.toString()) as {
              type?: string; is_final?: boolean
              channel?: { alternatives?: { transcript?: string }[] }
            }
            if (msg.type === 'Results') {
              const t = msg.channel?.alternatives?.[0]?.transcript || ''
              if (t.trim() && !firstResultTs) firstResultTs = hrMs()
              if (msg.is_final && t.trim()) {
                finalResultTs = hrMs()
                transcript = t
              }
            }
          } catch { /* ignore */ }
        })
        ws.on('close', () => { clearTimeout(timeout); resolve() })
      })

      // Send audio at ~real-time speed (100ms chunks)
      const chunkSize = 24000 / 10 * 2 // 100ms of 16-bit PCM
      for (let offset = 0; offset < speechAudio.length; offset += chunkSize) {
        ws.send(speechAudio.subarray(offset, Math.min(offset + chunkSize, speechAudio.length)))
        await new Promise(r => setTimeout(r, 50)) // send 2x realtime
      }
      ws.send(JSON.stringify({ type: 'CloseStream' }))

      await done
      ws.close()
      const firstResult = firstResultTs ? firstResultTs - t0 : 0
      const finalResult = finalResultTs ? finalResultTs - t0 : 0
      console.log(`    trial ${trial + 1}: firstResult=${fmt(firstResult)} finalResult=${fmt(finalResult)} text="${transcript.slice(0, 50)}"`)
    }

    // Step 3: Feed to Soniox WebSocket
    console.log('\n  Soniox stt-rt-preview (WebSocket, real speech):')
    const { SonioxNodeClient } = await import('@soniox/node')

    for (let trial = 0; trial < 3; trial++) {
      const client = new SonioxNodeClient({ api_key: sonioxKey })
      const session = client.realtime.stt({
        model: 'stt-rt-preview',
        audio_format: 'pcm_s16le',
        sample_rate: 24000,
        num_channels: 1,
        enable_endpoint_detection: true,
        language_hints: ['en'],
        language_hints_strict: true,
      })

      let firstResultTs = 0
      let finalResultTs = 0
      let transcript = ''
      const t0 = hrMs()

      session.on('result', (result: { tokens: { text: string; is_final: boolean }[] }) => {
        const text = result.tokens.map((t: { text: string }) => t.text).join('')
        if (text.trim() && !firstResultTs) firstResultTs = hrMs()
        const isFinal = result.tokens.some((t: { is_final: boolean }) => t.is_final)
        if (isFinal && text.trim()) {
          finalResultTs = hrMs()
          transcript = text
        }
      })

      await session.connect()

      // Send audio at ~real-time speed
      const chunkSize = 24000 / 10 * 2
      for (let offset = 0; offset < speechAudio.length; offset += chunkSize) {
        const chunk = speechAudio.subarray(offset, Math.min(offset + chunkSize, speechAudio.length))
        if (session.state === 'connected') session.sendAudio(chunk)
        await new Promise(r => setTimeout(r, 50))
      }

      await new Promise(r => setTimeout(r, 2000)) // wait for final result
      try { await session.finish() } catch { /* ignore */ }

      const firstResult = firstResultTs ? firstResultTs - t0 : 0
      const finalResult = finalResultTs ? finalResultTs - t0 : 0
      console.log(`    trial ${trial + 1}: firstResult=${fmt(firstResult)} finalResult=${fmt(finalResult)} text="${transcript.slice(0, 50)}"`)
    }
  }

  console.log('\n  Summary: Compare "firstResult" and "finalResult" times.')
  console.log('  firstResult = time to first interim transcript (preemptive gen trigger)')
  console.log('  finalResult = time to final transcript (EOU trigger)')
}

// ── Summary ──

function printSummary() {
  separator('SUMMARY — Target: < 800ms first audio')
  console.log()
  for (const r of results) {
    const status = r.ttfb < 800 ? '✓' : r.ttfb < 1000 ? '~' : '✗'
    console.log(`  ${status} ${r.name.padEnd(24)} TTFB: ${fmt(r.ttfb).padStart(7)}  total: ${fmt(r.total).padStart(7)}`)
    for (const [key, value] of Object.entries(r.details)) {
      const v = typeof value === 'number' ? fmt(value) : value
      console.log(`      ${key}: ${v}`)
    }
  }

  console.log()
  console.log('  Pipeline TTFB = LLM TTFT + client buffering + TTS TTFB')
  console.log('  Add ~100-200ms for WebRTC transport + client audio playout')
  console.log()

  // Budget analysis
  const pipelineResult = results.find(r => r.name.startsWith('Pipeline'))
  if (pipelineResult) {
    const d = pipelineResult.details
    console.log('  Budget analysis (800ms target):')
    const llmTtft = (d.llmTtft as number) || 0
    const bufferDelay = ((d.firstTtsSend as number) || (d.firstFlush as number) || 0) - llmTtft
    const ttsDelay = (d.firstTtsAudio as number) - ((d.firstTtsSend as number) || (d.firstFlush as number) || 0)
    console.log(`    LLM TTFT:        ${fmt(llmTtft).padStart(7)}  (${llmTtft < 300 ? 'good' : 'optimize'})`)
    console.log(`    Client buffer:   ${fmt(bufferDelay).padStart(7)}  (${bufferDelay < 100 ? 'good' : 'optimize'})`)
    console.log(`    TTS TTFB:        ${fmt(ttsDelay).padStart(7)}  (${ttsDelay < 200 ? 'good' : 'optimize'})`)
    console.log(`    WebRTC overhead: ~150ms`)
    console.log(`    ─────────────────────`)
    console.log(`    Estimated E2E:   ${fmt(llmTtft + bufferDelay + ttsDelay + 150).padStart(7)}`)
  }
}

// ── Main ──

async function main() {
  const arg = process.argv[2] || 'all'
  console.log(`\nLingle Latency Test Suite`)
  console.log(`Mode: ${arg}`)
  console.log(`Time: ${new Date().toISOString()}`)
  console.log(`Available modes: llm, cartesia, rime, soniox, pipeline, cutoff, conversation, all`)

  try {
    if (arg === 'llm' || arg === 'all') {
      await testLlmTtft()
    }
    if (arg === 'cartesia' || arg === 'all') {
      await testCartesiaTtfb()
    }
    if (arg === 'rime' || arg === 'all') {
      await testRimeTtfb()
    }
    if (arg === 'soniox' || arg === 'all') {
      await testSonioxLatency()
    }
    if (arg === 'pipeline' || arg === 'all') {
      await testFullPipeline('cartesia')
      await testFullPipeline('rime')
    }
    if (arg === 'cutoff' || arg === 'all') {
      await testAudioCutoff()
      await testRimeAudioCutoff()
    }
    if (arg === 'rime-cutoff') {
      await testRimeAudioCutoff()
    }
    if (arg === 'stt-compare' || arg === 'all') {
      await testSttComparison()
    }
    if (arg === 'conversation' || arg === 'all') {
      await testRealisticConversation()
    }
    printSummary()
  } catch (err) {
    console.error('Test failed:', err)
    process.exit(1)
  }

  process.exit(0)
}

main()
