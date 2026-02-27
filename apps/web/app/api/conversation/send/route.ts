import { withAuth } from '@/lib/api-helpers'
import { prisma } from '@linguist/db'
import Anthropic from '@anthropic-ai/sdk'
import type { ConversationMessage } from '@linguist/shared/types'
import type { Prisma } from '@prisma/client'

const anthropic = new Anthropic()

export const POST = withAuth(async (request) => {
  const { sessionId, message, stream: useStream } = await request.json()

  const session = await prisma.conversationSession.findUniqueOrThrow({ where: { id: sessionId } })
  if (!session.systemPrompt) throw new Error('Session has no system prompt')

  const transcript = (session.transcript as unknown as ConversationMessage[]) ?? []
  const userMsg: ConversationMessage = { role: 'user', content: message, timestamp: new Date().toISOString() }
  transcript.push(userMsg)

  const recentMessages = transcript.slice(-30)
  const apiMessages = recentMessages.map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }))

  if (useStream) {
    const stream = anthropic.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 512,
      system: session.systemPrompt,
      messages: apiMessages,
    })

    const encoder = new TextEncoder()
    let fullContent = ''

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              fullContent += event.delta.text
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'delta', text: event.delta.text })}\n\n`))
            }
          }

          const assistantMsg: ConversationMessage = {
            role: 'assistant',
            content: fullContent,
            timestamp: new Date().toISOString(),
          }
          transcript.push(assistantMsg)

          await prisma.conversationSession.update({
            where: { id: sessionId },
            data: { transcript: transcript as unknown as Prisma.InputJsonValue },
          })

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done', message: assistantMsg })}\n\n`))
          controller.close()
        } catch (err) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: String(err) })}\n\n`))
          controller.close()
        }
      },
    })

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  }

  // Non-streaming fallback
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 512,
    system: session.systemPrompt,
    messages: apiMessages,
  })

  const textContent = response.content.find((c) => c.type === 'text')
  const assistantContent = textContent?.type === 'text' ? textContent.text : ''

  const assistantMsg: ConversationMessage = { role: 'assistant', content: assistantContent, timestamp: new Date().toISOString() }
  transcript.push(assistantMsg)

  await prisma.conversationSession.update({
    where: { id: sessionId },
    data: { transcript: transcript as unknown as Prisma.InputJsonValue },
  })

  return Response.json(assistantMsg)
})
