import { normalizePlan, formatPlanForPrompt } from '@/lib/session-plan'
import type { ScenarioMode } from '@/lib/experience-scenarios'

/**
 * Build the full system prompt for a voice conversation session.
 * Shared between /api/conversation/send and /api/voice/hume-clm.
 */
export function buildVoiceSystemPrompt(
  basePrompt: string,
  opts: {
    sessionPlan: unknown
    sessionMode: ScenarioMode
    voiceMode: boolean
  },
): string {
  const { sessionPlan, sessionMode, voiceMode } = opts

  const plan = sessionPlan ? normalizePlan(sessionPlan, sessionMode) : null
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
This is a live voice conversation via text-to-speech. The learner is waiting to hear you speak.

CRITICAL — BREVITY:
- 1-2 sentences MAXIMUM. Never more. This is spoken aloud — long responses feel like a lecture.
- Respond like a quick back-and-forth text exchange, not an essay.
- You MUST ALWAYS produce spoken text. NEVER respond with only tool calls and no text. The learner is waiting to hear you speak.
- Corrections, vocabulary cards, and grammar notes are handled separately via visual cards — do NOT explain errors in your spoken text. Just recast naturally.

SPEECH NATURALNESS:
- Speak like a real person talking off the top of their head, NOT reading a script.
- Use filler words naturally in the target language: えーっと、うーん、そうですね、あのー
- Trail off sometimes... don't always end sentences perfectly.
- React before responding: あー！、へー、うんうん、ああ
- Vary sentence length: one-word answers mixed with fuller thoughts.
- NEVER overuse pauses or fillers — sprinkle them naturally, not every sentence.

FORMATTING:
- End sentences cleanly with 。！？ — the TTS needs clear sentence boundaries.
- No markdown, no bullet points, no lists, no numbered items. Just natural speech.
- Do NOT use {kanji|reading} ruby annotations in voice mode — just write the kanji directly.
- NEVER include meta-commentary, stage directions, or reasoning about what you're doing. Your output is read aloud — only output words you'd actually say.
- If the learner's speech was unclear, ask them to repeat naturally.

LEARNER SIGNALS:
- Messages may include a [Learner signals: ...] annotation at the end.
- These are automatic observations about speech (hesitation, filler words, low confidence, L1 switching).
- Adapt accordingly: simplify if hesitating, redirect if they switch to native language.
- NEVER read signal annotations aloud or reference them directly.`
    : ''

  return basePrompt + planBlock + voiceBlock
}
