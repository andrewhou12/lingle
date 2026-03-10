import { NextResponse } from 'next/server'
import { generateObject } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'
import { withAuth } from '@/lib/api-helpers'
import { withUsageCheck } from '@/lib/usage-guard'
import { prisma } from '@lingle/db'

const voiceAnalysisSchema = z.object({
  corrections: z.array(z.object({
    original: z.string().describe('The incorrect phrase only (not the full sentence)'),
    corrected: z.string().describe('The corrected phrase'),
    explanation: z.string().describe('One sentence max. No numbered lists.'),
    grammarPoint: z.string().optional().describe('2-3 word grammar label, e.g. "particle を"'),
  })).max(2).describe('Genuine grammar/vocab errors only. Never flag punctuation, formatting, or transcription artifacts.'),
  vocabularyCards: z.array(z.object({
    word: z.string().describe('Word in target language'),
    reading: z.string().optional().describe('Reading/pronunciation'),
    meaning: z.string().describe('English meaning'),
    partOfSpeech: z.string().optional().describe('Part of speech'),
    exampleSentence: z.string().optional().describe('Example sentence'),
    notes: z.string().optional().describe('Usage notes'),
  })).describe('Only words above learner level used by the assistant — 0-2 cards max'),
  grammarNotes: z.array(z.object({
    pattern: z.string().describe('Grammar pattern'),
    meaning: z.string().describe('English meaning'),
    formation: z.string().describe('How to form it'),
    examples: z.array(z.object({
      japanese: z.string(),
      english: z.string(),
    })).describe('1-2 examples'),
    level: z.string().optional().describe('JLPT level'),
  })).describe('Only if assistant used a notable grammar pattern — 0-1 notes max'),
  naturalnessFeedback: z.array(z.object({
    original: z.string().describe('What the learner said (grammatically correct but unnatural)'),
    suggestion: z.string().describe('More natural way to say it'),
    explanation: z.string().describe('One sentence. Why the suggestion sounds more natural.'),
  })).max(1).describe('At most ONE naturalness suggestion per turn. Only flag clear cases.'),
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

  // Extract sections from session plan for tracking
  const sessionPlan = session.sessionPlan as Record<string, unknown> | null
  const sections = sessionPlan?.sections as Array<{ id: string; label: string; description: string }> | undefined
  const sectionsBlock = sections?.length
    ? `\nConversation sections to track:\n${sections.map(s => `- ${s.id}: ${s.label} — ${s.description}`).join('\n')}\n`
    : ''

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
${sectionsBlock}
Rules:
- Only flag GENUINE grammar/vocabulary errors — not stylistic choices, casual speech, or natural variation.
- IGNORE transcription artifacts: the learner's text comes from speech-to-text, so missing punctuation, wrong quote marks (「」vs『』), spacing issues, or minor formatting differences are NOT errors. Never correct punctuation or formatting.
- IGNORE particle omission that is natural in casual spoken Japanese (e.g. dropping は, を, が in casual speech).
- Keep explanations to ONE concise sentence. No multi-part explanations, no numbered lists.
- Vocabulary cards: ONLY if the learner explicitly asked what a word means. Never proactively. 0-2 max.
- Grammar notes: ONLY if the learner explicitly asked about a grammar point. Never proactively. 0-1 max.
- Naturalness feedback: Only if the learner's sentence is grammatically correct but clearly textbook-ish. 0-1 items max.
- If everything looks fine, return empty arrays. Most turns should have 0 corrections.
- Be extremely selective. When in doubt, do NOT correct.
- sectionTracking: If conversation sections are provided above, identify which section is currently active based on the conversation context, and which sections have been fully covered. Only include this field if sections are provided.`,
    })

    return NextResponse.json(object)
  } catch (err) {
    console.error('[voice-analyze] Analysis failed:', err)
    return NextResponse.json({ corrections: [], vocabularyCards: [], grammarNotes: [], naturalnessFeedback: [], sectionTracking: undefined })
  }
}))
