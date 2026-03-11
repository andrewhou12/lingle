import { streamText, type UIMessage, convertToModelMessages } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { withAuth } from '@/lib/api-helpers'

export const maxDuration = 120
import { createConversationTools, createVoiceModeTools } from '@/lib/conversation-tools'
import { buildVoiceSystemPrompt } from '@/lib/conversation-prompt'
import { getSessionWithCache } from '@/lib/conversation-session-cache'
import { persistTranscript } from '@/lib/conversation-transcript'
import { truncateMessages, MAX_CONVERSATION_MESSAGES, applyCacheBreakpoint } from '@/lib/conversation-cache-control'
import type { ScenarioMode } from '@/lib/experience-scenarios'
import type { ConversationToolCall } from '@lingle/shared/types'

export const POST = withAuth(async (request, { userId }) => {
  const t0 = performance.now()
  const body = await request.json()
  const messages: UIMessage[] = body.messages
  const sessionId: string | undefined = body.sessionId
  const voiceMode: boolean = body.voiceMode === true

  if (!sessionId) {
    return new Response(JSON.stringify({ error: 'Missing sessionId in request body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { session, cacheHit } = await getSessionWithCache(sessionId)
  const tSession = performance.now()

  const sessionMode = (session.mode || 'conversation') as ScenarioMode

  const system = buildVoiceSystemPrompt(session.systemPrompt, {
    sessionPlan: session.sessionPlan,
    sessionMode,
    voiceMode,
  })

  const tools = voiceMode
    ? createVoiceModeTools(userId, sessionId)
    : createConversationTools(userId, sessionId, sessionMode)

  // For voice mode, cap conversation history to keep latency low
  const { messages: inputMessages, truncated } = truncateMessages(
    messages,
    voiceMode ? MAX_CONVERSATION_MESSAGES : undefined,
  )
  const modelMessages = await convertToModelMessages(inputMessages, { tools })

  // Add cache breakpoint to the second-to-last message so that
  // system + tools + older turns are cached (must exceed Haiku's 2048 token minimum)
  applyCacheBreakpoint(modelMessages)
  if (modelMessages.length >= 3) {
    const target = modelMessages[modelMessages.length - 2]
    const msgAny = target as { providerOptions?: Record<string, unknown> }
    const content = target.content
    console.log(`[send:cache-debug] breakpoint on msg[${modelMessages.length - 2}] role=${target.role} msgOpts:${JSON.stringify(msgAny.providerOptions)} contentType:${Array.isArray(content) ? 'array(' + content.length + ')' : typeof content}`)
  } else {
    console.log(`[send:cache-debug] no message breakpoint (modelMessages.length=${modelMessages.length}, need >= 3)`)
  }

  const tPrep = performance.now()

  const modelId = voiceMode ? 'claude-haiku-4-5-20251001' : 'claude-sonnet-4-20250514'
  console.log(`[send:timing] session=${cacheHit ? 'cached' : 'db'}:${(tSession - t0).toFixed(0)}ms prep:${(tPrep - tSession).toFixed(0)}ms | model:${modelId} msgs:${modelMessages.length}${truncated ? ` (truncated from ${messages.length})` : ''} sysLen:${system.length}`)

  const tLlmStart = performance.now()
  let ttftLogged = false

  const result = streamText({
    model: anthropic(modelId),
    system: [{
      role: 'system' as const,
      content: system,
      providerOptions: {
        anthropic: { cacheControl: { type: 'ephemeral' } },
      },
    }],
    messages: modelMessages,
    tools,
    maxOutputTokens: voiceMode ? 512 : 2048,
    onChunk: ({ chunk }) => {
      if (!ttftLogged && chunk.type === 'text-delta') {
        ttftLogged = true
        console.log(`[send:timing] TTFT:${(performance.now() - tLlmStart).toFixed(0)}ms (from request: ${(performance.now() - t0).toFixed(0)}ms)`)
      }
    },
    onError: (event) => {
      console.error('[send] streamText error:', event.error)
    },
    onStepFinish: ({ text, toolCalls, finishReason, usage, providerMetadata }) => {
      const total = performance.now() - t0
      // Cache metrics from usage.inputTokenDetails (AI SDK v4+)
      const details = (usage as { inputTokenDetails?: { cacheWriteTokens?: number; cacheReadTokens?: number; noCacheTokens?: number } }).inputTokenDetails
      const cacheWrite = details?.cacheWriteTokens ?? 0
      const cacheRead = details?.cacheReadTokens ?? 0
      const noCache = details?.noCacheTokens ?? 0
      // Also check providerMetadata for legacy/fallback
      const anthropicMeta = providerMetadata?.anthropic as Record<string, unknown> | undefined
      const metaCacheCreate = (anthropicMeta?.cacheCreationInputTokens as number) ?? 0
      console.log(`[send:timing] step done total:${total.toFixed(0)}ms llm:${(performance.now() - tLlmStart).toFixed(0)}ms | ${finishReason} textLen:${text.length} tools:[${toolCalls.map((tc) => tc.toolName)}] tokens:${usage.inputTokens}+${usage.outputTokens} cache:write=${cacheWrite},read=${cacheRead},noCache=${noCache} meta:cacheCreate=${metaCacheCreate}`)
      // Raw dump for debugging — remove once caching is confirmed working
      if (cacheWrite === 0 && cacheRead === 0) {
        console.log('[send:cache-debug] inputTokenDetails:', JSON.stringify(details))
        console.log('[send:cache-debug] providerMetadata.anthropic:', JSON.stringify(anthropicMeta))
      }
    },
    onFinish: async ({ text, steps }) => {
      console.log('[send] onFinish text length:', text.length, 'steps:', steps.length, 'preview:', text.slice(0, 100))
      try {
        // Extract user text from the latest user UI message
        const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')
        const textPart = lastUserMsg?.parts.find((p) => p.type === 'text')
        const userContent = textPart?.type === 'text' ? textPart.text : null

        // Collect tool calls from all steps
        const toolCalls: ConversationToolCall[] = []
        for (const step of steps) {
          for (const tc of step.toolCalls) {
            toolCalls.push({ toolName: tc.toolName, args: tc.input as Record<string, unknown> })
          }
        }

        await persistTranscript(
          sessionId,
          userContent,
          text || null,
          toolCalls.length > 0 ? toolCalls : undefined,
        )
      } catch (err) {
        console.error('[conversation/send] Failed to persist transcript:', err)
      }
    },
  })

  return result.toUIMessageStreamResponse()
})
