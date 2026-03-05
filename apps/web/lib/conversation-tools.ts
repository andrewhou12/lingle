import { tool } from 'ai'
import { z } from 'zod'
import { prisma } from '@lingle/db'
import type { Prisma } from '@prisma/client'
import type { SessionPlan } from '@/lib/session-plan'

export function createConversationTools(_userId: string, _sessionId: string) {
  return {
    updateSessionPlan: tool({
      description:
        'Update the session plan when the direction changes — e.g., completing milestones, adjusting goals based on learner performance, shifting focus. Call this proactively when you notice the session evolving.',
      inputSchema: z.object({
        completedMilestones: z
          .array(z.number())
          .optional()
          .describe('Indices (0-based) of milestones just completed'),
        newGoals: z
          .array(z.string())
          .optional()
          .describe('Replace goals if focus has shifted'),
        newFocus: z.string().optional().describe('Updated one-line focus if the session direction changed'),
        addVocabulary: z
          .array(z.string())
          .optional()
          .describe('New vocabulary to add to targets'),
        addGrammar: z
          .array(z.string())
          .optional()
          .describe('New grammar patterns to add to targets'),
      }),
      execute: async ({ completedMilestones, newGoals, newFocus, addVocabulary, addGrammar }) => {
        const session = await prisma.conversationSession.findUniqueOrThrow({
          where: { id: _sessionId },
          select: { sessionPlan: true },
        })
        const plan = (session.sessionPlan ?? {}) as unknown as SessionPlan

        if (completedMilestones?.length && plan.milestones) {
          for (const idx of completedMilestones) {
            if (plan.milestones[idx]) {
              plan.milestones[idx].completed = true
            }
          }
        }
        if (newGoals) plan.goals = newGoals
        if (newFocus) plan.focus = newFocus
        if (addVocabulary?.length) {
          plan.targetVocabulary = [...(plan.targetVocabulary ?? []), ...addVocabulary]
        }
        if (addGrammar?.length) {
          plan.targetGrammar = [...(plan.targetGrammar ?? []), ...addGrammar]
        }

        await prisma.conversationSession.update({
          where: { id: _sessionId },
          data: { sessionPlan: plan as unknown as Prisma.InputJsonValue },
        })

        return { updated: true, plan }
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
          .describe('The grammar point involved, if applicable (e.g. "て-form")'),
      }),
      execute: async (input) => {
        return input
      },
    }),

    showVocabularyCard: tool({
      description:
        'Show a vocabulary card to teach or highlight a word. Use when introducing new vocabulary, when the learner asks about a word, or when a word comes up naturally that deserves attention.',
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
        pattern: z.string().describe('The grammar pattern (e.g. "〜てもいいですか")'),
        meaning: z.string().describe('What the pattern means in English'),
        formation: z.string().describe('How to form it (e.g. "Verb て-form + もいいですか")'),
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
}

export type ConversationTools = ReturnType<typeof createConversationTools>
