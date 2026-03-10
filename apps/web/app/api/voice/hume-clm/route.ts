import { streamText } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { prisma } from '@lingle/db'
import { createVoiceModeTools } from '@/lib/conversation-tools'
import { buildVoiceSystemPrompt } from '@/lib/conversation-prompt'
import type { ScenarioMode } from '@/lib/experience-scenarios'
import type { ConversationMessage, ConversationToolCall } from '@lingle/shared/types'
import type { Prisma } from '@prisma/client'

interface HumeCLMMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/**
 * GET handler — Hume sends a GET to validate the endpoint exists when creating a config.
 */
export async function GET() {
  return new Response(JSON.stringify({ status: 'ok', model: 'claude-sonnet-4-20250514' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * CLM endpoint for Hume EVI.
 * Hume POSTs here with OpenAI Chat Completions format.
 * We call Claude and stream back as OpenAI-compatible SSE.
 */
export async function POST(request: Request) {
  const url = new URL(request.url)
  const body = await request.json()

  // Hume may pass custom_session_id via query param, request body, or header
  const sessionId =
    url.searchParams.get('custom_session_id') ||
    body.custom_session_id ||
    request.headers.get('x-hume-custom-session-id') ||
    null

  console.log('[hume-clm] POST received', {
    queryParams: Object.fromEntries(url.searchParams),
    bodyKeys: Object.keys(body),
    sessionId,
    hasMessages: !!(body.messages?.length),
  })

  if (!sessionId) {
    console.error('[hume-clm] No session ID found in request')
    return new Response(JSON.stringify({ error: 'Missing custom_session_id' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const humeMessages: HumeCLMMessage[] = body.messages || []

  // Look up session
  const session = await prisma.conversationSession.findUnique({
    where: { id: sessionId },
    select: { systemPrompt: true, sessionPlan: true, mode: true, userId: true },
  })

  if (!session?.systemPrompt) {
    return new Response(JSON.stringify({ error: 'Session not found or missing system prompt' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const sessionMode = (session.mode || 'conversation') as ScenarioMode

  const system = buildVoiceSystemPrompt(session.systemPrompt, {
    sessionPlan: session.sessionPlan,
    sessionMode,
    voiceMode: true,
  })

  // Convert Hume messages to AI SDK format
  // Skip system messages (we use our own prompt) and filter empty content (Hume sometimes sends empty strings)
  const messages = humeMessages
    .filter((m) => m.role !== 'system')
    .filter((m) => m.content && m.content.trim() !== '')
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))

  const tools = createVoiceModeTools(session.userId, sessionId)

  console.log('[hume-clm] sessionId:', sessionId, 'messages:', messages.length)

  const result = streamText({
    model: anthropic('claude-sonnet-4-20250514'),
    system,
    messages,
    tools,
    maxOutputTokens: 2048,
    onError: (event) => {
      console.error('[hume-clm] streamText error:', event.error)
    },
    onFinish: async ({ text, steps }) => {
      try {
        const current = await prisma.conversationSession.findUniqueOrThrow({
          where: { id: sessionId },
          select: { transcript: true },
        })
        const transcript =
          (current.transcript as unknown as ConversationMessage[]) ?? []

        // Add last user message
        const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')
        if (lastUserMsg) {
          transcript.push({
            role: 'user',
            content: lastUserMsg.content,
            timestamp: new Date().toISOString(),
          })
        }

        // Collect tool calls
        const toolCalls: ConversationToolCall[] = []
        for (const step of steps) {
          for (const tc of step.toolCalls) {
            toolCalls.push({ toolName: tc.toolName, args: tc.input as Record<string, unknown> })
          }
        }

        if (text || toolCalls.length > 0) {
          transcript.push({
            role: 'assistant',
            content: text,
            timestamp: new Date().toISOString(),
            ...(toolCalls.length > 0 ? { toolCalls } : {}),
          })
        }

        await prisma.conversationSession.update({
          where: { id: sessionId },
          data: { transcript: transcript as unknown as Prisma.InputJsonValue },
        })
      } catch (err) {
        console.error('[hume-clm] Failed to persist transcript:', err)
      }
    },
  })

  // Stream as OpenAI-compatible SSE
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of result.textStream) {
          const sseData = JSON.stringify({
            id: `chatcmpl-${sessionId}`,
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: 'claude-sonnet-4-20250514',
            system_fingerprint: sessionId,
            choices: [{
              index: 0,
              delta: { role: 'assistant', content: chunk },
              finish_reason: null,
            }],
          })
          controller.enqueue(encoder.encode(`data: ${sseData}\n\n`))
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      } catch (err) {
        console.error('[hume-clm] Stream error:', err)
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
