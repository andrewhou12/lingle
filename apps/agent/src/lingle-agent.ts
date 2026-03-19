/**
 * Custom LiveKit Voice Agent for Lingle.
 *
 * Handles:
 * - System prompt construction from learner profile + session plan
 * - Context management: summarizes old turns to keep context window lean
 * - Data channel messages for whiteboard content
 */
import { voice, llm } from '@livekit/agents'
import Anthropic from '@anthropic-ai/sdk'
import { resolveAgentTtsProvider, type AgentMetadata } from './config.js'
import { buildToolContext } from './tools.js'
import { buildWhiteboardTools, type WhiteboardMessage } from './whiteboard-tools.js'
import { getSessionState, serializeForPrompt } from './session-state.js'

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
    // Build base tools + whiteboard tools
    const baseTools = buildToolContext(metadata.sessionId, metadata.sessionMode)

    // Whiteboard publish uses a deferred reference — set once room is available
    let publishFn: ((msg: WhiteboardMessage) => void) | null = null
    const publish = (msg: WhiteboardMessage) => {
      if (publishFn) publishFn(msg)
      else console.warn('[LingleAgent] whiteboard publish called before room available')
    }

    const whiteboardTools = metadata.sessionId ? buildWhiteboardTools(publish) : {}
    const allTools = baseTools ? { ...baseTools, ...whiteboardTools } : undefined

    super({
      instructions: buildSystemPrompt(metadata),
      ...(allTools ? { tools: allTools } : {}),
    })
    this.metadata = metadata

    // Wire up the publish function once we have access to the activity/room
    // This is set lazily on the first tool call attempt
    this._setPublishFn = (fn) => { publishFn = fn }
  }

  private _setPublishFn: ((fn: (msg: WhiteboardMessage) => void) => void) | null = null

  override async onEnter(): Promise<void> {
    // Wire up whiteboard publish function now that we have room access
    if (this._setPublishFn) {
      this._setPublishFn((msg: WhiteboardMessage) => {
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
            const payload = encoder.encode(JSON.stringify(msg))
            room.localParticipant.publishData(payload, { reliable: true })
          }
        } catch {
          // No activity or room yet
        }
      })
    }
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

    // Inject live session state (Slot 3) into system prompt
    if (this.metadata.sessionId) {
      this.injectSessionState(chatCtx).catch((err) => {
        console.error('[LingleAgent] Session state injection failed:', err)
      })
    }

    // Context management: summarize old turns when context grows too large
    await this.maybeCompressContext(chatCtx)

  }

  /**
   * Read session state from Redis and inject it into the system message
   * as Slot 3 content. This ensures every LLM call sees the latest
   * error counts, lesson phase, and difficulty constraints.
   */
  private async injectSessionState(chatCtx: llm.ChatContext): Promise<void> {
    const state = await getSessionState(this.metadata.sessionId)
    if (!state) return

    const stateBlock = serializeForPrompt(state)

    // Find the system message and append/replace the session state block
    for (const item of chatCtx.items) {
      if (item.type === 'message') {
        const msg = item as llm.ChatMessage
        if (msg.role === 'system' || msg.role === 'developer') {
          const text = msg.textContent || ''
          // Replace existing session state block or append
          const marker = '=== SESSION STATE (read every turn) ==='
          const markerIdx = text.indexOf(marker)
          if (markerIdx >= 0) {
            // Replace everything from marker to end
            const before = text.substring(0, markerIdx)
            ;(msg as unknown as { content: string }).content = before + stateBlock
          } else {
            ;(msg as unknown as { content: string }).content = text + '\n\n' + stateBlock
          }
          break
        }
      }
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

/**
 * 6-Slot System Prompt Builder
 *
 * Slot 1 — System block: persona, behavioral rules, tool instructions
 * Slot 2 — User profile: CEFR scores, weak areas, correction style
 * Slot 3 — Session state: phase, errors, difficulty (injected per-turn via Redis)
 * Slot 4 — Retrieved memories: placeholder for Mem0 (Phase 6)
 * Slot 5 — Conversation window: managed by context compression above
 * Slot 6 — Current utterance: handled by LiveKit framework
 */
export function buildSystemPrompt(metadata: AgentMetadata): string {
  const targetLang = metadata.targetLanguage || 'the target language'
  const nativeLang = metadata.nativeLanguage || 'English'
  const ttsProvider = resolveAgentTtsProvider(metadata)
  const hasSession = !!metadata.sessionId

  // ── Slot 1: System Block (~800 tokens) ──
  // For test mode (no sessionId), use a simple prompt
  if (!hasSession) {
    const basePrompt = metadata.basePrompt || 'You are a language conversation partner.'
    let prompt = basePrompt

    if (metadata.sessionPlan && typeof metadata.sessionPlan === 'object') {
      const plan = metadata.sessionPlan as Record<string, unknown>
      if (plan.topic) prompt += `\n\nSession topic: ${plan.topic}`
      if (plan.persona) prompt += `\nPersona: ${JSON.stringify(plan.persona)}`
      if (plan.register) prompt += `\nRegister: ${plan.register}`
    }

    prompt += `\n\nIMPORTANT VOICE MODE RULES:
- You are speaking out loud in a real-time voice conversation. Keep responses concise and conversational.
- Speak primarily in ${targetLang}. Use the learner's native language only for brief clarifications.
- Do NOT use markdown, bullet points, or other formatting — this is spoken language.
- When the learner makes errors, recast naturally (use the correct form in your response) rather than explicitly correcting.
- Keep turns short — 1-3 sentences is ideal for natural conversation flow.`

    return prompt
  }

  // ── Full 6-slot prompt for real sessions ──

  const correctionStyle = metadata.correctionStyle || 'recast'
  const correctionRule = correctionStyle === 'explicit'
    ? 'When the learner makes errors, gently point out the error and explain the correct form.'
    : correctionStyle === 'none'
      ? 'Do not correct errors unless they cause miscommunication.'
      : 'When the learner makes errors, recast naturally — use the correct form in your next utterance without explicitly pointing out the error.'

  const slot1 = `You are a skilled ${targetLang} language tutor having a real-time voice conversation with a learner whose native language is ${nativeLang}.

PERSONA & APPROACH:
- Be warm, patient, and encouraging. Sound like a real conversation partner, not a textbook.
- Speak primarily in ${targetLang}. Switch to ${nativeLang} only for brief vocabulary clarifications when the learner is stuck.
- Keep turns short — 1-3 sentences. This is a spoken conversation, not a lecture.
- Create natural conversational contexts that elicit target vocabulary and grammar from the learner.
- ${correctionRule}
- Track errors and strengths silently using your tools. NEVER mention tool calls in speech.

VOICE MODE RULES:
- Do NOT use markdown, bullet points, numbered lists, or any text formatting — this is spoken language.
- Do NOT narrate your actions ("Let me log that error" / "I'm noting your progress").
- Do NOT explicitly announce lesson phases or transitions.
- Respond naturally to what the learner says. If they go off-topic, gently guide back.

TOOL USAGE RULES:
- Call logError for EVERY grammar, vocabulary, pronunciation, or register error you notice.
- Call noteStrength when the learner demonstrates skill growth.
- Call saveMemory when you learn personal facts (job, hobbies, family, interests).
- Call queueCorrection for errors worth reviewing post-session.
- Call updateLessonPhase when naturally transitioning between warmup → main → review → wrapup.
- Call adjustDifficulty if the learner is consistently struggling or breezing through.
- All tool calls are SILENT. They must not affect your spoken output.

PROHIBITED:
- Do NOT break character or discuss the system, tools, or AI nature.
- Do NOT give long grammar explanations mid-conversation (save for corrections doc).
- Do NOT use language above the learner's level as defined in the difficulty constraints.`

  // ── Slot 2: User Profile (~500 tokens) ──
  let slot2 = ''
  if (metadata.learnerModel) {
    const lm = metadata.learnerModel
    slot2 = `\n\nLEARNER PROFILE:
- CEFR Grammar: ${lm.cefrGrammar.toFixed(1)} (${cefrLabelFromScore(lm.cefrGrammar)})
- CEFR Fluency: ${lm.cefrFluency.toFixed(1)} (${cefrLabelFromScore(lm.cefrFluency)})
- Weak areas: ${lm.weakAreas?.join(', ') || 'none identified yet'}
- Sessions completed: ${lm.sessionsCompleted}
- Correction style preference: ${correctionStyle}`
    if (metadata.personalNotes) {
      slot2 += `\n- Personal notes: ${metadata.personalNotes}`
    }
  }

  if (metadata.errorPatterns && metadata.errorPatterns.length > 0) {
    slot2 += `\n\nKNOWN ERROR PATTERNS (address naturally in conversation):`
    for (const ep of metadata.errorPatterns.slice(0, 8)) {
      slot2 += `\n- ${ep.rule}: ${ep.occurrenceCount}x across ${ep.sessionCount} sessions`
    }
  }

  // ── Slot 3: Session State (placeholder — injected per-turn) ──
  let slot3 = ''
  if (metadata.lessonPlan) {
    const lp = metadata.lessonPlan
    slot3 = `\n\nSESSION PLAN:
- Warmup topic: ${lp.warmupTopic}
- Main activity: ${lp.mainActivity}
- Target vocab: ${lp.targetVocab?.join(', ') || 'none'}
- Grammar focus: ${lp.grammarFocus?.join(', ') || 'none'}
- Review items: ${lp.reviewPatterns?.join(', ') || 'none'}`
  }

  // ── Slot 4: Episodic Memories ──
  const slot4 = metadata.memories ? `\n\n${metadata.memories}` : ''

  return slot1 + slot2 + slot3 + slot4
}

function cefrLabelFromScore(score: number): string {
  if (score < 1.5) return 'A1'
  if (score < 2.5) return 'A2'
  if (score < 3.5) return 'B1'
  if (score < 4.5) return 'B2'
  if (score < 5.5) return 'C1'
  return 'C2'
}
