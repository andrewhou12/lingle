/**
 * Custom LiveKit Voice Agent for Lingle.
 *
 * Handles:
 * - System prompt construction from learner profile + session plan
 * - Post-turn analysis via existing API endpoint
 * - Data channel messages for analysis results
 */
import { voice, llm } from '@livekit/agents'
import { buildVoiceSystemPrompt } from '@lingle/shared/conversation-prompt'
import type { ScenarioMode } from '@lingle/shared/scenario-mode'
import type { AgentMetadata } from './config.js'

export class LingleAgent extends voice.Agent {
  private metadata: AgentMetadata
  private turnIndex = 0

  constructor(metadata: AgentMetadata) {
    super({
      instructions: buildSystemPrompt(metadata),
    })
    this.metadata = metadata
  }

  override async onEnter(): Promise<void> {
    // Agent has entered — session is ready
    console.log('[LingleAgent] Agent entered, session started')
  }

  override async onUserTurnCompleted(
    chatCtx: llm.ChatContext,
    newMessage: llm.ChatMessage,
  ): Promise<void> {
    this.turnIndex++

    // Extract user text from the new message
    const userText = extractText(newMessage)

    // Fire post-turn analysis asynchronously
    if (this.metadata.analyzeEndpoint && this.metadata.sessionId && userText) {
      this.runAnalysis(userText).catch((err) => {
        console.error('[LingleAgent] Analysis failed:', err)
      })
    }
  }

  private async runAnalysis(userText: string): Promise<void> {
    const { analyzeEndpoint, sessionId, targetLanguage, nativeLanguage } = this.metadata

    if (!analyzeEndpoint) return

    try {
      const response = await fetch(analyzeEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          userMessage: userText,
          targetLanguage,
          nativeLanguage,
          turnIndex: this.turnIndex,
        }),
      })

      if (!response.ok || !response.body) return

      // Stream NDJSON analysis results to the client via data channel
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.trim()) continue
          // Send each NDJSON line to the browser via text stream
          try {
            const activity = this.getActivityOrThrow()
            const room = (activity as unknown as { room?: { localParticipant?: { publishData: (data: Uint8Array, opts: { reliable: boolean }) => void } } }).room
            if (room?.localParticipant) {
              const encoder = new TextEncoder()
              const data = encoder.encode(
                JSON.stringify({
                  type: 'analysis',
                  turnIndex: this.turnIndex,
                  data: line,
                }),
              )
              room.localParticipant.publishData(data, { reliable: true })
            }
          } catch {
            // No activity or room — skip
          }
        }
      }
    } catch (err) {
      console.error('[LingleAgent] Analysis request failed:', err)
    }
  }
}

function extractText(message: llm.ChatMessage): string {
  if (typeof message.content === 'string') return message.content
  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => {
        if (typeof part === 'string') return part
        if (part && typeof part === 'object' && 'text' in part) return (part as { text: string }).text
        return ''
      })
      .join('')
  }
  return ''
}

function buildSystemPrompt(metadata: AgentMetadata): string {
  const basePrompt = metadata.basePrompt || 'You are a language conversation partner.'
  const sessionMode = (metadata.sessionMode || 'conversation') as ScenarioMode

  return buildVoiceSystemPrompt(basePrompt, {
    sessionPlan: metadata.sessionPlan,
    sessionMode,
    voiceMode: true,
    targetLanguage: metadata.targetLanguage,
  })
}
