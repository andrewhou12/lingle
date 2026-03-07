'use client'

import { useMemo, useCallback, useState } from 'react'
import { XMarkIcon, CheckIcon, ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline'
import type { UIMessage } from 'ai'
import {
  type SessionPlan,
  type ConversationPlan,
  type TutorPlan,
  isConversationPlan,
  isTutorPlan,
  isImmersionPlan,
  isReferencePlan,
} from '@/lib/session-plan'
import type { ScenarioMode } from '@/lib/experience-scenarios'
import { getToolZone } from '@/lib/tool-zones'
import { usePanel } from '@/hooks/use-panel'
import { ScrollArea } from '@/components/ui/scroll-area'
import { VocabularyCard } from '@/components/chat/vocabulary-card'
import { GrammarNote } from '@/components/chat/grammar-note'
import { CorrectionCard } from '@/components/chat/correction-card'
import { cn } from '@/lib/utils'

interface LearningPanelProps {
  messages: UIMessage[]
  plan: SessionPlan | null
  sessionId: string | null
  mode?: ScenarioMode
  onPlanUpdate?: (updates: Partial<SessionPlan>) => void
}

const MODE_PANEL_HEADERS: Record<ScenarioMode, string> = {
  conversation: 'Session',
  tutor: 'Tutor Session',
  immersion: 'Immersion Session',
  reference: 'Reference',
}

export function LearningPanel({ messages, plan, mode = 'conversation', onPlanUpdate }: LearningPanelProps) {
  const panel = usePanel()
  const [planCollapsed, setPlanCollapsed] = useState(false)

  // Extract panel-zone tool outputs from messages
  const panelCards = useMemo(() => {
    const cards: Array<{ id: string; toolName: string; output: unknown }> = []
    for (const msg of messages) {
      if (msg.role !== 'assistant') continue
      for (let i = 0; i < msg.parts.length; i++) {
        const part = msg.parts[i] as { type: string; state?: string; output?: unknown }
        if (!part.type.startsWith('tool-')) continue
        const toolName = part.type.replace('tool-', '')
        if (getToolZone(toolName) !== 'panel') continue
        if (part.state === 'output-available' && part.output) {
          cards.push({ id: `${msg.id}-${i}`, toolName, output: part.output })
        }
      }
    }
    return cards
  }, [messages])

  // Progress info for header — only for plans with milestones
  const hasMilestones = plan && 'milestones' in plan && Array.isArray(plan.milestones) && plan.milestones.length > 0
  const completedCount = hasMilestones ? (plan as { milestones: Array<{ completed: boolean }> }).milestones.filter((m) => m.completed).length : 0
  const totalMilestones = hasMilestones ? (plan as { milestones: Array<{ completed: boolean }> }).milestones.length : 0

  // Progress info for tutor steps
  const hasTutorSteps = plan && isTutorPlan(plan) && plan.steps.length > 0
  const tutorCompleted = hasTutorSteps ? (plan as TutorPlan).steps.filter((s) => s.status === 'completed').length : 0
  const tutorTotal = hasTutorSteps ? (plan as TutorPlan).steps.length : 0

  const progressLabel = hasTutorSteps
    ? `${tutorCompleted}/${tutorTotal}`
    : hasMilestones
    ? `${completedCount}/${totalMilestones}`
    : null

  const handleMilestoneToggle = useCallback(
    (index: number) => {
      if (!plan || !('milestones' in plan) || !onPlanUpdate) return
      const milestones = (plan as { milestones: Array<{ description: string; completed: boolean }> }).milestones
      const updated = milestones.map((m, i) =>
        i === index ? { ...m, completed: !m.completed } : m
      )
      onPlanUpdate({ milestones: updated } as Partial<SessionPlan>)
    },
    [plan, onPlanUpdate]
  )

  return (
    <div className="h-full flex flex-col bg-bg">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0">
        <span className="text-[13px] font-medium text-text-primary">{MODE_PANEL_HEADERS[mode]}</span>
        <button
          className="w-6 h-6 flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
          onClick={panel.close}
        >
          <XMarkIcon className="w-3.5 h-3.5" />
        </button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Plan section */}
          {plan && (
            <div>
              <button
                className="flex items-center gap-1.5 text-[12px] font-medium text-text-muted uppercase tracking-wide mb-2 hover:text-text-primary transition-colors"
                onClick={() => setPlanCollapsed((v) => !v)}
              >
                {planCollapsed ? <ChevronRightIcon className="w-3 h-3" /> : <ChevronDownIcon className="w-3 h-3" />}
                Plan
                {progressLabel && (
                  <span className="text-text-placeholder ml-1">{progressLabel}</span>
                )}
              </button>

              {!planCollapsed && (
                <>
                  {isConversationPlan(plan) && <ConversationPlanCard plan={plan} />}
                  {isTutorPlan(plan) && <TutorPlanCard plan={plan} />}
                  {(isImmersionPlan(plan) || isReferencePlan(plan)) && (
                    <BasePlanCard plan={plan} onMilestoneToggle={handleMilestoneToggle} />
                  )}
                </>
              )}
            </div>
          )}

          {/* Divider */}
          {plan && panelCards.length > 0 && (
            <div className="border-t border-border" />
          )}

          {/* Cards section */}
          {panelCards.length > 0 && (
            <div>
              <span className="text-[12px] font-medium text-text-muted uppercase tracking-wide mb-2 block">
                Cards ({panelCards.length})
              </span>
              <div className="space-y-3">
                {panelCards.map((card) => (
                  <PanelCard key={card.id} toolName={card.toolName} output={card.output} />
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {!plan && panelCards.length === 0 && (
            <div className="text-center py-8">
              <p className="text-[13px] text-text-muted">Session content will appear here.</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

// --- ConversationPlanCard — scene card layout ---

function ConversationPlanCard({ plan }: { plan: ConversationPlan }) {
  return (
    <div className="space-y-2.5">
      {/* Topic */}
      <p className="text-[13px] text-text-secondary leading-snug">{plan.topic}</p>

      {/* Persona */}
      <div className="text-[12px] text-text-muted bg-bg-secondary rounded-lg p-2.5 space-y-0.5">
        {plan.persona.name && (
          <div><span className="font-medium">Name:</span> {plan.persona.name}</div>
        )}
        <div><span className="font-medium">Relationship:</span> {plan.persona.relationship}</div>
        <div><span className="font-medium">Personality:</span> {plan.persona.personality}</div>
      </div>

      {/* Register & Tone */}
      <div className="flex flex-wrap gap-1.5">
        <SceneTag label="Register" value={plan.register} />
        <SceneTag label="Tone" value={plan.tone} />
      </div>

      {/* Optional fields */}
      {(plan.setting || plan.culturalContext || plan.dynamic || plan.tension || (plan.speakers && plan.speakers > 2)) && (
        <div className="text-[12px] text-text-muted space-y-0.5">
          {plan.setting && <div><span className="font-medium">Setting:</span> {plan.setting}</div>}
          {plan.speakers && plan.speakers > 2 && <div><span className="font-medium">Speakers:</span> {plan.speakers}</div>}
          {plan.culturalContext && <div><span className="font-medium">Culture:</span> {plan.culturalContext}</div>}
          {plan.dynamic && <div><span className="font-medium">Dynamic:</span> {plan.dynamic}</div>}
          {plan.tension && <div><span className="font-medium">Tension:</span> {plan.tension}</div>}
        </div>
      )}
    </div>
  )
}

function SceneTag({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-bg-secondary text-[11.5px]">
      <span className="font-medium text-text-muted">{label}:</span>
      <span className="text-text-secondary">{value}</span>
    </span>
  )
}

// --- TutorPlanCard — lesson progress layout ---

const STEP_TYPE_COLORS: Record<string, string> = {
  activate: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  explain: 'bg-blue-soft text-blue',
  check: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  practice: 'bg-green-soft text-green',
  produce: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
  review: 'bg-purple-soft text-purple',
}

function TutorPlanCard({ plan }: { plan: TutorPlan }) {
  return (
    <div className="space-y-3">
      {/* Topic + Objective */}
      <div>
        <p className="text-[13px] text-text-secondary leading-snug font-medium">{plan.topic}</p>
        <p className="text-[12px] text-text-muted leading-snug mt-0.5">{plan.objective}</p>
      </div>

      {/* Steps */}
      {plan.steps.length > 0 && (
        <div>
          <span className="text-[11px] font-medium text-text-muted uppercase tracking-wide">Steps</span>
          <ul className="mt-1.5 space-y-1">
            {plan.steps.map((step, i) => (
              <li
                key={i}
                className={cn(
                  'flex items-start gap-2 rounded-md px-1.5 py-0.5 -mx-1.5',
                  step.status === 'active' && 'bg-bg-secondary'
                )}
              >
                <span
                  className={cn(
                    'w-4 h-4 rounded border flex items-center justify-center shrink-0 mt-0.5',
                    step.status === 'completed'
                      ? 'bg-accent-brand border-accent-brand'
                      : step.status === 'skipped'
                      ? 'bg-bg-secondary border-border-strong'
                      : step.status === 'active'
                      ? 'border-accent-brand'
                      : 'border-border-strong'
                  )}
                >
                  {step.status === 'completed' && <CheckIcon className="w-2.5 h-2.5 text-white" />}
                  {step.status === 'active' && <div className="w-1.5 h-1.5 rounded-full bg-accent-brand" />}
                  {step.status === 'skipped' && <span className="text-[9px] text-text-muted">-</span>}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        'px-1 py-0 rounded text-[10px] font-medium uppercase tracking-wide',
                        STEP_TYPE_COLORS[step.type] || 'bg-bg-secondary text-text-muted'
                      )}
                    >
                      {step.type}
                    </span>
                    <span
                      className={cn(
                        'text-[12.5px] leading-snug',
                        step.status === 'completed' ? 'text-text-muted line-through' :
                        step.status === 'skipped' ? 'text-text-muted line-through' :
                        step.status === 'active' ? 'text-text-primary font-medium' :
                        'text-text-secondary'
                      )}
                    >
                      {step.title}
                    </span>
                  </div>
                  {step.notes && (
                    <p className="text-[11px] text-text-muted mt-0.5 italic">{step.notes}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Concepts */}
      {plan.concepts.length > 0 && (
        <div>
          <span className="text-[11px] font-medium text-text-muted uppercase tracking-wide">Concepts</span>
          <div className="mt-1 flex flex-wrap gap-1">
            {plan.concepts.map((c, i) => (
              <span
                key={i}
                className={cn(
                  'inline-block px-2 py-0.5 rounded-full text-[11.5px] font-medium font-jp',
                  c.type === 'grammar' && 'bg-purple-soft text-purple',
                  c.type === 'vocabulary' && 'bg-blue-soft text-blue',
                  c.type === 'usage' && 'bg-green-soft text-green'
                )}
              >
                {c.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Exercise types */}
      {plan.exerciseTypes && plan.exerciseTypes.length > 0 && (
        <div>
          <span className="text-[11px] font-medium text-text-muted uppercase tracking-wide">Exercises</span>
          <div className="mt-1 flex flex-wrap gap-1">
            {plan.exerciseTypes.map((ex, i) => (
              <span
                key={i}
                className="inline-block px-2 py-0.5 rounded-full bg-bg-secondary text-text-secondary text-[11.5px] font-medium"
              >
                {ex}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// --- BasePlanCard — immersion/reference (unchanged from old layout) ---

function BasePlanCard({
  plan,
  onMilestoneToggle,
}: {
  plan: SessionPlan
  onMilestoneToggle: (index: number) => void
}) {
  if (!('focus' in plan)) return null

  const basePlan = plan as { focus: string; goals: string[]; milestones: Array<{ description: string; completed: boolean }> }

  return (
    <div className="space-y-3">
      {/* Immersion: content type + content spec at top */}
      {isImmersionPlan(plan) && (
        <div className="text-[12px] text-text-muted bg-bg-secondary rounded-lg p-2.5 space-y-0.5">
          <div><span className="font-medium">Content:</span> {plan.contentType}</div>
          <div><span className="font-medium">Spec:</span> {plan.contentSpec}</div>
        </div>
      )}

      {/* Reference: topic + related topics at top */}
      {isReferencePlan(plan) && (
        <div className="text-[12px] text-text-muted bg-bg-secondary rounded-lg p-2.5 space-y-0.5">
          <div><span className="font-medium">Topic:</span> {plan.topic}</div>
          {plan.relatedTopics?.length ? (
            <div><span className="font-medium">Related:</span> {plan.relatedTopics.join(', ')}</div>
          ) : null}
        </div>
      )}

      {/* Focus */}
      <p className="text-[13px] text-text-secondary leading-snug">{basePlan.focus}</p>

      {/* Goals */}
      {basePlan.goals?.length > 0 && (
        <div>
          <span className="text-[11px] font-medium text-text-muted uppercase tracking-wide">Goals</span>
          <ul className="mt-1 space-y-1">
            {basePlan.goals.map((goal, i) => (
              <li key={i} className="text-[12.5px] text-text-secondary leading-snug flex items-start gap-1.5">
                <span className="text-text-placeholder mt-0.5">-</span>
                {goal}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Milestones */}
      {basePlan.milestones?.length > 0 && (
        <div>
          <span className="text-[11px] font-medium text-text-muted uppercase tracking-wide">Milestones</span>
          <ul className="mt-1.5 space-y-1">
            {basePlan.milestones.map((m, i) => (
              <li key={i} className="flex items-start gap-2">
                <button
                  className={cn(
                    'w-4 h-4 rounded border flex items-center justify-center shrink-0 mt-0.5 transition-colors',
                    m.completed
                      ? 'bg-accent-brand border-accent-brand'
                      : 'border-border-strong hover:border-accent-brand'
                  )}
                  onClick={() => onMilestoneToggle(i)}
                >
                  {m.completed && <CheckIcon className="w-2.5 h-2.5 text-white" />}
                </button>
                <span
                  className={cn(
                    'text-[12.5px] leading-snug',
                    m.completed ? 'text-text-muted line-through' : 'text-text-secondary'
                  )}
                >
                  {m.description}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Immersion: vocabulary + comprehension */}
      {isImmersionPlan(plan) && plan.targetVocabulary?.length ? (
        <div>
          <span className="text-[11px] font-medium text-text-muted uppercase tracking-wide">Vocabulary targets</span>
          <div className="mt-1 flex flex-wrap gap-1">
            {plan.targetVocabulary.map((word, i) => (
              <span
                key={i}
                className="inline-block px-2 py-0.5 rounded-full bg-blue-soft text-blue text-[11.5px] font-medium font-jp"
              >
                {word}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {isImmersionPlan(plan) && plan.comprehensionQuestions?.length ? (
        <div>
          <span className="text-[11px] font-medium text-text-muted uppercase tracking-wide">Comprehension questions</span>
          <ul className="mt-1 space-y-1">
            {plan.comprehensionQuestions.map((q, i) => (
              <li key={i} className="text-[12.5px] text-text-secondary leading-snug flex items-start gap-1.5">
                <span className="text-text-placeholder mt-0.5">{i + 1}.</span>
                {q}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

// --- Panel card renderer (vocabulary, grammar, correction) ---

function PanelCard({ toolName, output }: { toolName: string; output: unknown }) {
  const data = output as Record<string, unknown>

  if (toolName === 'showVocabularyCard') {
    return (
      <VocabularyCard
        word={data.word as string}
        reading={data.reading as string | undefined}
        meaning={data.meaning as string}
        partOfSpeech={data.partOfSpeech as string | undefined}
        exampleSentence={data.exampleSentence as string | undefined}
        notes={data.notes as string | undefined}
      />
    )
  }

  if (toolName === 'showGrammarNote') {
    return (
      <GrammarNote
        pattern={data.pattern as string}
        meaning={data.meaning as string}
        formation={data.formation as string}
        examples={data.examples as Array<{ japanese: string; english: string }>}
        level={data.level as string | undefined}
      />
    )
  }

  if (toolName === 'showCorrection') {
    return (
      <CorrectionCard
        original={data.original as string}
        corrected={data.corrected as string}
        explanation={data.explanation as string}
        grammarPoint={data.grammarPoint as string | undefined}
      />
    )
  }

  return null
}
