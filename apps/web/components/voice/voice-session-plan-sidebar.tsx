'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { ChevronLeftIcon, PaperAirplaneIcon } from '@heroicons/react/24/outline'
import { cn } from '@/lib/utils'
import type { SessionPlan } from '@/lib/session-plan'
import { isConversationPlan, isTutorPlan } from '@/lib/session-plan'

interface VoiceSessionPlanSidebarProps {
  isOpen: boolean
  plan: SessionPlan | null
  onCollapse: () => void
  onSteer: (text: string) => void
  steeringMessages: Array<{ text: string; time: string }>
  className?: string
}

function getPlanProgress(plan: SessionPlan | null): number {
  if (!plan) return 0
  if (isTutorPlan(plan) && plan.steps.length > 0) {
    const completed = plan.steps.filter(s => s.status === 'completed').length
    return Math.round((completed / plan.steps.length) * 100)
  }
  if ('milestones' in plan && Array.isArray(plan.milestones) && plan.milestones.length > 0) {
    const m = plan.milestones as Array<{ completed: boolean }>
    const completed = m.filter(x => x.completed).length
    return Math.round((completed / m.length) * 100)
  }
  return 0
}

export function VoiceSessionPlanSidebar({
  isOpen, plan, onCollapse, onSteer, steeringMessages,
}: VoiceSessionPlanSidebarProps) {
  const [inputValue, setInputValue] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const progress = getPlanProgress(plan)

  const handleSubmit = useCallback(() => {
    const val = inputValue.trim()
    if (!val) return
    onSteer(val)
    setInputValue('')
    if (inputRef.current) inputRef.current.style.height = 'auto'
  }, [inputValue, onSteer])

  // Scroll to bottom when steering messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [steeringMessages])

  return (
    <div
      className={cn(
        'fixed left-0 top-0 bottom-0 w-[290px] z-[10] flex flex-col overflow-hidden transition-transform duration-[380ms] ease-[cubic-bezier(.76,0,.24,1)]',
        'bg-[rgba(252,252,250,.95)] backdrop-blur-[20px] saturate-[1.3] border-r border-[rgba(228,224,217,.8)]',
        isOpen ? 'translate-x-0' : '-translate-x-full',
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3.5 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-[7px]">
          <div className="w-[26px] h-[26px] rounded-[7px] bg-accent-brand flex items-center justify-center shrink-0">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
          </div>
          <div>
            <div className="text-[12.5px] font-semibold text-text-primary tracking-[-0.015em]">Session Plan</div>
            <div className="text-[10.5px] text-text-muted mt-px">Live &middot; AI references this</div>
          </div>
        </div>
        <button
          onClick={onCollapse}
          className="w-[22px] h-[22px] rounded-md border-none bg-bg-hover cursor-pointer flex items-center justify-center text-text-muted transition-all hover:bg-bg-active hover:text-text-primary shrink-0"
        >
          <ChevronLeftIcon className="w-3 h-3" />
        </button>
      </div>

      {/* Progress */}
      <div className="px-3.5 pt-2 shrink-0">
        <div className="flex justify-between text-[10px] text-text-muted mb-[5px] tracking-[.02em]">
          <span>Progress</span>
          <span>{progress}%</span>
        </div>
        <div className="h-[2px] bg-border rounded-sm overflow-hidden">
          <div
            className="h-full rounded-sm bg-accent-brand transition-[width] duration-600 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Plan content */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 pt-3.5 pb-2 [&::-webkit-scrollbar]:w-[3px] [&::-webkit-scrollbar-thumb]:bg-border-strong [&::-webkit-scrollbar-thumb]:rounded-sm">
        <div className="voice-plan-body">
          {plan && <PlanContent plan={plan} />}

          {/* Steering messages */}
          {steeringMessages.map((msg, i) => (
            <div key={i} className="voice-steer-msg">
              <span className="text-[9.5px] text-text-muted tracking-[.03em]">Your instruction &middot; {msg.time}</span>
              <span className="text-[11.5px] text-text-primary leading-[1.5]">{msg.text}</span>
              <span className="inline-flex items-center gap-1 text-[9.5px] text-green font-medium mt-0.5">
                &#10003; Applied to next response
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Steering input */}
      <div className="shrink-0 border-t border-border px-3 py-2.5 flex flex-col gap-[7px]">
        <div className="text-[10px] font-semibold tracking-[.09em] uppercase text-text-muted">Steer the AI</div>
        <div className="flex gap-[7px] items-end">
          <div className="flex-1 bg-[rgba(255,255,255,.88)] border-[1.5px] border-border rounded-2xl overflow-hidden transition-all focus-within:border-border-strong focus-within:shadow-[0_0_0_3px_rgba(47,47,47,.05)]">
            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={e => {
                setInputValue(e.target.value)
                e.target.style.height = 'auto'
                e.target.style.height = Math.min(e.target.scrollHeight, 80) + 'px'
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() }
              }}
              rows={1}
              placeholder="E.g. switch topic, focus on keigo, slow down..."
              className="w-full px-[11px] py-2 font-sans text-[12.5px] text-text-primary bg-transparent border-none outline-none resize-none leading-[1.5] min-h-[34px] max-h-[80px] placeholder:text-text-muted"
            />
          </div>
          <button
            onClick={handleSubmit}
            disabled={!inputValue.trim()}
            className="w-[34px] h-[34px] rounded-[10px] border-none cursor-pointer bg-accent-brand flex items-center justify-center shadow-[0_1px_4px_rgba(47,47,47,.2)] transition-all shrink-0 hover:bg-[#111] hover:-translate-y-px disabled:opacity-[.28] disabled:pointer-events-none"
          >
            <PaperAirplaneIcon className="w-3.5 h-3.5 text-white" />
          </button>
        </div>
      </div>
    </div>
  )
}

function PlanContent({ plan }: { plan: SessionPlan }) {
  if (isConversationPlan(plan)) {
    return (
      <>
        <h3>Scenario</h3>
        <p><strong>{plan.topic}</strong></p>
        {plan.setting && <p>{plan.setting}</p>}

        <h3>Character</h3>
        <ul>
          {plan.persona.name && <li>{plan.persona.name} &mdash; {plan.persona.relationship}</li>}
          {!plan.persona.name && <li>{plan.persona.relationship}</li>}
          <li>{plan.persona.personality}</li>
          {plan.register && <li>Register: {plan.register}</li>}
        </ul>

        {plan.dynamic && (
          <>
            <h3>Dynamic</h3>
            <p>{plan.dynamic}</p>
          </>
        )}

        {plan.culturalContext && (
          <>
            <h3>Cultural Context</h3>
            <p><em>{plan.culturalContext}</em></p>
          </>
        )}

        {plan.tension && (
          <>
            <h3>Tension</h3>
            <p>{plan.tension}</p>
          </>
        )}
      </>
    )
  }

  if (isTutorPlan(plan)) {
    return (
      <>
        <h3>Topic</h3>
        <p><strong>{plan.topic}</strong></p>
        <p>{plan.objective}</p>

        <h3>Lesson Steps</h3>
        <ul>
          {plan.steps.map((s, i) => (
            <li key={i}>
              {s.status === 'completed' ? '✓ ' : s.status === 'active' ? '▸ ' : ''}
              <code>{s.type}</code> {s.title}
            </li>
          ))}
        </ul>

        {plan.concepts.length > 0 && (
          <>
            <h3>Concepts</h3>
            <ul>
              {plan.concepts.map((c, i) => (
                <li key={i}><code>{c.type}</code> {c.label}</li>
              ))}
            </ul>
          </>
        )}
      </>
    )
  }

  // Immersion/reference fallback
  const base = plan as { focus?: string; goals?: string[]; milestones?: Array<{ description: string; completed: boolean }> }
  return (
    <>
      {base.focus && (
        <>
          <h3>Focus</h3>
          <p>{base.focus}</p>
        </>
      )}
      {base.goals && base.goals.length > 0 && (
        <>
          <h3>Goals</h3>
          <ul>
            {base.goals.map((g, i) => <li key={i}>{g}</li>)}
          </ul>
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
