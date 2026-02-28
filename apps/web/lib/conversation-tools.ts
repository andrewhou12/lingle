import { tool, jsonSchema } from 'ai'
import { prisma } from '@linguist/db'
import { createInitialFsrsState } from '@linguist/core/fsrs/scheduler'
import type { Prisma } from '@prisma/client'

// Schema definitions as JSON Schema objects for AI SDK tool()
const vocabCardSchema = jsonSchema<{
  surface: string
  reading?: string
  meaning: string
  example?: string
  example_translation?: string
}>({
  type: 'object',
  properties: {
    surface: { type: 'string', description: 'The word in its written form (kanji/kana)' },
    reading: { type: 'string', description: 'Hiragana reading of the word' },
    meaning: { type: 'string', description: 'English meaning' },
    example: { type: 'string', description: 'Example sentence using the word' },
    example_translation: { type: 'string', description: 'English translation of the example sentence' },
  },
  required: ['surface', 'meaning'],
})

const grammarCardSchema = jsonSchema<{
  pattern: string
  meaning: string
  formation?: string
  example?: string
  example_translation?: string
}>({
  type: 'object',
  properties: {
    pattern: { type: 'string', description: 'The grammar pattern name' },
    meaning: { type: 'string', description: 'English explanation of the pattern' },
    formation: { type: 'string', description: 'How to form/conjugate this pattern' },
    example: { type: 'string', description: 'Example sentence using the pattern' },
    example_translation: { type: 'string', description: 'English translation of the example sentence' },
  },
  required: ['pattern', 'meaning'],
})

const correctionSchema = jsonSchema<{
  incorrect: string
  correct: string
  error_type?: string
  explanation?: string
}>({
  type: 'object',
  properties: {
    incorrect: { type: 'string', description: 'What the learner said (incorrect form)' },
    correct: { type: 'string', description: 'The correct form' },
    error_type: { type: 'string', description: 'Type of error: Grammar, Vocabulary, Spelling, or Style tip' },
    explanation: { type: 'string', description: 'Brief explanation of the correction' },
  },
  required: ['incorrect', 'correct'],
})

const reviewPromptSchema = jsonSchema<{
  prompt: string
  answer: string
  item_type?: string
  item_id?: string
}>({
  type: 'object',
  properties: {
    prompt: { type: 'string', description: 'The question or prompt to display' },
    answer: { type: 'string', description: 'The correct answer to reveal when the learner is ready' },
    item_type: { type: 'string', description: 'Type of item being reviewed: lexical or grammar' },
    item_id: { type: 'string', description: 'ID of the item being reviewed' },
  },
  required: ['prompt', 'answer'],
})

const markTargetsHitSchema = jsonSchema<{
  vocab_ids?: string[]
  grammar_ids?: string[]
}>({
  type: 'object',
  properties: {
    vocab_ids: {
      type: 'array',
      items: { type: 'string' },
      description: 'IDs of vocabulary items the learner successfully produced',
    },
    grammar_ids: {
      type: 'array',
      items: { type: 'string' },
      description: 'IDs of grammar items the learner successfully produced',
    },
  },
})

export function createConversationTools(userId: string, sessionId: string) {
  return {
    displayVocabCard: tool({
      description:
        'Display a vocabulary card to the learner when introducing new vocabulary. Creates or updates the item in the word bank.',
      inputSchema: vocabCardSchema,
      execute: async ({ surface, reading, meaning, example, example_translation }) => {
        try {
          const existing = await prisma.lexicalItem.findFirst({
            where: { userId, surfaceForm: surface },
          })

          if (!existing) {
            const initialFsrs = createInitialFsrsState()
            await prisma.lexicalItem.create({
              data: {
                userId,
                surfaceForm: surface,
                reading: reading ?? null,
                meaning,
                masteryState: 'introduced',
                recognitionFsrs: initialFsrs as unknown as Prisma.InputJsonValue,
                productionFsrs: initialFsrs as unknown as Prisma.InputJsonValue,
                source: 'conversation',
                tags: ['conversation'],
                contextTypes: ['conversation'],
                contextCount: 1,
                exposureCount: 1,
              },
            })
          } else if (existing.masteryState === 'unseen') {
            const updatedContextTypes = existing.contextTypes.includes('conversation')
              ? existing.contextTypes
              : [...existing.contextTypes, 'conversation']
            await prisma.lexicalItem.update({
              where: { id: existing.id },
              data: {
                masteryState: 'introduced',
                exposureCount: { increment: 1 },
                contextTypes: updatedContextTypes,
                contextCount: updatedContextTypes.length,
                ...(reading && !existing.reading ? { reading } : {}),
                ...(meaning && !existing.meaning ? { meaning } : {}),
              },
            })
          } else if (existing.meaning === '' && meaning) {
            await prisma.lexicalItem.update({
              where: { id: existing.id },
              data: {
                meaning,
                ...(reading && !existing.reading ? { reading } : {}),
              },
            })
          }
        } catch (err) {
          console.error('[displayVocabCard] DB error:', err)
        }

        return { surface, reading, meaning, example, example_translation }
      },
    }),

    displayGrammarCard: tool({
      description:
        'Display a grammar card to the learner when explaining a grammar pattern. Creates or updates the item in the grammar bank.',
      inputSchema: grammarCardSchema,
      execute: async ({ pattern, meaning, formation, example, example_translation }) => {
        try {
          const patternId = pattern.toLowerCase().replace(/\s+/g, '_')
          const existing = await prisma.grammarItem.findFirst({
            where: { userId, OR: [{ name: pattern }, { patternId }] },
          })

          if (!existing) {
            const initialFsrs = createInitialFsrsState()
            await prisma.grammarItem.create({
              data: {
                userId,
                patternId,
                name: pattern,
                description: meaning,
                masteryState: 'introduced',
                recognitionFsrs: initialFsrs as unknown as Prisma.InputJsonValue,
                productionFsrs: initialFsrs as unknown as Prisma.InputJsonValue,
                contextTypes: ['conversation'],
                contextCount: 1,
              },
            })
          } else if (existing.masteryState === 'unseen') {
            const updatedContextTypes = existing.contextTypes.includes('conversation')
              ? existing.contextTypes
              : [...existing.contextTypes, 'conversation']
            await prisma.grammarItem.update({
              where: { id: existing.id },
              data: {
                masteryState: 'introduced',
                contextTypes: updatedContextTypes,
                contextCount: updatedContextTypes.length,
                ...(meaning && !existing.description ? { description: meaning } : {}),
              },
            })
          }
        } catch (err) {
          console.error('[displayGrammarCard] DB error:', err)
        }

        return { pattern, meaning, formation, example, example_translation }
      },
    }),

    displayCorrection: tool({
      description:
        'Display a correction card when the learner makes an error. Shows the incorrect form, the correct form, and an explanation.',
      inputSchema: correctionSchema,
      execute: async ({ incorrect, correct, error_type, explanation }) => {
        // No-op — errors are captured by post-session analysis
        return { incorrect, correct, error_type, explanation }
      },
    }),

    displayReviewPrompt: tool({
      description:
        'Display an interactive review prompt to test the learner on a specific item.',
      inputSchema: reviewPromptSchema,
      execute: async ({ prompt, answer, item_type, item_id }) => {
        // No-op — display only
        return { prompt, answer, item_type, item_id }
      },
    }),

    markTargetsHit: tool({
      description:
        'Mark target vocabulary or grammar items that the learner successfully produced in their most recent message. Call this after each learner message where targets were hit.',
      inputSchema: markTargetsHitSchema,
      execute: async ({ vocab_ids, grammar_ids }) => {
        try {
          // Update production counts on matched lexical items
          for (const idStr of vocab_ids ?? []) {
            const id = parseInt(idStr, 10)
            if (isNaN(id)) continue
            const item = await prisma.lexicalItem.findUnique({ where: { id } })
            if (item && item.userId === userId) {
              await prisma.lexicalItem.update({
                where: { id },
                data: { productionCount: { increment: 1 } },
              })
            }
          }
          // Update production counts on matched grammar items
          for (const idStr of grammar_ids ?? []) {
            const id = parseInt(idStr, 10)
            if (isNaN(id)) continue
            const item = await prisma.grammarItem.findUnique({ where: { id } })
            if (item && item.userId === userId) {
              await prisma.grammarItem.update({
                where: { id },
                data: { writingProductions: { increment: 1 } },
              })
            }
          }
        } catch (err) {
          console.error('[markTargetsHit] DB error:', err)
        }
        return { vocab_ids: vocab_ids ?? [], grammar_ids: grammar_ids ?? [] }
      },
    }),
  }
}

export type ConversationTools = ReturnType<typeof createConversationTools>
