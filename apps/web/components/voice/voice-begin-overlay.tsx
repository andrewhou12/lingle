'use client'

import { useState, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { PaperAirplaneIcon } from '@heroicons/react/24/outline'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import type { SessionPlan } from '@/lib/session-plan'
import { isConversationPlan, isTutorPlan } from '@/lib/session-plan'
import { type VoiceProviderType, getDefaultVoiceProvider } from '@/lib/voice/voice-provider-config'

interface VoiceBeginOverlayProps {
  plan: SessionPlan
  mode: string
  prompt: string
  defaultProvider?: VoiceProviderType
  onBegin: (steeringNotes: string[], voiceProvider: VoiceProviderType) => void
  onBack: () => void
}

interface SteerMessage {
  text: string
  ts: number
}

const MODE_ICONS: Record<string, string> = {
  conversation: '💬',
  tutor: '📚',
  immersion: '🎧',
  reference: '📖',
}

function getTitle(plan: SessionPlan): { main: string; accent?: string } {
  if (isConversationPlan(plan)) {
    return { main: plan.topic || 'Conversation' }
  }
  if (isTutorPlan(plan)) {
    return { main: plan.topic || 'Lesson' }
  }
  const focus = 'focus' in plan ? (plan as { focus: string }).focus : 'Session'
  return { main: focus }
}

function getDescription(plan: SessionPlan): string {
  if (isConversationPlan(plan)) {
    const parts: string[] = []
    if (plan.setting) parts.push(plan.setting + '.')
    parts.push('Hold the mic and speak naturally — Lingle will correct you inline as you go.')
    return parts.join(' ')
  }
  if (isTutorPlan(plan)) {
    return plan.objective || 'Interactive lesson with step-by-step guidance.'
  }
  return 'Hold the mic and speak naturally.'
}

function getCharacter(plan: SessionPlan): { avatar: string; name: string; desc: string } | null {
  if (isConversationPlan(plan) && plan.persona) {
    const name = plan.persona.name || plan.persona.relationship
    return {
      avatar: plan.persona.name?.charAt(0) || '話',
      name: name,
      desc: `${plan.persona.personality} · ${plan.register} register`,
    }
  }
  return null
}

function getDetailPills(plan: SessionPlan): Array<{ icon: string; label: string }> {
  const pills: Array<{ icon: string; label: string }> = []
  if (isConversationPlan(plan)) {
    pills.push({ icon: '🎌', label: plan.register || 'Polite' })
    if (plan.tone) pills.push({ icon: '🗣', label: plan.tone })
    pills.push({ icon: '⏱', label: '~10 min' })
  } else if (isTutorPlan(plan)) {
    pills.push({ icon: '📝', label: `${plan.steps.length} steps` })
    if (plan.concepts.length > 0) pills.push({ icon: '🎯', label: `${plan.concepts.length} concepts` })
    pills.push({ icon: '⏱', label: '~15 min' })
  } else {
    pills.push({ icon: '⏱', label: '~10 min' })
  }
  return pills
}

export function VoiceBeginOverlay({ plan, mode, prompt, defaultProvider, onBegin, onBack }: VoiceBeginOverlayProps) {
  const [steerMessages, setSteerMessages] = useState<SteerMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isExiting, setIsExiting] = useState(false)
  const [voiceProvider, setVoiceProvider] = useState<VoiceProviderType>(defaultProvider ?? getDefaultVoiceProvider())
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const title = getTitle(plan)
  const description = getDescription(plan)
  const character = getCharacter(plan)
  const pills = getDetailPills(plan)
  const icon = MODE_ICONS[mode] || '💬'

  const handleSteer = useCallback(() => {
    const val = inputValue.trim()
    if (!val) return
    setSteerMessages(prev => [...prev, { text: val, ts: Date.now() }])
    setInputValue('')
    if (inputRef.current) inputRef.current.style.height = 'auto'
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    })
  }, [inputValue])

  const handleBegin = useCallback(() => {
    setIsExiting(true)
    setTimeout(() => {
      onBegin(steerMessages.map(m => m.text), voiceProvider)
    }, 400)
  }, [onBegin, steerMessages, voiceProvider])

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: isExiting ? 0 : 1 }}
      transition={{ duration: 0.4 }}
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-[rgba(255,255,255,.98)] backdrop-blur-[16px] px-6 py-8"
    >
      <motion.div
        initial={{ scale: 0.97, y: 12 }}
        animate={{ scale: isExiting ? 0.97 : 1, y: isExiting ? 12 : 0 }}
        transition={{ duration: 0.4, ease: [0.76, 0, 0.24, 1] }}
        className="max-w-[860px] w-full h-[min(680px,calc(100vh-64px))] grid grid-cols-[300px_1fr] bg-[rgba(255,255,255,.92)] border border-border rounded-3xl shadow-[0_8px_40px_rgba(0,0,0,.08),0_32px_80px_rgba(0,0,0,.05)] overflow-hidden"
      >
        {/* Left column */}
        <div className="px-7 py-7 flex flex-col border-r border-border overflow-y-auto">
          <div className="text-[26px] mb-3">{icon}</div>
          <h2 className="text-[18px] font-bold tracking-[-0.035em] mb-1">
            {title.main}
          </h2>
          <p className="text-[12px] text-text-secondary leading-[1.65] mb-4">
            {description}
          </p>

          {/* Character card */}
          {character && (
            <div className="flex items-center gap-[11px] bg-bg-secondary border border-border rounded-2xl px-3.5 py-[11px] mb-3.5">
              <div className="w-9 h-9 rounded-[10px] bg-accent-brand flex items-center justify-center font-jp text-[16px] text-white shrink-0">
                {character.avatar}
              </div>
              <div>
                <div className="text-[13px] font-semibold tracking-[-0.02em]">{character.name}</div>
                <div className="text-[11px] text-text-muted mt-0.5">{character.desc}</div>
              </div>
            </div>
          )}

          {/* Detail pills */}
          <div className="flex gap-1.5 flex-wrap mb-[18px]">
            {pills.map((pill, i) => (
              <span key={i} className="flex items-center gap-[5px] text-[11px] text-text-secondary bg-bg-secondary border border-border px-[9px] py-[3px] rounded-full">
                {pill.icon} {pill.label}
              </span>
            ))}
          </div>

          <div className="flex-1" />

          {/* Voice provider toggle */}
          <div className="flex items-center justify-center gap-0.5 bg-bg-secondary border border-border rounded-xl p-[3px] mb-3">
            <button
              onClick={() => setVoiceProvider('soniox')}
              className={cn(
                'flex-1 text-[11.5px] font-medium py-[5px] px-3 rounded-[9px] border-none cursor-pointer transition-all font-sans',
                voiceProvider === 'soniox'
                  ? 'bg-white text-text-primary shadow-[0_1px_3px_rgba(0,0,0,.1)]'
                  : 'bg-transparent text-text-muted hover:text-text-secondary',
              )}
            >
              Standard
            </button>
            <button
              onClick={() => setVoiceProvider('hume')}
              className={cn(
                'flex-1 text-[11.5px] font-medium py-[5px] px-3 rounded-[9px] border-none cursor-pointer transition-all font-sans',
                voiceProvider === 'hume'
                  ? 'bg-white text-text-primary shadow-[0_1px_3px_rgba(0,0,0,.1)]'
                  : 'bg-transparent text-text-muted hover:text-text-secondary',
              )}
            >
              Hume EVI
            </button>
          </div>

          {/* Begin button */}
          <button
            onClick={handleBegin}
            className="w-full py-3 font-sans text-[14.5px] font-semibold text-white bg-accent-brand border-none rounded-2xl cursor-pointer transition-all shadow-[0_2px_4px_rgba(0,0,0,.15)] tracking-[-0.02em] hover:bg-[#111] hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,0,0,.2)]"
          >
            Begin conversation &rarr;
          </button>
          <p className="text-[10.5px] text-text-muted mt-[9px] leading-[1.55] text-center">
            {voiceProvider === 'hume'
              ? 'Speak freely — Hume handles turn-taking · Corrections appear inline'
              : 'Hold mic to speak · Corrections appear inline · Plan editable mid-session'}
          </p>
        </div>

        {/* Right column */}
        <div className="flex flex-col bg-bg-secondary overflow-hidden min-h-0">
          {/* Plan header */}
          <div className="flex items-center gap-2 px-4 pt-3.5 pb-3 border-b border-border shrink-0 bg-[rgba(255,255,255,.6)]">
            <div className="w-[22px] h-[22px] rounded-md bg-accent-brand flex items-center justify-center shrink-0">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
              </svg>
            </div>
            <span className="text-[11.5px] font-semibold text-text-primary tracking-[-0.01em]">Session Plan</span>
            <span className="text-[9.5px] text-text-muted bg-bg-active border border-border px-[7px] py-0.5 rounded-full font-mono tracking-[.03em] ml-auto">
              AI reads this live
            </span>
          </div>

          {/* Scrollable plan body */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-[18px] pt-4 pb-2 min-h-0 [&::-webkit-scrollbar]:w-[3px] [&::-webkit-scrollbar-thumb]:bg-border-strong [&::-webkit-scrollbar-thumb]:rounded-sm">
            <div className="voice-plan-body text-[12px] text-text-secondary leading-[1.75]">
              <PlanBody plan={plan} />

              {/* Steering messages */}
              {steerMessages.map((msg, i) => (
                <div key={i} className="voice-steer-msg">
                  <span className="text-[9.5px] text-text-muted tracking-[.03em]">Plan update</span>
                  <span className="text-[11.5px] text-text-primary leading-[1.5]">{msg.text}</span>
                  <span className="inline-flex items-center gap-1 text-[9.5px] text-green font-medium mt-0.5">
                    &#10003; Will apply from turn one
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Steering input */}
          <div className="shrink-0 border-t border-border px-4 py-3 flex flex-col gap-2 bg-[rgba(255,255,255,.7)]">
            <div className="text-[10px] font-semibold tracking-[.09em] uppercase text-text-muted">Adjust the plan</div>
            <div className="flex w-full">
              <div className="flex-1 min-w-0 bg-[rgba(255,255,255,.88)] border-[1.5px] border-border rounded-[14px] relative overflow-hidden transition-all focus-within:border-border-strong focus-within:shadow-[0_0_0_3px_rgba(47,47,47,.05)]">
                <textarea
                  ref={inputRef}
                  value={inputValue}
                  onChange={e => {
                    setInputValue(e.target.value)
                    e.target.style.height = 'auto'
                    e.target.style.height = Math.min(e.target.scrollHeight, 130) + 'px'
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSteer() }
                  }}
                  rows={3}
                  placeholder="Adjust anything before you start..."
                  className="w-full min-h-[72px] max-h-[130px] px-[13px] py-[11px] pb-9 text-[13px] leading-[1.6] font-sans resize-none border-none outline-none bg-transparent placeholder:text-text-muted"
                />
                <button
                  onClick={handleSteer}
                  disabled={!inputValue.trim()}
                  className="absolute bottom-2 right-[9px] w-7 h-7 rounded-lg border-none cursor-pointer bg-accent-brand flex items-center justify-center opacity-70 transition-opacity hover:opacity-100 disabled:opacity-[.28] disabled:pointer-events-none"
                >
                  <PaperAirplaneIcon className="w-[13px] h-[13px] text-white" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  )
}

function PlanBody({ plan }: { plan: SessionPlan }) {
  if (isConversationPlan(plan)) {
    return (
      <>
        <h3>Scenario</h3>
        <p><strong>{plan.topic}</strong></p>
        {plan.setting && <p>{plan.setting}</p>}

        {plan.persona && (
          <>
            <h3>Character</h3>
            <ul>
              {plan.persona.name && <li><strong>{plan.persona.name}</strong> &mdash; {plan.persona.relationship}</li>}
              {!plan.persona.name && <li>{plan.persona.relationship}</li>}
              <li>{plan.persona.personality}</li>
              <li>Register: {plan.register}</li>
              {plan.tone && <li>Tone: {plan.tone}</li>}
            </ul>
          </>
        )}

        {plan.dynamic && (
          <>
            <h3>Session Direction</h3>
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
            <h3>Tension / Challenge</h3>
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
            <li key={i}><code>{s.type}</code> {s.title}</li>
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

        {plan.exerciseTypes && plan.exerciseTypes.length > 0 && (
          <>
            <h3>Exercise Types</h3>
            <ul>
              {plan.exerciseTypes.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </>
        )}
      </>
    )
  }

  // Immersion / reference
  const base = plan as { focus?: string; goals?: string[]; approach?: string; milestones?: Array<{ description: string; completed: boolean }> }
  return (
    <>
      {base.focus && (
        <>
          <h3>Focus</h3>
          <p><strong>{base.focus}</strong></p>
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
      {base.approach && (
        <>
          <h3>Approach</h3>
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
