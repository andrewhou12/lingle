// Re-export from shared package — single source of truth
export {
  normalizePlan,
  formatPlanForPrompt,
  isConversationPlan,
  isTutorPlan,
  isImmersionPlan,
  isReferencePlan,
} from '@lingle/shared/session-plan'
export type {
  LessonStepType,
  LessonStepStatus,
  ConversationSectionStatus,
  ConversationSection,
  ConversationPlan,
  TutorPlan,
  ImmersionPlan,
  ReferencePlan,
  SessionPlan,
} from '@lingle/shared/session-plan'
