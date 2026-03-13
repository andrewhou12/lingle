import type { ScenarioMode } from './scenario-mode'

// --- Lesson step types (tutor mode) ---

export type LessonStepType = 'activate' | 'explain' | 'check' | 'practice' | 'produce' | 'review'
export type LessonStepStatus = 'upcoming' | 'active' | 'completed' | 'skipped'

// --- Conversation section (skeleton roadmap) ---

export type ConversationSectionStatus = 'upcoming' | 'active' | 'completed'

export interface ConversationSection {
  id: string          // e.g., "greeting", "topic-1"
  label: string       // Short display label, e.g., "Greeting", "Weekend plans"
  description: string // 1-line description of what happens in this section
  status: ConversationSectionStatus
}

// --- ConversationPlan — scene card (no shared base) ---

export interface ConversationPlan {
  mode: 'conversation'
  topic: string
  persona: {
    name?: string
    relationship: string
    personality: string
  }
  register: string
  tone: string
  setting?: string
  speakers?: number
  culturalContext?: string
  dynamic?: string
  tension?: string
  sections?: ConversationSection[]
}

// --- TutorPlan — structured lesson (no shared base) ---

export interface TutorPlan {
  mode: 'tutor'
  topic: string
  objective: string
  steps: Array<{
    title: string
    type: LessonStepType
    status: LessonStepStatus
    notes?: string
  }>
  concepts: Array<{
    label: string
    type: 'grammar' | 'vocabulary' | 'usage'
  }>
  exerciseTypes?: string[]
}

// --- SessionPlanBase — kept for immersion & reference only ---

interface SessionPlanBase {
  mode: ScenarioMode
  focus: string
  goals: string[]
  approach: string
  milestones: Array<{
    description: string
    completed: boolean
  }>
}

export interface ImmersionPlan extends SessionPlanBase {
  mode: 'immersion'
  contentType: string
  contentSpec: string
  comprehensionQuestions?: string[]
  targetVocabulary?: string[]
}

export interface ReferencePlan extends SessionPlanBase {
  mode: 'reference'
  topic: string
  relatedTopics?: string[]
}

export type SessionPlan = ConversationPlan | TutorPlan | ImmersionPlan | ReferencePlan

// --- Type guards ---

export function isConversationPlan(plan: SessionPlan): plan is ConversationPlan {
  return plan.mode === 'conversation'
}

export function isTutorPlan(plan: SessionPlan): plan is TutorPlan {
  return plan.mode === 'tutor'
}

export function isImmersionPlan(plan: SessionPlan): plan is ImmersionPlan {
  return plan.mode === 'immersion'
}

export function isReferencePlan(plan: SessionPlan): plan is ReferencePlan {
  return plan.mode === 'reference'
}

// --- Backward-compat normalization ---

/**
 * Normalize a raw plan (e.g. from DB JSON) into a typed SessionPlan.
 * Handles old-shape plans that used the shared base (focus/goals/milestones)
 * for conversation and tutor modes, migrating them to the new structures.
 */
export function normalizePlan(raw: unknown, mode?: string): SessionPlan {
  const obj = (raw ?? {}) as Record<string, unknown>
  const resolvedMode = (obj.mode as string) || mode || 'conversation'

  switch (resolvedMode) {
    case 'conversation': {
      // New shape: has `topic` and `persona`
      if (obj.topic && obj.persona) {
        const rawSections = obj.sections as Array<Record<string, unknown>> | undefined
        const sections: ConversationSection[] | undefined = rawSections?.map((s) => ({
          id: (s.id as string) || '',
          label: (s.label as string) || '',
          description: (s.description as string) || '',
          status: ((s.status as ConversationSectionStatus) || 'upcoming'),
        }))
        return {
          mode: 'conversation',
          topic: obj.topic as string,
          persona: obj.persona as ConversationPlan['persona'],
          register: (obj.register as string) || 'polite',
          tone: (obj.tone as string) || 'lighthearted',
          setting: obj.setting as string | undefined,
          speakers: obj.speakers as number | undefined,
          culturalContext: obj.culturalContext as string | undefined,
          dynamic: obj.dynamic as string | undefined,
          tension: obj.tension as string | undefined,
          sections: sections?.length ? sections : undefined,
        }
      }
      // Old shape: migrate from focus/scenario
      const scenario = obj.scenario as Record<string, string> | undefined
      return {
        mode: 'conversation',
        topic: (obj.focus as string) || '',
        persona: {
          relationship: scenario?.aiRole || 'conversation partner',
          personality: 'friendly and helpful',
        },
        register: scenario?.register || 'polite',
        tone: 'lighthearted',
        setting: scenario?.setting,
        dynamic: scenario?.learnerGoal ? `Learner goal: ${scenario.learnerGoal}` : undefined,
      }
    }

    case 'tutor': {
      // New shape: has `objective` and `steps`
      if (obj.objective && Array.isArray(obj.steps)) {
        return {
          mode: 'tutor',
          topic: (obj.topic as string) || '',
          objective: obj.objective as string,
          steps: (obj.steps as Array<Record<string, unknown>>).map((s) => ({
            title: (s.title as string) || '',
            type: (s.type as LessonStepType) || 'explain',
            status: (s.status as LessonStepStatus) || 'upcoming',
            notes: s.notes as string | undefined,
          })),
          concepts: (obj.concepts as TutorPlan['concepts']) || [],
          exerciseTypes: obj.exerciseTypes as string[] | undefined,
        }
      }
      // Old shape: migrate from focus/goals/lessonSteps/targetVocabulary/targetGrammar
      const oldSteps = (obj.lessonSteps as Array<Record<string, unknown>>) || []
      const oldGoals = (obj.goals as string[]) || []
      const oldVocab = (obj.targetVocabulary as string[]) || []
      const oldGrammar = (obj.targetGrammar as string[]) || []
      const concepts: TutorPlan['concepts'] = [
        ...oldVocab.map((v) => ({ label: v, type: 'vocabulary' as const })),
        ...oldGrammar.map((g) => ({ label: g, type: 'grammar' as const })),
      ]
      return {
        mode: 'tutor',
        topic: (obj.focus as string) || '',
        objective: oldGoals[0] || '',
        steps: oldSteps.map((s) => ({
          title: (s.title as string) || '',
          type: (s.type as LessonStepType) || 'explain',
          status: s.completed ? 'completed' : 'upcoming',
          notes: s.notes as string | undefined,
        })),
        concepts,
        exerciseTypes: obj.exerciseTypes as string[] | undefined,
      }
    }

    case 'immersion':
      return {
        mode: 'immersion',
        focus: (obj.focus as string) || '',
        goals: (obj.goals as string[]) || [],
        approach: (obj.approach as string) || '',
        milestones: (obj.milestones as SessionPlanBase['milestones']) || [],
        contentType: (obj.contentType as string) || 'custom',
        contentSpec: (obj.contentSpec as string) || '',
        comprehensionQuestions: obj.comprehensionQuestions as string[] | undefined,
        targetVocabulary: obj.targetVocabulary as string[] | undefined,
      }

    case 'reference':
      return {
        mode: 'reference',
        focus: (obj.focus as string) || '',
        goals: (obj.goals as string[]) || [],
        approach: (obj.approach as string) || '',
        milestones: (obj.milestones as SessionPlanBase['milestones']) || [],
        topic: (obj.topic as string) || (obj.focus as string) || '',
        relatedTopics: obj.relatedTopics as string[] | undefined,
      }

    default:
      // Unknown mode — treat as conversation
      return {
        mode: 'conversation',
        topic: (obj.focus as string) || (obj.topic as string) || '',
        persona: {
          relationship: 'conversation partner',
          personality: 'friendly and helpful',
        },
        register: 'polite',
        tone: 'lighthearted',
      }
  }
}

// --- Prompt formatting ---

export function formatPlanForPrompt(plan: SessionPlan): string {
  const lines: string[] = []

  switch (plan.mode) {
    case 'conversation': {
      lines.push(`Scene: ${plan.topic}`)
      lines.push(`Persona: ${plan.persona.name ? `${plan.persona.name}, ` : ''}${plan.persona.relationship} — ${plan.persona.personality}`)
      lines.push(`Register: ${plan.register}`)
      lines.push(`Tone: ${plan.tone}`)
      if (plan.setting) lines.push(`Setting: ${plan.setting}`)
      if (plan.speakers && plan.speakers > 2) lines.push(`Speakers: ${plan.speakers} (you play multiple roles)`)
      if (plan.culturalContext) lines.push(`Cultural context: ${plan.culturalContext}`)
      if (plan.dynamic) lines.push(`Dynamic: ${plan.dynamic}`)
      if (plan.tension) lines.push(`Tension: ${plan.tension}`)
      if (plan.sections && plan.sections.length > 0) {
        lines.push('')
        lines.push('Conversation Flow:')
        for (const section of plan.sections) {
          const statusIcon =
            section.status === 'completed' ? '[x]' :
            section.status === 'active' ? '[>]' :
            '[ ]'
          lines.push(`  ${statusIcon} ${section.label}: ${section.description}`)
        }
      }
      break
    }

    case 'tutor': {
      lines.push(`Topic: ${plan.topic}`)
      lines.push(`Objective: ${plan.objective}`)
      lines.push('')
      lines.push('Lesson Steps:')
      for (let i = 0; i < plan.steps.length; i++) {
        const step = plan.steps[i]
        const statusIcon =
          step.status === 'completed' ? '[x]' :
          step.status === 'active' ? '[>]' :
          step.status === 'skipped' ? '[-]' :
          '[ ]'
        lines.push(`  ${statusIcon} ${i + 1}. [${step.type}] ${step.title}${step.notes ? ` (${step.notes})` : ''}`)
      }
      if (plan.concepts.length > 0) {
        lines.push('')
        lines.push('Concepts:')
        for (const c of plan.concepts) {
          lines.push(`  - [${c.type}] ${c.label}`)
        }
      }
      if (plan.exerciseTypes?.length) {
        lines.push(`Exercise types: ${plan.exerciseTypes.join(', ')}`)
      }
      break
    }

    case 'immersion': {
      lines.push(`Mode: immersion`)
      lines.push(`Focus: ${plan.focus}`)
      lines.push('')
      lines.push('Goals:')
      for (const goal of plan.goals) {
        lines.push(`  - ${goal}`)
      }
      lines.push('')
      lines.push(`Approach: ${plan.approach}`)
      if (plan.milestones.length > 0) {
        lines.push('')
        lines.push('Milestones:')
        for (let i = 0; i < plan.milestones.length; i++) {
          const m = plan.milestones[i]
          lines.push(`  ${m.completed ? '[x]' : '[ ]'} ${i + 1}. ${m.description}`)
        }
      }
      lines.push(`Content type: ${plan.contentType}`)
      lines.push(`Content spec: ${plan.contentSpec}`)
      if (plan.targetVocabulary?.length) {
        lines.push(`Target vocabulary: ${plan.targetVocabulary.join(', ')}`)
      }
      if (plan.comprehensionQuestions?.length) {
        lines.push('')
        lines.push('Comprehension questions:')
        for (const q of plan.comprehensionQuestions) {
          lines.push(`  - ${q}`)
        }
      }
      break
    }

    case 'reference': {
      lines.push(`Mode: reference`)
      lines.push(`Topic: ${plan.topic}`)
      lines.push(`Focus: ${plan.focus}`)
      lines.push('')
      lines.push('Goals:')
      for (const goal of plan.goals) {
        lines.push(`  - ${goal}`)
      }
      lines.push('')
      lines.push(`Approach: ${plan.approach}`)
      if (plan.milestones.length > 0) {
        lines.push('')
        lines.push('Milestones:')
        for (let i = 0; i < plan.milestones.length; i++) {
          const m = plan.milestones[i]
          lines.push(`  ${m.completed ? '[x]' : '[ ]'} ${i + 1}. ${m.description}`)
        }
      }
      if (plan.relatedTopics?.length) {
        lines.push(`Related topics: ${plan.relatedTopics.join(', ')}`)
      }
      break
    }
  }

  return lines.join('\n')
}
