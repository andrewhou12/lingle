import { NextResponse } from 'next/server'
import { generateObject } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'
import { withAuth } from '@/lib/api-helpers'
import { prisma } from '@lingle/db'
import { buildSystemPrompt } from '@/lib/experience-prompt'
import { getDifficultyLevel } from '@/lib/difficulty-levels'
import { normalizePlan, type SessionPlan } from '@/lib/session-plan'
import type { ScenarioMode } from '@/lib/experience-scenarios'
import type { Prisma } from '@prisma/client'
import { MODE_TOOLS } from '@/lib/conversation-tools'

// --- Per-mode Zod schemas ---

const conversationPlanSchema = z.object({
  topic: z.string().describe('What the conversation is about — e.g. "Recommending restaurants to a friend visiting Tokyo"'),
  persona: z.object({
    name: z.string().optional().describe('Optional character name'),
    relationship: z.string().describe('Relationship to the learner — e.g. "close friend", "coworker", "shopkeeper"'),
    personality: z.string().describe('Personality traits — e.g. "cheerful and talkative", "reserved but warm"'),
  }),
  register: z.string().describe('"casual", "polite", "keigo", or "mixed"'),
  tone: z.string().describe('"lighthearted", "serious", "playful debate", etc.'),
  setting: z.string().optional().describe('Where the conversation takes place — e.g. "izakaya after work", "LINE messages"'),
  speakers: z.number().optional().describe('Number of speakers — default 2, 3+ means AI plays multiple roles'),
  culturalContext: z.string().optional().describe('Relevant cultural context — e.g. "end-of-year party season"'),
  dynamic: z.string().optional().describe('Conversation dynamic — e.g. "AI leads", "learner is asking for advice"'),
  tension: z.string().optional().describe('Conversational tension or challenge — e.g. "politely decline an invitation"'),
})

const tutorPlanSchema = z.object({
  topic: z.string().describe('What the lesson covers — e.g. "te-form: formation and common uses"'),
  objective: z.string().describe('What the learner should be able to do after — e.g. "Conjugate and use te-form in 3 sentence patterns"'),
  steps: z.array(z.object({
    title: z.string().describe('Step title'),
    type: z.enum(['activate', 'explain', 'check', 'practice', 'produce', 'review']).describe('Pedagogical step type'),
    status: z.enum(['upcoming', 'active', 'completed', 'skipped']).default('upcoming'),
  })).describe('3-8 ordered lesson steps using the 6 pedagogical types'),
  concepts: z.array(z.object({
    label: z.string().describe('The concept — e.g. "te-form", "食べる"'),
    type: z.enum(['grammar', 'vocabulary', 'usage']).describe('Concept category'),
  })).describe('Key concepts being taught'),
  exerciseTypes: z.array(z.string()).optional().describe('Types of exercises to use'),
})

const milestoneSchema = z.object({
  description: z.string(),
  completed: z.boolean().default(false),
})

const planBaseFields = {
  focus: z.string().describe('One-line session description'),
  goals: z.array(z.string()).describe('2-4 specific learning objectives'),
  approach: z.string().describe('1-2 sentences on teaching strategy'),
  milestones: z
    .array(milestoneSchema)
    .describe('3-5 ordered checkpoints to hit during the session'),
}

const immersionPlanSchema = z.object({
  ...planBaseFields,
  contentType: z
    .string()
    .describe('Content type: dialogue, reading, news, jlpt, or custom'),
  contentSpec: z
    .string()
    .describe('Specific description of the content to generate'),
  comprehensionQuestions: z
    .array(z.string())
    .optional()
    .describe('2-4 comprehension questions to ask after presenting content'),
  targetVocabulary: z
    .array(z.string())
    .optional()
    .describe('Key vocabulary the content will feature'),
})

const referencePlanSchema = z.object({
  ...planBaseFields,
  topic: z.string().describe('The main topic being asked about'),
  relatedTopics: z
    .array(z.string())
    .optional()
    .describe('2-4 related topics the learner might want to explore next'),
})

function getPlanSchema(mode: string) {
  switch (mode) {
    case 'tutor':
      return tutorPlanSchema
    case 'immersion':
      return immersionPlanSchema
    case 'reference':
      return referencePlanSchema
    default:
      return conversationPlanSchema
  }
}

function getModeSpecificPlanningInstructions(mode: string, targetLanguage: string): string {
  switch (mode) {
    case 'tutor':
      return `This is a TUTOR session. Generate a structured lesson plan:
- topic: what the lesson covers
- objective: what the learner should be able to do after the lesson
- steps: 3-8 ordered pedagogical steps. Each step has a type:
  * "activate" — warm up, activate prior knowledge
  * "explain" — teach a new concept with examples
  * "check" — quick comprehension check (question, true/false, etc.)
  * "practice" — guided practice with exercises
  * "produce" — free production (learner creates their own sentences/output)
  * "review" — summarize, reinforce, preview next steps
  Compose steps freely from these building blocks. All start with status "upcoming".
- concepts: key grammar, vocabulary, and usage concepts being taught (in ${targetLanguage})
- exerciseTypes: types of exercises you'll use (e.g. "fill-in-the-blank", "translation", "sentence building")`

    case 'immersion':
      return `This is an IMMERSION session. Generate a content-focused plan:
- contentType: one of "dialogue", "reading", "news", "jlpt", or "custom"
- contentSpec: describe the specific content you'll generate (topic, length, style)
- comprehensionQuestions: 2-4 questions to test understanding after presenting content
- targetVocabulary: key vocabulary the content will feature (in ${targetLanguage})`

    case 'reference':
      return `This is a REFERENCE session. Generate a Q&A-focused plan:
- topic: the main topic being asked about
- relatedTopics: 2-4 related topics the learner might want to explore next
- milestones should focus on: define the concept, show examples, address common mistakes, offer practice`

    default:
      return `This is a CONVERSATION session. Generate a scene card — pure context for a natural conversation:
- topic: what the conversation is about (be specific and engaging)
- persona: { relationship, personality } — who the AI is playing. Add a name if it fits.
- register: "casual", "polite", "keigo", or "mixed" — match the situation
- tone: the emotional quality — "lighthearted", "serious", "playful debate", etc.
- setting: where the conversation takes place (optional, include if it adds flavor)
- culturalContext: relevant cultural context (optional)
- dynamic: who leads, what's the conversational flow (optional)
- tension: a conversational challenge or tension point (optional — e.g. "politely decline an invitation")

IMPORTANT: This is a scene card, NOT a lesson plan. No learning objectives, no milestones, no grammar targets. The learning is implicit through natural conversation. Make the scene specific and interesting — the learner should want to talk.
If the user prompt is generic like "Free conversation", create an engaging scene anyway.`
  }
}

// --- Fallback plans per mode ---

function getFallbackPlan(mode: string, sessionFocus: string): SessionPlan {
  switch (mode) {
    case 'tutor':
      return normalizePlan({
        topic: sessionFocus,
        objective: 'Understand and practice the target concept',
        steps: [
          { title: 'Warm-up', type: 'activate', status: 'upcoming' },
          { title: 'Explanation', type: 'explain', status: 'upcoming' },
          { title: 'Comprehension check', type: 'check', status: 'upcoming' },
          { title: 'Guided practice', type: 'practice', status: 'upcoming' },
          { title: 'Free production', type: 'produce', status: 'upcoming' },
          { title: 'Review', type: 'review', status: 'upcoming' },
        ],
        concepts: [],
        exerciseTypes: ['fill-in-the-blank', 'translation'],
      }, 'tutor')

    case 'immersion':
      return normalizePlan({
        focus: sessionFocus,
        goals: ['Engage with native-level content', 'Build comprehension'],
        approach: 'Present content then analyze and discuss.',
        milestones: [
          { description: 'Present content', completed: false },
          { description: 'Comprehension check', completed: false },
          { description: 'Vocabulary review', completed: false },
        ],
        contentType: 'custom',
        contentSpec: sessionFocus,
      }, 'immersion')

    case 'reference':
      return normalizePlan({
        focus: sessionFocus,
        goals: ['Answer the question clearly', 'Provide examples'],
        approach: 'Structured explanation with examples and practice.',
        milestones: [
          { description: 'Define the concept', completed: false },
          { description: 'Show examples', completed: false },
          { description: 'Common mistakes', completed: false },
        ],
        topic: sessionFocus,
      }, 'reference')

    default:
      return normalizePlan({
        topic: sessionFocus,
        persona: {
          relationship: 'conversation partner',
          personality: 'friendly and helpful',
        },
        register: 'polite',
        tone: 'lighthearted',
      }, 'conversation')
  }
}

export const POST = withAuth(async (request, { userId }) => {
  let prompt: string | undefined
  let mode: string | undefined
  try {
    const body = await request.json()
    if (body.prompt && typeof body.prompt === 'string') {
      prompt = body.prompt
    }
    if (body.mode && typeof body.mode === 'string') {
      mode = body.mode
    }
  } catch {
    // No body or invalid JSON
  }

  const profile = await prisma.learnerProfile.findUniqueOrThrow({ where: { userId } })

  const sessionFocus = prompt || 'Free conversation'
  const resolvedMode = mode || 'conversation'
  const level = getDifficultyLevel(profile.difficultyLevel)

  const availableTools = MODE_TOOLS[resolvedMode as ScenarioMode] ?? MODE_TOOLS.conversation

  const systemPrompt = buildSystemPrompt({
    userPrompt: sessionFocus,
    mode: resolvedMode,
    difficultyLevel: profile.difficultyLevel,
    nativeLanguage: profile.nativeLanguage,
    targetLanguage: profile.targetLanguage,
    availableTools,
  })

  // Generate structured session plan via Haiku with mode-specific schema
  const schema = getPlanSchema(resolvedMode)
  let plan: SessionPlan
  try {
    const planPrompt = resolvedMode === 'conversation' || resolvedMode === 'tutor'
      ? `You are a session planner for a language learning app.

User prompt: "${sessionFocus}"
Mode: ${resolvedMode}
Difficulty: ${level.label}
Target language: ${profile.targetLanguage}
Native language: ${profile.nativeLanguage}

${getModeSpecificPlanningInstructions(resolvedMode, profile.targetLanguage)}

Generate the plan as JSON. Make it specific to the user's prompt and difficulty level.`
      : `You are a session planner for a language learning app.

User prompt: "${sessionFocus}"
Mode: ${resolvedMode}
Difficulty: ${level.label}
Target language: ${profile.targetLanguage}
Native language: ${profile.nativeLanguage}

Generate a session plan as JSON:
- focus: one-line session description
- goals: 2-4 specific learning objectives appropriate for the difficulty level
- approach: 1-2 sentences on teaching strategy for this session
- milestones: 3-5 ordered checkpoints to hit during the session (all start as not completed)

${getModeSpecificPlanningInstructions(resolvedMode, profile.targetLanguage)}

Make the plan specific to the user's prompt and difficulty level.`

    const { object } = await generateObject({
      model: anthropic('claude-haiku-4-5-20251001'),
      schema,
      prompt: planPrompt,
    })
    plan = normalizePlan(object, resolvedMode)
  } catch (err) {
    console.error('[plan] Failed to generate session plan:', err)
    plan = getFallbackPlan(resolvedMode, sessionFocus)
  }

  const session = await prisma.conversationSession.create({
    data: {
      userId,
      mode: resolvedMode,
      targetLanguage: profile.targetLanguage,
      transcript: [],
      targetsPlanned: {},
      targetsHit: [],
      errorsLogged: [],
      avoidanceEvents: [],
      sessionPlan: plan as unknown as Prisma.InputJsonValue,
      systemPrompt,
    },
  })

  await prisma.learnerProfile.update({
    where: { userId },
    data: { totalSessions: { increment: 1 } },
  })

  return NextResponse.json({ _sessionId: session.id, sessionFocus, plan })
})
