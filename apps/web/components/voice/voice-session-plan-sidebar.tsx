'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { XMarkIcon, ArrowRightIcon, PencilIcon, CheckIcon } from '@heroicons/react/24/outline'
import { cn } from '@/lib/utils'
import type { SessionPlan } from '@/lib/session-plan'
import { isConversationPlan, isTutorPlan } from '@/lib/session-plan'

interface VoiceSessionPlanSidebarProps {
  isOpen: boolean
  plan: SessionPlan | null
  onCollapse: () => void
  onSteer: (text: string) => void
  onPlanSave?: (planText: string) => void
  steeringMessages: Array<{ text: string; time: string }>
  className?: string
}

function planToText(plan: SessionPlan): string {
  const lines: string[] = []

  if (isConversationPlan(plan)) {
    lines.push(`Topic: ${plan.topic}`)
    if (plan.setting) lines.push(`Setting: ${plan.setting}`)
    if (plan.persona.name) lines.push(`Character: ${plan.persona.name} — ${plan.persona.relationship}`)
    else lines.push(`Character: ${plan.persona.relationship}`)
    lines.push(`Personality: ${plan.persona.personality}`)
    if (plan.register) lines.push(`Register: ${plan.register}`)
    if (plan.tone) lines.push(`Tone: ${plan.tone}`)
    if (plan.dynamic) lines.push(`Dynamic: ${plan.dynamic}`)
    if (plan.tension) lines.push(`Tension: ${plan.tension}`)
    if (plan.culturalContext) lines.push(`Cultural context: ${plan.culturalContext}`)
  } else if (isTutorPlan(plan)) {
    lines.push(`Topic: ${plan.topic}`)
    lines.push(`Objective: ${plan.objective}`)
    if (plan.steps.length > 0) {
      lines.push(`\nSteps:`)
      for (const s of plan.steps) {
        lines.push(`- ${s.title}`)
      }
    }
    const concepts = plan.concepts.map(c => c.label)
    if (concepts.length > 0) lines.push(`\nConcepts: ${concepts.join(', ')}`)
  } else {
    const base = plan as { focus?: string; goals?: string[]; approach?: string; targetVocabulary?: string[] }
    if (base.focus) lines.push(`Focus: ${base.focus}`)
    if (base.goals?.length) {
      lines.push(`\nGoals:`)
      for (const g of base.goals) lines.push(`- ${g}`)
    }
    if (base.targetVocabulary?.length) {
      lines.push(`\nVocabulary: ${base.targetVocabulary.join(', ')}`)
    }
    if (base.approach) lines.push(`\nApproach: ${base.approach}`)
  }

  return lines.join('\n')
}

export function VoiceSessionPlanSidebar({
  isOpen, plan, onCollapse, onSteer, onPlanSave, steeringMessages,
}: VoiceSessionPlanSidebarProps) {
  const [inputValue, setInputValue] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const editRef = useRef<HTMLTextAreaElement>(null)

  const handleSubmit = useCallback(() => {
    const val = inputValue.trim()
    if (!val) return
    onSteer(val)
    setInputValue('')
    if (inputRef.current) inputRef.current.style.height = 'auto'
  }, [inputValue, onSteer])

  const handleEditStart = useCallback(() => {
    if (plan) {
      setEditText(planToText(plan))
    }
    setIsEditing(true)
  }, [plan])

  const handleEditSave = useCallback(() => {
    const trimmed = editText.trim()
    if (!trimmed) return
    setIsEditing(false)
    onPlanSave?.(trimmed)
  }, [editText, onPlanSave])

  const handleEditCancel = useCallback(() => {
    setIsEditing(false)
    setEditText('')
  }, [])

  // Focus edit textarea when entering edit mode
  useEffect(() => {
    if (isEditing && editRef.current) {
      editRef.current.focus()
      editRef.current.selectionStart = editRef.current.value.length
    }
  }, [isEditing])

  // Scroll to bottom when steering messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [steeringMessages])

  return (
    <div
      className={cn(
        'fixed left-0 top-0 bottom-0 w-[340px] z-[10] flex flex-col overflow-hidden transition-transform duration-[380ms] ease-[cubic-bezier(.76,0,.24,1)]',
        'bg-bg-pure border-r border-border',
        isOpen ? 'translate-x-0' : '-translate-x-full',
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border shrink-0">
        <div className="text-[15px] font-semibold text-text-primary tracking-[-0.02em]">Session Plan</div>
        <div className="flex items-center gap-1">
          {!isEditing && plan && (
            <button
              onClick={handleEditStart}
              className="w-8 h-8 rounded-lg flex items-center justify-center bg-transparent border-none cursor-pointer text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary shrink-0"
              title="Edit plan"
            >
              <PencilIcon className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onCollapse}
            className="w-8 h-8 rounded-lg flex items-center justify-center bg-transparent border-none cursor-pointer text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary shrink-0"
          >
            <XMarkIcon className="w-[18px] h-[18px]" />
          </button>
        </div>
      </div>

      {/* Plan content */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 pt-4 pb-3 [&::-webkit-scrollbar]:w-[3px] [&::-webkit-scrollbar-thumb]:bg-border-strong [&::-webkit-scrollbar-thumb]:rounded-sm">
        {isEditing ? (
          <div className="flex flex-col gap-3">
            <textarea
              ref={editRef}
              value={editText}
              onChange={e => setEditText(e.target.value)}
              className="w-full min-h-[200px] px-4 py-3 font-sans text-[14px] text-text-primary bg-bg-secondary border border-border rounded-xl outline-none resize-y leading-[1.7] focus:border-border-strong focus:shadow-[0_0_0_3px_rgba(47,47,47,.05)] transition-shadow"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={handleEditCancel}
                className="px-4 py-2 text-[13px] text-text-secondary bg-transparent border border-border rounded-lg cursor-pointer transition-colors hover:bg-bg-hover"
              >
                Cancel
              </button>
              <button
                onClick={handleEditSave}
                disabled={!editText.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-[13px] font-medium text-white bg-accent-brand border-none rounded-lg cursor-pointer transition-all hover:bg-[#111] disabled:opacity-30 disabled:pointer-events-none"
              >
                <CheckIcon className="w-3.5 h-3.5" />
                Save
              </button>
            </div>
          </div>
        ) : (
          <div className="voice-plan-body">
            {plan && <PlanContent plan={plan} />}

            {/* Steering messages */}
            {steeringMessages.map((msg, i) => (
              <div key={i} className="voice-steer-msg">
                <span className="text-[11px] text-text-muted tracking-[.03em]">Your instruction &middot; {msg.time}</span>
                <span className="text-[13px] text-text-primary leading-[1.6]">{msg.text}</span>
                <span className="inline-flex items-center gap-1 text-[11px] text-green font-medium mt-0.5">
                  &#10003; Applied to next response
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Steering input */}
      {!isEditing && (
        <div className="shrink-0 border-t border-border px-4 py-3 flex flex-col gap-2">
          <div className="text-[13px] font-medium text-text-muted">Adjust plan</div>
          <div className="relative bg-bg-pure border border-border rounded-xl overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,.04),0_1px_4px_rgba(0,0,0,.03)] transition-[border-color,box-shadow] duration-150 focus-within:border-border-strong focus-within:shadow-[0_2px_8px_rgba(0,0,0,.06),0_1px_4px_rgba(0,0,0,.04)]">
            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={e => {
                setInputValue(e.target.value)
                e.target.style.height = 'auto'
                e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px'
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() }
              }}
              rows={1}
              placeholder="e.g. talk more about travel..."
              className="w-full px-4 py-3 pr-12 font-sans text-[14px] text-text-primary bg-transparent border-none outline-none resize-none leading-[1.5] min-h-[44px] max-h-[100px] placeholder:text-text-muted"
            />
            <button
              onClick={handleSubmit}
              disabled={!inputValue.trim()}
              className="absolute right-2 bottom-2 w-8 h-8 rounded-lg border-none cursor-pointer bg-accent-brand flex items-center justify-center transition-all shrink-0 hover:bg-[#111] disabled:pointer-events-none"
            >
              <ArrowRightIcon className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function PlanContent({ plan }: { plan: SessionPlan }) {
  if (isConversationPlan(plan)) {
    // Collect focus points from dynamic/tension/culturalContext
    const focusPoints: string[] = []
    if (plan.dynamic) focusPoints.push(plan.dynamic)
    if (plan.tension) focusPoints.push(plan.tension)
    if (plan.culturalContext) focusPoints.push(plan.culturalContext)

    return (
      <>
        <h3>Session Goal</h3>
        <p>
          <strong>{plan.topic}</strong>
          {plan.setting ? ` — ${plan.setting}` : ''}
        </p>

        {focusPoints.length > 0 && (
          <>
            <h3>Today&apos;s Focus</h3>
            <ul>
              {focusPoints.map((fp, i) => <li key={i}>{fp}</li>)}
            </ul>
          </>
        )}

        <h3>Character</h3>
        <ul>
          {plan.persona.name && <li><strong>{plan.persona.name}</strong> &mdash; {plan.persona.relationship}</li>}
          {!plan.persona.name && <li>{plan.persona.relationship}</li>}
          <li>{plan.persona.personality}</li>
          {plan.register && <li>Register: {plan.register}</li>}
          {plan.tone && <li>Tone: {plan.tone}</li>}
        </ul>
      </>
    )
  }

  if (isTutorPlan(plan)) {
    const vocabConcepts = plan.concepts.filter(c => c.type === 'vocabulary')
    const grammarConcepts = plan.concepts.filter(c => c.type === 'grammar')
    const usageConcepts = plan.concepts.filter(c => c.type === 'usage')

    return (
      <>
        <h3>Session Goal</h3>
        <p><strong>{plan.topic}</strong></p>
        <p>{plan.objective}</p>

        <h3>Lesson Steps</h3>
        <ol>
          {plan.steps.map((s, i) => (
            <li key={i}>
              {s.status === 'completed' ? '✓ ' : s.status === 'active' ? '▸ ' : ''}
              {s.title}
            </li>
          ))}
        </ol>

        {vocabConcepts.length > 0 && (
          <>
            <h3>Vocabulary Targets</h3>
            <p className="plan-inline-list">
              {vocabConcepts.map(c => c.label).join('、')}
            </p>
          </>
        )}

        {grammarConcepts.length > 0 && (
          <>
            <h3>Grammar Points</h3>
            <ol>
              {grammarConcepts.map((c, i) => <li key={i}>{c.label}</li>)}
            </ol>
          </>
        )}

        {usageConcepts.length > 0 && (
          <>
            <h3>Usage</h3>
            <ul>
              {usageConcepts.map((c, i) => <li key={i}>{c.label}</li>)}
            </ul>
          </>
        )}
      </>
    )
  }

  // Immersion/reference fallback
  const base = plan as { focus?: string; goals?: string[]; approach?: string; milestones?: Array<{ description: string; completed: boolean }>; targetVocabulary?: string[] }
  return (
    <>
      {base.focus && (
        <>
          <h3>Session Goal</h3>
          <p><strong>{base.focus}</strong></p>
        </>
      )}
      {base.goals && base.goals.length > 0 && (
        <>
          <h3>Today&apos;s Focus</h3>
          <ul>
            {base.goals.map((g, i) => <li key={i}>{g}</li>)}
          </ul>
        </>
      )}
      {base.targetVocabulary && base.targetVocabulary.length > 0 && (
        <>
          <h3>Vocabulary Targets</h3>
          <p className="plan-inline-list">
            {base.targetVocabulary.join('、')}
          </p>
        </>
      )}
      {base.approach && (
        <>
          <h3>Progression</h3>
          <p>{base.approach}</p>
        </>
      )}
      {base.milestones && base.milestones.length > 0 && (
        <>
          <h3>Milestones</h3>
          <ul>
            {base.milestones.map((m, i) => (
              <li key={i}>{m.completed ? '✓ ' : '○ '}{m.description}</li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}
