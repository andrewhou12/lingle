import { streamText } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { withAuth } from '@/lib/api-helpers'
import { createVoiceModeTools } from '@/lib/conversation-tools'
import { buildVoiceSystemPrompt } from '@/lib/conversation-prompt'
import { getSessionWithCache } from '@/lib/conversation-session-cache'
import { persistTranscript } from '@/lib/conversation-transcript'
import { truncateMessages, MAX_CONVERSATION_MESSAGES, applyCacheBreakpoint } from '@/lib/conversation-cache-control'
import type { ScenarioMode } from '@/lib/experience-scenarios'
import { createSentenceBoundaryTracker } from '@/lib/voice/sentence-boundary'
import { parseCartesiaSSE } from '@/lib/cartesia-sse'
import { getCartesiaWs } from '@/lib/cartesia-ws'
import { getRimeWs } from '@/lib/rime-ws'
import { FRAME, encodeFrame } from '@/lib/voice/voice-stream-protocol'
import { getLanguageById } from '@/lib/languages'

export const maxDuration = 120

const RUBY_REGEX = /\{([^}|]+)\|[^}]+\}/g
const PAUSE_MARKER_REGEX = /<\d+>/g
const PUNCTUATION_ONLY = /^[\u3002\uFF01\uFF1F.!?\s\u2026\u2500\u2014\u3001,]+$/

// Latin-character ratio check for filtering non-target-language content
const LATIN_CHAR = /[a-zA-Z]/g
const PAREN_LATIN = /\([^)]*[a-zA-Z][^)]*\)/g
const BRACKET_LATIN = /\[[^\]]*[a-zA-Z][^\]]*\]/g

function stripNonTargetLanguage(text: string): string {
  // Strip (...) containing Latin characters (English parenthetical explanations)
  let result = text.replace(PAREN_LATIN, '')
  // Strip [...] containing Latin characters
  result = result.replace(BRACKET_LATIN, '')
  // Strip lines that are >50% Latin characters
  result = result
    .split('\n')
    .filter(line => {
      const stripped = line.trim()
      if (!stripped) return true
      const latinCount = (stripped.match(LATIN_CHAR) || []).length
      return latinCount / stripped.length <= 0.5
    })
    .join('\n')
  return result.replace(/\s{2,}/g, ' ').trim()
}

const CARTESIA_API_KEY = process.env.CARTESIA_API_KEY

/** Map language sttCode to Cartesia voice env var */
function getCartesiaVoice(langCode: string): string | undefined {
  const envKey = `CARTESIA_VOICE_${langCode.toUpperCase()}`
  return process.env[envKey]
}

/** Map sttCode to Rime language code. Returns null if Rime doesn't handle this language. */
function getRimeLangCode(langCode: string): string | null {
  const map: Record<string, string> = {
    en: 'eng',
    ja: 'jpn',
  }
  return map[langCode] ?? null
}

// Detect if a sentence is predominantly English vs the target language.
// For CJK targets, Latin text = English. For Latin-script targets (es, fr, de, etc.),
// we can't distinguish by script, so always assume target language.
const CJK_RANGE = /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf\uff00-\uff9f\uac00-\ud7af\u1100-\u11ff]/g
function detectSentenceLanguage(text: string, targetLangCode: string, isCJK: boolean): string {
  // For non-CJK target languages (Spanish, French, etc.), Latin text IS the target language
  if (!isCJK) return targetLangCode
  const cjkCount = (text.match(CJK_RANGE) || []).length
  const latinCount = (text.match(LATIN_CHAR) || []).length
  // If more Latin chars than CJK, treat as English
  if (latinCount > 0 && cjkCount === 0) return 'en'
  if (latinCount > cjkCount * 2) return 'en'
  return targetLangCode
}

function cleanForTTS(text: string): string {
  return text.replace(RUBY_REGEX, '$1').replace(PAUSE_MARKER_REGEX, '').trim()
}

/** Classify a sentence to pick per-sentence Cartesia voice controls */
function getSentenceControls(text: string): { speed: number; emotion?: string[] } {
  const trimmed = text.trim()
  // Short reactions/acknowledgments — natural speed, no slowdown
  if (trimmed.length < 12) return { speed: 0 }
  // Questions — slight curiosity, natural pace
  if (/[？?]$/.test(trimmed)) return { speed: -0.05, emotion: ['curiosity'] }
  // Longer statements — baseline slight slowdown
  return { speed: -0.1 }
}

export const POST = withAuth(async (request, { userId }) => {
  const t0 = performance.now()
  const body = await request.json()
  const messages: Array<{ role: string; content: string }> = body.messages
  const sessionId: string | undefined = body.sessionId
  const bustCache: boolean = body.bustCache ?? false

  if (!sessionId) {
    return new Response(JSON.stringify({ error: 'Missing sessionId' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!CARTESIA_API_KEY) {
    return new Response(JSON.stringify({ error: 'Cartesia not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Session lookup with caching
  const { session, cacheHit } = await getSessionWithCache(sessionId, { bustCache })

  const targetLanguage = session.targetLanguage
  const langConfig = getLanguageById(targetLanguage)
  const targetLangCode = langConfig?.ttsLanguageCode || langConfig?.sttCode || 'ja'
  const isCJK = langConfig?.isCJK ?? true

  // Get voice for target language, falling back to JA
  const voiceId = getCartesiaVoice(targetLangCode) || getCartesiaVoice('ja')
  if (!voiceId) {
    return new Response(JSON.stringify({ error: 'No Cartesia voice configured for ' + targetLanguage }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const sessionMode = (session.mode || 'conversation') as ScenarioMode
  const system = buildVoiceSystemPrompt(session.systemPrompt, {
    sessionPlan: session.sessionPlan,
    sessionMode,
    voiceMode: true,
    targetLanguage,
  })

  const tools = createVoiceModeTools(userId, sessionId)

  // Cap conversation history for latency
  const { messages: inputMessages } = truncateMessages(messages, MAX_CONVERSATION_MESSAGES)

  const encoder = new TextEncoder()
  const { readable, writable } = new TransformStream<Uint8Array>()
  const writer = writable.getWriter()

  // Serialize all writes to prevent interleaving from concurrent async contexts
  let writeChain = Promise.resolve()
  const safeWrite = (frame: Uint8Array) => {
    writeChain = writeChain.then(() => writer.write(frame).catch(() => {}))
    return writeChain
  }

  const tPrep = performance.now()
  console.log(`[voice-stream:timing] session=${cacheHit ? 'cached' : 'db'}:${(tPrep - t0).toFixed(0)}ms msgs:${inputMessages.length} sysLen:${system.length} lang:${targetLanguage}`)

  // Process in background — return the readable stream immediately
  ;(async () => {
    const tracker = createSentenceBoundaryTracker()
    tracker.setEagerMode(true)
    let fullText = ''
    let ttftLogged = false
    const tLlm = performance.now()

    // Audio dispatch chain — ensures sentences are TTS'd and streamed in order
    let audioChain = Promise.resolve()
    let sentenceCount = 0

    // Use WebSocket for TTS (persistent connection, no per-sentence handshake overhead)
    // Pre-warm the WS connection in parallel with LLM — saves ~200ms on first sentence
    const cartesiaWs = getCartesiaWs()
    cartesiaWs.warmup()
    let wsDisabled = false // Skip WS after first failure (e.g., bufferutil missing on Vercel)

    // Buffer for short clause fragments (e.g., "えっと、", "へー、") that generate
    // disproportionately long TTS audio when sent alone. Merged with the next sentence.
    const SENTENCE_TERMINATOR = /[。！？.!?\n]$/
    const MIN_TTS_LENGTH = 8
    let pendingFragment = ''

    const dispatchSentence = (sentence: string, forceFlush = false) => {
      const combined = pendingFragment + sentence
      pendingFragment = ''

      const sentenceLang = detectSentenceLanguage(combined, targetLangCode, isCJK)
      // Only strip non-target-language content for CJK languages where Latin chars reliably indicate English
      const cleaned = sentenceLang === 'en'
        ? cleanForTTS(combined)
        : isCJK
          ? stripNonTargetLanguage(cleanForTTS(combined))
          : cleanForTTS(combined)
      if (!cleaned || PUNCTUATION_ONLY.test(cleaned)) return

      // Buffer short fragments that don't end with a sentence terminator —
      // Cartesia generates 2-3x expected audio for tiny comma-terminated inputs
      if (!forceFlush && cleaned.length < MIN_TTS_LENGTH && !SENTENCE_TERMINATOR.test(cleaned)) {
        pendingFragment = combined
        console.log(`[voice-stream] buffering short fragment (${cleaned.length} chars): "${cleaned}"`)
        return
      }

      const idx = sentenceCount++
      audioChain = audioChain.then(async () => {
        const tTts = performance.now()
        try {
          await safeWrite(encodeFrame(FRAME.SENTENCE_START, encoder.encode(cleaned)))

          const controls = getSentenceControls(cleaned)
          let reader: ReadableStreamDefaultReader<Uint8Array>
          let usingWs = true
          let chunkCount = 0
          let totalBytes = 0

          // Helper to read all PCM chunks from a stream and write AUDIO frames
          const readPcmStream = async (r: ReadableStreamDefaultReader<Uint8Array>) => {
            while (true) {
              const { done, value } = await r.read()
              if (done) break
              if (!value || value.length === 0) continue
              chunkCount++
              totalBytes += value.length
              await safeWrite(encodeFrame(FRAME.AUDIO, value))
            }
          }

          // Rime-routed languages (English + Japanese) → Rime TTS (24kHz PCM)
          const rimeLangCode = getRimeLangCode(sentenceLang)
          if (rimeLangCode !== null) {
            const { readable: rimeReadable } = getRimeWs().synthesizeStream(cleaned, undefined, rimeLangCode)
            const rimeReader = rimeReadable.getReader()
            while (true) {
              const { done, value } = await rimeReader.read()
              if (done) break
              if (!value || value.length === 0) continue
              chunkCount++
              totalBytes += value.length
              await safeWrite(encodeFrame(FRAME.AUDIO, value))
            }
            console.log(`[voice-stream:timing] rime[${idx}] done:${(performance.now() - tTts).toFixed(0)}ms chunks:${chunkCount} bytes:${totalBytes} "${cleaned.slice(0, 30)}"`)
            await safeWrite(encodeFrame(FRAME.SENTENCE_END, new Uint8Array(0)))
            return
          }

          // Try WebSocket first — reuses persistent connection, saves ~50-100ms per sentence
          try {
            if (wsDisabled) throw new Error('WS disabled after previous failure')
            const wsStream = cartesiaWs.synthesize({
              transcript: cleaned,
              voiceId: voiceId!,
              language: sentenceLang,
              sampleRate: 16000,
              controls,
            })
            reader = wsStream.getReader()
            // Verify WS stream works by reading the first chunk — if the WS
            // connection failed, this is where we'll get the error
            const first = await reader.read()
            if (first.done || !first.value || first.value.length === 0) {
              reader.releaseLock()
              throw new Error('WS stream returned no audio')
            }
            chunkCount++
            totalBytes += first.value.length
            await safeWrite(encodeFrame(FRAME.AUDIO, first.value))
            // First chunk worked — read the rest
            await readPcmStream(reader)
          } catch (wsErr) {
            // WS failed during connect or first read — fall back to SSE
            usingWs = false
            chunkCount = 0
            totalBytes = 0
            wsDisabled = true
            console.warn(`[voice-stream] WS failed[${idx}], falling back to SSE (disabled for remaining sentences):`, (wsErr as Error)?.message)

            const response = await fetch('https://api.cartesia.ai/tts/sse', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Cartesia-Version': '2024-06-10',
                'X-API-Key': CARTESIA_API_KEY!,
              },
              body: JSON.stringify({
                model_id: 'sonic-multilingual',
                transcript: cleaned,
                voice: {
                  mode: 'id',
                  id: voiceId,
                  __experimental_controls: controls,
                },
                language: sentenceLang,
                output_format: {
                  container: 'raw',
                  encoding: 'pcm_s16le',
                  sample_rate: 16000,
                },
              }),
            })

            if (!response.ok) {
              const errorText = await response.text().catch(() => 'unknown')
              console.error(`[voice-stream] cartesia SSE error[${idx}]:`, response.status, errorText)
              await safeWrite(encodeFrame(FRAME.SENTENCE_END, new Uint8Array(0)))
              return
            }

            const sseStream = parseCartesiaSSE(response)
            reader = sseStream.getReader()
            await readPcmStream(reader)
          }

          const ttfa = performance.now() - tTts
          console.log(`[voice-stream:timing] cartesia[${idx}] TTFA:${ttfa.toFixed(0)}ms via:${usingWs ? 'ws' : 'sse'} lang:${sentenceLang} "${cleaned.slice(0, 40)}"`)
          if (chunkCount === 0) {
            console.warn(`[voice-stream] NO AUDIO produced for[${idx}]: "${cleaned.slice(0, 40)}"`)
          }

          console.log(`[voice-stream:timing] cartesia[${idx}] done:${(performance.now() - tTts).toFixed(0)}ms chunks:${chunkCount} bytes:${totalBytes} "${cleaned.slice(0, 30)}"`)
          await safeWrite(encodeFrame(FRAME.SENTENCE_END, new Uint8Array(0)))
        } catch (err) {
          console.error(`[voice-stream] TTS error[${idx}]:`, err)
          await safeWrite(encodeFrame(FRAME.SENTENCE_END, new Uint8Array(0)))
        }
      })
    }

    try {
      // Build messages then apply cache breakpoint
      const modelMessages = inputMessages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }))
      applyCacheBreakpoint(modelMessages)

      const result = streamText({
        model: anthropic('claude-haiku-4-5-20251001'),
        system: [{
          role: 'system' as const,
          content: system,
          providerOptions: {
            anthropic: { cacheControl: { type: 'ephemeral' } },
          },
        }],
        messages: modelMessages,
        tools,
        maxOutputTokens: 200,
        onStepFinish: ({ usage, providerMetadata }) => {
          const details = (usage as { inputTokenDetails?: { cacheWriteTokens?: number; cacheReadTokens?: number; noCacheTokens?: number } }).inputTokenDetails
          const cacheWrite = details?.cacheWriteTokens ?? 0
          const cacheRead = details?.cacheReadTokens ?? 0
          const noCache = details?.noCacheTokens ?? 0
          console.log(`[voice-stream:cache] tokens:${usage.inputTokens}+${usage.outputTokens} cache:write=${cacheWrite},read=${cacheRead},noCache=${noCache}`)
          if (cacheWrite === 0 && cacheRead === 0) {
            const anthropicMeta = providerMetadata?.anthropic as Record<string, unknown> | undefined
            console.log(`[voice-stream:cache] providerMeta:`, JSON.stringify(anthropicMeta?.usage || 'none'))
          }
        },
      })

      for await (const part of result.fullStream) {
        if (part.type === 'text-delta') {
          if (!ttftLogged) {
            ttftLogged = true
            const ttft = performance.now() - tLlm
            console.log(`[voice-stream:timing] TTFT:${ttft.toFixed(0)}ms (total:${(performance.now() - t0).toFixed(0)}ms)`)
          }

          fullText += part.text
          // Send text delta immediately for transcript display
          await safeWrite(encodeFrame(FRAME.TEXT_DELTA, encoder.encode(part.text)))

          // Detect sentence boundaries and dispatch TTS
          const sentences = tracker.feed(fullText)
          for (const s of sentences) {
            dispatchSentence(s)
          }
        }
      }

      // Flush remaining text
      const remaining = tracker.flush(fullText)
      if (remaining) {
        dispatchSentence(remaining, true)
      }
      // Force-dispatch any buffered short fragment that wasn't merged
      if (pendingFragment) {
        dispatchSentence('', true)
      }

      // Wait for all TTS audio to be streamed
      await audioChain

      const total = performance.now() - t0
      console.log(`[voice-stream:timing] complete total:${total.toFixed(0)}ms sentences:${sentenceCount} textLen:${fullText.length}`)

      await safeWrite(encodeFrame(FRAME.DONE, new Uint8Array(0)))
      await writer.close()

      // Persist transcript (fire-and-forget)
      const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')
      persistTranscript(sessionId, lastUserMsg?.content ?? null, fullText).catch(err => {
        console.error('[voice-stream] Failed to persist transcript:', err)
      })
    } catch (err) {
      console.error('[voice-stream] Fatal error:', err)
      try {
        await safeWrite(encodeFrame(FRAME.ERROR, encoder.encode(String(err))))
        await writer.close()
      } catch { /* writer may already be closed */ }
    }
  })()

  return new Response(readable, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Cache-Control': 'no-cache',
    },
  })
})
