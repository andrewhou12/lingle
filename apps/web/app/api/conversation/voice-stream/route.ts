import { streamText } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { withAuth } from '@/lib/api-helpers'
import { prisma } from '@lingle/db'
import { createVoiceModeTools } from '@/lib/conversation-tools'
import { buildVoiceSystemPrompt } from '@/lib/conversation-prompt'
import type { ScenarioMode } from '@/lib/experience-scenarios'
import type { ConversationMessage } from '@lingle/shared/types'
import type { Prisma } from '@prisma/client'
import { createSentenceBoundaryTracker } from '@/lib/voice/sentence-boundary'
import { parseCartesiaSSE } from '@/lib/cartesia-sse'
import { FRAME, encodeFrame } from '@/lib/voice/voice-stream-protocol'
import { getLanguageById } from '@/lib/languages'

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

// Detect if a sentence is predominantly English vs CJK-based target language
const CJK_RANGE = /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf\uff00-\uff9f\uac00-\ud7af\u1100-\u11ff]/g
function detectSentenceLanguage(text: string, targetLangCode: string): string {
  const cjkCount = (text.match(CJK_RANGE) || []).length
  const latinCount = (text.match(LATIN_CHAR) || []).length
  // If more Latin chars than CJK, treat as English
  if (latinCount > 0 && cjkCount === 0) return 'en'
  if (latinCount > cjkCount * 2) return 'en'
  return targetLangCode
}

// Same session cache as send route — systemPrompt/sessionPlan/mode/targetLanguage never change mid-session
const sessionCache = new Map<string, { systemPrompt: string; sessionPlan: unknown; mode: string | null; targetLanguage: string }>()

function cleanForTTS(text: string): string {
  return text.replace(RUBY_REGEX, '$1').replace(PAUSE_MARKER_REGEX, '').trim()
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
  if (bustCache) {
    sessionCache.delete(sessionId)
  }
  let session = sessionCache.get(sessionId)
  const cacheHit = !!session
  if (!session) {
    const dbSession = await prisma.conversationSession.findUniqueOrThrow({
      where: { id: sessionId },
      select: { systemPrompt: true, sessionPlan: true, mode: true, targetLanguage: true },
    })
    if (!dbSession.systemPrompt) throw new Error('Session has no system prompt')
    session = {
      systemPrompt: dbSession.systemPrompt,
      sessionPlan: dbSession.sessionPlan,
      mode: dbSession.mode,
      targetLanguage: dbSession.targetLanguage,
    }
    sessionCache.set(sessionId, session)
  }

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
  const MAX_VOICE_MESSAGES = 20
  const inputMessages = messages.length > MAX_VOICE_MESSAGES
    ? messages.slice(-MAX_VOICE_MESSAGES)
    : messages

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

    const dispatchSentence = (sentence: string) => {
      const sentenceLang = detectSentenceLanguage(sentence, targetLangCode)
      // Only strip non-target-language content for CJK languages where Latin chars reliably indicate English
      const cleaned = sentenceLang === 'en'
        ? cleanForTTS(sentence)
        : isCJK
          ? stripNonTargetLanguage(cleanForTTS(sentence))
          : cleanForTTS(sentence)
      if (!cleaned || PUNCTUATION_ONLY.test(cleaned)) return

      const idx = sentenceCount++
      audioChain = audioChain.then(async () => {
        const tTts = performance.now()
        try {
          await safeWrite(encodeFrame(FRAME.SENTENCE_START, encoder.encode(cleaned)))

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
              voice: { mode: 'id', id: voiceId },
              language: sentenceLang,
              output_format: {
                container: 'raw',
                encoding: 'pcm_s16le',
                sample_rate: 24000,
              },
            }),
          })

          const ttfa = performance.now() - tTts
          console.log(`[voice-stream:timing] cartesia[${idx}] TTFA:${ttfa.toFixed(0)}ms lang:${sentenceLang} "${cleaned.slice(0, 40)}"`)

          if (!response.ok) {
            const errorText = await response.text().catch(() => 'unknown')
            console.error(`[voice-stream] cartesia error[${idx}]:`, response.status, errorText)
            await safeWrite(encodeFrame(FRAME.SENTENCE_END, new Uint8Array(0)))
            return
          }

          const pcmStream = parseCartesiaSSE(response)
          const reader = pcmStream.getReader()
          let chunkCount = 0
          let totalBytes = 0

          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            chunkCount++
            totalBytes += value.length
            await safeWrite(encodeFrame(FRAME.AUDIO, value))
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
      // Build messages with cache breakpoint on second-to-last message
      const modelMessages = inputMessages.map((m, i) => {
        const isBreakpoint = inputMessages.length >= 3 && i === inputMessages.length - 2
        if (m.role === 'assistant') {
          return {
            role: 'assistant' as const,
            content: m.content,
            ...(isBreakpoint ? { providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } } } : {}),
          }
        }
        return {
          role: 'user' as const,
          content: m.content,
          ...(isBreakpoint ? { providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } } } : {}),
        }
      })

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
        maxOutputTokens: 512,
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
        dispatchSentence(remaining)
      }

      // Wait for all TTS audio to be streamed
      await audioChain

      const total = performance.now() - t0
      console.log(`[voice-stream:timing] complete total:${total.toFixed(0)}ms sentences:${sentenceCount} textLen:${fullText.length}`)

      await safeWrite(encodeFrame(FRAME.DONE, new Uint8Array(0)))
      await writer.close()

      // Persist transcript (fire-and-forget)
      persistTranscript(sessionId, messages, fullText).catch(err => {
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

async function persistTranscript(
  sessionId: string,
  messages: Array<{ role: string; content: string }>,
  assistantText: string,
) {
  const current = await prisma.conversationSession.findUniqueOrThrow({
    where: { id: sessionId },
    select: { transcript: true },
  })
  const transcript = (current.transcript as unknown as ConversationMessage[]) ?? []

  // Add user message
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')
  if (lastUserMsg) {
    transcript.push({
      role: 'user',
      content: lastUserMsg.content,
      timestamp: new Date().toISOString(),
    })
  }

  // Add assistant response
  if (assistantText) {
    transcript.push({
      role: 'assistant',
      content: assistantText,
      timestamp: new Date().toISOString(),
    })
  }

  await prisma.conversationSession.update({
    where: { id: sessionId },
    data: { transcript: transcript as unknown as Prisma.InputJsonValue },
  })
}
