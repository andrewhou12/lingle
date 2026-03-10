'use client'

import { useState, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import {
  ChatBubbleLeftRightIcon,
  AcademicCapIcon,
  SpeakerWaveIcon,
  BookOpenIcon,
  ClockIcon,
  ChatBubbleLeftIcon,
  ListBulletIcon,
  LightBulbIcon,
  ArrowUpIcon,
  ArrowLeftIcon,
  UserIcon,
  MapPinIcon,
  SparklesIcon,
  ArrowRightIcon,
} from '@heroicons/react/24/outline'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import type { LearnerProfile } from '@lingle/shared/types'
import type { SessionPlan } from '@/lib/session-plan'
import { isConversationPlan, isTutorPlan } from '@/lib/session-plan'
import { getDifficultyLevel } from '@/lib/difficulty-levels'

interface VoiceBeginOverlayProps {
  plan: SessionPlan
  mode: string
  prompt: string
  profile: LearnerProfile | null
  onBegin: (steeringNotes: string[]) => void
  onBack: () => void
}

interface SteerMessage {
  text: string
  ts: number
}

const MODE_ICONS: Record<string, typeof ChatBubbleLeftRightIcon> = {
  conversation: ChatBubbleLeftRightIcon,
  tutor: AcademicCapIcon,
  immersion: SpeakerWaveIcon,
  reference: BookOpenIcon,
}

function getTitle(plan: SessionPlan): string {
  if (isConversationPlan(plan)) return plan.topic || 'Conversation'
  if (isTutorPlan(plan)) return plan.topic || 'Lesson'
  const focus = 'focus' in plan ? (plan as { focus: string }).focus : 'Session'
  return focus
}

function getSubtitle(plan: SessionPlan): string | null {
  if (isConversationPlan(plan) && plan.setting) return plan.setting
  if (isTutorPlan(plan) && plan.objective) return plan.objective
  return null
}

export function VoiceBeginOverlay({ plan, mode, profile, onBegin, onBack }: VoiceBeginOverlayProps) {
  const [steerMessages, setSteerMessages] = useState<SteerMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isExiting, setIsExiting] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const title = getTitle(plan)
  const subtitle = getSubtitle(plan)
  const ModeIcon = MODE_ICONS[mode] || ChatBubbleLeftRightIcon

  const handleSteer = useCallback(() => {
    const val = inputValue.trim()
    if (!val) return
    setSteerMessages(prev => [...prev, { text: val, ts: Date.now() }])
    setInputValue('')
    if (inputRef.current) inputRef.current.style.height = 'auto'
  }, [inputValue])

  const handleBegin = useCallback(() => {
    setIsExiting(true)
    setTimeout(() => {
      onBegin(steerMessages.map(m => m.text))
    }, 350)
  }, [onBegin, steerMessages])

  // Build plan detail sections
  const sections = buildPlanSections(plan)

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: isExiting ? 0 : 1 }}
      transition={{ duration: 0.3 }}
      className="fixed inset-0 z-[99999] bg-bg overflow-y-auto"
    >
      <div className="max-w-[520px] mx-auto px-6 py-10">
        {/* Back */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: isExiting ? 0 : 1 }}
          transition={{ delay: 0.05, duration: 0.3 }}
        >
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-[13px] text-text-muted hover:text-text-primary bg-transparent border-none cursor-pointer transition-colors mb-8"
          >
            <ArrowLeftIcon className="w-3.5 h-3.5" />
            Back
          </button>
        </motion.div>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: isExiting ? 0 : 1, y: isExiting ? 8 : 0 }}
          transition={{ delay: 0.1, duration: 0.4 }}
          className="mb-8"
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-md bg-bg-pure border border-border flex items-center justify-center">
              <ModeIcon className="w-4 h-4 text-text-muted" />
            </div>
            <span className="text-[13px] text-text-muted font-medium capitalize">{mode}</span>
          </div>
          <h2 className="text-[24px] font-bold text-text-primary tracking-[-0.03em] leading-[1.25] mb-2">
            {title}
          </h2>
          {subtitle && (
            <p className="text-[14px] text-text-secondary leading-[1.7]">
              {subtitle}
            </p>
          )}
        </motion.div>

        {/* Learner context */}
        {profile && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: isExiting ? 0 : 1, y: isExiting ? 8 : 0 }}
            transition={{ delay: 0.15, duration: 0.4 }}
            className="flex items-center gap-2 flex-wrap mb-6"
          >
            <span className="text-[13px] text-text-muted">Tailored for</span>
            <span className="text-[13px] text-text-primary font-medium bg-bg-pure border border-border px-2.5 py-0.5 rounded-md">
              {profile.targetLanguage}
            </span>
            <span className="text-[13px] text-text-primary font-medium bg-bg-pure border border-border px-2.5 py-0.5 rounded-md">
              {getDifficultyLevel(profile.difficultyLevel).label}
            </span>
            {profile.totalSessions > 0 && (
              <span className="text-[13px] text-text-muted">
                · {profile.totalSessions} session{profile.totalSessions !== 1 ? 's' : ''} completed
              </span>
            )}
          </motion.div>
        )}

        {/* Plan sections */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: isExiting ? 0 : 1, y: isExiting ? 8 : 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          className="flex flex-col gap-3 mb-8"
        >
          {sections.map((section, i) => (
            <div key={i} className="px-4 py-3.5 rounded-xl bg-bg-pure border border-border shadow-[0_1px_2px_rgba(0,0,0,.04)]">
              <div className="flex items-center gap-2 mb-2">
                <section.icon className="w-4 h-4 text-text-muted shrink-0" />
                <span className="text-[13px] font-semibold text-text-primary">{section.label}</span>
              </div>
              {section.type === 'text' && (
                <p className="text-[14px] text-text-secondary leading-[1.7] pl-6">{section.content}</p>
              )}
              {section.type === 'pills' && (
                <div className="flex flex-wrap gap-1.5 pl-6">
                  {section.items.map((item, j) => (
                    <span key={j} className="text-[13px] text-text-secondary bg-bg-secondary px-2.5 py-0.5 rounded-md">
                      {item}
                    </span>
                  ))}
                </div>
              )}
              {section.type === 'character' && (
                <div className="flex items-start gap-3 pl-6">
                  <div className="w-8 h-8 rounded-lg bg-accent-brand flex items-center justify-center text-white shrink-0 mt-0.5">
                    {section.avatar ? (
                      <span className="font-jp-clean text-[14px]">{section.avatar}</span>
                    ) : (
                      <UserIcon className="w-4 h-4" />
                    )}
                  </div>
                  <div>
                    <div className="text-[14px] font-medium text-text-primary">{section.name}</div>
                    <div className="text-[13px] text-text-muted leading-[1.5]">{section.desc}</div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </motion.div>

        {/* Steering messages */}
        {steerMessages.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-2 mb-6"
          >
            {steerMessages.map((msg, i) => (
              <div key={i} className="px-4 py-3 rounded-xl bg-green-soft border border-green-med">
                <div className="text-[13px] text-text-primary leading-[1.6]">{msg.text}</div>
                <div className="text-[11px] text-green font-medium mt-1 flex items-center gap-1">
                  &#10003; Will apply from turn one
                </div>
              </div>
            ))}
          </motion.div>
        )}

        {/* Adjust input */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: isExiting ? 0 : 1, y: isExiting ? 8 : 0 }}
          transition={{ delay: 0.3, duration: 0.4 }}
          className="mb-8"
        >
          <div className="text-[13px] font-medium text-text-muted mb-2">Adjust the plan</div>
          <div className="relative bg-bg-pure border border-border rounded-xl overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,.04),0_1px_4px_rgba(0,0,0,.03)] transition-[border-color,box-shadow] duration-150 focus-within:border-border-strong focus-within:shadow-[0_2px_8px_rgba(0,0,0,.06),0_1px_4px_rgba(0,0,0,.04)]">
            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={e => {
                setInputValue(e.target.value)
                e.target.style.height = 'auto'
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSteer() }
              }}
              rows={1}
              placeholder="e.g. make it more casual, focus on food vocabulary..."
              className="w-full px-4 py-3 pr-12 text-[14px] leading-[1.5] font-sans resize-none border-none outline-none bg-transparent placeholder:text-text-muted"
            />
            <button
              onClick={handleSteer}
              disabled={!inputValue.trim()}
              className="absolute right-2 bottom-2 w-8 h-8 rounded-lg border-none cursor-pointer bg-accent-brand flex items-center justify-center text-white transition-all hover:bg-[#111] disabled:pointer-events-none"
            >
              <ArrowUpIcon className="w-4 h-4" strokeWidth={2.5} />
            </button>
          </div>
        </motion.div>

        {/* Begin button */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: isExiting ? 0 : 1, y: isExiting ? 8 : 0 }}
          transition={{ delay: 0.4, duration: 0.4 }}
          className="flex flex-col items-center"
        >
          <button
            onClick={handleBegin}
            className="inline-flex items-center gap-2 px-8 py-3 rounded-xl bg-accent-brand text-white text-[14px] font-semibold border-none cursor-pointer transition-all hover:bg-[#111] hover:shadow-[0_6px_20px_rgba(0,0,0,.2)] hover:-translate-y-0.5 active:scale-[0.97]"
          >
            Begin conversation
            <ArrowRightIcon className="w-4 h-4" />
          </button>
          <p className="text-[12px] text-text-muted mt-3">
            Hold mic to speak · Corrections appear inline
          </p>
        </motion.div>
      </div>
    </motion.div>,
    document.body,
  )
}

// --- Section builder ---

type PlanSection =
  | { type: 'text'; icon: typeof UserIcon; label: string; content: string }
  | { type: 'pills'; icon: typeof UserIcon; label: string; items: string[] }
  | { type: 'character'; icon: typeof UserIcon; label: string; avatar: string; name: string; desc: string }

function buildPlanSections(plan: SessionPlan): PlanSection[] {
  const sections: PlanSection[] = []

  if (isConversationPlan(plan)) {
    // Character
    if (plan.persona) {
      const hasName = !!plan.persona.name
      const displayName = hasName
        ? plan.persona.name!
        : plan.persona.relationship.charAt(0).toUpperCase() + plan.persona.relationship.slice(1)
      const desc = hasName
        ? `${plan.persona.relationship} · ${plan.persona.personality}`
        : plan.persona.personality
      sections.push({
        type: 'character',
        icon: UserIcon,
        label: 'Character',
        avatar: hasName ? plan.persona.name!.charAt(0) : '',
        name: displayName,
        desc,
      })
    }

    // Style (register, tone)
    const stylePills: string[] = []
    if (plan.register) stylePills.push(plan.register)
    if (plan.tone) stylePills.push(plan.tone)
    if (stylePills.length > 0) {
      sections.push({
        type: 'pills',
        icon: ChatBubbleLeftIcon,
        label: 'Style',
        items: stylePills,
      })
    }

    // Direction
    if (plan.dynamic) {
      sections.push({
        type: 'text',
        icon: SparklesIcon,
        label: 'Direction',
        content: plan.dynamic,
      })
    }

    // Cultural context
    if (plan.culturalContext) {
      sections.push({
        type: 'text',
        icon: MapPinIcon,
        label: 'Cultural Context',
        content: plan.culturalContext,
      })
    }

    // Tension
    if (plan.tension) {
      sections.push({
        type: 'text',
        icon: LightBulbIcon,
        label: 'Challenge',
        content: plan.tension,
      })
    }
  } else if (isTutorPlan(plan)) {
    // Steps
    if (plan.steps.length > 0) {
      sections.push({
        type: 'pills',
        icon: ListBulletIcon,
        label: `${plan.steps.length} Lesson Steps`,
        items: plan.steps.map(s => s.title),
      })
    }

    // Concepts
    if (plan.concepts.length > 0) {
      sections.push({
        type: 'pills',
        icon: LightBulbIcon,
        label: 'Concepts',
        items: plan.concepts.map(c => c.label),
      })
    }

    // Exercise types
    if (plan.exerciseTypes && plan.exerciseTypes.length > 0) {
      sections.push({
        type: 'pills',
        icon: SparklesIcon,
        label: 'Exercise Types',
        items: plan.exerciseTypes,
      })
    }
  } else {
    // Immersion/reference fallback
    const base = plan as { focus?: string; goals?: string[]; approach?: string }
    if (base.goals && base.goals.length > 0) {
      sections.push({
        type: 'pills',
        icon: LightBulbIcon,
        label: 'Goals',
        items: base.goals,
      })
    }
    if (base.approach) {
      sections.push({
        type: 'text',
        icon: SparklesIcon,
        label: 'Approach',
        content: base.approach,
      })
    }
  }

  // Always show estimated time
  const isLesson = isTutorPlan(plan)
  sections.push({
    type: 'pills',
    icon: ClockIcon,
    label: 'Estimated',
    items: [isLesson ? '~15 min' : '~10 min'],
  })

  return sections
}
