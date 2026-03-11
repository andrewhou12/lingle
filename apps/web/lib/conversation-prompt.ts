import { normalizePlan, formatPlanForPrompt } from '@/lib/session-plan'
import type { ScenarioMode } from '@/lib/experience-scenarios'
import { getLanguageById, getSttCode } from '@/lib/languages'
import { getFillerWords } from '@/lib/voice/filler-words'
import { getReactionWords } from '@/lib/voice/filler-words'

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
    targetLanguage?: string
  },
): string {
  const { sessionPlan, sessionMode, voiceMode, targetLanguage } = opts

  const plan = sessionPlan ? normalizePlan(sessionPlan, sessionMode) : null
  const planInstruction =
    sessionMode === 'conversation'
      ? 'Use this scene card and conversation skeleton to guide the conversation. Stay in character. You are responsible for moving the conversation forward through each section — don\'t wait for the learner to stumble onto the next topic. When a section has been explored enough (2-4 exchanges), bridge naturally to the next one with a question or comment that opens the new topic. You can follow the learner\'s tangents briefly, but always bring it back to the plan. If the conversation evolves significantly, call updateSessionPlan to update the scene.'
      : sessionMode === 'tutor'
      ? 'Follow this lesson plan step by step. Call updateSessionPlan to mark steps active as you begin them, and completed when done. Adapt if the learner needs to skip or revisit.'
      : sessionMode === 'reference'
      ? 'Follow this plan. Track milestones.'
      : 'Follow this plan. Track milestones. Adapt if the learner\'s needs shift — call updateSessionPlan to record changes.'
  const planBlock = plan
    ? `\n\n═══ SESSION PLAN ═══\n${formatPlanForPrompt(plan)}\n\n${planInstruction}`
    : ''

  const langConfig = targetLanguage ? getLanguageById(targetLanguage) : null
  const langName = targetLanguage || 'the target language'
  const sttCode = targetLanguage ? getSttCode(targetLanguage) : 'ja'
  const fillers = getFillerWords(sttCode)
  const reactions = getReactionWords(sttCode)
  const sentenceBoundaryChars = langConfig?.sentenceBoundaryChars || '.!?'
  const hasAnnotations = langConfig?.hasAnnotations ?? false

  const voiceBlock = voiceMode
    ? `\n\n═══ VOICE MODE ═══
This is a live voice conversation via text-to-speech. The learner is waiting to hear you speak.

CRITICAL — BREVITY:
- 2-3 sentences. This is spoken aloud — long responses feel like a lecture.
- Always end your response with a question or prompt that invites the learner to speak next.
- Respond like a quick back-and-forth text exchange, not an essay.
- You MUST ALWAYS produce spoken text. NEVER respond with only tool calls and no text. The learner is waiting to hear you speak.
- Corrections, vocabulary cards, and grammar notes are handled separately via visual cards — do NOT explain errors in your spoken text. Just recast naturally.
- Default to 100% target language. IGNORE any "ENGLISH:" instructions from the difficulty level — those apply to text mode only. In voice mode, do NOT translate, gloss, or add English after your sentences. The ONLY exception is when redirecting a learner who switched to English (see LANGUAGE SWITCHING below).

SPEECH NATURALNESS:
- Speak like a real person talking off the top of their head, NOT reading a script.${fillers.length > 0 ? `\n- Use filler words naturally in the target language: ${fillers.slice(0, 4).join('\u3001')}` : ''}
- Trail off sometimes... don't always end sentences perfectly.${reactions.length > 0 ? `\n- React before responding: ${reactions.slice(0, 4).join('\u3001')}` : ''}
- Vary sentence length: one-word answers mixed with fuller thoughts.
- NEVER overuse pauses or fillers — sprinkle them naturally, not every sentence.
- Be a real person: disagree, tease, challenge, express surprise or skepticism. NEVER be sycophantic or give hollow praise.

FORMATTING:
- End sentences cleanly with ${sentenceBoundaryChars} — the TTS needs clear sentence boundaries.
- No markdown, no bullet points, no lists, no numbered items. Just natural speech.${hasAnnotations ? '\n- Do NOT use annotation markup in voice mode — just write characters directly.' : ''}
- NEVER include meta-commentary, stage directions, or reasoning about what you're doing. Your output is read aloud — only output words you'd actually say.
- If the learner's speech was unclear, ask them to repeat naturally.

FIRST MESSAGE:
- Your very first response MUST be a clear, warm greeting in the target language.
- Introduce yourself using your persona/character name from the session plan and briefly set the scene.
- Do NOT react to session setup instructions, the user's prompt, or the session plan — just greet naturally as your character would.
- Keep it to 1-2 sentences. End with a simple question to get the conversation started.

LANGUAGE SWITCHING:
- If the learner switches to English (their native language), respond with ONE short sentence in English acknowledging what they said, then switch back to ${langName}.
- Keep the English part brief and warm — just enough so they don't feel ignored. Then immediately redirect the conversation back to ${langName}.
- If they keep speaking English, gently encourage them to practice in ${langName}.
- Do NOT lecture them about using ${langName}. Keep it light and natural.
- If they seem stuck or frustrated, simplify your ${langName} significantly rather than switching to English.

LEARNER SIGNALS:
- Messages may include a [Learner signals: ...] annotation at the end.
- These are automatic observations about speech (hesitation, filler words, low confidence, L1 switching).
- Adapt accordingly: simplify if hesitating, use the language switching rules above if they switch to native language.
- NEVER read signal annotations aloud or reference them directly.`
    : ''

  return basePrompt + planBlock + voiceBlock
}
