/**
 * Agent tool definitions for Lingle (Pattern A + B).
 *
 * Pattern A — silent tracking (fire-and-forget, return empty string):
 *   logError, noteStrength, saveMemory, queueCorrection
 *
 * Pattern B — lesson management (mutate state, return empty string):
 *   adjustDifficulty, updateLessonPhase, setVocabHomework, endLesson
 *
 * All tools write to Redis session state and return '' so the LLM
 * doesn't narrate the tool call. They never block the speech pipeline.
 */
import { llm } from '@livekit/agents'
import {
  appendError,
  appendStrength,
  appendCorrection,
  queueMemory,
  setLessonPhase,
  adjustDifficulty as adjustDifficultyState,
  setVocabHomework as setVocabHomeworkState,
  updateSessionState,
} from './session-state.js'

/**
 * Build onboarding-specific tools.
 * These make HTTP calls back to the web server to persist preferences.
 */
function buildOnboardingTools(sessionId: string): llm.ToolContext {
  return {
    setGoal: llm.tool({
      description:
        'Record the learner\'s language learning goal. Call when you understand their motivation and timeline. Do NOT mention this tool in speech.',
      parameters: {
        type: 'object' as const,
        properties: {
          goal: { type: 'string', description: 'The learner\'s goal (e.g. "Travel to Japan next year", "Pass JLPT N3")' },
          deadline: { type: 'string', description: 'Timeline if mentioned (e.g. "6 months", "next summer"). Leave empty if not specified.' },
        },
        required: ['goal'],
      },
      execute: async (args) => {
        queueMemory(sessionId, {
          content: `Goal: ${args.goal}${args.deadline ? ` (timeline: ${args.deadline})` : ''}`,
          memoryType: 'goal',
        })
        console.log(`[tools] setGoal: "${args.goal}" deadline=${args.deadline || 'none'}`)
        return ''
      },
    }),

    calibrateLevel: llm.tool({
      description:
        'Set the learner\'s initial CEFR level based on your conversation assessment. Call once you have enough evidence. Do NOT mention this in speech.',
      parameters: {
        type: 'object' as const,
        properties: {
          cefrGrammar: { type: 'number', description: 'Grammar CEFR score 1.0-6.0 (A1=1.0, A2=2.0, B1=3.0, B2=4.0, C1=5.0, C2=6.0)' },
          cefrFluency: { type: 'number', description: 'Fluency CEFR score 1.0-6.0' },
          rationale: { type: 'string', description: 'Brief explanation of your assessment' },
        },
        required: ['cefrGrammar', 'cefrFluency', 'rationale'],
      },
      execute: async (args) => {
        // Store calibration in session state for post-session processing
        updateSessionState(sessionId, {
          difficultyLevel: Math.round((args.cefrGrammar + args.cefrFluency) / 2),
        }).catch((err) => console.error('[tools] calibrateLevel failed:', err))
        queueMemory(sessionId, {
          content: `Initial assessment: Grammar ${args.cefrGrammar.toFixed(1)}, Fluency ${args.cefrFluency.toFixed(1)}. ${args.rationale}`,
          memoryType: 'context',
        })
        console.log(`[tools] calibrateLevel: grammar=${args.cefrGrammar}, fluency=${args.cefrFluency}, reason="${args.rationale}"`)
        return ''
      },
    }),

    setPreference: llm.tool({
      description:
        'Record a learner preference (correction style, session length, etc). Do NOT mention this in speech.',
      parameters: {
        type: 'object' as const,
        properties: {
          key: {
            type: 'string',
            enum: ['correctionStyle', 'sessionLengthMinutes', 'lessonStylePreference'],
            description: 'The preference key',
          },
          value: { type: 'string', description: 'The preference value' },
        },
        required: ['key', 'value'],
      },
      execute: async (args) => {
        queueMemory(sessionId, {
          content: `Preference: ${args.key} = ${args.value}`,
          memoryType: 'preference',
        })
        console.log(`[tools] setPreference: ${args.key}=${args.value}`)
        return ''
      },
    }),
  }
}

/**
 * Build tool context for a session. Returns undefined if no sessionId
 * (test mode gets no tools — agent behaves exactly as before).
 */
export function buildToolContext(sessionId: string | undefined, sessionMode?: string): llm.ToolContext | undefined {
  if (!sessionId) return undefined

  const sid = sessionId
  const isOnboarding = sessionMode === 'onboarding'

  // Base tools available in all sessions
  const baseTools: llm.ToolContext = {
    // ── Pattern A: Silent Tracking ──────────────────────────────────────

    logError: llm.tool({
      description:
        'Log a learner error. Call this silently whenever you notice a grammar, vocabulary, or pronunciation error. Do NOT mention this tool call in your spoken response.',
      parameters: {
        type: 'object' as const,
        properties: {
          errorType: {
            type: 'string',
            enum: ['grammar', 'vocabulary', 'pronunciation', 'register', 'l1_interference'],
            description: 'Category of the error',
          },
          phrase: { type: 'string', description: 'What the learner said (verbatim)' },
          correction: { type: 'string', description: 'The correct form' },
          rule: { type: 'string', description: 'Short rule label (e.g. "te_form_conjugation", "particle_wa_ga")' },
        },
        required: ['errorType', 'phrase', 'correction', 'rule'],
      },
      execute: async (args) => {
        appendError(sid, {
          errorType: args.errorType,
          phrase: args.phrase,
          correction: args.correction,
          rule: args.rule,
        })
        return ''
      },
    }),

    noteStrength: llm.tool({
      description:
        'Note something the learner did well. Call silently — do NOT mention this in your spoken response.',
      parameters: {
        type: 'object' as const,
        properties: {
          skill: { type: 'string', description: 'The skill demonstrated (e.g. "complex sentence structure", "natural keigo usage")' },
          example: { type: 'string', description: 'The specific phrase or utterance that demonstrated the skill' },
        },
        required: ['skill', 'example'],
      },
      execute: async (args) => {
        appendStrength(sid, args.skill, args.example)
        return ''
      },
    }),

    saveMemory: llm.tool({
      description:
        'Save a personal fact about the learner for future sessions. Call when you learn something about their life, interests, job, family, etc. Do NOT mention this in your spoken response.',
      parameters: {
        type: 'object' as const,
        properties: {
          content: { type: 'string', description: 'The fact to remember (e.g. "Learner works as a software engineer in Tokyo")' },
          memoryType: {
            type: 'string',
            enum: ['personal', 'preference', 'goal', 'context'],
            description: 'Category of memory',
          },
        },
        required: ['content', 'memoryType'],
      },
      execute: async (args) => {
        queueMemory(sid, {
          content: args.content,
          memoryType: args.memoryType,
        })
        return ''
      },
    }),

    queueCorrection: llm.tool({
      description:
        'Queue a correction for the post-session corrections document. Use for errors worth reviewing later. Do NOT mention this in your spoken response.',
      parameters: {
        type: 'object' as const,
        properties: {
          phrase: { type: 'string', description: 'What the learner said' },
          correction: { type: 'string', description: 'The correct form' },
          rule: { type: 'string', description: 'Grammar/vocabulary rule that applies' },
          explanation: { type: 'string', description: 'Brief explanation for the learner' },
        },
        required: ['phrase', 'correction', 'rule'],
      },
      execute: async (args) => {
        appendCorrection(sid, {
          phrase: args.phrase,
          correction: args.correction,
          rule: args.rule,
          explanation: args.explanation,
        })
        return ''
      },
    }),

    // ── Pattern B: Lesson Management ────────────────────────────────────

    adjustDifficulty: llm.tool({
      description:
        'Adjust the conversation difficulty up or down. Call when the learner is consistently struggling (down) or breezing through (up). Do NOT mention this in your spoken response.',
      parameters: {
        type: 'object' as const,
        properties: {
          direction: {
            type: 'string',
            enum: ['up', 'down'],
            description: 'Direction to adjust',
          },
          reason: { type: 'string', description: 'Why you are adjusting (for logging)' },
        },
        required: ['direction', 'reason'],
      },
      execute: async (args) => {
        adjustDifficultyState(sid, args.direction)
        console.log(`[tools] adjustDifficulty ${args.direction}: ${args.reason}`)
        return ''
      },
    }),

    updateLessonPhase: llm.tool({
      description:
        'Advance the lesson to the next phase. Phases: warmup → main → review → wrapup. Call when transitioning between lesson segments. Do NOT mention this in your spoken response.',
      parameters: {
        type: 'object' as const,
        properties: {
          phase: {
            type: 'string',
            enum: ['warmup', 'main', 'review', 'wrapup'],
            description: 'The new lesson phase',
          },
        },
        required: ['phase'],
      },
      execute: async (args) => {
        setLessonPhase(sid, args.phase as 'warmup' | 'main' | 'review' | 'wrapup')
        console.log(`[tools] updateLessonPhase → ${args.phase}`)
        return ''
      },
    }),

    setVocabHomework: llm.tool({
      description:
        'Set vocabulary words for the learner to review after the session. Call near the end of a lesson to compile key vocabulary covered. Do NOT mention this in your spoken response.',
      parameters: {
        type: 'object' as const,
        properties: {
          words: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of vocabulary words/phrases to review',
          },
        },
        required: ['words'],
      },
      execute: async (args) => {
        setVocabHomeworkState(sid, args.words)
        return ''
      },
    }),

    endLesson: llm.tool({
      description:
        'Signal that the lesson should end. Call this after the wrapup phase is complete. The system will handle cleanup. Do NOT mention this in your spoken response.',
      execute: async () => {
        updateSessionState(sid, { lessonPhase: 'wrapup' })
          .catch((err) => console.error('[tools] endLesson failed:', err))
        console.log(`[tools] endLesson triggered for session ${sid}`)
        return ''
      },
    }),
  }

  // Merge onboarding tools if in onboarding mode
  if (isOnboarding) {
    return { ...baseTools, ...buildOnboardingTools(sid) }
  }

  return baseTools
}
