import { tool } from 'ai'
import { z } from 'zod'
import { prisma } from '@lingle/db'
import type { Prisma } from '@prisma/client'
import {
  normalizePlan,
  isConversationPlan,
  isTutorPlan,
  type SessionPlan,
  type ConversationPlan,
  type TutorPlan,
} from '@/lib/session-plan'
import type { ScenarioMode } from '@/lib/experience-scenarios'

// --- Tool availability matrix per mode ---

export const MODE_TOOLS: Record<ScenarioMode, string[]> = {
  conversation: ['updateSessionPlan', 'suggestActions', 'displayChoices', 'showCorrection', 'showVocabularyCard', 'showGrammarNote'],
  tutor: ['updateSessionPlan', 'suggestActions', 'displayChoices', 'showCorrection', 'showVocabularyCard', 'showGrammarNote'],
  immersion: ['updateSessionPlan', 'suggestActions', 'displayChoices', 'showVocabularyCard', 'showGrammarNote'],
  reference: ['suggestActions', 'displayChoices', 'showVocabularyCard', 'showGrammarNote'],
}

export function createConversationTools(_userId: string, _sessionId: string, mode: ScenarioMode = 'conversation') {
  const allTools = {
    updateSessionPlan: tool({
      description:
        mode === 'conversation'
          ? 'Update the scene: shift the topic, change register or tone, introduce tension or a new dynamic. Call this when the conversation naturally evolves.'
          : mode === 'tutor'
          ? 'Advance the lesson: mark steps active/completed/skipped, update the objective, add concepts, annotate steps with notes. Call this as you progress through the lesson.'
          : 'Update the session plan: mark milestones complete, adjust goals, shift focus. Call this when you complete a teaching objective or when the session direction shifts.',
      inputSchema: z.object({
        // --- Conversation fields ---
        newTopic: z.string().optional().describe('[conversation] New conversation topic'),
        newRegister: z.string().optional().describe('[conversation] New register (casual/polite/keigo/mixed)'),
        newTone: z.string().optional().describe('[conversation] New tone (lighthearted/serious/etc)'),
        newSetting: z.string().optional().describe('[conversation] New setting'),
        newTension: z.string().optional().describe('[conversation] New conversational tension'),
        newDynamic: z.string().optional().describe('[conversation] New conversation dynamic'),
        // --- Tutor fields ---
        markStepActive: z.number().optional().describe('[tutor] Index (0-based) of the step to mark as active'),
        markStepCompleted: z.array(z.number()).optional().describe('[tutor] Indices (0-based) of steps to mark completed'),
        markStepSkipped: z.array(z.number()).optional().describe('[tutor] Indices (0-based) of steps to mark skipped'),
        newObjective: z.string().optional().describe('[tutor] Updated lesson objective'),
        addConcepts: z.array(z.object({
          label: z.string(),
          type: z.enum(['grammar', 'vocabulary', 'usage']),
        })).optional().describe('[tutor] New concepts to add'),
        stepNotes: z.array(z.object({
          index: z.number(),
          notes: z.string(),
        })).optional().describe('[tutor] Annotate steps with notes'),
        // --- Immersion/reference fields (legacy) ---
        completedMilestones: z.array(z.number()).optional().describe('[immersion/reference] Indices (0-based) of milestones just completed'),
        newGoals: z.array(z.string()).optional().describe('[immersion/reference] Replace goals if focus has shifted'),
        newFocus: z.string().optional().describe('[immersion/reference] Updated one-line focus'),
      }),
      execute: async (input) => {
        const session = await prisma.conversationSession.findUniqueOrThrow({
          where: { id: _sessionId },
          select: { sessionPlan: true, mode: true },
        })
        const plan = normalizePlan(session.sessionPlan, session.mode)

        let updated: SessionPlan

        if (isConversationPlan(plan)) {
          const p: ConversationPlan = { ...plan }
          if (input.newTopic) p.topic = input.newTopic
          if (input.newRegister) p.register = input.newRegister
          if (input.newTone) p.tone = input.newTone
          if (input.newSetting) p.setting = input.newSetting
          if (input.newTension) p.tension = input.newTension
          if (input.newDynamic) p.dynamic = input.newDynamic
          updated = p
        } else if (isTutorPlan(plan)) {
          const p: TutorPlan = { ...plan, steps: plan.steps.map((s) => ({ ...s })), concepts: [...plan.concepts] }
          if (input.markStepActive != null && p.steps[input.markStepActive]) {
            // Deactivate any currently active step
            for (const s of p.steps) {
              if (s.status === 'active') s.status = 'upcoming'
            }
            p.steps[input.markStepActive].status = 'active'
          }
          if (input.markStepCompleted?.length) {
            for (const idx of input.markStepCompleted) {
              if (p.steps[idx]) p.steps[idx].status = 'completed'
            }
          }
          if (input.markStepSkipped?.length) {
            for (const idx of input.markStepSkipped) {
              if (p.steps[idx]) p.steps[idx].status = 'skipped'
            }
          }
          if (input.newObjective) p.objective = input.newObjective
          if (input.addConcepts?.length) {
            p.concepts = [...p.concepts, ...input.addConcepts]
          }
          if (input.stepNotes?.length) {
            for (const { index, notes } of input.stepNotes) {
              if (p.steps[index]) p.steps[index].notes = notes
            }
          }
          updated = p
        } else {
          // Immersion/reference — legacy behavior
          const p = { ...plan } as SessionPlan & Record<string, unknown>
          if (input.completedMilestones?.length && 'milestones' in p && Array.isArray(p.milestones)) {
            p.milestones = p.milestones.map((m: { description: string; completed: boolean }, i: number) =>
              input.completedMilestones!.includes(i) ? { ...m, completed: true } : m
            )
          }
          if (input.newGoals && 'goals' in p) {
            (p as { goals: string[] }).goals = input.newGoals
          }
          if (input.newFocus && 'focus' in p) {
            (p as { focus: string }).focus = input.newFocus
          }
          updated = p as SessionPlan
        }

        await prisma.conversationSession.update({
          where: { id: _sessionId },
          data: { sessionPlan: updated as unknown as Prisma.InputJsonValue },
        })

        return { updated: true, plan: updated }
      },
    }),

    suggestActions: tool({
      description:
        'Suggest 2-3 contextual next actions the learner could take. These can be responses, actions, or questions — whatever fits the moment. Call this at the end of every response, AFTER your text.',
      inputSchema: z.object({
        suggestions: z
          .array(z.string())
          .describe(
            '2-3 contextual next actions the learner could take, in the target language. These can be dialogue responses, actions ("Sit at the counter"), or questions. Keep them natural and varied.'
          ),
      }),
      execute: async ({ suggestions }) => {
        return { suggestions }
      },
    }),

    displayChoices: tool({
      description:
        'Display numbered choice buttons for the learner to pick from. Use this in immersive scenes when offering branching options, or anytime the learner should choose between 2-4 options.',
      inputSchema: z.object({
        choices: z
          .array(
            z.object({
              text: z.string().describe('The choice text, in the target language'),
              hint: z.string().optional().describe('Optional English hint or translation'),
            })
          )
          .min(2)
          .max(4)
          .describe('2-4 choices for the learner'),
      }),
      execute: async ({ choices }) => {
        return { choices }
      },
    }),

    showCorrection: tool({
      description:
        'Show a gentle correction card when the learner makes a grammatical or vocabulary error. Use this instead of inline [CORRECTION] tags.',
      inputSchema: z.object({
        original: z.string().describe("What the learner wrote (the incorrect form)"),
        corrected: z.string().describe('The corrected form'),
        explanation: z.string().describe('Brief explanation of why the correction was made'),
        grammarPoint: z
          .string()
          .optional()
          .describe('The grammar point involved, if applicable (e.g. "te-form")'),
      }),
      execute: async (input) => {
        return input
      },
    }),

    showVocabularyCard: tool({
      description:
        'Show a vocabulary card for a word. ONLY use when: (1) the learner explicitly asks what a word means, or (2) you intentionally use a word well above their level and want to teach it. Do NOT show cards for routine vocabulary — most words should just be used naturally without a card.',
      inputSchema: z.object({
        word: z.string().describe('The word in the target language'),
        reading: z.string().optional().describe('Reading/pronunciation (e.g. hiragana for kanji)'),
        meaning: z.string().describe('English meaning'),
        partOfSpeech: z.string().optional().describe('Part of speech (noun, verb, adjective, etc.)'),
        exampleSentence: z.string().optional().describe('Example sentence using the word'),
        notes: z.string().optional().describe('Usage notes, nuance, or cultural context'),
      }),
      execute: async (input) => {
        return input
      },
    }),

    showGrammarNote: tool({
      description:
        'Show a grammar explanation card. Use when teaching a grammar point, when the learner asks about grammar, or when a grammar pattern comes up that deserves explanation.',
      inputSchema: z.object({
        pattern: z.string().describe('The grammar pattern (e.g. "~temoidesuka")'),
        meaning: z.string().describe('What the pattern means in English'),
        formation: z.string().describe('How to form it (e.g. "Verb te-form + moidesuka")'),
        examples: z
          .array(
            z.object({
              japanese: z.string(),
              english: z.string(),
            })
          )
          .min(1)
          .max(3)
          .describe('1-3 example sentences'),
        level: z.string().optional().describe('JLPT level if applicable (N5, N4, etc.)'),
      }),
      execute: async (input) => {
        return input
      },
    }),
  }

  // Filter tools to only those available for this mode
  const allowedTools = MODE_TOOLS[mode] ?? MODE_TOOLS.conversation
  const filtered: Record<string, typeof allTools[keyof typeof allTools]> = {}
  for (const toolName of allowedTools) {
    if (toolName in allTools) {
      filtered[toolName] = allTools[toolName as keyof typeof allTools]
    }
  }

  return filtered
}

/** Voice mode: only updateSessionPlan (teaching feedback handled by separate Track 2 analysis) */
export function createVoiceModeTools(userId: string, sessionId: string) {
  return {
    updateSessionPlan: createConversationTools(userId, sessionId, 'conversation').updateSessionPlan,
  }
}

export type ConversationTools = ReturnType<typeof createConversationTools>
