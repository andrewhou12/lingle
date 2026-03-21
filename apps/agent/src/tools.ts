/**
 * Agent tool definitions for Lingle — 4 tools.
 *
 * flagError         — fire-and-forget (returns '' immediately, Redis write in background)
 * writeWhiteboard   — soft-blocking (awaits ~10ms Redis write before returning)
 * updateLessonPhase — blocking (awaited, triggers slide transition in UI)
 * endLesson         — blocking (triggers post-session pipeline)
 *
 * All tools return empty strings. Tool calls are invisible to the user.
 */
import { llm } from '@livekit/agents'
import type { LessonPhase, SlideContent } from '@lingle/shared'
import {
  appendFlaggedError,
  setLessonPhase,
  updateSessionState,
  writeWhiteboard as writeWhiteboardState,
} from './session-state.js'

/**
 * Build tool context for a session. Returns undefined if no sessionId
 * (test mode gets no tools).
 */
export function buildToolContext(
  sessionId: string | undefined,
  slides: SlideContent[],
  getCurrentPhase: () => LessonPhase,
): llm.ToolContext | undefined {
  if (!sessionId) return undefined

  const sid = sessionId

  return {
    // ── flagError: fire-and-forget ──────────────────────────────────────
    flagError: llm.tool({
      description:
        'Log a learner error with severity minor or major. Call silently whenever you notice a grammar, vocabulary, pronunciation, register, or L1 interference error. Do NOT call for pedantic errors. Do NOT mention this tool in speech.',
      parameters: {
        type: 'object' as const,
        properties: {
          utteranceIndex: {
            type: 'number',
            description: 'The turn index of the user utterance containing the error',
          },
          userUtterance: {
            type: 'string',
            description: 'What the learner said (verbatim)',
          },
          errorType: {
            type: 'string',
            enum: ['grammar', 'vocab', 'pronunciation', 'register', 'l1_interference'],
            description: 'Category of the error',
          },
          errorDetail: {
            type: 'string',
            description: 'Description of the error (e.g. "Incorrect て-form conjugation — said 食べって, should be 食べて")',
          },
          correction: {
            type: 'string',
            description: 'The correct form',
          },
          severity: {
            type: 'string',
            enum: ['minor', 'major'],
            description: 'Severity: minor (common slip) or major (fundamental misunderstanding)',
          },
        },
        required: ['utteranceIndex', 'userUtterance', 'errorType', 'errorDetail', 'correction', 'severity'],
      },
      execute: async (args) => {
        appendFlaggedError(sid, {
          sessionId: sid,
          utteranceIndex: args.utteranceIndex,
          userUtterance: args.userUtterance,
          errorType: args.errorType,
          errorDetail: args.errorDetail,
          correction: args.correction,
          severity: args.severity,
          likelySttArtifact: false,
        })
        return ''
      },
    }),

    // ── writeWhiteboard: soft-blocking (~10ms) ──────────────────────────
    writeWhiteboard: llm.tool({
      description:
        'Write content to the whiteboard that the learner sees on screen. Use to show new vocabulary, grammar patterns, corrections, or phrases. The whiteboard has two sections: "new_material" for vocab/grammar/phrases being taught, and "corrections" for error corrections. Call with action "add" to add an item, "update" to change it, or "delete" to remove it. Do NOT mention this tool in speech — just reference the content naturally ("as you can see on the board...").',
      parameters: {
        type: 'object' as const,
        properties: {
          itemId: {
            type: 'string',
            description: 'A unique ID for this whiteboard item (use a short descriptive key like "vocab_kaigi" or "correction_teform")',
          },
          section: {
            type: 'string',
            enum: ['new_material', 'corrections'],
            description: 'Which whiteboard section to write to',
          },
          content: {
            type: 'string',
            description: 'The content to display (e.g. "空港 (くうこう) — airport" or "食べって → 食べて (te-form)")',
          },
          type: {
            type: 'string',
            enum: ['vocab', 'grammar', 'correction', 'phrase'],
            description: 'The type of content',
          },
          action: {
            type: 'string',
            enum: ['add', 'update', 'delete'],
            description: 'Whether to add a new item, update an existing one, or delete it',
          },
        },
        required: ['itemId', 'section', 'content', 'type', 'action'],
      },
      execute: async (args) => {
        await writeWhiteboardState(sid, {
          itemId: args.itemId,
          section: args.section,
          content: args.content,
          type: args.type,
          action: args.action,
          phase: getCurrentPhase(),
        })
        return ''
      },
    }),

    // ── updateLessonPhase: blocking ─────────────────────────────────────
    updateLessonPhase: llm.tool({
      description:
        'Advance to the next lesson phase. You MUST ask the learner for permission before calling this. Only call after they acknowledge. Do NOT mention this tool in speech.',
      parameters: {
        type: 'object' as const,
        properties: {
          phase: {
            type: 'string',
            enum: ['warmup', 'review', 'core', 'debrief', 'closing'],
            description: 'The phase to transition to',
          },
        },
        required: ['phase'],
      },
      execute: async (args) => {
        const phase = args.phase as LessonPhase
        const slide = slides.find((s) => s.phase === phase) || {
          phase,
          title: phase.toUpperCase(),
          bullets: [],
        }
        await setLessonPhase(sid, phase, slide)
        console.log(`[tools] updateLessonPhase → ${phase}`)
        return ''
      },
    }),

    // ── endLesson: blocking ─────────────────────────────────────────────
    endLesson: llm.tool({
      description:
        'Signal that the lesson should end. Call after the closing phase is complete. The system will trigger the post-session pipeline. Do NOT mention this in speech.',
      execute: async () => {
        await new Promise((resolve) => setTimeout(resolve, 500))
        await updateSessionState(sid, { currentPhase: 'closing' as LessonPhase })
        console.log(`[tools] endLesson triggered for session ${sid}`)
        return ''
      },
    }),
  }
}
