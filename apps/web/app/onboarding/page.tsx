'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { SUPPORTED_LANGUAGES } from '@/lib/languages'

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
  { id: 'complete_beginner', label: 'Complete Beginner', desc: 'I\'m just starting — no prior knowledge', detail: 'Starting from zero', cefr: 'Pre-A1', tag: 'New' },
  { id: 'beginner', label: 'Beginner', desc: 'I know basic greetings and simple phrases', detail: 'Can introduce yourself, say hello/goodbye', cefr: 'A1', tag: 'N5' },
  { id: 'elementary', label: 'Elementary', desc: 'I can handle simple daily conversations', detail: 'Basic grammar, ~300 vocabulary', cefr: 'A2', tag: 'N4' },
  { id: 'intermediate', label: 'Intermediate', desc: 'I can express opinions on familiar topics', detail: 'Can read simple texts, hold conversations', cefr: 'B1', tag: 'N3' },
  { id: 'upper_intermediate', label: 'Upper Intermediate', desc: 'I understand most native content with effort', detail: 'Complex grammar, ~3000 vocabulary', cefr: 'B2', tag: 'N2' },
  { id: 'advanced', label: 'Advanced', desc: 'I\'m near-fluent and want to refine nuance', detail: 'Idiomatic expressions, nuance, register', cefr: 'C1', tag: 'N1' },
]

const LEVEL_TO_DIFFICULTY: Record<string, number> = {
  complete_beginner: 1,
  beginner: 1,
  elementary: 2,
  intermediate: 3,
  upper_intermediate: 4,
  advanced: 5,
}

/* ── Step components ── */

function StepLanguage({ selected, onSelect }: { selected: string; onSelect: (id: string) => void }) {
  return (
    <div style={{ width: '100%', maxWidth: 560 }}>
      <h2 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-.03em', marginBottom: 6 }}>
        What language do you want to learn?
      </h2>
      <p style={{ fontSize: 15, color: 'var(--text-secondary)', marginBottom: 32, lineHeight: 1.6 }}>
        You can always change this later.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
        {SUPPORTED_LANGUAGES.map((lang) => (
          <button
            key={lang.id}
            onClick={() => onSelect(lang.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '16px 18px',
              background: selected === lang.id ? 'var(--bg-active)' : 'var(--bg-pure)',
              border: `1.5px solid ${selected === lang.id ? 'var(--accent-brand)' : 'var(--border-subtle)'}`,
              borderRadius: 14,
              cursor: 'pointer',
              transition: 'all .15s',
              textAlign: 'left',
            }}
          >
            <span style={{ fontSize: 28 }}>{lang.flag}</span>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{lang.label}</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: 'var(--font-jp)' }}>{lang.nativeLabel}</div>
            </div>
            {selected === lang.id && (
              <div style={{
                marginLeft: 'auto',
                width: 22, height: 22, borderRadius: '50%',
                background: 'var(--accent-brand)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: 12, fontWeight: 700,
              }}>✓</div>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

function StepGoals({ selected, onToggle }: { selected: string[]; onToggle: (id: string) => void }) {
  return (
    <div style={{ width: '100%', maxWidth: 560 }}>
      <h2 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-.03em', marginBottom: 6 }}>
        What are your learning goals?
      </h2>
      <p style={{ fontSize: 15, color: 'var(--text-secondary)', marginBottom: 32, lineHeight: 1.6 }}>
        Select all that apply — this helps us personalize your experience.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
        {LEARNING_GOALS.map((goal) => {
          const active = selected.includes(goal.id)
          return (
            <button
              key={goal.id}
              onClick={() => onToggle(goal.id)}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 12,
                padding: '16px 18px',
                background: active ? 'var(--bg-active)' : 'var(--bg-pure)',
                border: `1.5px solid ${active ? 'var(--accent-brand)' : 'var(--border-subtle)'}`,
                borderRadius: 14,
                cursor: 'pointer',
                transition: 'all .15s',
                textAlign: 'left',
              }}
            >
              <span style={{ fontSize: 22, lineHeight: 1, marginTop: 2 }}>{goal.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{goal.label}</div>
                <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.4 }}>{goal.desc}</div>
              </div>
              {active && (
                <div style={{
                  width: 20, height: 20, borderRadius: '50%',
                  background: 'var(--accent-brand)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontSize: 11, fontWeight: 700, flexShrink: 0, marginTop: 2,
                }}>✓</div>
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
    <div style={{ width: '100%', maxWidth: 560 }}>
      <h2 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-.03em', marginBottom: 6 }}>
        What&apos;s your current level?
      </h2>
      <p style={{ fontSize: 15, color: 'var(--text-secondary)', marginBottom: 32, lineHeight: 1.6 }}>
        Don&apos;t worry about being exact — Lingle adapts as you go.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {LEVELS.map((level) => {
          const active = selected === level.id
          return (
            <button
              key={level.id}
              onClick={() => onSelect(level.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '16px 20px',
                background: active ? 'var(--bg-active)' : 'var(--bg-pure)',
                border: `1.5px solid ${active ? 'var(--accent-brand)' : 'var(--border-subtle)'}`,
                borderRadius: 14,
                cursor: 'pointer',
                transition: 'all .15s',
                textAlign: 'left',
                width: '100%',
              }}
            >
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: active ? 'var(--accent-brand)' : 'var(--bg-secondary)',
                border: `1px solid ${active ? 'var(--accent-brand)' : 'var(--border-subtle)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700,
                color: active ? '#fff' : 'var(--text-muted)',
                letterSpacing: '.02em', flexShrink: 0,
              }}>
                {level.tag}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{level.label}</span>
                  <span style={{
                    fontSize: 10.5, fontWeight: 600, color: 'var(--text-muted)',
                    background: 'var(--bg-secondary)', padding: '2px 6px', borderRadius: 4,
                    border: '1px solid var(--border-subtle)',
                  }}>{level.cefr}</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 3 }}>{level.desc}</div>
              </div>
              {active && (
                <div style={{
                  width: 22, height: 22, borderRadius: '50%',
                  background: 'var(--accent-brand)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontSize: 12, fontWeight: 700, flexShrink: 0,
                }}>✓</div>
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

  return (
    <div style={{
      width: '100%', maxWidth: 480,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      textAlign: 'center',
    }}>
      <div style={{
        width: 72, height: 72, borderRadius: 20,
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-subtle)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 36, marginBottom: 24,
        boxShadow: '0 4px 16px rgba(0,0,0,.06)',
      }}>
        {lang?.flag || '🌍'}
      </div>
      <h2 style={{
        fontSize: 28, fontWeight: 700, color: 'var(--text-primary)',
        letterSpacing: '-.03em', marginBottom: 8,
      }}>
        Your learning experience<br />is almost ready!
      </h2>
      <p style={{ fontSize: 15, color: 'var(--text-secondary)', marginBottom: 40, lineHeight: 1.6 }}>
        Setting up your personalized {language} experience...
      </p>

      {/* Progress bar */}
      <div style={{
        width: '100%', maxWidth: 320, height: 6,
        background: 'var(--bg-active)', borderRadius: 6, overflow: 'hidden',
        marginBottom: 20,
      }}>
        <div style={{
          height: '100%', borderRadius: 6,
          background: 'var(--accent-brand)',
          width: `${progress}%`,
          transition: 'width .6s cubic-bezier(.4,0,.2,1)',
        }} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 320 }}>
        {[
          { label: 'Calibrating difficulty level', done: progress >= 30 },
          { label: 'Building your curriculum', done: progress >= 60 },
          { label: 'Preparing conversation partner', done: progress >= 85 },
          { label: 'Ready to go!', done: progress >= 100 },
        ].map((item) => (
          <div key={item.label} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            fontSize: 13.5, color: item.done ? 'var(--text-primary)' : 'var(--text-muted)',
            transition: 'color .3s',
          }}>
            <div style={{
              width: 18, height: 18, borderRadius: '50%',
              background: item.done ? 'var(--accent-brand)' : 'var(--bg-active)',
              border: `1px solid ${item.done ? 'var(--accent-brand)' : 'var(--border-subtle)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: 10, fontWeight: 700,
              transition: 'all .3s', flexShrink: 0,
            }}>
              {item.done ? '✓' : ''}
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
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          style={{
            width: i === current ? 24 : 8,
            height: 8,
            borderRadius: 4,
            background: i === current ? 'var(--accent-brand)' : i < current ? 'var(--text-muted)' : 'var(--bg-active)',
            transition: 'all .3s cubic-bezier(.4,0,.2,1)',
          }}
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
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 32px', height: 54,
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 30, height: 30, background: 'var(--accent-brand)', borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="17" height="17" viewBox="0 0 32 32" fill="none">
              <path d="M24 4C24 4, 18 7, 14 12C10 17, 8 23, 8 28C9 26, 11 21, 14 16C17 11, 21 7, 24 4Z" stroke="white" strokeWidth="2.2" strokeLinejoin="round" fill="none"/>
              <path d="M24 4C24 4, 27 9, 24 15C21 21, 16 26, 11 29C13 25, 17 20, 20 15C23 10, 26 7, 24 4Z" stroke="white" strokeWidth="2.2" strokeLinejoin="round" fill="none"/>
            </svg>
          </div>
          <span style={{
            fontFamily: 'var(--font-serif)', fontSize: 18, fontWeight: 400,
            fontStyle: 'italic', color: 'var(--text-primary)',
          }}>Lingle</span>
        </div>
        <ProgressDots current={step} total={totalSteps} />
        <div style={{ width: 80 }} /> {/* Spacer for centering */}
      </header>

      {/* Content */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 24px',
        opacity: transitioning ? 0 : 1,
        transform: transitioning ? 'translateY(8px)' : 'translateY(0)',
        transition: 'opacity .2s ease, transform .2s ease',
      }}>
        {step === 0 && <StepLanguage selected={language} onSelect={setLanguage} />}
        {step === 1 && <StepGoals selected={goals} onToggle={toggleGoal} />}
        {step === 2 && <StepLevel selected={level} onSelect={setLevel} />}
        {step === 3 && <StepPreparing language={language} />}
      </div>

      {/* Footer navigation */}
      {step < 3 && (
        <footer style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 32px',
          borderTop: '1px solid var(--border-subtle)',
        }}>
          <button
            onClick={goBack}
            disabled={step === 0}
            style={{
              fontFamily: 'var(--font-sans)', fontSize: 14,
              color: step === 0 ? 'var(--text-muted)' : 'var(--text-secondary)',
              background: 'transparent', border: 'none',
              padding: '8px 16px', borderRadius: 8,
              cursor: step === 0 ? 'default' : 'pointer',
              transition: 'color .15s',
            }}
          >
            Back
          </button>
          <button
            onClick={goNext}
            disabled={!canAdvance}
            style={{
              fontFamily: 'var(--font-sans)', fontSize: 14, fontWeight: 600,
              color: canAdvance ? '#fff' : 'var(--text-muted)',
              background: canAdvance ? 'var(--accent-brand)' : 'var(--bg-active)',
              border: 'none',
              borderRadius: 10, padding: '10px 28px',
              cursor: canAdvance ? 'pointer' : 'default',
              transition: 'all .15s',
              boxShadow: canAdvance ? '0 1px 3px rgba(0,0,0,.15)' : 'none',
            }}
          >
            {step === 2 ? 'Finish setup' : 'Continue'}
          </button>
        </footer>
      )}
    </div>
  )
}
