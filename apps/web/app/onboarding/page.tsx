'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { SUPPORTED_LANGUAGES } from '@/lib/languages'
import { cn } from '@/lib/utils'

/* ── Step data ── */

const LEARNING_GOALS = [
  { id: 'travel', icon: '✈️', label: 'Travel', desc: 'Navigate real-world situations abroad' },
  { id: 'work', icon: '💼', label: 'Career', desc: 'Business meetings, emails, interviews' },
  { id: 'exams', icon: '📝', label: 'Exams', desc: 'JLPT, TOPIK, HSK, DELE preparation' },
  { id: 'media', icon: '🎬', label: 'Media & Culture', desc: 'Anime, dramas, music, manga' },
  { id: 'fluency', icon: '🗣️', label: 'General Fluency', desc: 'Conversational confidence' },
  { id: 'academic', icon: '🎓', label: 'Academic', desc: 'University study, research' },
]

const LEVELS = [
  { id: 'complete_beginner', label: 'Complete Beginner', desc: 'I\'m just starting — no prior knowledge', cefr: 'Pre-A1', tag: 'New' },
  { id: 'beginner', label: 'Beginner', desc: 'I know basic greetings and simple phrases', cefr: 'A1', tag: 'N5' },
  { id: 'elementary', label: 'Elementary', desc: 'I can handle simple daily conversations', cefr: 'A2', tag: 'N4' },
  { id: 'intermediate', label: 'Intermediate', desc: 'I can express opinions on familiar topics', cefr: 'B1', tag: 'N3' },
  { id: 'upper_intermediate', label: 'Upper Intermediate', desc: 'I understand most native content with effort', cefr: 'B2', tag: 'N2' },
  { id: 'advanced', label: 'Advanced', desc: 'I can follow complex arguments and express nuance', cefr: 'C1', tag: 'N1' },
  { id: 'near_native', label: 'Near-Native', desc: 'I\'m fluent and want to master subtlety and register', cefr: 'C2', tag: 'C2' },
]

const LEVEL_TO_DIFFICULTY: Record<string, number> = {
  complete_beginner: 1,
  beginner: 1,
  elementary: 2,
  intermediate: 3,
  upper_intermediate: 4,
  advanced: 5,
  near_native: 6,
}

/* ── Step components ── */

function StepLanguage({ selected, onSelect }: { selected: string; onSelect: (id: string) => void }) {
  return (
    <div className="w-full max-w-[560px]">
      <h2 className="text-[28px] font-bold text-text-primary tracking-[-0.03em] mb-1.5">
        What language do you want to learn?
      </h2>
      <p className="text-[15px] text-text-secondary mb-8 leading-relaxed">
        You can always change this later.
      </p>
      <div className="grid grid-cols-2 gap-2.5">
        {SUPPORTED_LANGUAGES.map((lang) => (
          <button
            key={lang.id}
            onClick={() => onSelect(lang.id)}
            className={cn(
              "flex items-center gap-3.5 px-[18px] py-4 rounded-xl cursor-pointer transition-all duration-150 text-left border-[1.5px]",
              selected === lang.id
                ? "bg-bg-active border-accent-brand"
                : "bg-bg-pure border-border-subtle hover:border-border-strong"
            )}
          >
            <span className="text-[28px]">{lang.flag}</span>
            <div>
              <div className="text-[15px] font-semibold text-text-primary">{lang.label}</div>
              <div className="text-[13px] text-text-muted font-jp">{lang.nativeLabel}</div>
            </div>
            {selected === lang.id && (
              <div className="ml-auto w-[22px] h-[22px] rounded-full bg-accent-brand flex items-center justify-center text-white text-[12px] font-bold">
                ✓
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

function StepGoals({ selected, onToggle }: { selected: string[]; onToggle: (id: string) => void }) {
  return (
    <div className="w-full max-w-[560px]">
      <h2 className="text-[28px] font-bold text-text-primary tracking-[-0.03em] mb-1.5">
        What are your learning goals?
      </h2>
      <p className="text-[15px] text-text-secondary mb-8 leading-relaxed">
        Select all that apply — this helps us personalize your experience.
      </p>
      <div className="grid grid-cols-2 gap-2.5">
        {LEARNING_GOALS.map((goal) => {
          const active = selected.includes(goal.id)
          return (
            <button
              key={goal.id}
              onClick={() => onToggle(goal.id)}
              className={cn(
                "flex items-start gap-3 px-[18px] py-4 rounded-xl cursor-pointer transition-all duration-150 text-left border-[1.5px]",
                active
                  ? "bg-bg-active border-accent-brand"
                  : "bg-bg-pure border-border-subtle hover:border-border-strong"
              )}
            >
              <span className="text-[22px] leading-none mt-0.5">{goal.icon}</span>
              <div className="flex-1">
                <div className="text-[15px] font-semibold text-text-primary">{goal.label}</div>
                <div className="text-[13px] text-text-muted mt-0.5 leading-snug">{goal.desc}</div>
              </div>
              {active && (
                <div className="w-5 h-5 rounded-full bg-accent-brand flex items-center justify-center text-white text-[11px] font-bold shrink-0 mt-0.5">
                  ✓
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function StepLevel({ selected, onSelect }: { selected: string; onSelect: (id: string) => void }) {
  return (
    <div className="w-full max-w-[560px]">
      <h2 className="text-[28px] font-bold text-text-primary tracking-[-0.03em] mb-1.5">
        What&apos;s your current level?
      </h2>
      <p className="text-[15px] text-text-secondary mb-8 leading-relaxed">
        Don&apos;t worry about being exact — Lingle adapts as you go.
      </p>
      <div className="flex flex-col gap-2">
        {LEVELS.map((level) => {
          const active = selected === level.id
          return (
            <button
              key={level.id}
              onClick={() => onSelect(level.id)}
              className={cn(
                "flex items-center gap-3.5 px-5 py-4 rounded-xl cursor-pointer transition-all duration-150 text-left w-full border-[1.5px]",
                active
                  ? "bg-bg-active border-accent-brand"
                  : "bg-bg-pure border-border-subtle hover:border-border-strong"
              )}
            >
              <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center text-[11px] font-bold tracking-[.02em] shrink-0 border",
                active
                  ? "bg-accent-brand border-accent-brand text-white"
                  : "bg-bg-secondary border-border-subtle text-text-muted"
              )}>
                {level.tag}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[15px] font-semibold text-text-primary">{level.label}</span>
                  <span className="text-[11px] font-semibold text-text-muted bg-bg-secondary px-1.5 py-0.5 rounded-md border border-border-subtle">
                    {level.cefr}
                  </span>
                </div>
                <div className="text-[13px] text-text-secondary mt-0.5">{level.desc}</div>
              </div>
              {active && (
                <div className="w-[22px] h-[22px] rounded-full bg-accent-brand flex items-center justify-center text-white text-[12px] font-bold shrink-0">
                  ✓
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function StepPreparing({ language }: { language: string }) {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const steps = [
      { target: 30, delay: 200 },
      { target: 60, delay: 800 },
      { target: 85, delay: 1400 },
      { target: 100, delay: 2000 },
    ]
    const timers = steps.map(({ target, delay }) =>
      setTimeout(() => setProgress(target), delay)
    )
    return () => timers.forEach(clearTimeout)
  }, [])

  const lang = SUPPORTED_LANGUAGES.find(l => l.id === language)

  const checklist = [
    { label: 'Calibrating difficulty level', done: progress >= 30 },
    { label: 'Building your curriculum', done: progress >= 60 },
    { label: 'Preparing conversation partner', done: progress >= 85 },
    { label: 'Ready to go!', done: progress >= 100 },
  ]

  return (
    <div className="w-full max-w-[480px] flex flex-col items-center text-center">
      <div className="w-[72px] h-[72px] rounded-2xl bg-bg-secondary border border-border-subtle flex items-center justify-center text-[36px] mb-6 shadow-md">
        {lang?.flag || '🌍'}
      </div>
      <h2 className="text-[28px] font-bold text-text-primary tracking-[-0.03em] mb-2">
        Your learning experience<br />is almost ready!
      </h2>
      <p className="text-[15px] text-text-secondary mb-10 leading-relaxed">
        Setting up your personalized {language} experience...
      </p>

      {/* Progress bar */}
      <div className="w-full max-w-[320px] h-2 bg-bg-active rounded-full overflow-hidden mb-5">
        <div
          className="h-full rounded-full bg-accent-brand transition-[width] duration-[600ms] ease-[cubic-bezier(.4,0,.2,1)]"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="flex flex-col gap-3 w-full max-w-[320px]">
        {checklist.map((item) => (
          <div
            key={item.label}
            className={cn(
              "flex items-center gap-2.5 text-[13px] transition-colors duration-300",
              item.done ? "text-text-primary" : "text-text-muted"
            )}
          >
            <div className={cn(
              "w-[18px] h-[18px] rounded-full flex items-center justify-center text-[11px] font-bold transition-all duration-300 shrink-0 border",
              item.done
                ? "bg-accent-brand border-accent-brand text-white"
                : "bg-bg-active border-border-subtle text-transparent"
            )}>
              ✓
            </div>
            {item.label}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Progress dots ── */

function ProgressDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex gap-1.5 items-center">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={cn(
            "h-2 rounded transition-all duration-300 ease-[cubic-bezier(.4,0,.2,1)]",
            i === current ? "w-6 bg-accent-brand" : i < current ? "w-2 bg-text-muted" : "w-2 bg-bg-active"
          )}
        />
      ))}
    </div>
  )
}

/* ── Main page ── */

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [language, setLanguage] = useState('')
  const [goals, setGoals] = useState<string[]>([])
  const [level, setLevel] = useState('')
  const [transitioning, setTransitioning] = useState(false)

  // Redirect if user already has a profile
  useEffect(() => {
    fetch('/api/profile').then(r => r.json()).then(profile => {
      if (profile) router.replace('/conversation')
    }).catch(() => {})
  }, [router])

  const totalSteps = 4

  const canAdvance = step === 0 ? !!language : step === 1 ? goals.length > 0 : step === 2 ? !!level : true

  const toggleGoal = useCallback((id: string) => {
    setGoals(prev => prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id])
  }, [])

  const goNext = useCallback(async () => {
    if (step < 3) {
      setTransitioning(true)
      setTimeout(() => {
        setStep(s => s + 1)
        setTransitioning(false)
      }, 200)
    }

    // When reaching preparing step, create profile
    if (step === 2) {
      try {
        await fetch('/api/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetLanguage: language,
            nativeLanguage: 'English',
            selfReportedLevel: level,
            difficultyLevel: LEVEL_TO_DIFFICULTY[level] || 2,
            goals,
          }),
        })
      } catch (err) {
        console.error('Failed to create profile:', err)
      }

      // Redirect after preparing animation
      setTimeout(() => {
        router.push('/conversation')
      }, 2800)
    }
  }, [step, language, level, goals, router])

  const goBack = useCallback(() => {
    if (step > 0) {
      setTransitioning(true)
      setTimeout(() => {
        setStep(s => s - 1)
        setTransitioning(false)
      }, 200)
    }
  }, [step])

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-8 h-[54px] border-b border-border-subtle">
        <div className="flex items-center gap-2">
          <div className="w-[30px] h-[30px] bg-accent-brand rounded-lg flex items-center justify-center shadow-[0_1px_3px_rgba(0,0,0,.2),inset_0_1px_0_rgba(255,255,255,.08)]">
            <svg width="17" height="17" viewBox="0 0 32 32" fill="none">
              <path d="M24 4C24 4, 18 7, 14 12C10 17, 8 23, 8 28C9 26, 11 21, 14 16C17 11, 21 7, 24 4Z" stroke="white" strokeWidth="2.2" strokeLinejoin="round" fill="none"/>
              <path d="M24 4C24 4, 27 9, 24 15C21 21, 16 26, 11 29C13 25, 17 20, 20 15C23 10, 26 7, 24 4Z" stroke="white" strokeWidth="2.2" strokeLinejoin="round" fill="none"/>
            </svg>
          </div>
          <span className="font-serif text-[18px] font-normal italic text-text-primary tracking-[-0.03em]">
            Lingle
          </span>
        </div>
        <ProgressDots current={step} total={totalSteps} />
        <div className="w-20" /> {/* Spacer for centering */}
      </header>

      {/* Content */}
      <div
        className={cn(
          "flex-1 flex flex-col items-center justify-center px-6 py-10 transition-all duration-200 ease-out",
          transitioning ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0"
        )}
      >
        {step === 0 && <StepLanguage selected={language} onSelect={setLanguage} />}
        {step === 1 && <StepGoals selected={goals} onToggle={toggleGoal} />}
        {step === 2 && <StepLevel selected={level} onSelect={setLevel} />}
        {step === 3 && <StepPreparing language={language} />}
      </div>

      {/* Footer navigation */}
      {step < 3 && (
        <footer className="flex items-center justify-between px-8 py-4 border-t border-border-subtle">
          <button
            onClick={goBack}
            disabled={step === 0}
            className={cn(
              "text-[14px] bg-transparent border-none px-4 py-2 rounded-lg transition-colors duration-150",
              step === 0
                ? "text-text-muted cursor-default"
                : "text-text-secondary cursor-pointer hover:text-text-primary hover:bg-bg-hover"
            )}
          >
            Back
          </button>
          <button
            onClick={goNext}
            disabled={!canAdvance}
            className={cn(
              "text-[15px] font-semibold border-none rounded-xl px-8 py-3 transition-all duration-150",
              canAdvance
                ? "text-white bg-accent-brand cursor-pointer shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-[0.98]"
                : "text-text-muted bg-bg-active cursor-default"
            )}
          >
            {step === 2 ? 'Finish setup' : 'Continue'}
          </button>
        </footer>
      )}
    </div>
  )
}
