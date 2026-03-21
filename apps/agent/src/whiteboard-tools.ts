/**
 * Whiteboard RPC Tools (Pattern C).
 *
 * These tools send JSON messages to the browser via LiveKit's
 * data channel. The browser renders the whiteboard content.
 *
 * Tool calls return '' so the LLM doesn't narrate them.
 * The whiteboard UI listens for these messages and renders them.
 */
import { llm } from '@livekit/agents'

/** Whiteboard message types */
export type WhiteboardMessageType =
  | 'whiteboard_open'
  | 'whiteboard_close'
  | 'whiteboard_correction'
  | 'whiteboard_vocab_cluster'
  | 'whiteboard_table'
  | 'whiteboard_content'
  | 'whiteboard_clear'

export interface WhiteboardMessage {
  type: WhiteboardMessageType
  data?: Record<string, unknown>
}

/**
 * Create a publish function that sends whiteboard messages via
 * LiveKit data channel. This is injected by the agent at runtime.
 */
export type PublishWhiteboardFn = (message: WhiteboardMessage) => void

/**
 * Build whiteboard tool context.
 * The publish function is provided by the LingleAgent which has
 * access to the room's data channel.
 */
export function buildWhiteboardTools(publish: PublishWhiteboardFn): llm.ToolContext {
  return {
    whiteboardOpen: llm.tool({
      description:
        'Open the whiteboard for the learner. Call before writing content to it. Do NOT mention this in speech.',
      execute: async () => {
        publish({ type: 'whiteboard_open' })
        return ''
      },
    }),

    whiteboardClose: llm.tool({
      description:
        'Close the whiteboard. Call when done showing content. Do NOT mention this in speech.',
      execute: async () => {
        publish({ type: 'whiteboard_close' })
        return ''
      },
    }),

    whiteboardWriteCorrection: llm.tool({
      description:
        'Show a correction on the whiteboard with the original, corrected form, and the grammar rule. Use when a correction is worth highlighting visually. Do NOT mention "whiteboard" in speech — just reference the correction naturally.',
      parameters: {
        type: 'object' as const,
        properties: {
          original: { type: 'string', description: 'What the learner said' },
          corrected: { type: 'string', description: 'The correct form' },
          rule: { type: 'string', description: 'The grammar/vocab rule' },
          explanation: { type: 'string', description: 'Brief explanation' },
        },
        required: ['original', 'corrected', 'rule'],
      },
      execute: async (args) => {
        publish({
          type: 'whiteboard_correction',
          data: {
            original: args.original,
            corrected: args.corrected,
            rule: args.rule,
            explanation: args.explanation,
          },
        })
        return ''
      },
    }),

    whiteboardShowVocabCluster: llm.tool({
      description:
        'Show a cluster of related vocabulary words on the whiteboard. Use when introducing or reviewing a group of related words. Do NOT mention "whiteboard" in speech.',
      parameters: {
        type: 'object' as const,
        properties: {
          title: { type: 'string', description: 'Title for the vocab cluster (e.g. "Food vocabulary")' },
          words: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                word: { type: 'string' },
                reading: { type: 'string', description: 'Reading/pronunciation guide (e.g. furigana)' },
                meaning: { type: 'string' },
              },
              required: ['word', 'meaning'],
            },
            description: 'List of vocabulary words with meanings',
          },
        },
        required: ['title', 'words'],
      },
      execute: async (args) => {
        publish({
          type: 'whiteboard_vocab_cluster',
          data: { title: args.title, words: args.words },
        })
        return ''
      },
    }),

    whiteboardShowTable: llm.tool({
      description:
        'Show a grammar table on the whiteboard (e.g. conjugation table, comparison chart). Do NOT mention "whiteboard" in speech.',
      parameters: {
        type: 'object' as const,
        properties: {
          title: { type: 'string', description: 'Table title' },
          headers: {
            type: 'array',
            items: { type: 'string' },
            description: 'Column headers',
          },
          rows: {
            type: 'array',
            items: {
              type: 'array',
              items: { type: 'string' },
            },
            description: 'Table rows (array of arrays)',
          },
        },
        required: ['title', 'headers', 'rows'],
      },
      execute: async (args) => {
        publish({
          type: 'whiteboard_table',
          data: { title: args.title, headers: args.headers, rows: args.rows },
        })
        return ''
      },
    }),

    whiteboardLoadContent: llm.tool({
      description:
        'Load text content onto the whiteboard (article, dialogue, instructions). Do NOT mention "whiteboard" in speech.',
      parameters: {
        type: 'object' as const,
        properties: {
          contentType: {
            type: 'string',
            enum: ['article', 'dialogue', 'instructions', 'notes'],
            description: 'Type of content',
          },
          title: { type: 'string', description: 'Content title' },
          body: { type: 'string', description: 'The content text' },
        },
        required: ['contentType', 'title', 'body'],
      },
      execute: async (args) => {
        publish({
          type: 'whiteboard_content',
          data: {
            contentType: args.contentType,
            title: args.title,
            body: args.body,
          },
        })
        return ''
      },
    }),

    whiteboardClear: llm.tool({
      description:
        'Clear the whiteboard content. Do NOT mention this in speech.',
      execute: async () => {
        publish({ type: 'whiteboard_clear' })
        return ''
      },
    }),
  }
}
