import { NextResponse } from 'next/server'
import { generateObject } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'
import { withAuth } from '@/lib/api-helpers'

export const maxDuration = 60
import { withUsageCheck } from '@/lib/usage-guard'
import { prisma } from '@lingle/db'

const voiceAnalysisSchema = z.object({
  corrections: z.array(z.object({
    original: z.string().describe('The incorrect phrase only (not the full sentence)'),
    corrected: z.string().describe('The corrected phrase'),
    explanation: z.string().describe('One sentence max. No numbered lists.'),
    grammarPoint: z.string().optional().describe('2-3 word grammar label, e.g. "particle を"'),
  })).describe('Genuine grammar/vocab errors only. Never flag punctuation, formatting, or transcription artifacts. 0-2 items max.'),
  vocabularyCards: z.array(z.object({
    word: z.string().describe('Word in target language'),
    reading: z.string().optional().describe('Reading/pronunciation'),
    meaning: z.string().describe('English meaning'),
    partOfSpeech: z.string().optional().describe('Part of speech'),
    exampleSentence: z.string().optional().describe('Example sentence in target language'),
    notes: z.string().optional().describe('Usage notes'),
  })).describe('Words from the ASSISTANT\'s message that are above or at the edge of the learner\'s level. 0-3 cards.'),
  grammarNotes: z.array(z.object({
    pattern: z.string().describe('Grammar pattern in target language'),
    meaning: z.string().describe('English meaning'),
    formation: z.string().describe('How to form it'),
    examples: z.array(z.object({
      japanese: z.string(),
      english: z.string(),
    })).describe('1-2 examples'),
    level: z.string().optional().describe('Proficiency level'),
  })).describe('Grammar patterns from the ASSISTANT\'s message that are above or at the edge of the learner\'s level. 0-2 notes.'),
  naturalnessFeedback: z.array(z.object({
    original: z.string().describe('What the learner said (grammatically correct but unnatural)'),
    suggestion: z.string().describe('More natural way to say it'),
    explanation: z.string().describe('One sentence. Why the suggestion sounds more natural.'),
  })).describe('At most ONE naturalness suggestion per turn. Only flag clear cases. 0-1 items max.'),
  registerMismatches: z.array(z.object({
    original: z.string().describe('What the learner said'),
    suggestion: z.string().describe('The same idea in the correct register'),
    expected: z.string().describe('"casual", "polite", or "formal" — the register the conversation calls for'),
    explanation: z.string().describe('One sentence. Why this register is wrong for the context.'),
  })).describe('Flag when the learner uses the wrong formality level for the conversation context. 0-1 items max.'),
  l1Interference: z.array(z.object({
    original: z.string().describe('What the learner said'),
    issue: z.string().describe('One sentence describing the native-language pattern bleeding through'),
    suggestion: z.string().describe('The natural target-language way to express it'),
  })).describe('Flag when sentence structure, word choice, or phrasing mirrors the learner\'s native language instead of natural target-language patterns. 0-1 items max.'),
  alternativeExpressions: z.array(z.object({
    original: z.string().describe('What the learner said (which was correct)'),
    alternative: z.string().describe('A more idiomatic, common, or nuanced way to say it'),
    explanation: z.string().describe('One sentence. What makes the alternative better or different — collocation, nuance, or register.'),
  })).describe('When the learner\'s phrasing is correct but there\'s a notably better or more idiomatic alternative. Includes collocation improvements. 0-1 items max.'),
  conversationalTips: z.array(z.object({
    tip: z.string().describe('A short actionable tip in English, e.g. "Ask them about their week too" or "Use a follow-up question here"'),
    explanation: z.string().describe('One sentence. Why this matters culturally or pragmatically — e.g. reciprocity norms, showing interest, politeness expectations.'),
  })).describe('Cultural or pragmatic tips about the learner\'s conversational behavior — not grammar. Flag when the learner misses a social cue: not asking a reciprocal question, not acknowledging what was said, being too direct/indirect for the culture, missing a chance to show empathy or interest. 0-1 items max. Only flag clear opportunities, not every turn.'),
  takeaways: z.array(z.string()).describe('0-2 short bullet-point notes of notable things from this turn the learner should remember: key expressions, cultural context, usage tips, or "aha moments". Only include genuinely memorable insights, not routine exchanges. Most turns should have 0.'),
  sectionTracking: z.object({
    currentSectionId: z.string().describe('ID of the section currently being discussed'),
    completedSectionIds: z.array(z.string()).describe('IDs of sections that have been fully covered'),
  }).optional().describe('Track conversation skeleton progress. Only include if session has sections.'),
})

export const POST = withAuth(withUsageCheck(async (request, { userId: _userId }) => {
  const { sessionId, userMessage, assistantMessage, recentHistory } = await request.json()

  if (!sessionId || !userMessage || !assistantMessage) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const session = await prisma.conversationSession.findUnique({
    where: { id: sessionId },
    select: { targetLanguage: true, userId: true, sessionPlan: true },
  })
  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  const profile = await prisma.learnerProfile.findUnique({
    where: { userId: session.userId },
    select: { difficultyLevel: true, nativeLanguage: true, targetLanguage: true },
  })

  const historyBlock = recentHistory?.length
    ? `Recent conversation context:\n${recentHistory.map((m: { role: string; content: string }) => `${m.role}: ${m.content}`).join('\n')}\n\n`
    : ''

  // Extract sections and register from session plan
  const sessionPlan = session.sessionPlan as Record<string, unknown> | null
  const sections = sessionPlan?.sections as Array<{ id: string; label: string; description: string }> | undefined
  const sectionsBlock = sections?.length
    ? `\nConversation sections to track:\n${sections.map(s => `- ${s.id}: ${s.label} — ${s.description}`).join('\n')}\n`
    : ''
  const register = (sessionPlan?.register as string) || ''
  const registerBlock = register ? `- Expected register: ${register}\n` : ''

  const SPOKEN_LANGUAGE_RULES: Record<string, string> = {
    Japanese: 'IGNORE particle omission natural in casual spoken Japanese (e.g. dropping は, を, が). IGNORE casual contractions (e.g. ている→てる, ではない→じゃない). IGNORE sentence-final particles and filler words (えっと, あの, まあ).',
    Korean: 'IGNORE marker omission natural in casual spoken Korean (e.g. dropping 은/는, 이/가, 을/를). IGNORE casual contractions (e.g. 하는 것→하는 거, 것이→게). IGNORE filler words (음, 그, 어).',
    'Mandarin Chinese': 'IGNORE filler words natural in spoken Mandarin (那个, 嗯, 就是). IGNORE omission of 的 in casual speech. IGNORE topic-prominent structures where the subject is dropped (pro-drop). IGNORE measure word simplification in casual speech (e.g. using 个 as a general classifier).',
    Spanish: 'IGNORE subject pronoun omission natural in spoken Spanish (pro-drop language). IGNORE filler words (bueno, pues, o sea, es que). IGNORE casual contractions (pa\' for para, na\' for nada). IGNORE leísmo/laísmo that is regionally standard. IGNORE dropped -d- in past participles in casual speech (e.g. cansao for cansado).',
    French: 'IGNORE "ne" omission in spoken negation (e.g. "je sais pas" instead of "je ne sais pas") — this is standard spoken French. IGNORE filler words (euh, ben, bon, enfin, quoi, du coup). IGNORE on used instead of nous. IGNORE informal question formation without inversion (e.g. "tu viens?" instead of "viens-tu?").',
    German: 'IGNORE filler words natural in spoken German (also, halt, mal, na ja, ähm). IGNORE casual word order variations in spoken speech. IGNORE weil + verb-second order (common in spoken German though technically non-standard). IGNORE shortened forms (e.g. hab for habe, is for ist). IGNORE denn/mal particles that add conversational nuance.',
    Italian: 'IGNORE subject pronoun omission natural in spoken Italian (pro-drop language). IGNORE filler words (allora, cioè, tipo, praticamente, insomma). IGNORE passato prossimo used instead of passato remoto in spoken northern Italian. IGNORE informal question formation. IGNORE clitic doubling in casual speech.',
    Portuguese: 'IGNORE subject pronoun omission natural in spoken Portuguese (pro-drop language). IGNORE filler words (tipo, né, então, bom, sei lá). IGNORE ter used instead of haver in compound tenses in Brazilian Portuguese. IGNORE a gente used instead of nós. IGNORE pra/pro contractions (para + a/o). IGNORE tu with third-person verb conjugation common in Brazilian spoken Portuguese.',
  }
  const spokenRule = SPOKEN_LANGUAGE_RULES[profile?.targetLanguage ?? session.targetLanguage ?? ''] || ''

  try {
    const { object } = await generateObject({
      model: anthropic('claude-haiku-4-5-20251001'),
      schema: voiceAnalysisSchema,
      prompt: `You are a language learning analysis engine. Analyze this voice conversation exchange and extract teaching feedback.

${historyBlock}Latest exchange:
Learner: ${userMessage}
Assistant: ${assistantMessage}

Learner info:
- Target language: ${profile?.targetLanguage ?? session.targetLanguage}
- Native language: ${profile?.nativeLanguage ?? 'English'}
- Difficulty level: ${profile?.difficultyLevel ?? 3}
${registerBlock}${sectionsBlock}
Rules:
- Only flag GENUINE grammar/vocabulary errors — not stylistic choices, casual speech, or natural variation.
- IGNORE transcription artifacts: the learner's text comes from speech-to-text, so missing punctuation, wrong quote marks, spacing issues, or minor formatting differences are NOT errors. Never correct punctuation or formatting.
${spokenRule ? `- ${spokenRule}\n` : ''}- Keep explanations to ONE concise sentence. No multi-part explanations, no numbered lists.
- Vocabulary cards: Scan the ASSISTANT's message for words that are above or at the edge of the learner's difficulty level (level ${profile?.difficultyLevel ?? 3}). These are words the learner likely doesn't know yet but encountered in context. Include 0-3 cards per turn. Skip basic words the learner clearly already knows. Focus on the most useful/memorable ones.
- Grammar notes: Scan the ASSISTANT's message for grammar patterns above or at the edge of the learner's level. These are forms the learner may not have studied yet. Include 0-2 notes per turn. Skip patterns the learner has clearly been using correctly themselves.
- Naturalness feedback: Only if the learner's sentence is grammatically correct but clearly textbook-ish. 0-1 items max.
- Register mismatches: If the expected register is specified above, check if the learner used the wrong formality level. e.g. using です/ます in a casual conversation, or casual forms in a polite/formal setting. 0-1 items max. Only flag clear mismatches, not borderline cases.
- L1 interference: Check if the learner's sentence structure, word order, or phrasing mirrors ${profile?.nativeLanguage ?? 'English'} patterns instead of natural ${profile?.targetLanguage ?? session.targetLanguage}. Common examples: direct translation of idioms, wrong word order calqued from the native language, using words in ways that only make sense from the native language perspective. 0-1 items max. Only flag when it's clearly L1 influence, not just a generic error.
- Alternative expressions: If the learner said something correct but there's a notably more idiomatic, natural, or commonly-used alternative (including better collocations), suggest it. This expands their active repertoire. 0-1 items max. Only suggest when the alternative is genuinely better, not just different.
- Conversational tips: Flag when the learner misses a cultural or pragmatic opportunity — e.g. not asking a reciprocal question after being asked one, not showing interest in what the other person said, being too blunt or too indirect for the context, missing empathy cues. These are about conversational behavior, not grammar. 0-1 items max.
- Be extremely selective overall. Each feedback type is 0-1 items max. A typical turn should have feedback in only 1-2 categories, not all of them. Don't overwhelm the learner.
- sectionTracking: If conversation sections are provided above, identify which section is currently active based on the conversation context, and which sections have been fully covered. Only include this field if sections are provided.`,
    })

    return NextResponse.json(object)
  } catch (err) {
    console.error('[voice-analyze] Analysis failed:', err)
    return NextResponse.json({ corrections: [], vocabularyCards: [], grammarNotes: [], naturalnessFeedback: [], registerMismatches: [], l1Interference: [], alternativeExpressions: [], conversationalTips: [], takeaways: [], sectionTracking: undefined })
  }
}))
