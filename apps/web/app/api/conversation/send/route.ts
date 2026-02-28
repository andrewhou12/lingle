import { streamText, type UIMessage, convertToModelMessages } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { withAuth } from '@/lib/api-helpers'
import { prisma } from '@linguist/db'
import { createConversationTools } from '@/lib/conversation-tools'
import type { ConversationMessage } from '@linguist/shared/types'
import type { Prisma } from '@prisma/client'

export const POST = withAuth(async (request, { userId }) => {
  const body = await request.json()
  const messages: UIMessage[] = body.messages
  const sessionId: string | undefined = body.sessionId

  if (!sessionId) {
    return new Response(JSON.stringify({ error: 'Missing sessionId in request body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const session = await prisma.conversationSession.findUniqueOrThrow({
    where: { id: sessionId },
  })
  if (!session.systemPrompt) throw new Error('Session has no system prompt')

  const tools = createConversationTools(userId, sessionId)
  const modelMessages = await convertToModelMessages(messages, { tools })

  const result = streamText({
    model: anthropic('claude-sonnet-4-20250514'),
    system: session.systemPrompt,
    messages: modelMessages,
    tools,
    maxOutputTokens: 1024,
    onFinish: async ({ text }) => {
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

        // Add assistant response (text only, no tool invocation data)
        if (text) {
          transcript.push({
            role: 'assistant',
            content: text,
            timestamp: new Date().toISOString(),
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
})
