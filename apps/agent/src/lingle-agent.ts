/**
 * Custom LiveKit Voice Agent for Lingle.
 *
 * Handles:
 * - System prompt construction from learner profile + session plan
 * - Context management: summarizes old turns to keep context window lean
 * - Post-turn analysis via Claude Haiku (runs in-process, no HTTP round-trip)
 * - Data channel messages for analysis results
 */
import { voice, llm } from '@livekit/agents'
import Anthropic from '@anthropic-ai/sdk'
import { resolveAgentTtsProvider, type AgentMetadata } from './config.js'

const anthropic = new Anthropic()

/** Max message pairs to keep in full before summarizing older ones */
const MAX_FULL_TURNS = 20
/** When summarizing, keep this many recent turns in full */
const KEEP_RECENT_TURNS = 12

/** Returns true if the transcript is empty noise (dots, punctuation, whitespace) */
function isGarbageTranscript(text: string): boolean {
  return /^[\s.…。、,!?！？·]+$/.test(text) || text.trim().length === 0
}

export class LingleAgent extends voice.Agent {
  private metadata: AgentMetadata
  private turnIndex = 0
  private contextSummary: string | null = null

  constructor(metadata: AgentMetadata) {
    super({
      instructions: buildSystemPrompt(metadata),
    })
    this.metadata = metadata
  }

  override async onEnter(): Promise<void> {
    // Session started — no-op, lifecycle managed by AgentSession
  }

  override async onUserTurnCompleted(
    chatCtx: llm.ChatContext,
    newMessage: llm.ChatMessage,
  ): Promise<void> {
    const userText = extractText(newMessage)

    if (!userText || isGarbageTranscript(userText)) {
      console.log(`[LingleAgent] skipping garbage transcript: "${userText}"`)
      return
    }

    this.turnIndex++

    // Context management: summarize old turns when context grows too large
    await this.maybeCompressContext(chatCtx)

    // Fire post-turn analysis asynchronously (in-process via Claude Haiku)
    if (this.metadata.sessionId) {
      this.runAnalysis(chatCtx, userText).catch((err) => {
        console.error('[LingleAgent] Analysis failed:', err)
      })
    }
  }

  /**
   * When conversation exceeds MAX_FULL_TURNS, summarize older turns into a
   * compact summary and replace them in the chat context. Keeps the most
   * recent KEEP_RECENT_TURNS in full for LLM quality.
   */
  private async maybeCompressContext(chatCtx: llm.ChatContext): Promise<void> {
    // Count user+assistant message pairs (excluding system)
    const messages = chatCtx.items.filter(
      (item) => item.type === 'message' && (item as llm.ChatMessage).role !== 'system' && (item as llm.ChatMessage).role !== 'developer',
    )

    if (messages.length < MAX_FULL_TURNS * 2) return

    // Split into old (to summarize) and recent (to keep)
    const splitPoint = messages.length - KEEP_RECENT_TURNS * 2
    const oldMessages = messages.slice(0, splitPoint)

    // Build text for summarization
    const oldText = oldMessages
      .map((msg) => {
        const m = msg as llm.ChatMessage
        return `${m.role}: ${m.textContent || ''}`
      })
      .join('\n')

    try {
      const summary = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system: 'Summarize this conversation excerpt in 2-3 sentences. Focus on: topics discussed, key vocabulary/grammar the learner used or struggled with, and where the conversation was heading. Be concise.',
        messages: [{ role: 'user', content: oldText }],
      })

      const summaryText = summary.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('')

      if (summaryText) {
        this.contextSummary = summaryText

        // Rebuild context: keep system messages + summary + recent messages
        const systemItems = chatCtx.items.filter(
          (item) => item.type === 'message' && ((item as llm.ChatMessage).role === 'system' || (item as llm.ChatMessage).role === 'developer'),
        )
        const recentItems = messages.slice(splitPoint)

        // Use truncate to clear, then re-add
        const freshCtx = new llm.ChatContext()
        for (const item of systemItems) {
          const msg = item as llm.ChatMessage
          freshCtx.addMessage({ role: msg.role, content: msg.textContent || '' })
        }
        freshCtx.addMessage({
          role: 'user',
          content: `[Earlier conversation summary: ${summaryText}]`,
        })
        freshCtx.addMessage({
          role: 'assistant',
          content: '[Understood, continuing the conversation.]',
        })
        for (const item of recentItems) {
          const msg = item as llm.ChatMessage
          freshCtx.addMessage({ role: msg.role, content: msg.textContent || '' })
        }

        // Replace items in the original context
        chatCtx.items = freshCtx.items

        console.log(`[LingleAgent] Compressed ${oldMessages.length} messages into summary (${summaryText.length} chars)`)
      }
    } catch (err) {
      console.error('[LingleAgent] Context compression failed:', err)
    }
  }

  /**
   * Run post-turn analysis directly via Claude Haiku (no HTTP round-trip).
   * Results are streamed to the browser via LiveKit data channel.
   */
  private async runAnalysis(chatCtx: llm.ChatContext, userText: string): Promise<void> {
    const { sessionId, targetLanguage, nativeLanguage } = this.metadata
    if (!sessionId) return

    // Build recent history from chat context
    const recentMessages = chatCtx.items
      .filter((item) => item.type === 'message')
      .slice(-10)
      .map((item) => {
        const msg = item as llm.ChatMessage
        return { role: msg.role, content: msg.textContent || '' }
      })

    // Get the last assistant message
    const lastAssistant = [...recentMessages].reverse().find((m) => m.role === 'assistant')
    const assistantText = lastAssistant?.content || ''

    const langName = targetLanguage || 'Japanese'
    const analysisPrompt = `Analyze this exchange from a ${langName} language learning conversation.

User said: "${userText}"
Assistant responded: "${assistantText}"

Recent history for context:
${recentMessages.map((m) => `${m.role}: ${m.content}`).join('\n')}

Return a JSON object with these fields (omit empty arrays):
{
  "corrections": [{"original": "...", "corrected": "...", "explanation": "...", "grammarPoint": "..."}],
  "naturalnessFeedback": [{"original": "...", "suggestion": "...", "explanation": "..."}],
  "alternativeExpressions": [{"original": "...", "alternative": "...", "explanation": "..."}],
  "registerMismatches": [{"original": "...", "suggestion": "...", "expected": "...", "explanation": "..."}],
  "l1Interference": [{"original": "...", "issue": "...", "suggestion": "..."}],
  "conversationalTips": [{"tip": "...", "explanation": "..."}],
  "takeaways": ["..."]
}

Rules:
- Only flag genuine learner errors, NOT speech-to-text transcription artifacts.
- For ${langName}, do NOT flag natural spoken features as errors (e.g., dropped particles in casual speech, contracted forms).
- Be concise. Each explanation should be 1-2 sentences max.
- If the user's ${langName} was correct, return mostly empty arrays — don't invent issues.`

    try {
      const stream = anthropic.messages.stream({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{ role: 'user', content: analysisPrompt }],
        system: `You are a ${langName} language analysis engine. Output only valid JSON. The learner's native language is ${nativeLanguage || 'English'}.`,
      })

      let fullText = ''
      let lastEmitTime = 0

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          fullText += event.delta.text

          // Try to parse and emit periodically
          const now = Date.now()
          if (now - lastEmitTime < 200) continue
          lastEmitTime = now

          try {
            // Attempt to parse partial JSON (may fail for incomplete)
            const parsed = JSON.parse(fullText)
            this.publishAnalysis(parsed)
          } catch {
            // Incomplete JSON — wait for more
          }
        }
      }

      // Final parse and emit
      try {
        // Strip markdown code fences if present
        let cleaned = fullText.trim()
        if (cleaned.startsWith('```')) {
          cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
        }
        const parsed = JSON.parse(cleaned)
        this.publishAnalysis(parsed)
        console.log('[LingleAgent] Analysis complete for turn', this.turnIndex)
      } catch {
        console.error('[LingleAgent] Failed to parse final analysis JSON')
      }
    } catch (err) {
      console.error('[LingleAgent] Analysis stream failed:', err)
    }
  }

  private publishAnalysis(data: Record<string, unknown>): void {
    try {
      const activity = this.getActivityOrThrow()
      const room = (activity as unknown as {
        room?: {
          localParticipant?: {
            publishData: (data: Uint8Array, opts: { reliable: boolean }) => void
          }
        }
      }).room
      if (room?.localParticipant) {
        const encoder = new TextEncoder()
        const payload = encoder.encode(
          JSON.stringify({
            type: 'analysis',
            turnIndex: this.turnIndex,
            data: JSON.stringify(data),
          }),
        )
        room.localParticipant.publishData(payload, { reliable: true })
      }
    } catch {
      // No activity or room — skip
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
  const targetLang = metadata.targetLanguage || 'the target language'
  const ttsProvider = resolveAgentTtsProvider(metadata)

  let prompt = basePrompt

  // Add session plan context if available
  if (metadata.sessionPlan && typeof metadata.sessionPlan === 'object') {
    const plan = metadata.sessionPlan as Record<string, unknown>
    if (plan.topic) prompt += `\n\nSession topic: ${plan.topic}`
    if (plan.persona) prompt += `\nPersona: ${JSON.stringify(plan.persona)}`
    if (plan.register) prompt += `\nRegister: ${plan.register}`
  }

  // Voice-specific instructions
  prompt += `\n\nIMPORTANT VOICE MODE RULES:
- You are speaking out loud in a real-time voice conversation. Keep responses concise and conversational.
- Speak primarily in ${targetLang}. Use the learner's native language only for brief clarifications.
- Do NOT use markdown, bullet points, or other formatting — this is spoken language.
- When the learner makes errors, recast naturally (use the correct form in your response) rather than explicitly correcting.
- Keep turns short — 1-3 sentences is ideal for natural conversation flow.`

  // TTS-specific hints
  if (ttsProvider === 'cartesia') {
    prompt += `\n- You may use <break time="0.5s"/> for natural pauses.`
  }

  return prompt
}
