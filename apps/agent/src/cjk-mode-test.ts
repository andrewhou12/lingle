/**
 * Direct comparison of CJK natural vs fast mode on Cartesia.
 * Sends Japanese tokens at realistic Haiku speed (~330ms apart)
 * and measures TTFB for both buffering strategies.
 *
 * Usage: node --import tsx src/cjk-mode-test.ts
 */
import dotenv from 'dotenv'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '../../../.env') })
// @ts-ignore
import WebSocket from 'ws'

const apiKey = process.env.CARTESIA_API_KEY!
const voiceId = process.env.CARTESIA_VOICE_JA!
const wsUrl = `wss://api.cartesia.ai/tts/websocket?api_key=${apiKey}&cartesia_version=2025-04-16`

// Japanese tokens simulating Haiku output at ~3 tok/s
const JP_TOKENS = ['そう', 'です', 'か。', 'でも', '良い', '一日', 'だった', 'んです', 'ね。']
const TOKEN_DELAY_MS = 330

async function testMode(label: string, mode: 'natural' | 'fast', ws: WebSocket) {
  const trials = 4
  const ttfbs: number[] = []
  const audios: number[] = []

  for (let t = 0; t < trials; t++) {
    const contextId = `cjk-${mode}-${Date.now()}-${t}`
    const maxBufferDelay = mode === 'fast' ? 300 : 0
    const basePacket = {
      model_id: 'sonic-3',
      voice: { mode: 'id', id: voiceId },
      output_format: { container: 'raw', encoding: 'pcm_s16le', sample_rate: 24000 },
      language: 'ja',
      max_buffer_delay_ms: maxBufferDelay,
      generation_config: { speed: 0.8 },
    }

    let ttfb = 0
    let audioBytes = 0
    const t0 = performance.now()

    const done = new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, 12000)
      const handler = (data: WebSocket.Data) => {
        try {
          const msg = JSON.parse(data.toString())
          if (msg.context_id !== contextId) return
          if (msg.type === 'chunk' && msg.data) {
            if (!ttfb) ttfb = performance.now() - t0
            audioBytes += Buffer.from(msg.data, 'base64').length
          } else if (msg.type === 'done') {
            clearTimeout(timeout)
            ws.off('message', handler)
            resolve()
          }
        } catch {}
      }
      ws.on('message', handler)
    })

    if (mode === 'natural') {
      // Client-side buffering: accumulate until punctuation or 6 chars, then send
      let buffer = ''
      let firstSent = false
      for (let i = 0; i < JP_TOKENS.length; i++) {
        buffer += JP_TOKENS[i]
        const hasPunct = /[。！？、,.]/.test(buffer)
        const chars = buffer.length

        let shouldSend = false
        if (!firstSent) {
          if (hasPunct && chars >= 2) shouldSend = true
          else if (chars >= 6) shouldSend = true
        } else {
          if (hasPunct) shouldSend = true
          else if (chars >= 12) shouldSend = true
        }

        if (shouldSend) {
          ws.send(JSON.stringify({ ...basePacket, context_id: contextId, transcript: buffer + ' ', continue: true }))
          buffer = ''
          firstSent = true
        }
        if (i < JP_TOKENS.length - 1) await new Promise(r => setTimeout(r, TOKEN_DELAY_MS))
      }
      if (buffer.trim()) {
        ws.send(JSON.stringify({ ...basePacket, context_id: contextId, transcript: buffer + ' ', continue: true }))
      }
      ws.send(JSON.stringify({ ...basePacket, context_id: contextId, transcript: ' ', continue: false }))
    } else {
      // Fast: per-token streaming, server buffers 300ms
      for (let i = 0; i < JP_TOKENS.length; i++) {
        ws.send(JSON.stringify({ ...basePacket, context_id: contextId, transcript: JP_TOKENS[i], continue: true }))
        if (i < JP_TOKENS.length - 1) await new Promise(r => setTimeout(r, TOKEN_DELAY_MS))
      }
      ws.send(JSON.stringify({ ...basePacket, context_id: contextId, transcript: ' ', continue: false }))
    }

    await done
    const audioSec = audioBytes / (24000 * 2)
    ttfbs.push(ttfb)
    audios.push(audioSec)
    console.log(`  ${label} trial ${t + 1}: TTFB=${ttfb.toFixed(0)}ms audio=${audioSec.toFixed(1)}s`)
  }

  const avgTtfb = ttfbs.reduce((s, v) => s + v, 0) / ttfbs.length
  const minTtfb = Math.min(...ttfbs)
  const avgAudio = audios.reduce((s, v) => s + v, 0) / audios.length
  console.log(`  → avg TTFB: ${avgTtfb.toFixed(0)}ms  min: ${minTtfb.toFixed(0)}ms  avg audio: ${avgAudio.toFixed(1)}s\n`)
  return { avgTtfb, minTtfb, avgAudio }
}

async function main() {
  console.log(`\n${'═'.repeat(50)}`)
  console.log(`  CJK Mode Comparison: natural vs fast`)
  console.log('═'.repeat(50))
  console.log(`Text: "${JP_TOKENS.join('')}"`)
  console.log(`Token delay: ${TOKEN_DELAY_MS}ms (Haiku ~3 tok/s)\n`)

  const ws = await new Promise<WebSocket>((resolve, reject) => {
    const socket = new WebSocket(wsUrl)
    const timeout = setTimeout(() => { socket.close(); reject(new Error('timeout')) }, 10000)
    socket.on('open', () => { clearTimeout(timeout); resolve(socket) })
    socket.on('error', (err: Error) => { clearTimeout(timeout); reject(err) })
  })
  console.log('Cartesia WS connected\n')

  const natural = await testMode('NATURAL', 'natural', ws)
  const fast = await testMode('FAST   ', 'fast', ws)

  console.log('═'.repeat(50))
  console.log(`  NATURAL  avg TTFB: ${natural.avgTtfb.toFixed(0)}ms  audio: ${natural.avgAudio.toFixed(1)}s`)
  console.log(`  FAST     avg TTFB: ${fast.avgTtfb.toFixed(0)}ms  audio: ${fast.avgAudio.toFixed(1)}s`)
  console.log(`  Δ saving: ${(natural.avgTtfb - fast.avgTtfb).toFixed(0)}ms faster TTFB`)
  if (natural.avgAudio > 0 && fast.avgAudio > 0) {
    const audioRatio = fast.avgAudio / natural.avgAudio
    console.log(`  Audio ratio: ${(audioRatio * 100).toFixed(0)}% (fast vs natural)`)
  }
  console.log('═'.repeat(50))

  ws.close()
  process.exit(0)
}

main()
