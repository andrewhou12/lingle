import { useState, useCallback, useEffect } from 'react'
import {
  Flex,
  Text,
  Button,
  Card,
  RadioCards,
  Slider,
  Badge,
  Progress,
  Separator,
} from '@radix-ui/themes'
import { Check, ChevronRight, ChevronLeft, BookOpen, Languages, Target, Sparkles } from 'lucide-react'
import type { AssessmentItem, OnboardingResult, SelfReportedLevel } from '@shared/types'
import { useAuth } from '../../contexts/auth-context'

type Step = 'welcome' | 'language' | 'level' | 'assessment' | 'preferences' | 'complete'

const STEPS: Step[] = ['welcome', 'language', 'level', 'assessment', 'preferences', 'complete']

const isMac = window.platform === 'darwin'

export function OnboardingPage() {
  const { user, completeOnboarding } = useAuth()
  const [step, setStep] = useState<Step>('welcome')
  const [nativeLanguage, setNativeLanguage] = useState('English')
  const [selfReportedLevel, setSelfReportedLevel] = useState<SelfReportedLevel>('beginner')
  const [dailyNewItemLimit, setDailyNewItemLimit] = useState(10)
  const [assessmentItems, setAssessmentItems] = useState<AssessmentItem[]>([])
  const [knownItems, setKnownItems] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const stepIndex = STEPS.indexOf(step)
  const progress = ((stepIndex + 1) / STEPS.length) * 100

  const goNext = useCallback(() => {
    const idx = STEPS.indexOf(step)
    if (idx < STEPS.length - 1) setStep(STEPS[idx + 1])
  }, [step])

  const goBack = useCallback(() => {
    const idx = STEPS.indexOf(step)
    if (idx > 0) setStep(STEPS[idx - 1])
  }, [step])

  const handleLevelSelect = useCallback(
    (level: SelfReportedLevel) => {
      setSelfReportedLevel(level)
      setKnownItems(new Set())
      goNext()
    },
    [goNext]
  )

  // Load assessment items when entering the assessment step
  useEffect(() => {
    if (step !== 'assessment') return
    let cancelled = false
    setLoading(true)
    window.linguist
      .onboardingGetAssessment(selfReportedLevel)
      .then((items) => {
        if (!cancelled) setAssessmentItems(items)
      })
      .catch((err) => {
        console.error('Failed to load assessment items:', err)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [step, selfReportedLevel])

  const toggleKnown = useCallback((index: number) => {
    setKnownItems((prev) => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }, [])

  const handleComplete = useCallback(async () => {
    setSubmitting(true)
    try {
      const result: OnboardingResult = {
        targetLanguage: 'Japanese',
        nativeLanguage,
        selfReportedLevel,
        dailyNewItemLimit,
        knownItemIndices: Array.from(knownItems),
      }
      await window.linguist.onboardingComplete(result)
      completeOnboarding()
    } finally {
      setSubmitting(false)
    }
  }, [nativeLanguage, selfReportedLevel, dailyNewItemLimit, knownItems, completeOnboarding])

  return (
    <Flex
      direction="column"
      align="center"
      style={{ height: '100vh', overflow: 'auto' }}
    >
      {isMac && (
        <div
          className="titlebar-drag-region"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            height: 52,
            zIndex: 1,
          }}
        />
      )}

      <Flex
        direction="column"
        align="center"
        style={{ maxWidth: 600, width: '100%', padding: '80px 24px 48px' }}
        gap="5"
      >
        <Progress value={progress} size="1" style={{ width: '100%' }} />

        {step === 'welcome' && (
          <WelcomeStep name={user?.name ?? null} onNext={goNext} />
        )}

        {step === 'language' && (
          <LanguageStep
            nativeLanguage={nativeLanguage}
            onNativeLanguageChange={setNativeLanguage}
            onNext={goNext}
            onBack={goBack}
          />
        )}

        {step === 'level' && (
          <LevelStep onSelect={handleLevelSelect} onBack={goBack} />
        )}

        {step === 'assessment' && (
          <AssessmentStep
            items={assessmentItems}
            knownItems={knownItems}
            loading={loading}
            onToggle={toggleKnown}
            onNext={goNext}
            onBack={goBack}
          />
        )}

        {step === 'preferences' && (
          <PreferencesStep
            dailyNewItemLimit={dailyNewItemLimit}
            onDailyLimitChange={setDailyNewItemLimit}
            onNext={goNext}
            onBack={goBack}
          />
        )}

        {step === 'complete' && (
          <CompleteStep
            knownCount={knownItems.size}
            totalCount={assessmentItems.length}
            level={selfReportedLevel}
            submitting={submitting}
            onComplete={handleComplete}
            onBack={goBack}
          />
        )}
      </Flex>
    </Flex>
  )
}

function WelcomeStep({ name, onNext }: { name: string | null; onNext: () => void }) {
  return (
    <Card size="4" style={{ width: '100%' }}>
      <Flex direction="column" align="center" gap="5" p="4">
        <Flex
          align="center"
          justify="center"
          style={{
            width: 64,
            height: 64,
            borderRadius: 'var(--radius-4)',
            background: 'var(--accent-3)',
          }}
        >
          <Languages size={32} color="var(--accent-11)" />
        </Flex>
        <Flex direction="column" align="center" gap="2">
          <Text size="7" weight="bold">
            Welcome{name ? `, ${name.split(' ')[0]}` : ''}!
          </Text>
          <Text size="3" color="gray" align="center" style={{ maxWidth: 400 }}>
            Let's set up your personalized learning experience. We'll ask a few
            questions to understand your current level and tailor your study plan.
          </Text>
        </Flex>
        <Text size="2" color="gray" align="center">
          This takes about 2 minutes.
        </Text>
        <Button size="3" onClick={onNext} style={{ width: '100%', maxWidth: 300 }}>
          Get Started <ChevronRight size={16} />
        </Button>
      </Flex>
    </Card>
  )
}

function LanguageStep({
  nativeLanguage,
  onNativeLanguageChange,
  onNext,
  onBack,
}: {
  nativeLanguage: string
  onNativeLanguageChange: (lang: string) => void
  onNext: () => void
  onBack: () => void
}) {
  const languages = ['English', 'Spanish', 'French', 'German', 'Portuguese', 'Chinese', 'Korean', 'Other']

  return (
    <Card size="4" style={{ width: '100%' }}>
      <Flex direction="column" gap="5" p="4">
        <Flex direction="column" gap="2">
          <Text size="5" weight="bold">What's your native language?</Text>
          <Text size="2" color="gray">
            We'll use this to tailor explanations and detect L1 interference patterns.
          </Text>
        </Flex>

        <RadioCards.Root
          value={nativeLanguage}
          onValueChange={onNativeLanguageChange}
          columns={{ initial: '2', sm: '2' }}
        >
          {languages.map((lang) => (
            <RadioCards.Item key={lang} value={lang}>
              <Text weight="medium">{lang}</Text>
            </RadioCards.Item>
          ))}
        </RadioCards.Root>

        <Separator size="4" />

        <Flex direction="column" gap="2">
          <Text size="5" weight="bold">Target language</Text>
          <Card variant="surface">
            <Flex align="center" gap="3" p="1">
              <Text size="6">🇯🇵</Text>
              <Flex direction="column">
                <Text weight="medium">Japanese</Text>
                <Text size="1" color="gray">More languages coming in future versions</Text>
              </Flex>
            </Flex>
          </Card>
        </Flex>

        <Flex gap="3" justify="between">
          <Button variant="soft" onClick={onBack}>
            <ChevronLeft size={16} /> Back
          </Button>
          <Button onClick={onNext}>
            Continue <ChevronRight size={16} />
          </Button>
        </Flex>
      </Flex>
    </Card>
  )
}

function LevelStep({
  onSelect,
  onBack,
}: {
  onSelect: (level: SelfReportedLevel) => void
  onBack: () => void
}) {
  const levels: Array<{ value: SelfReportedLevel; label: string; description: string }> = [
    { value: 'beginner', label: 'Complete Beginner', description: 'Just starting out, little to no Japanese knowledge' },
    { value: 'N5', label: 'JLPT N5', description: 'Basic phrases, hiragana/katakana, ~100 kanji' },
    { value: 'N4', label: 'JLPT N4', description: 'Simple conversations, ~300 kanji, basic grammar' },
    { value: 'N3', label: 'JLPT N3', description: 'Everyday situations, ~600 kanji, intermediate grammar' },
    { value: 'N2', label: 'JLPT N2', description: 'Complex texts, ~1000 kanji, advanced grammar' },
    { value: 'N1', label: 'JLPT N1', description: 'Near-native comprehension, ~2000 kanji' },
  ]

  return (
    <Card size="4" style={{ width: '100%' }}>
      <Flex direction="column" gap="5" p="4">
        <Flex direction="column" gap="2">
          <Flex align="center" gap="2">
            <Target size={20} color="var(--accent-11)" />
            <Text size="5" weight="bold">What's your current level?</Text>
          </Flex>
          <Text size="2" color="gray">
            Don't worry about being exact — we'll fine-tune this with a quick vocabulary check next.
          </Text>
        </Flex>

        <Flex direction="column" gap="2">
          {levels.map((level) => (
            <div
              key={level.value}
              onClick={() => onSelect(level.value)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelect(level.value)
                }
              }}
              style={{
                cursor: 'pointer',
                padding: '12px 16px',
                borderRadius: 'var(--radius-2)',
                border: '1px solid var(--gray-6)',
                background: 'var(--color-surface)',
                transition: 'border-color 0.15s ease, background 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent-8)'
                e.currentTarget.style.background = 'var(--accent-2)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--gray-6)'
                e.currentTarget.style.background = 'var(--color-surface)'
              }}
            >
              <Flex align="center" justify="between" gap="3">
                <Flex direction="column" gap="1">
                  <Text weight="medium">{level.label}</Text>
                  <Text size="1" color="gray">{level.description}</Text>
                </Flex>
                <ChevronRight size={16} color="var(--gray-8)" />
              </Flex>
            </div>
          ))}
        </Flex>

        <Button variant="soft" onClick={onBack} style={{ alignSelf: 'flex-start' }}>
          <ChevronLeft size={16} /> Back
        </Button>
      </Flex>
    </Card>
  )
}

function AssessmentStep({
  items,
  knownItems,
  loading,
  onToggle,
  onNext,
  onBack,
}: {
  items: AssessmentItem[]
  knownItems: Set<number>
  loading: boolean
  onToggle: (index: number) => void
  onNext: () => void
  onBack: () => void
}) {
  const vocabItems = items.filter((i) => i.type === 'vocabulary')
  const grammarItems = items.filter((i) => i.type === 'grammar')

  return (
    <Card size="4" style={{ width: '100%' }}>
      <Flex direction="column" gap="5" p="4">
        <Flex direction="column" gap="2">
          <Flex align="center" gap="2">
            <BookOpen size={20} color="var(--accent-11)" />
            <Text size="5" weight="bold">Quick Vocabulary Check</Text>
          </Flex>
          <Text size="2" color="gray">
            Tap the items you already know. This helps us build your initial knowledge map.
          </Text>
        </Flex>

        {loading ? (
          <Flex align="center" justify="center" py="6">
            <Text color="gray">Loading assessment...</Text>
          </Flex>
        ) : (
          <>
            {vocabItems.length > 0 && (
              <Flex direction="column" gap="3">
                <Text size="3" weight="medium" color="gray">Vocabulary</Text>
                <Flex gap="2" wrap="wrap">
                  {vocabItems.map((item) => {
                    const isKnown = knownItems.has(item.index)
                    return (
                      <Button
                        key={item.index}
                        variant={isKnown ? 'solid' : 'outline'}
                        size="2"
                        onClick={() => onToggle(item.index)}
                        style={{
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {isKnown && <Check size={14} />}
                        <Flex direction="column" align="start" gap="0">
                          <Text size="2" weight="medium">{item.surfaceForm}</Text>
                          <Text size="1" style={{ opacity: 0.7 }}>{item.meaning}</Text>
                        </Flex>
                      </Button>
                    )
                  })}
                </Flex>
              </Flex>
            )}

            {grammarItems.length > 0 && (
              <Flex direction="column" gap="3">
                <Text size="3" weight="medium" color="gray">Grammar Patterns</Text>
                <Flex gap="2" wrap="wrap">
                  {grammarItems.map((item) => {
                    const isKnown = knownItems.has(item.index)
                    return (
                      <Button
                        key={item.index}
                        variant={isKnown ? 'solid' : 'outline'}
                        size="2"
                        onClick={() => onToggle(item.index)}
                        style={{
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {isKnown && <Check size={14} />}
                        <Flex direction="column" align="start" gap="0">
                          <Text size="2" weight="medium">{item.surfaceForm}</Text>
                          <Text size="1" style={{ opacity: 0.7 }}>{item.meaning}</Text>
                        </Flex>
                      </Button>
                    )
                  })}
                </Flex>
              </Flex>
            )}

            <Text size="1" color="gray" align="center">
              {knownItems.size} of {items.length} items marked as known
            </Text>
          </>
        )}

        <Flex gap="3" justify="between">
          <Button variant="soft" onClick={onBack}>
            <ChevronLeft size={16} /> Back
          </Button>
          <Button onClick={onNext}>
            Continue <ChevronRight size={16} />
          </Button>
        </Flex>
      </Flex>
    </Card>
  )
}

function PreferencesStep({
  dailyNewItemLimit,
  onDailyLimitChange,
  onNext,
  onBack,
}: {
  dailyNewItemLimit: number
  onDailyLimitChange: (limit: number) => void
  onNext: () => void
  onBack: () => void
}) {
  return (
    <Card size="4" style={{ width: '100%' }}>
      <Flex direction="column" gap="5" p="4">
        <Flex direction="column" gap="2">
          <Text size="5" weight="bold">Study Preferences</Text>
          <Text size="2" color="gray">
            You can always change these later in Settings.
          </Text>
        </Flex>

        <Flex direction="column" gap="3">
          <Flex justify="between" align="center">
            <Text size="3" weight="medium">New items per day</Text>
            <Badge size="2" variant="soft">{dailyNewItemLimit}</Badge>
          </Flex>
          <Slider
            value={[dailyNewItemLimit]}
            onValueChange={([v]) => onDailyLimitChange(v)}
            min={3}
            max={30}
            step={1}
          />
          <Flex justify="between">
            <Text size="1" color="gray">Light (3)</Text>
            <Text size="1" color="gray">Heavy (30)</Text>
          </Flex>
        </Flex>

        <Card variant="surface">
          <Flex direction="column" gap="2" p="2">
            <Text size="2" weight="medium">What this means</Text>
            <Text size="1" color="gray">
              Each day, up to {dailyNewItemLimit} new vocabulary and grammar items will be introduced
              alongside your review queue. A higher number means faster progress but requires more
              daily study time.
            </Text>
          </Flex>
        </Card>

        <Flex gap="3" justify="between">
          <Button variant="soft" onClick={onBack}>
            <ChevronLeft size={16} /> Back
          </Button>
          <Button onClick={onNext}>
            Continue <ChevronRight size={16} />
          </Button>
        </Flex>
      </Flex>
    </Card>
  )
}

function CompleteStep({
  knownCount,
  totalCount,
  level,
  submitting,
  onComplete,
  onBack,
}: {
  knownCount: number
  totalCount: number
  level: SelfReportedLevel
  submitting: boolean
  onComplete: () => void
  onBack: () => void
}) {
  const levelLabels: Record<SelfReportedLevel, string> = {
    beginner: 'Complete Beginner',
    N5: 'JLPT N5',
    N4: 'JLPT N4',
    N3: 'JLPT N3',
    N2: 'JLPT N2',
    N1: 'JLPT N1',
  }

  return (
    <Card size="4" style={{ width: '100%' }}>
      <Flex direction="column" align="center" gap="5" p="4">
        <Flex
          align="center"
          justify="center"
          style={{
            width: 64,
            height: 64,
            borderRadius: 'var(--radius-4)',
            background: 'var(--green-3)',
          }}
        >
          <Sparkles size={32} color="var(--green-11)" />
        </Flex>

        <Flex direction="column" align="center" gap="2">
          <Text size="6" weight="bold">You're all set!</Text>
          <Text size="3" color="gray" align="center" style={{ maxWidth: 400 }}>
            Your personalized learning profile has been created. Here's a summary:
          </Text>
        </Flex>

        <Card variant="surface" style={{ width: '100%' }}>
          <Flex direction="column" gap="3" p="3">
            <Flex justify="between">
              <Text size="2" color="gray">Level</Text>
              <Text size="2" weight="medium">{levelLabels[level]}</Text>
            </Flex>
            <Separator size="4" />
            <Flex justify="between">
              <Text size="2" color="gray">Known items</Text>
              <Text size="2" weight="medium">{knownCount} of {totalCount} assessed</Text>
            </Flex>
            <Separator size="4" />
            <Flex justify="between">
              <Text size="2" color="gray">Target language</Text>
              <Text size="2" weight="medium">Japanese 🇯🇵</Text>
            </Flex>
          </Flex>
        </Card>

        <Flex gap="3" style={{ width: '100%' }} direction="column">
          <Button
            size="3"
            onClick={onComplete}
            disabled={submitting}
            style={{ width: '100%', cursor: submitting ? 'wait' : 'pointer' }}
          >
            {submitting ? 'Setting up your profile...' : 'Start Learning'}
          </Button>
          <Button variant="soft" onClick={onBack} style={{ width: '100%' }} disabled={submitting}>
            <ChevronLeft size={16} /> Go Back
          </Button>
        </Flex>
      </Flex>
    </Card>
  )
}
