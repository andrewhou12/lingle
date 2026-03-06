import { streamText, type UIMessage, convertToModelMessages } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { withAuth } from '@/lib/api-helpers'
import { withUsageCheck } from '@/lib/usage-guard'
import { prisma } from '@lingle/db'
import { createConversationTools } from '@/lib/conversation-tools'
import { normalizePlan, formatPlanForPrompt } from '@/lib/session-plan'
import type { ScenarioMode } from '@/lib/experience-scenarios'
import type { ConversationMessage, ConversationToolCall } from '@lingle/shared/types'
import type { Prisma } from '@prisma/client'

export const POST = withAuth(withUsageCheck(async (request, { userId }) => {
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

  const session = await prisma.conversationSession.findUniqueOrThrow({
    where: { id: sessionId },
    select: { systemPrompt: true, sessionPlan: true, mode: true },
  })
  if (!session.systemPrompt) throw new Error('Session has no system prompt')

  const sessionMode = (session.mode || 'conversation') as ScenarioMode

  // Combine static system prompt + dynamic session plan
  const plan = session.sessionPlan ? normalizePlan(session.sessionPlan, sessionMode) : null
  const planInstruction =
    sessionMode === 'conversation'
      ? 'Use this scene card to guide the conversation. Stay in character. If the conversation evolves, call updateSessionPlan to update the scene.'
      : sessionMode === 'tutor'
      ? 'Follow this lesson plan step by step. Call updateSessionPlan to mark steps active as you begin them, and completed when done. Adapt if the learner needs to skip or revisit.'
      : sessionMode === 'reference'
      ? 'Follow this plan. Track milestones.'
      : 'Follow this plan. Track milestones. Adapt if the learner\'s needs shift — call updateSessionPlan to record changes.'
  const planBlock = plan
    ? `\n\n═══ SESSION PLAN ═══\n${formatPlanForPrompt(plan)}\n\n${planInstruction}`
    : ''
  const voiceBlock = voiceMode
    ? `\n\n═══ VOICE MODE ═══
This is a live voice conversation. The learner is speaking aloud and hearing your
responses via text-to-speech.

1. Keep responses SHORT. 1-3 sentences max. No monologues.
2. Do NOT use displayChoices or suggestActions. Present options conversationally.
3. End sentences cleanly with 。！？ — the TTS needs clear boundaries.
4. No markdown, no bullet points, no lists. Just natural speech.
5. Corrections, vocabulary cards, and grammar notes still work as visual overlays.
6. If the learner's speech was unclear, ask them to repeat naturally.`
    : ''
  const system = session.systemPrompt + planBlock + voiceBlock

  const tools = createConversationTools(userId, sessionId, sessionMode)
  const modelMessages = await convertToModelMessages(messages, { tools })

  console.log('[send] modelMessages count:', modelMessages.length)
  console.log('[send] tools:', Object.keys(tools))
  console.log('[send] system prompt length:', system.length)

  const result = streamText({
    model: anthropic('claude-sonnet-4-20250514'),
    system,
    messages: modelMessages,
    tools,
    maxOutputTokens: 2048,
    onError: (event) => {
      console.error('[send] streamText error:', event.error)
    },
    onStepFinish: ({ text, toolCalls, finishReason }) => {
      console.log('[send] step finished:', {
        finishReason,
        textLen: text.length,
        textPreview: text.slice(0, 80),
        toolCalls: toolCalls.map((tc) => tc.toolName),
      })
    },
    onFinish: async ({ text, steps }) => {
      console.log('[send] onFinish text length:', text.length, 'steps:', steps.length, 'preview:', text.slice(0, 100))
      try {
        // Re-fetch transcript to avoid stale reads on concurrent messages
        const current = await prisma.conversationSession.findUniqueOrThrow({
          where: { id: sessionId },
          select: { transcript: true },
        })
        const transcript =
          (current.transcript as unknown as ConversationMessage[]) ?? []

        // Find the latest user message from the UI messages
        const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')
        if (lastUserMsg) {
          const textPart = lastUserMsg.parts.find((p) => p.type === 'text')
          if (textPart && textPart.type === 'text') {
            transcript.push({
              role: 'user',
              content: textPart.text,
              timestamp: new Date().toISOString(),
            })
          }
        }

        // Collect tool calls from all steps
        const toolCalls: ConversationToolCall[] = []
        for (const step of steps) {
          for (const tc of step.toolCalls) {
            toolCalls.push({ toolName: tc.toolName, args: tc.input as Record<string, unknown> })
          }
        }

        // Add assistant response with tool call data
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
        console.error('[conversation/send] Failed to persist transcript:', err)
      }
    },
  })

  return result.toUIMessageStreamResponse()
}))
