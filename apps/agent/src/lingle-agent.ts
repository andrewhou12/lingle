/**
 * Custom LiveKit Voice Agent for Lingle.
 *
 * Implements the 6-slot system prompt per spec Section 4.5:
 *   Slot 1 — Identity & role, voice rules, behavioral constraints
 *   Slot 2 — Learner profile (CEFR, skills, personal context)
 *   Slot 3 — Lesson plan
 *   Slot 4 — Phase instructions (exit criteria, permission protocol)
 *   Slot 5 — Tool instructions
 *   Slot 6 — Behavioral constraints (edge cases)
 *
 * Per-turn: Redis session state injected as system message addendum.
 * Context compression after 20+ turns (async, never blocks).
 */
import { voice, llm } from '@livekit/agents'
import Anthropic from '@anthropic-ai/sdk'
import type { AgentMetadata, LessonPhase } from '@lingle/shared'
import { cefrLabel } from '@lingle/shared'
import { buildToolContext } from './tools.js'
import { getSessionState, serializeForPrompt } from './session-state.js'

const anthropic = new Anthropic()

const MAX_FULL_TURNS = 20
const KEEP_RECENT_TURNS = 5

function isGarbageTranscript(text: string): boolean {
  return /^[\s.…。、,!?！？·]+$/.test(text) || text.trim().length === 0
}

export class LingleAgent extends voice.Agent {
  private metadata: AgentMetadata
  private turnIndex = 0
  private contextSummary: string | null = null
  private lastStateSignature = ''
  private currentPhase: LessonPhase = 'warmup'

  constructor(metadata: AgentMetadata) {
    const slides = metadata.lessonPlan?.slides ?? []
    const self = { currentPhase: 'warmup' as LessonPhase }
    const tools = buildToolContext(metadata.sessionId, slides, () => self.currentPhase)

    super({
      instructions: buildSystemPrompt(metadata),
      ...(tools ? { tools } : {}),
    })
    this.metadata = metadata
    // Wire up the phase tracker so writeWhiteboard can read it
    this._phaseRef = self
  }

  private _phaseRef: { currentPhase: LessonPhase } = { currentPhase: 'warmup' }

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

    // Inject live session state into system prompt (only if changed)
    if (this.metadata.sessionId) {
      try {
        await this.injectSessionStateIfChanged(chatCtx)
      } catch (err) {
        console.error('[LingleAgent] Session state injection failed:', err)
      }
    }

    // Context compression (async, never blocks)
    this.maybeCompressContext(chatCtx).catch((err) => {
      console.error('[LingleAgent] Context compression failed:', err)
    })
  }

  /**
   * Inject Redis session state into the system message ONLY if semantically
   * important fields changed. Preserves preemptive generation when state is stable.
   */
  private async injectSessionStateIfChanged(chatCtx: llm.ChatContext): Promise<void> {
    const state = await getSessionState(this.metadata.sessionId!)
    if (!state) return

    // Keep phase ref in sync so writeWhiteboard knows current phase
    this._phaseRef.currentPhase = state.currentPhase

    const sig = [
      state.currentPhase,
      Math.floor(state.errorsLogged.length / 3),
      state.phaseExtensionGranted ? 'ext' : 'no-ext',
      state.correctionsQueued.length > 0 ? 'has-corrections' : 'no-corrections',
      state.whiteboardContent.newMaterial.length,
      state.whiteboardContent.corrections.length,
    ].join('|')

    if (sig === this.lastStateSignature) {
      console.log(`[LingleAgent] session state unchanged (turn ${this.turnIndex}), skipping injection`)
      return
    }

    this.lastStateSignature = sig
    const stateBlock = serializeForPrompt(state)

    console.log(`[LingleAgent] ── INJECTED PROMPT (turn ${this.turnIndex}) ──\n${stateBlock}\n── END ──`)

    // Find system message and append/replace
    for (const item of chatCtx.items) {
      if (item.type === 'message') {
        const msg = item as llm.ChatMessage
        if (msg.role === 'system' || msg.role === 'developer') {
          const text = msg.textContent || ''
          const marker = '=== SESSION STATE (read every turn) ==='
          const markerIdx = text.indexOf(marker)
          if (markerIdx >= 0) {
            ;(msg as unknown as { content: string }).content = text.substring(0, markerIdx) + stateBlock
          } else {
            ;(msg as unknown as { content: string }).content = text + '\n\n' + stateBlock
          }
          break
        }
      }
    }
  }

  /**
   * Compress older turns when context grows beyond MAX_FULL_TURNS.
   * Keeps the last KEEP_RECENT_TURNS (5) always uncompressed.
   * Async — never blocks the current turn.
   */
  private async maybeCompressContext(chatCtx: llm.ChatContext): Promise<void> {
    const messages = chatCtx.items.filter(
      (item) => item.type === 'message' && (item as llm.ChatMessage).role !== 'system' && (item as llm.ChatMessage).role !== 'developer',
    )

    if (messages.length < MAX_FULL_TURNS * 2) return

    const splitPoint = messages.length - KEEP_RECENT_TURNS * 2
    const oldMessages = messages.slice(0, splitPoint)

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

        const systemItems = chatCtx.items.filter(
          (item) => item.type === 'message' && ((item as llm.ChatMessage).role === 'system' || (item as llm.ChatMessage).role === 'developer'),
        )
        const recentItems = messages.slice(splitPoint)

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
 * 6-Slot System Prompt Builder (spec Section 4.5)
 */
export function buildSystemPrompt(metadata: AgentMetadata): string {
  const targetLang = metadata.targetLanguage || 'the target language'
  const nativeLang = metadata.nativeLanguage || 'English'
  const hasSession = !!metadata.sessionId

  // Test mode (no sessionId): minimal prompt
  if (!hasSession) {
    const basePrompt = metadata.basePrompt || 'You are a spoken conversation partner'
    let prompt = basePrompt

    if (metadata.sessionPlan && typeof metadata.sessionPlan === 'object') {
      const plan = metadata.sessionPlan as Record<string, unknown>
      if (plan.topic) prompt += `\n\nSession topic: ${plan.topic}`
      if (plan.persona) prompt += `\nPersona: ${JSON.stringify(plan.persona)}`
      if (plan.register) prompt += `\nRegister: ${plan.register}`
    }

    prompt += `\n\nIMPORTANT VOICE MODE RULES:
- Your output is sent DIRECTLY to a text-to-speech engine and spoken aloud.
- Speak primarily in ${targetLang}. Use ${nativeLang} only for brief clarifications.
- Do NOT use markdown, bullet points, asterisks, or other formatting.
- Do NOT include stage directions or action descriptions (*like this* or [like this]).
- Keep turns short — 1-3 sentences.`
    return prompt
  }

  // ── SLOT 1: Identity & Role ──
  const slot1 = `You are a skilled ${targetLang} language tutor having a real-time voice conversation with a learner whose native language is ${nativeLang}.

PERSONA & APPROACH:
- Be warm, patient, and encouraging. Sound like a real conversation partner, not a textbook.
- Speak primarily in ${targetLang}. Switch to ${nativeLang} only for brief vocabulary clarifications when stuck.
- Keep turns short — 1-3 sentences. This is spoken conversation, not a lecture.
- Create natural conversational contexts that elicit target vocabulary and grammar.

VOICE MODE RULES:
- Your output is sent DIRECTLY to a text-to-speech engine. Every character is spoken aloud.
- Do NOT use markdown, bullet points, numbered lists, asterisks, or formatting.
- Do NOT include stage directions, internal thoughts, or action descriptions.
- Do NOT narrate your actions ("Let me log that error" / "I'm noting your progress").
- Do NOT mix ${nativeLang} commentary into ${targetLang} speech.`

  // ── SLOT 2: Learner Profile ──
  let slot2 = ''
  if (metadata.learnerModel) {
    const lm = metadata.learnerModel
    slot2 = `

LEARNER PROFILE:
- CEFR Grammar: ${lm.cefrGrammar.toFixed(1)} (${cefrLabel(lm.cefrGrammar)})
- CEFR Fluency: ${lm.cefrFluency.toFixed(1)} (${cefrLabel(lm.cefrFluency)})
- Sessions completed: ${lm.sessionCount}
- Correction style preference: ${metadata.correctionStyle || 'recast'}`
  }

  if (metadata.userProfile) {
    const up = metadata.userProfile
    if (up.name) slot2 += `\n- Name: ${up.name}`
    if (up.occupation) slot2 += `\n- Occupation: ${up.occupation}`
    if (up.family) slot2 += `\n- Family: ${up.family}`
    if (up.goals) slot2 += `\n- Goals: ${up.goals}`
    if (up.interests.length > 0) slot2 += `\n- Interests: ${up.interests.join(', ')}`
    if (up.recentUpdates.length > 0) {
      slot2 += `\n\nRECENT UPDATES (reference ONLY what is listed here — never infer or embellish):`
      for (const u of up.recentUpdates) {
        slot2 += `\n- ${u}`
      }
    }
  }

  // ── SLOT 3: Lesson Plan ──
  let slot3 = ''
  if (metadata.lessonPlan) {
    const lp = metadata.lessonPlan
    slot3 = `

LESSON PLAN:
- Warmup: ${lp.warmup.questionOfDay}${lp.warmup.personalHook ? ` (hook: ${lp.warmup.personalHook})` : ''}
- Review: ${lp.review.skip ? 'SKIPPED (no items)' : `${lp.review.vocabItems.length} vocab, ${lp.review.grammarItems.length} grammar, ${lp.review.errorsToRevisit.length} errors to revisit`}
- Core topic: ${lp.core.topic} — ${lp.core.angle}${lp.core.targetGrammar ? ` (target grammar: ${lp.core.targetGrammar})` : ''}
- Phase budgets: warmup ${lp.phaseBudgetMinutes.warmup}m, review ${lp.phaseBudgetMinutes.review}m, core ${lp.phaseBudgetMinutes.core}m, debrief ${lp.phaseBudgetMinutes.debrief}m, closing ${lp.phaseBudgetMinutes.closing}m`
  }

  // ── SLOT 4: Phase Instructions ──
  const slot4 = `

PHASE INSTRUCTIONS:

WARMUP:
Transition to REVIEW when: the user has shared a personal update AND at least 4 minutes have elapsed. OR when 6 minutes have elapsed regardless. Before transitioning, ask: "[Target language: Shall we move on to reviewing what we covered last time?]" and wait for acknowledgment.

REVIEW (if not skipped):
Transition to CORE when: all review items have been covered (each attempted at least once) OR when 10 minutes have elapsed in this phase. If 8 minutes have elapsed and items remain, begin wrapping up. Before transitioning, ask permission.

CORE:
Transition to DEBRIEF when: the conversation topic has been substantively explored AND at least 18 minutes have elapsed in this phase. OR when 25 minutes have elapsed. Ask permission before transitioning.

DEBRIEF:
Review major errors from the session with at least one correction attempt each. Transition to CLOSING when done OR after 5 minutes. Ask permission.

CLOSING:
Terminal phase. Encourage the user and preview what's next. Then call endLesson.

PERMISSION PROTOCOL:
Before EVERY phase transition, you MUST ask the learner for permission. Vary how you ask naturally. Wait for acknowledgment before calling updateLessonPhase.

ONE-EXTENSION RULE:
If the user asks to continue a section after you propose moving on, grant ONE extension of up to 3 additional minutes. If they ask for a second extension, say "Let's make a note of this and come back to it next time" and proceed.`

  // ── SLOT 5: Tool Instructions ──
  const slot5 = `

TOOL INSTRUCTIONS:
You have exactly 4 tools. All return empty strings. NEVER narrate or acknowledge tool calls.

- flagError: Call for EVERY grammar/vocab/pronunciation/register/L1 error you notice, but ONLY severity minor or major. Pedantic errors (trivial, one-off) are NOT flagged.
- writeWhiteboard: Write to the whiteboard the learner sees on screen. Two sections: "new_material" and "corrections". Give each item a stable itemId (e.g. "vocab_kaigi"). You can reference the board naturally but do NOT say "I'm writing to the whiteboard."
  WHEN TO CALL:
  - CORE phase: Call with section="new_material" every time you explicitly introduce, explain, or define a new vocabulary word, grammar pattern, or phrase. If you say a word and then explain what it means, that's an introduction — write it.
  - DEBRIEF phase: Call with section="corrections" for each error you review. Show the incorrect form and the correction.
  - REVIEW phase: Optionally add reviewed items from the previous session to "new_material" as you cover them.
  - Do NOT write incidental words that appear in passing conversation. Only write items you are pedagogically surfacing.
  - Use action="update" if you need to fix a typo. Use action="delete" to remove an item that was wrong.
- updateLessonPhase: Call to advance to the next phase. ALWAYS ask permission first and wait for acknowledgment.
- endLesson: Call after the closing phase to end the session.`

  // ── SLOT 6: Behavioral Constraints (Edge Cases) ──
  const slot6 = `

BEHAVIORAL CONSTRAINTS:

STT FAILURES:
If the user's utterance seems incoherent, cut off, or doesn't make sense in context, ask for clarification before responding. Never fabricate meaning from unclear input. Say something like "Sorry, I didn't quite catch that — could you say that again?"

OFF-SCRIPT USER:
Acknowledge, politely redirect, and return to the session. "That's a great idea — let's save that for after our session."

USER DISPUTES CORRECTION:
Explain your reasoning once. If they remain unconvinced, acknowledge the disagreement and move on. Do not argue. Do not capitulate to incorrect pushback.

USER EMOTIONAL/FRUSTRATED:
Pause the lesson structure entirely. Acknowledge their feeling directly and genuinely. Offer encouragement specific to their actual progress. Ask if they'd like to continue or stop. Do not rush back to the lesson.

USER REFUSES A PHASE:
Honor this without argument. Call updateLessonPhase to skip it. Move to the next phase. Do not explain pedagogical value.

USER PRODUCES ABOVE LEVEL:
Do not raise difficulty. Continue at the current level. Post-session analysis will pick it up.

META QUESTIONS ("What level am I?"):
Answer briefly from your injected learner profile data. Redirect to current topic.

PERSONAL FACT HALLUCINATION GUARD:
You may ONLY reference personal facts that are explicitly present in the LEARNER PROFILE and RECENT UPDATES sections above. Never infer, guess, or embellish beyond what is written there. If a fact is not in your profile, it did not happen.`

  const fullPrompt = slot1 + slot2 + slot3 + slot4 + slot5 + slot6
  console.log(`[agent] prompt=FULL_SESSION (~${Math.round(fullPrompt.length / 4)} tokens) hasSession=true`)
  return fullPrompt
}
