'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Slider } from '@/components/ui/slider'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Check, ChevronRight, ChevronLeft, BookOpen, Languages, Target, Sparkles, Keyboard, FileText, X } from 'lucide-react'
import type {
  AssessmentItem,
  ReadingChallengeItem,
  ComprehensionItem,
  OnboardingResult,
  ReadingChallengeResult,
  ComprehensionResult,
  SelfReportedLevel,
} from '@linguist/shared/types'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

type Step = 'welcome' | 'language' | 'level' | 'assessment' | 'reading_challenge' | 'comprehension' | 'preferences' | 'complete'
const STEPS: Step[] = ['welcome', 'language', 'level', 'assessment', 'reading_challenge', 'comprehension', 'preferences', 'complete']

const primaryBtnClass = "inline-flex items-center gap-2 py-2.5 px-5 rounded-md bg-accent-brand text-white text-sm font-medium border-none cursor-pointer transition-opacity duration-150"
const softBtnClass = "inline-flex items-center gap-2 py-2.5 px-5 rounded-md bg-bg-secondary text-text-secondary text-sm font-medium border-none cursor-pointer transition-colors duration-150 hover:bg-bg-hover"
const cardClass = "w-full rounded-xl border border-border bg-bg p-8"

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('welcome')
  const [nativeLanguage, setNativeLanguage] = useState('English')
  const [selfReportedLevel, setSelfReportedLevel] = useState<SelfReportedLevel>('beginner')
  const [dailyNewItemLimit, setDailyNewItemLimit] = useState(10)
  const [assessmentItems, setAssessmentItems] = useState<AssessmentItem[]>([])
  const [knownItems, setKnownItems] = useState<Set<number>>(new Set())
  const [readingItems, setReadingItems] = useState<ReadingChallengeItem[]>([])
  const [readingResults, setReadingResults] = useState<ReadingChallengeResult[]>([])
  const [comprehensionItems, setComprehensionItems] = useState<ComprehensionItem[]>([])
  const [comprehensionResults, setComprehensionResults] = useState<ComprehensionResult[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [computedLevel, setComputedLevel] = useState<string | null>(null)

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
      setReadingResults([])
      setComprehensionResults([])
      goNext()
    },
    [goNext]
  )

  useEffect(() => {
    if (step !== 'assessment') return
    let cancelled = false
    setLoading(true)
    api.onboardingGetAssessment(selfReportedLevel)
      .then((items) => { if (!cancelled) setAssessmentItems(items) })
      .catch((err) => console.error('Failed to load assessment items:', err))
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [step, selfReportedLevel])

  useEffect(() => {
    if (step !== 'reading_challenge') return
    let cancelled = false
    setLoading(true)
    api.onboardingGetReadingChallenge(selfReportedLevel)
      .then((items) => { if (!cancelled) setReadingItems(items) })
      .catch((err) => console.error('Failed to load reading challenge:', err))
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [step, selfReportedLevel])

  useEffect(() => {
    if (step !== 'comprehension') return
    let cancelled = false
    setLoading(true)
    api.onboardingGetComprehension(selfReportedLevel)
      .then((items) => { if (!cancelled) setComprehensionItems(items) })
      .catch((err) => console.error('Failed to load comprehension items:', err))
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [step, selfReportedLevel])

  const toggleKnown = useCallback((index: number) => {
    setKnownItems((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }, [])

  const handleSubmitOnboarding = useCallback(async () => {
    setSubmitting(true)
    try {
      const result: OnboardingResult = {
        targetLanguage: 'Japanese',
        nativeLanguage,
        selfReportedLevel,
        dailyNewItemLimit,
        knownItemIndices: Array.from(knownItems),
        readingChallengeResults: readingResults,
        comprehensionResults,
      }
      const { computedLevel: level } = await api.onboardingComplete(result)
      setComputedLevel(level)
    } finally {
      setSubmitting(false)
    }
  }, [nativeLanguage, selfReportedLevel, dailyNewItemLimit, knownItems, readingResults, comprehensionResults])

  useEffect(() => {
    if (step === 'complete' && !computedLevel && !submitting) {
      handleSubmitOnboarding()
    }
  }, [step, computedLevel, submitting, handleSubmitOnboarding])

  const readingCorrect = readingResults.filter((r) => r.correct).length

  return (
    <div className="flex flex-col items-center h-screen overflow-auto bg-bg">
      <div className="flex flex-col items-center max-w-[600px] w-full pt-20 px-6 pb-12 gap-6">
        {/* Progress bar */}
        <div className="w-full h-1 rounded-sm bg-bg-active overflow-hidden">
          <div className="h-full rounded-sm bg-accent-brand transition-[width] duration-300 ease-out" style={{ width: `${progress}%` }} />
        </div>

        {step === 'welcome' && <WelcomeStep onNext={goNext} />}
        {step === 'language' && (
          <LanguageStep
            nativeLanguage={nativeLanguage}
            onNativeLanguageChange={setNativeLanguage}
            onNext={goNext}
            onBack={goBack}
          />
        )}
        {step === 'level' && <LevelStep onSelect={handleLevelSelect} onBack={goBack} />}
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
        {step === 'reading_challenge' && (
          <ReadingChallengeStep
            items={readingItems}
            loading={loading}
            onComplete={(results) => { setReadingResults(results); goNext() }}
            onBack={goBack}
          />
        )}
        {step === 'comprehension' && (
          <ComprehensionStep
            items={comprehensionItems}
            loading={loading}
            onComplete={(results) => { setComprehensionResults(results); goNext() }}
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
            readingCorrect={readingCorrect}
            readingTotal={readingResults.length}
            comprehensionCount={comprehensionResults.length}
            selfReportedLevel={selfReportedLevel}
            computedLevel={computedLevel}
            submitting={submitting}
            onComplete={() => router.push('/dashboard')}
            onBack={goBack}
          />
        )}
      </div>
    </div>
  )
}

// -- Welcome --

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className={cardClass}>
      <div className="flex flex-col items-center gap-6">
        <div className="w-16 h-16 rounded-xl bg-bg-secondary flex items-center justify-center">
          <Languages size={32} className="text-accent-brand" />
        </div>
        <div className="flex flex-col items-center gap-2">
          <span className="text-[28px] font-bold">Welcome!</span>
          <span className="text-[15px] text-text-muted text-center max-w-[400px]">
            Let&apos;s set up your personalized learning experience. We&apos;ll ask a few
            questions to understand your current level and tailor your study plan.
          </span>
        </div>
        <span className="text-[13px] text-text-muted text-center">This takes about 3--4 minutes.</span>
        <button className={cn(primaryBtnClass, "w-full max-w-[300px] justify-center")} onClick={onNext}>
          Get Started <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )
}

// -- Language --

function LanguageStep({
  nativeLanguage, onNativeLanguageChange, onNext, onBack,
}: { nativeLanguage: string; onNativeLanguageChange: (l: string) => void; onNext: () => void; onBack: () => void }) {
  const languages = ['English', 'Spanish', 'French', 'German', 'Portuguese', 'Chinese', 'Korean', 'Other']
  return (
    <div className={cardClass}>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <span className="text-[22px] font-bold">What&apos;s your native language?</span>
          <span className="text-[13px] text-text-muted">We&apos;ll use this to tailor explanations and detect L1 interference patterns.</span>
        </div>
        <RadioGroup value={nativeLanguage} onValueChange={onNativeLanguageChange} className="grid grid-cols-2 gap-2">
          {languages.map((lang) => (
            <label
              key={lang}
              className={cn(
                "flex items-center gap-3 cursor-pointer rounded-md border py-3 px-4 transition-colors duration-150",
                nativeLanguage === lang ? "border-accent-brand bg-accent-brand/5" : "border-border bg-bg hover:bg-bg-secondary"
              )}
            >
              <RadioGroupItem value={lang} className="sr-only" />
              <span className="font-medium">{lang}</span>
            </label>
          ))}
        </RadioGroup>
        <hr className="border-t border-border m-0" />
        <div className="flex flex-col gap-2">
          <span className="text-[22px] font-bold">Target language</span>
          <div className="rounded-lg border border-border bg-bg-secondary p-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🇯🇵</span>
              <div className="flex flex-col">
                <span className="font-medium">Japanese</span>
                <span className="text-[11px] text-text-muted">More languages coming in future versions</span>
              </div>
            </div>
          </div>
        </div>
        <div className="flex gap-3 justify-between">
          <button className={softBtnClass} onClick={onBack}><ChevronLeft size={16} /> Back</button>
          <button className={primaryBtnClass} onClick={onNext}>Continue <ChevronRight size={16} /></button>
        </div>
      </div>
    </div>
  )
}

// -- Level --

function LevelStep({ onSelect, onBack }: { onSelect: (l: SelfReportedLevel) => void; onBack: () => void }) {
  const levels: Array<{ value: SelfReportedLevel; label: string; description: string }> = [
    { value: 'beginner', label: 'Complete Beginner', description: 'Just starting out, little to no Japanese knowledge' },
    { value: 'N5', label: 'JLPT N5', description: 'Basic phrases, hiragana/katakana, ~100 kanji' },
    { value: 'N4', label: 'JLPT N4', description: 'Simple conversations, ~300 kanji, basic grammar' },
    { value: 'N3', label: 'JLPT N3', description: 'Everyday situations, ~600 kanji, intermediate grammar' },
    { value: 'N2', label: 'JLPT N2', description: 'Complex texts, ~1000 kanji, advanced grammar' },
    { value: 'N1', label: 'JLPT N1', description: 'Near-native comprehension, ~2000 kanji' },
  ]
  return (
    <div className={cardClass}>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Target size={20} className="text-accent-brand" />
            <span className="text-[22px] font-bold">What&apos;s your current level?</span>
          </div>
          <span className="text-[13px] text-text-muted">Don&apos;t worry about being exact — we&apos;ll fine-tune this with a few challenges next.</span>
        </div>
        <div className="flex flex-col gap-2">
          {levels.map((level) => (
            <div
              key={level.value}
              onClick={() => onSelect(level.value)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(level.value) } }}
              className="cursor-pointer py-3 px-4 rounded-md border border-border bg-bg transition-colors duration-150 hover:border-border-strong hover:bg-bg-secondary"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <span className="font-medium">{level.label}</span>
                  <span className="text-[11px] text-text-muted">{level.description}</span>
                </div>
                <ChevronRight size={16} className="text-text-muted" />
              </div>
            </div>
          ))}
        </div>
        <button className={cn(softBtnClass, "self-start")} onClick={onBack}>
          <ChevronLeft size={16} /> Back
        </button>
      </div>
    </div>
  )
}

// -- Vocabulary Assessment --

function AssessmentStep({
  items, knownItems, loading, onToggle, onNext, onBack,
}: { items: AssessmentItem[]; knownItems: Set<number>; loading: boolean; onToggle: (i: number) => void; onNext: () => void; onBack: () => void }) {
  const vocabItems = items.filter((i) => i.type === 'vocabulary')
  const grammarItems = items.filter((i) => i.type === 'grammar')
  return (
    <div className={cardClass}>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <BookOpen size={20} className="text-accent-brand" />
            <span className="text-[22px] font-bold">Quick Vocabulary Check</span>
          </div>
          <span className="text-[13px] text-text-muted">Tap the items you already know. This helps us build your initial knowledge map.</span>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <span className="text-text-muted">Loading assessment...</span>
          </div>
        ) : (
          <>
            {vocabItems.length > 0 && (
              <div className="flex flex-col gap-3">
                <span className="text-sm font-medium text-text-muted">Vocabulary</span>
                <div className="flex gap-2 flex-wrap">
                  {vocabItems.map((item) => {
                    const isKnown = knownItems.has(item.index)
                    return (
                      <button
                        key={item.index}
                        onClick={() => onToggle(item.index)}
                        className={cn(
                          "inline-flex items-center gap-1.5 py-3 px-4 rounded-md border cursor-pointer transition-all duration-150",
                          isKnown
                            ? "border-accent-brand bg-accent-brand text-white"
                            : "border-border bg-bg text-text-primary"
                        )}
                      >
                        {isKnown && <Check size={14} />}
                        <div className="flex flex-col items-start gap-0.5">
                          <span className="text-[13px] font-medium">{item.surfaceForm}</span>
                          <span className="text-[11px] opacity-70">{item.meaning}</span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
            {grammarItems.length > 0 && (
              <div className="flex flex-col gap-3">
                <span className="text-sm font-medium text-text-muted">Grammar Patterns</span>
                <div className="flex gap-2 flex-wrap">
                  {grammarItems.map((item) => {
                    const isKnown = knownItems.has(item.index)
                    return (
                      <button
                        key={item.index}
                        onClick={() => onToggle(item.index)}
                        className={cn(
                          "inline-flex items-center gap-1.5 py-3 px-4 rounded-md border cursor-pointer transition-all duration-150",
                          isKnown
                            ? "border-accent-brand bg-accent-brand text-white"
                            : "border-border bg-bg text-text-primary"
                        )}
                      >
                        {isKnown && <Check size={14} />}
                        <div className="flex flex-col items-start gap-0.5">
                          <span className="text-[13px] font-medium">{item.surfaceForm}</span>
                          <span className="text-[11px] opacity-70">{item.meaning}</span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
            <span className="text-[11px] text-text-muted text-center">{knownItems.size} of {items.length} items marked as known</span>
          </>
        )}
        <div className="flex gap-3 justify-between">
          <button className={softBtnClass} onClick={onBack}><ChevronLeft size={16} /> Back</button>
          <button className={primaryBtnClass} onClick={onNext}>Continue <ChevronRight size={16} /></button>
        </div>
      </div>
    </div>
  )
}

// -- Reading Challenge (kanji -> hiragana) --

function ReadingChallengeStep({
  items, loading, onComplete, onBack,
}: {
  items: ReadingChallengeItem[]; loading: boolean
  onComplete: (results: ReadingChallengeResult[]) => void; onBack: () => void
}) {
  const [currentIdx, setCurrentIdx] = useState(0)
  const [userInput, setUserInput] = useState('')
  const [checked, setChecked] = useState(false)
  const [results, setResults] = useState<ReadingChallengeResult[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setCurrentIdx(0); setResults([]); setUserInput(''); setChecked(false) }, [items])
  useEffect(() => { if (!checked && inputRef.current) inputRef.current.focus() }, [currentIdx, checked])

  if (loading || items.length === 0) {
    return (
      <div className={cardClass}>
        <div className="flex items-center justify-center py-6">
          <span className="text-text-muted">Loading reading challenge...</span>
        </div>
      </div>
    )
  }

  const current = items[currentIdx]
  const isLast = currentIdx === items.length - 1

  const handleCheck = () => {
    if (!current) return
    const correctReading = getCorrectReading(current.surfaceForm)
    const normalized = userInput.trim()
    const isCorrect = normalized === correctReading
    setChecked(true)
    setResults((prev) => [...prev, { surfaceForm: current.surfaceForm, userAnswer: normalized, correct: isCorrect, level: current.level }])
  }

  const handleNext = () => {
    if (isLast) { onComplete(results) } else { setCurrentIdx((i) => i + 1); setUserInput(''); setChecked(false) }
  }

  const correctReading = checked ? getCorrectReading(current.surfaceForm) : null
  const lastResult = results.length > 0 ? results[results.length - 1] : null

  return (
    <div className={cardClass}>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Keyboard size={20} className="text-accent-brand" />
            <span className="text-[22px] font-bold">Reading Challenge</span>
          </div>
          <span className="text-[13px] text-text-muted">Type the hiragana reading for each word. Use a Japanese keyboard input.</span>
          <span
            className="text-[11px] text-text-muted cursor-pointer underline underline-offset-2"
            onClick={() => onComplete([])}
          >
            No Japanese keyboard? Skip this step
          </span>
        </div>

        <span className="text-[11px] text-text-muted text-center">{currentIdx + 1} of {items.length}</span>

        <div className="flex flex-col items-center gap-4 py-2">
          <span className="text-4xl font-bold tracking-wide">{current.surfaceForm}</span>
          <span className="text-[13px] text-text-muted">{current.meaning}</span>

          <Input
            ref={inputRef}
            placeholder="ひらがなで入力..."
            value={userInput}
            onChange={(e) => { if (!checked) setUserInput(e.target.value) }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (!checked && userInput.trim()) handleCheck()
                else if (checked) handleNext()
              }
            }}
            readOnly={checked}
            className={cn("w-full max-w-[300px] text-center text-lg", checked && "opacity-60")}
          />

          {checked && correctReading && (
            <div className="flex items-center gap-2">
              {lastResult?.correct ? (
                <span className="inline-flex items-center gap-1 py-1 px-3 rounded-full bg-[rgba(22,163,106,.08)] text-[13px] font-medium text-[#16a34a]">
                  <Check size={14} /> Correct!
                </span>
              ) : (
                <div className="flex flex-col items-center gap-1">
                  <span className="inline-flex items-center gap-1 py-1 px-3 rounded-full bg-[rgba(200,87,42,.07)] text-[13px] font-medium text-accent-warm">
                    <X size={14} /> Incorrect
                  </span>
                  <span className="text-[13px] text-text-muted">Correct reading: <strong>{correctReading}</strong></span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-3 justify-between">
          <button className={softBtnClass} onClick={onBack}><ChevronLeft size={16} /> Back</button>
          {!checked ? (
            <button className={cn(primaryBtnClass, !userInput.trim() && "opacity-50")} onClick={handleCheck} disabled={!userInput.trim()}>Check</button>
          ) : (
            <button className={primaryBtnClass} onClick={handleNext}>{isLast ? 'Continue' : 'Next'} <ChevronRight size={16} /></button>
          )}
        </div>
      </div>
    </div>
  )
}

function getCorrectReading(surfaceForm: string): string {
  const fullList = [
    { surfaceForm: '食べる', reading: 'たべる' }, { surfaceForm: '飲む', reading: 'のむ' },
    { surfaceForm: '行く', reading: 'いく' }, { surfaceForm: '見る', reading: 'みる' },
    { surfaceForm: '水', reading: 'みず' }, { surfaceForm: '友達', reading: 'ともだち' },
    { surfaceForm: '学校', reading: 'がっこう' }, { surfaceForm: '大きい', reading: 'おおきい' },
    { surfaceForm: '新しい', reading: 'あたらしい' }, { surfaceForm: '先生', reading: 'せんせい' },
    { surfaceForm: '経験', reading: 'けいけん' }, { surfaceForm: '届ける', reading: 'とどける' },
    { surfaceForm: '趣味', reading: 'しゅみ' }, { surfaceForm: '予約', reading: 'よやく' },
    { surfaceForm: '変わる', reading: 'かわる' }, { surfaceForm: '将来', reading: 'しょうらい' },
    { surfaceForm: '比べる', reading: 'くらべる' }, { surfaceForm: '習慣', reading: 'しゅうかん' },
    { surfaceForm: '影響', reading: 'えいきょう' }, { surfaceForm: '状況', reading: 'じょうきょう' },
    { surfaceForm: '環境', reading: 'かんきょう' }, { surfaceForm: '適切', reading: 'てきせつ' },
    { surfaceForm: '評価', reading: 'ひょうか' }, { surfaceForm: '発展', reading: 'はってん' },
    { surfaceForm: '管理', reading: 'かんり' }, { surfaceForm: '貢献', reading: 'こうけん' },
    { surfaceForm: '概念', reading: 'がいねん' }, { surfaceForm: '把握', reading: 'はあく' },
    { surfaceForm: '促進', reading: 'そくしん' }, { surfaceForm: '維持', reading: 'いじ' },
    { surfaceForm: '妥協', reading: 'だきょう' }, { surfaceForm: '抽象的', reading: 'ちゅうしょうてき' },
    { surfaceForm: '顕著', reading: 'けんちょ' }, { surfaceForm: '齟齬', reading: 'そご' },
    { surfaceForm: '蓋然性', reading: 'がいぜんせい' }, { surfaceForm: '踏襲', reading: 'とうしゅう' },
  ]
  return fullList.find((i) => i.surfaceForm === surfaceForm)?.reading ?? ''
}

// -- Comprehension Challenge (sentence -> translation) --

const COMPREHENSION_KEYWORDS: Record<string, string[]> = {
  '私は毎日学校に行きます。': ['school', 'go', 'every'],
  'この水はとても冷たいです。': ['water', 'cold'],
  '友達と一緒に映画を見ました。': ['friend', 'movie', 'watch'],
  '将来の夢について友達と話しました。': ['future', 'dream', 'friend', 'talk'],
  '趣味を変えることは難しくありません。': ['hobby', 'change', 'difficult'],
  '予約しないとレストランに入れません。': ['reservation', 'restaurant'],
  '環境問題は私たちの生活に大きな影響を与えています。': ['environment', 'life', 'impact', 'influence', 'effect'],
  '状況に応じて適切な判断をすることが大切です。': ['situation', 'appropriate', 'judgment', 'decision', 'important'],
  '抽象的な概念を把握するには具体的な例が必要だ。': ['abstract', 'concept', 'grasp', 'understand', 'example', 'concrete'],
  '妥協せずに品質を維持することが重要です。': ['compromise', 'quality', 'maintain', 'important'],
  '彼の顕著な業績にもかかわらず、その貢献は十分に評価されていない。': ['remarkable', 'achievement', 'despite', 'contribution', 'evaluate'],
  '蓋然性の高い仮説を踏襲することで研究の効率が上がる。': ['probability', 'hypothesis', 'follow', 'research', 'efficiency'],
}

const COMPREHENSION_TRANSLATIONS: Record<string, string> = {
  '私は毎日学校に行きます。': 'I go to school every day.',
  'この水はとても冷たいです。': 'This water is very cold.',
  '友達と一緒に映画を見ました。': 'I watched a movie with a friend.',
  '将来の夢について友達と話しました。': 'I talked with my friend about my future dream.',
  '趣味を変えることは難しくありません。': "Changing hobbies isn't difficult.",
  '予約しないとレストランに入れません。': "You can't get into the restaurant without a reservation.",
  '環境問題は私たちの生活に大きな影響を与えています。': 'Environmental problems are having a big impact on our lives.',
  '状況に応じて適切な判断をすることが大切です。': 'It is important to make appropriate judgments depending on the situation.',
  '抽象的な概念を把握するには具体的な例が必要だ。': 'Concrete examples are necessary to grasp abstract concepts.',
  '妥協せずに品質を維持することが重要です。': 'It is important to maintain quality without compromising.',
  '彼の顕著な業績にもかかわらず、その貢献は十分に評価されていない。': 'Despite his remarkable achievements, his contributions have not been adequately evaluated.',
  '蓋然性の高い仮説を踏襲することで研究の効率が上がる。': 'Research efficiency improves by following hypotheses with high probability.',
}

function computeKeywordMatchRate(sentence: string, userTranslation: string): number {
  const keywords = COMPREHENSION_KEYWORDS[sentence]
  if (!keywords || keywords.length === 0) return 0
  const lower = userTranslation.toLowerCase()
  const matched = keywords.filter((kw) => lower.includes(kw)).length
  return matched / keywords.length
}

function ComprehensionStep({
  items, loading, onComplete, onBack,
}: {
  items: ComprehensionItem[]; loading: boolean
  onComplete: (results: ComprehensionResult[]) => void; onBack: () => void
}) {
  const [currentIdx, setCurrentIdx] = useState(0)
  const [userInput, setUserInput] = useState('')
  const [checked, setChecked] = useState(false)
  const [lastMatchRate, setLastMatchRate] = useState(0)
  const [results, setResults] = useState<ComprehensionResult[]>([])
  const textAreaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { setCurrentIdx(0); setResults([]); setUserInput(''); setChecked(false) }, [items])
  useEffect(() => { if (!checked && textAreaRef.current) textAreaRef.current.focus() }, [currentIdx, checked])

  if (loading || items.length === 0) {
    return (
      <div className={cardClass}>
        <div className="flex items-center justify-center py-6">
          <span className="text-text-muted">Loading comprehension challenge...</span>
        </div>
      </div>
    )
  }

  const current = items[currentIdx]
  const isLast = currentIdx === items.length - 1

  const handleCheck = () => {
    const matchRate = computeKeywordMatchRate(current.sentence, userInput)
    setLastMatchRate(matchRate)
    setChecked(true)
    setResults((prev) => [...prev, { sentenceIndex: current.index, userTranslation: userInput.trim(), keywordMatchRate: matchRate, level: current.level }])
  }

  const handleNext = () => {
    if (isLast) { onComplete(results) } else { setCurrentIdx((i) => i + 1); setUserInput(''); setChecked(false); setLastMatchRate(0) }
  }

  const refTranslation = COMPREHENSION_TRANSLATIONS[current.sentence] ?? ''
  const correctCount = results.filter((r) => r.keywordMatchRate >= 0.5).length

  return (
    <div className={cardClass}>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <FileText size={20} className="text-accent-brand" />
            <span className="text-[22px] font-bold">Comprehension Challenge</span>
          </div>
          <span className="text-[13px] text-text-muted">Translate each Japanese sentence into your native language. We check for key concepts in your answer.</span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-[11px] text-text-muted">{currentIdx + 1} of {items.length}</span>
          {results.length > 0 && <span className="text-[11px] text-text-muted">{correctCount} of {results.length} correct so far</span>}
        </div>

        <div className="flex flex-col items-center gap-4 py-2">
          <div className="w-full rounded-lg border border-border bg-bg-secondary p-5">
            <span className="text-xl font-medium text-center leading-relaxed block">{current.sentence}</span>
          </div>

          <Textarea
            ref={textAreaRef}
            placeholder="Type your translation..."
            value={userInput}
            onChange={(e) => { if (!checked) setUserInput(e.target.value) }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                if (!checked && userInput.trim()) handleCheck()
                else if (checked) handleNext()
              }
            }}
            readOnly={checked}
            className={cn("w-full min-h-[80px]", checked && "opacity-60")}
          />

          {checked && (
            <div className="flex flex-col items-center gap-2 w-full">
              {lastMatchRate >= 0.5 ? (
                <span className="inline-flex items-center gap-1 py-1 px-3 rounded-full bg-[rgba(22,163,106,.08)] text-[13px] font-medium text-[#16a34a]">
                  <Check size={14} /> Good — you got the key ideas!
                </span>
              ) : lastMatchRate > 0 ? (
                <span className="inline-flex items-center gap-1 py-1 px-3 rounded-full bg-[rgba(245,158,11,.08)] text-[13px] font-medium text-[#f59e0b]">
                  Partial — you got some key concepts
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 py-1 px-3 rounded-full bg-[rgba(200,87,42,.07)] text-[13px] font-medium text-accent-warm">
                  <X size={14} /> Needs work
                </span>
              )}
              <span className="text-[11px] text-text-muted">Reference translation:</span>
              <span className="text-[13px] font-medium text-center italic">{refTranslation}</span>
            </div>
          )}
        </div>

        <div className="flex gap-3 justify-between">
          <button className={softBtnClass} onClick={onBack}><ChevronLeft size={16} /> Back</button>
          {!checked ? (
            <button className={cn(primaryBtnClass, !userInput.trim() && "opacity-50")} onClick={handleCheck} disabled={!userInput.trim()}>Check</button>
          ) : (
            <button className={primaryBtnClass} onClick={handleNext}>{isLast ? 'Continue' : 'Next'} <ChevronRight size={16} /></button>
          )}
        </div>
      </div>
    </div>
  )
}

// -- Preferences --

function PreferencesStep({
  dailyNewItemLimit, onDailyLimitChange, onNext, onBack,
}: { dailyNewItemLimit: number; onDailyLimitChange: (l: number) => void; onNext: () => void; onBack: () => void }) {
  return (
    <div className={cardClass}>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <span className="text-[22px] font-bold">Study Preferences</span>
          <span className="text-[13px] text-text-muted">You can always change these later in Settings.</span>
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">New items per day</span>
            <span className="inline-flex items-center py-0.5 px-2.5 rounded-full bg-bg-secondary text-[13px] font-medium text-text-secondary">
              {dailyNewItemLimit}
            </span>
          </div>
          <Slider value={[dailyNewItemLimit]} onValueChange={([v]) => onDailyLimitChange(v)} min={3} max={30} step={1} />
          <div className="flex justify-between">
            <span className="text-[11px] text-text-muted">Light (3)</span>
            <span className="text-[11px] text-text-muted">Heavy (30)</span>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-bg-secondary p-4">
          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-medium">What this means</span>
            <span className="text-[11px] text-text-muted">
              Each day, up to {dailyNewItemLimit} new vocabulary and grammar items will be introduced
              alongside your review queue.
            </span>
          </div>
        </div>
        <div className="flex gap-3 justify-between">
          <button className={softBtnClass} onClick={onBack}><ChevronLeft size={16} /> Back</button>
          <button className={primaryBtnClass} onClick={onNext}>Continue <ChevronRight size={16} /></button>
        </div>
      </div>
    </div>
  )
}

// -- Complete --

function CompleteStep({
  knownCount, totalCount, readingCorrect, readingTotal, comprehensionCount,
  selfReportedLevel, computedLevel, submitting, onComplete, onBack,
}: {
  knownCount: number; totalCount: number; readingCorrect: number; readingTotal: number
  comprehensionCount: number; selfReportedLevel: SelfReportedLevel; computedLevel: string | null
  submitting: boolean; onComplete: () => void; onBack: () => void
}) {
  const levelLabels: Record<SelfReportedLevel, string> = {
    beginner: 'Complete Beginner', N5: 'JLPT N5', N4: 'JLPT N4', N3: 'JLPT N3', N2: 'JLPT N2', N1: 'JLPT N1',
  }
  const ready = computedLevel !== null
  const levelChanged = ready && computedLevel !== getLevelCefrLabel(selfReportedLevel)

  return (
    <div className={cardClass}>
      <div className="flex flex-col items-center gap-6">
        <div className="w-16 h-16 rounded-xl bg-[rgba(22,163,106,.08)] flex items-center justify-center">
          <Sparkles size={32} className="text-[#16a34a]" />
        </div>
        <div className="flex flex-col items-center gap-2">
          <span className="text-2xl font-bold">{ready ? "You're all set!" : 'Setting up your profile...'}</span>
          <span className="text-sm text-text-muted text-center max-w-[400px]">
            {ready
              ? "Your personalized learning profile has been created. Here's a summary:"
              : 'Analyzing your results and building your knowledge map...'}
          </span>
        </div>
        <div className="w-full rounded-lg border border-border bg-bg-secondary p-4">
          <div className="flex flex-col gap-3">
            <div className="flex justify-between">
              <span className="text-[13px] text-text-muted">Self-reported level</span>
              <span className="text-[13px] font-medium">{levelLabels[selfReportedLevel]}</span>
            </div>
            <hr className="border-t border-border m-0" />
            <div className="flex justify-between items-center">
              <span className="text-[13px] text-text-muted">Computed level</span>
              {ready ? (
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "inline-flex items-center py-0.5 px-2.5 rounded-full text-[13px] font-medium",
                    levelChanged ? "bg-[rgba(22,163,106,.08)] text-[#16a34a]" : "bg-bg-active text-text-secondary"
                  )}>
                    {computedLevel}
                  </span>
                  {levelChanged && <span className="text-[11px] text-[#16a34a]">Adjusted from challenges</span>}
                </div>
              ) : (
                <span className="text-[13px] text-text-muted">Computing...</span>
              )}
            </div>
            <hr className="border-t border-border m-0" />
            <div className="flex justify-between">
              <span className="text-[13px] text-text-muted">Known items</span>
              <span className="text-[13px] font-medium">{knownCount} of {totalCount} assessed</span>
            </div>
            {readingTotal > 0 && (
              <>
                <hr className="border-t border-border m-0" />
                <div className="flex justify-between">
                  <span className="text-[13px] text-text-muted">Reading challenge</span>
                  <span className="text-[13px] font-medium">{readingCorrect} of {readingTotal} correct</span>
                </div>
              </>
            )}
            <hr className="border-t border-border m-0" />
            <div className="flex justify-between">
              <span className="text-[13px] text-text-muted">Comprehension</span>
              <span className="text-[13px] font-medium">{comprehensionCount} sentence{comprehensionCount !== 1 ? 's' : ''} translated</span>
            </div>
            <hr className="border-t border-border m-0" />
            <div className="flex justify-between">
              <span className="text-[13px] text-text-muted">Target language</span>
              <span className="text-[13px] font-medium">Japanese 🇯🇵</span>
            </div>
          </div>
        </div>
        <div className="flex gap-3 w-full flex-col">
          <button
            className={cn(
              primaryBtnClass, "w-full justify-center",
              !ready && "opacity-50 cursor-wait"
            )}
            onClick={onComplete}
            disabled={!ready}
          >
            {ready ? 'Start Learning' : 'Setting up...'}
          </button>
          <button
            className={cn(softBtnClass, "w-full justify-center", submitting && "opacity-50")}
            onClick={onBack}
            disabled={submitting}
          >
            <ChevronLeft size={16} /> Go Back
          </button>
        </div>
      </div>
    </div>
  )
}

function getLevelCefrLabel(level: SelfReportedLevel): string {
  const map: Record<SelfReportedLevel, string> = {
    beginner: 'A1', N5: 'A1', N4: 'A2', N3: 'B1', N2: 'B2', N1: 'C1',
  }
  return map[level]
}
