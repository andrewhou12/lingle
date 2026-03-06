'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import s from './landing.module.css'

/* ── SVG Logo Mark ── */
function LogoSVG({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <path d="M24 4C24 4, 18 7, 14 12C10 17, 8 23, 8 28C9 26, 11 21, 14 16C17 11, 21 7, 24 4Z" stroke="white" strokeWidth="2.2" strokeLinejoin="round" fill="none"/>
      <path d="M24 4C24 4, 27 9, 24 15C21 21, 16 26, 11 29C13 25, 17 20, 20 15C23 10, 26 7, 24 4Z" stroke="white" strokeWidth="2.2" strokeLinejoin="round" fill="none"/>
    </svg>
  )
}

/* ── Word Cycle Animation ── */
function WordCycle() {
  const wrapRef = useRef<HTMLSpanElement>(null)
  const innerRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const wrap = wrapRef.current
    const inner = innerRef.current
    if (!wrap || !inner) return

    const w = wrap
    const inn = inner
    const words = Array.from(inn.querySelectorAll<HTMLSpanElement>(`.${s['cycle-word']}`))
    let current = 0
    let slotSize = 0

    const GAP = 14
    const DESC_EXTRA = 10

    function measure() {
      let maxH = 0
      words.forEach(el => {
        el.style.position = 'relative'
        el.style.visibility = 'visible'
        const r = el.getBoundingClientRect().height
        if (r > maxH) maxH = r
      })
      const h = Math.ceil(maxH) || 80
      slotSize = h + GAP
      words.forEach(el => { el.style.height = h + 'px' })
      w.style.height = (h + DESC_EXTRA) + 'px'
      inn.style.gap = GAP + 'px'
      inn.style.transform = 'translateY(0)'
    }

    function advance() {
      current++
      const isLast = current === words.length - 1
      inn.style.transition = 'transform 360ms cubic-bezier(.76,0,.24,1)'
      inn.style.transform = `translateY(-${current * slotSize}px)`
      if (isLast) {
        setTimeout(() => {
          inn.style.transition = 'none'
          inn.style.transform = 'translateY(0)'
          current = 0
        }, 390)
      }
    }

    let interval: ReturnType<typeof setInterval>
    document.fonts.ready.then(() => {
      measure()
      interval = setInterval(advance, 2000)
    })
    const fallback = setTimeout(() => {
      if (!slotSize) {
        measure()
        interval = setInterval(advance, 2000)
      }
    }, 1500)

    return () => {
      clearInterval(interval)
      clearTimeout(fallback)
    }
  }, [])

  return (
    <span className={s['word-cycle-wrap']} ref={wrapRef}>
      <span className={s['word-cycle-inner']} ref={innerRef}>
        {['conversation partner', 'personal tutor', 'debate opponent', 'interview coach', 'travel companion', 'listening guide', 'conversation partner'].map((word, i) => (
          <span key={i} className={s['cycle-word']}>{word}</span>
        ))}
      </span>
    </span>
  )
}

/* ── Animated Placeholder ── */
function AnimatedPlaceholder() {
  const innerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const inner = innerRef.current
    if (!inner) return
    const itemH = 26.4
    let idx = 0
    const items = inner.querySelectorAll(`.${s['placeholder-item']}`)

    const interval = setInterval(() => {
      idx++
      if (idx >= items.length - 1) {
        inner.style.transition = 'transform .4s cubic-bezier(.76,0,.24,1)'
        inner.style.transform = `translateY(-${idx * itemH}px)`
        setTimeout(() => {
          inner.style.transition = 'none'
          inner.style.transform = 'translateY(0)'
          idx = 0
        }, 420)
      } else {
        inner.style.transition = 'transform .4s cubic-bezier(.76,0,.24,1)'
        inner.style.transform = `translateY(-${idx * itemH}px)`
      }
    }, 2800)

    return () => clearInterval(interval)
  }, [])

  return (
    <div className={s['placeholder-line']}>
      <div className={s['placeholder-inner']} ref={innerRef}>
        <span className={s['placeholder-item']}>I want to practice ordering at a ramen shop in Osaka...</span>
        <span className={s['placeholder-item']}>Teach me how to use て-form naturally in conversation...</span>
        <span className={s['placeholder-item']}>Show me what a job interview sounds like in keigo...</span>
        <span className={s['placeholder-item']}>I want to practice small talk with a coworker...</span>
        <span className={s['placeholder-item']}>Let&apos;s just chat casually about weekend plans...</span>
        <span className={s['placeholder-item']}>I want to practice ordering at a ramen shop in Osaka...</span>
      </div>
    </div>
  )
}

/* ── Mode Switcher ── */
function ModeSwitcher({ activeMode, onModeChange }: { activeMode: string, onModeChange: (mode: string) => void }) {
  const pillRef = useRef<HTMLDivElement>(null)
  const switcherRef = useRef<HTMLDivElement>(null)

  const positionPill = useCallback((btn: HTMLElement) => {
    const pill = pillRef.current
    const switcher = switcherRef.current
    if (!pill || !switcher) return
    const sr = switcher.getBoundingClientRect()
    const br = btn.getBoundingClientRect()
    pill.style.width = br.width + 'px'
    pill.style.transform = `translateX(${br.left - sr.left - 4}px)`
  }, [])

  useEffect(() => {
    const active = switcherRef.current?.querySelector(`.${s['mode-btn-active']}`) as HTMLElement | null
    if (active) positionPill(active)

    const handleResize = () => {
      const a = switcherRef.current?.querySelector(`.${s['mode-btn-active']}`) as HTMLElement | null
      if (a) positionPill(a)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [activeMode, positionPill])

  const modes = [
    { key: 'conversation', icon: '🗣️', label: 'Conversation' },
    { key: 'lesson', icon: '📖', label: 'Lesson' },
    { key: 'immersion', icon: '🎧', label: 'Immersion' },
  ]

  return (
    <div className={s['mode-switcher']} ref={switcherRef}>
      <div className={s['mode-switcher-pill']} ref={pillRef} />
      {modes.map(m => (
        <button
          key={m.key}
          className={`${s['mode-btn']} ${activeMode === m.key ? s['mode-btn-active'] : ''}`}
          onClick={(e) => {
            onModeChange(m.key)
            positionPill(e.currentTarget)
          }}
        >
          <span className={s['mode-btn-icon']}>{m.icon}</span>
          <span className={s['mode-btn-label']}>{m.label}</span>
        </button>
      ))}
    </div>
  )
}

/* ── Kanji Grid with shimmer effect ── */
function KanjiGrid() {
  const gridRef = useRef<HTMLDivElement>(null)
  const kanji = ['学','話','文','読','聞','書','語','字','法','音','練','習','知','識','力']

  useEffect(() => {
    const grid = gridRef.current
    if (!grid) return
    const chars = grid.querySelectorAll<HTMLSpanElement>('[data-kg]')

    function shimmer() {
      chars.forEach(c => { c.className = `${s['kg-char']} ${s['kg-dim']}` })
      const litCount = 2 + Math.floor(Math.random() * 2)
      const midCount = 3 + Math.floor(Math.random() * 2)
      const indices = Array.from({ length: chars.length }, (_, i) => i).sort(() => Math.random() - .5)
      indices.slice(0, litCount).forEach(i => { chars[i].className = `${s['kg-char']} ${s['kg-lit']}` })
      indices.slice(litCount, litCount + midCount).forEach(i => { chars[i].className = `${s['kg-char']} ${s['kg-mid']}` })
    }

    shimmer()
    const interval = setInterval(shimmer, 1800)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className={s['kanji-visual']}>
      <div className={s['kanji-grid']} ref={gridRef}>
        {kanji.map((k, i) => (
          <span key={i} data-kg className={`${s['kg-char']} ${s['kg-dim']}`}>{k}</span>
        ))}
      </div>
    </div>
  )
}

/* ── Wave Bars for immersion card ── */
function WaveBars() {
  const heights = [14,22,18,34,26,44,30,52,38,46,28,40,20,36,24,48,32,42,16,30,22,38,28,44,18,34,26,50,36,40,20,32,46,24,38,28,42,18,30,22,36,26,44,32,48,20,34,24]

  return (
    <div className={s['wave-visual']}>
      {heights.map((h, i) => (
        <div
          key={i}
          className={s['wave-bar-abs']}
          style={{ '--wh': h + 'px', animationDelay: (i * 0.06).toFixed(2) + 's' } as React.CSSProperties}
        />
      ))}
    </div>
  )
}

/* ── Scroll Reveal Hook ── */
function useReveal() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const children = entry.target.querySelectorAll(
              `.${s['step-col']}, .${s['quote-card']}, .${s['stats-band-item']}, .${s['cs-item']}, .${s['level-row']}, .${s['bento-card']}`
            )
            children.forEach((child, i) => {
              ;(child as HTMLElement).style.transitionDelay = i * 80 + 'ms'
              child.classList.add(s.reveal)
              setTimeout(() => child.classList.add(s['reveal-visible']), i * 80)
            })
            entry.target.classList.add(s['reveal-visible'])
          }
        })
      },
      { threshold: 0.07 }
    )

    const revealEls = el.querySelectorAll(`.${s.reveal}`)
    revealEls.forEach((r) => observer.observe(r))
    if (el.classList.contains(s.reveal)) observer.observe(el)

    return () => observer.disconnect()
  }, [])

  return ref
}

/* ── Level Preview Data ── */
const levelData: { num: number; width: string; name: string; jp: string; preview: string }[] = [
  { num: 1, width: '17%', name: 'Beginner', jp: 'ひらがな', preview: 'きょうは　てんきが　いいですね。どこかに　いきますか？' },
  { num: 2, width: '33%', name: 'Elementary', jp: '基本漢字', preview: '今日は天気がいいですね。どこかに行きますか？' },
  { num: 3, width: '50%', name: 'Intermediate', jp: '混合', preview: '今日は天気がいいね。どっかに行く？' },
  { num: 4, width: '67%', name: 'Upper-Int.', jp: '自然体', preview: '今日ほんと天気いいね〜。どっか出かけんの？' },
  { num: 5, width: '83%', name: 'Advanced', jp: '上級', preview: '今日めちゃくちゃ天気いいな。どっか出かける気でもあんの？' },
  { num: 6, width: '100%', name: 'Near-Native', jp: '無制限', preview: '今日ほんまええ天気やなあ。どっか出かけるん？' },
]

/* ── Prompt Fill Map ── */
const promptMap: Record<string, string> = {
  'Ordering ramen': 'I want to practice ordering at a ramen shop. I\'m N4 level.',
  'Job interview (keigo)': 'Let\'s practice a job interview in keigo. I\'m applying for an office position.',
  'Asking for directions': 'I need to practice asking for directions at a train station.',
  'Café small talk': 'Let\'s just chat casually over coffee. Keep it natural and friendly.',
  'て-form lesson': 'Teach me how to use て-form naturally in everyday conversation.',
}

/* ── Subtitle Map ── */
const subtitles: Record<string, string> = {
  conversation: 'Describe the scene — Lingle Agent becomes whoever you need. A waiter, a hiring manager, a debate partner, a patient tutor. Just start talking.',
  lesson: 'Tell Lingle Agent what you want to learn. It builds a structured lesson around it — grammar, vocabulary, patterns — with practice woven in from the start.',
  immersion: 'Pick a scenario. Lingle Agent generates a native-style exchange, reads it aloud, then walks you through every choice — so you can jump straight in.',
}

export default function LandingPage() {
  const revealRef = useReveal()
  const router = useRouter()
  const [activeMode, setActiveMode] = useState('conversation')
  const [promptValue, setPromptValue] = useState('')
  const [placeholderVisible, setPlaceholderVisible] = useState(true)
  const [promptFocused, setPromptFocused] = useState(false)
  const [heroSubSwitching, setHeroSubSwitching] = useState(false)
  const [heroSub, setHeroSub] = useState(subtitles.conversation)
  const [activeLevel, setActiveLevel] = useState(2)
  const promptRef = useRef<HTMLTextAreaElement>(null)

  const handlePromptSubmit = useCallback(() => {
    const text = promptValue.trim()
    if (!text) return
    localStorage.setItem('lingle_pending_prompt', JSON.stringify({ prompt: text, mode: activeMode }))
    router.push('/get-started')
  }, [promptValue, activeMode, router])

  const handleModeChange = useCallback((mode: string) => {
    setActiveMode(mode)
    setHeroSubSwitching(true)
    setTimeout(() => {
      setHeroSub(subtitles[mode])
      setHeroSubSwitching(false)
    }, 260)
  }, [])

  const fillPrompt = useCallback((label: string) => {
    const text = promptMap[label] || label
    setPromptValue(text)
    setPlaceholderVisible(false)
    if (promptRef.current) {
      promptRef.current.style.height = 'auto'
      promptRef.current.focus()
      requestAnimationFrame(() => {
        if (promptRef.current) {
          promptRef.current.style.height = promptRef.current.scrollHeight + 'px'
        }
      })
    }
  }, [])

  return (
    <div ref={revealRef}>
      <div className={s['paper-bg']} />

      {/* ── NAV ── */}
      <nav className={s.nav}>
        <Link href="/" className={s['nav-logo']}>
          <div className={s['nav-logo-mark']}><LogoSVG /></div>
          <span className={s['nav-logo-text']}>Lingle</span>
        </Link>
        <div className={s['nav-right']}>
          <Link href="/sign-in" className={s['btn-ghost']}>Sign in</Link>
          <Link href="/sign-in" className={s['btn-nav-primary']}>Get started free</Link>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className={s.hero}>
        <div className={s['hero-scene']} aria-hidden="true">
          <div className={s['hero-img-wrap']}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/hero-bg.png" alt="" className={s['hero-bg-img']} />
          </div>
        </div>

        <div className={s['hero-eyebrow']}>
          <div className={s['eyebrow-dot']}>
            <svg width="8" height="8" viewBox="0 0 10 10" fill="none"><circle cx="5" cy="5" r="4" fill="white"/></svg>
          </div>
          Now in open beta &mdash; Japanese learning sandbox
        </div>

        <div className={s['hero-title-wrap']}>
          <span className={s['hero-title-top']}>Meet your Japanese</span>
          <div className={s['hero-title-bottom']}>
            <WordCycle />
          </div>
          <span className={s['hero-title-jp']}>あなただけの日本語パートナー</span>
        </div>

        <p className={`${s['hero-sub']} ${heroSubSwitching ? s['hero-sub-switching'] : ''}`}>
          {heroSub}
        </p>

        <ModeSwitcher activeMode={activeMode} onModeChange={handleModeChange} />

        {/* THE PROMPT */}
        <div className={s['prompt-wrap']}>
          <div className={`${s['prompt-box']} ${promptFocused ? s['prompt-box-focused'] : ''}`}>
            <div style={{ position: 'relative' }}>
              <textarea
                ref={promptRef}
                className={s['prompt-input-area']}
                rows={2}
                value={promptValue}
                onChange={(e) => {
                  setPromptValue(e.target.value)
                  setPlaceholderVisible(e.target.value.length === 0)
                  e.target.style.height = 'auto'
                  e.target.style.height = e.target.scrollHeight + 'px'
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handlePromptSubmit()
                  }
                }}
                onFocus={() => {
                  setPromptFocused(true)
                  if (!promptValue) setPlaceholderVisible(false)
                }}
                onBlur={() => {
                  setPromptFocused(false)
                  if (!promptValue) setPlaceholderVisible(true)
                }}
              />
              <div className={s['prompt-placeholder']} style={{ opacity: placeholderVisible ? 1 : 0 }}>
                <AnimatedPlaceholder />
              </div>
            </div>
            <div className={s['prompt-footer']}>
              <button className={s['prompt-send']} title="Start practice" onClick={handlePromptSubmit}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M1 8L15 1L8 15L6.5 9.5L1 8Z" stroke="white" strokeWidth="1.5" strokeLinejoin="round" fill="none"/>
                </svg>
              </button>
            </div>
          </div>

          {/* EXAMPLE CHIPS */}
          <div className={s['example-chips']}>
            {[
              { emoji: '🍜', label: 'Ordering ramen', jp: 'ラーメン屋' },
              { emoji: '💼', label: 'Job interview (keigo)', jp: '面接練習' },
              { emoji: '🚉', label: 'Asking for directions', jp: '道案内' },
              { emoji: '☕', label: 'Café small talk', jp: '雑談' },
              { emoji: '📚', label: 'て-form lesson', jp: 'て形' },
            ].map((chip) => (
              <button key={chip.label} className={s['example-chip']} onClick={() => fillPrompt(chip.label)}>
                {chip.emoji} <span>{chip.label}</span> <span className={s['example-chip-jp']}>{chip.jp}</span>
              </button>
            ))}
          </div>
        </div>

        <div className={s['hero-social']}>
          <div className={s['avatar-stack']}>
            {['KS', 'MR', 'TN', '+'].map((letter) => (
              <div key={letter} className={s['avatar-sm']}>{letter}</div>
            ))}
          </div>
          <span className={s.stars}>★★★★★</span>
          <span>2,400+ learners in beta</span>
        </div>
      </section>

      {/* ── BENTO SECTION ── */}
      <section className={s['bento-section']} id="modes">
        <div className={s['bento-inner']}>
          <div className={`${s['bento-header']} ${s.reveal}`}>
            <h2 className={s['bento-heading']}>Three ways to practice</h2>
          </div>

          <div className={s['bento-grid']}>
            {/* Card 1: Conversation — voice rings */}
            <div className={`${s['bento-card']} ${s['bento-card-main']} ${s.reveal}`}>
              <div className={s['voice-visual']}>
                <div className={s['voice-rings']}>
                  <div className={s['voice-ring']} />
                  <div className={s['voice-ring']} />
                  <div className={s['voice-ring']} />
                  <div className={s['voice-ring']} />
                  <div className={s['voice-kanji']}>話</div>
                </div>
              </div>
              <div className={s['bento-text']}>
                <span className={`${s['bento-label']} ${s['bento-label-light']}`}>Conversation</span>
                <h3 className={`${s['bento-title']} ${s['bento-title-light']}`}>Speak to anyone.<br/>Any scene.</h3>
                <p className={`${s['bento-sub']} ${s['bento-sub-light']}`}>Waiter. Interviewer. Debate partner. Just describe it and start talking.</p>
              </div>
            </div>

            {/* Card 2: Lesson — kanji grid */}
            <div className={`${s['bento-card']} ${s['bento-card-light']} ${s.reveal}`}>
              <KanjiGrid />
              <div className={s['bento-text-mid']}>
                <span className={`${s['bento-label']} ${s['bento-label-dark']}`}>Lesson</span>
                <h3 className={`${s['bento-title']} ${s['bento-title-dark']}`}>Learn exactly<br/>what you ask for.</h3>
                <p className={`${s['bento-sub']} ${s['bento-sub-dark']}`}>Tell it the grammar point. It builds the full lesson around you.</p>
              </div>
            </div>

            {/* Card 3: Immersion — wave bars */}
            <div className={`${s['bento-card']} ${s['bento-card-light']} ${s.reveal}`}>
              <WaveBars />
              <div className={s['bento-text-mid']}>
                <span className={`${s['bento-label']} ${s['bento-label-dark']}`}>Immersion</span>
                <h3 className={`${s['bento-title']} ${s['bento-title-dark']}`}>Hear it native.<br/>Then speak it.</h3>
                <p className={`${s['bento-sub']} ${s['bento-sub-dark']}`}>Native audio. Read along. Then jump into a live version.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── STEPS SECTION — How it works ── */}
      <section className={s['steps-section']}>
        <div className={s['steps-inner']}>
          <div className={`${s['steps-header']} ${s.reveal}`}>
            <span className={s['steps-header-label']}>How it works</span>
            <h2 className={s['steps-header-title']}>Start speaking in<br/><span className={s['steps-header-title-em']}>three steps.</span></h2>
          </div>
          <div className={s['steps-grid']}>
            <div className={`${s['step-col']} ${s.reveal}`}>
              <span className={s['step-num']}>1</span>
              <div className={s['step-icon-art']}>
                <div className={s['art-prompt']}>
                  <div className={s['art-prompt-dot']} />
                  <div className={s['art-prompt-line']} />
                  <div className={`${s['art-prompt-line']} ${s['art-prompt-line-short']}`} />
                </div>
              </div>
              <div className={s['step-title']}>Describe the scene</div>
              <div className={s['step-desc']}>Type anything — a scenario, a grammar point, a situation you want to practice. Lingle builds it in seconds.</div>
            </div>
            <div className={`${s['step-col']} ${s.reveal}`}>
              <span className={s['step-num']}>2</span>
              <div className={s['step-icon-art']}>
                <div className={s['art-rings']}>
                  <div className={s['art-ring']} />
                  <div className={s['art-ring']} />
                  <div className={s['art-ring']} />
                </div>
              </div>
              <div className={s['step-title']}>Have the conversation</div>
              <div className={s['step-desc']}>Speak or type. Your AI partner adapts in real time — corrections woven in naturally, never breaking the flow.</div>
            </div>
            <div className={`${s['step-col']} ${s.reveal}`}>
              <span className={s['step-num']}>3</span>
              <div className={s['step-icon-art']}>
                <div className={s['art-insight']}>
                  {[
                    { label: 'Naturalness', pct: '82%', width: '82%', delay: undefined },
                    { label: 'Grammar', pct: '74%', width: '74%', delay: '.4s' },
                    { label: 'Vocab range', pct: '68%', width: '68%', delay: '.8s' },
                  ].map((row) => (
                    <div key={row.label} className={s['art-insight-row']}>
                      <span className={s['art-insight-label']}>{row.label}</span>
                      <div className={s['art-insight-track']}>
                        <div className={s['art-insight-fill']} style={{ width: row.width, animationDelay: row.delay }} />
                      </div>
                      <span className={s['art-insight-score']}>{row.pct}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className={s['step-title']}>Review and improve</div>
              <div className={s['step-desc']}>Every session is saved with a full transcript, corrections, new vocabulary, and a score. Nothing slips past.</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── ADAPT SECTION — Difficulty levels ── */}
      <section className={s['adapt-section']}>
        <div className={s['adapt-inner']}>
          <div className={s.reveal}>
            <span className={s['adapt-label']}>Six levels</span>
            <h2 className={s['adapt-title']}>Set it once.<br/>Everything <span className={s['adapt-title-em']}>adapts.</span></h2>
            <p className={s['adapt-body']}>Vocabulary, grammar complexity, kanji density, furigana, register — all controlled by a single level setting. You never have to think about it again.</p>
          </div>
          <div className={`${s['adapt-visual']} ${s.reveal}`}>
            {levelData.map((lv) => (
              <div key={lv.num}>
                <div
                  className={`${s['level-row']} ${activeLevel === lv.num ? s['level-row-active'] : ''}`}
                  onClick={() => setActiveLevel(lv.num)}
                >
                  <span className={s['lv-num']}>{lv.num}</span>
                  <div className={s['lv-track']}><div className={s['lv-fill']} style={{ width: lv.width }} /></div>
                  <span className={s['lv-name']}>{lv.name}</span>
                  <span className={s['lv-jp']}>{lv.jp}</span>
                </div>
                {activeLevel === lv.num && (
                  <div className={s['lv-preview-jp']}>{lv.preview}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CORRECTIONS — Dark split ── */}
      <section className={s['corrections-split']}>
        <div className={s['cs-inner']}>
          <div className={s['cs-layout']}>
            <div className={s.reveal}>
              <div className={s['cs-big']}>Mistakes are<br/>how you<br/><span className={s['cs-big-em']}>actually</span> learn.</div>
              <p className={s['cs-body']}>Lingle never interrupts. Errors get woven back in correctly — you absorb the right form without breaking stride.</p>
            </div>
            <div className={`${s['cs-right']} ${s.reveal}`}>
              {[
                { num: '1', title: 'Never punished for errors', desc: 'Real conversation doesn\'t stop when you slip. Lingle recasts in context — not a flag, not a red underline.' },
                { num: '2', title: 'Corrections that stick', desc: 'Hearing the right form used naturally in response to your error is how native speakers actually acquire language.' },
                { num: '3', title: 'Ask why, any time', desc: 'Pause for a grammar deep-dive or vocabulary note — then pick back up exactly where you left off.' },
              ].map((item) => (
                <div key={item.num} className={s['cs-item']}>
                  <span className={s['cs-item-num']}>{item.num}</span>
                  <div>
                    <div className={s['cs-item-title']}>{item.title}</div>
                    <div className={s['cs-item-desc']}>{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── STATS BAND ── */}
      <div className={s['stats-band']}>
        <div className={s['stats-band-inner']}>
          <div className={`${s['stats-band-item']} ${s.reveal}`}>
            <span className={s['sbi-num']}>89%</span>
            <div className={s['sbi-title']}>30-day retention</div>
            <div className={s['sbi-desc']}>Duolingo streaks are brittle. Real conversation is sticky.</div>
          </div>
          <div className={`${s['stats-band-item']} ${s.reveal}`}>
            <span className={s['sbi-num']}>18K+</span>
            <div className={s['sbi-title']}>Conversations started</div>
            <div className={s['sbi-desc']}>By 2,400+ beta learners across every level and scenario.</div>
          </div>
          <div className={`${s['stats-band-item']} ${s.reveal}`}>
            <span className={s['sbi-num']}><span className={s['sbi-num-em']}>Zero</span></span>
            <div className={s['sbi-title']}>Wasted sessions</div>
            <div className={s['sbi-desc']}>Every session is annotated, saved, and ready to review.</div>
          </div>
        </div>
      </div>

      {/* ── QUOTES / TESTIMONIALS ── */}
      <section className={s['quotes-section']}>
        <div className={s['quotes-inner']}>
          <div className={`${s['quotes-header']} ${s.reveal}`}>
            <h2 className={s['quotes-header-title']}>What people <span className={s['quotes-header-title-em']}>actually</span> notice.</h2>
          </div>
          <div className={s['quotes-grid']}>
            <div className={`${s['quote-card']} ${s['quote-card-featured']} ${s.reveal}`}>
              <p className={s['quote-text']}>&ldquo;For the first time I feel like I&apos;m having a real conversation — not completing exercises. After 20 minutes I was genuinely tired from thinking in Japanese.&rdquo;</p>
              <div className={s['quote-footer']}>
                <div className={s['quote-avatar']}>KS</div>
                <div>
                  <div className={s['quote-name']}>Kenji S.</div>
                  <div className={s['quote-meta']}>N4 · 8 months</div>
                </div>
                <span className={s['quote-jp']}>本物の会話</span>
              </div>
            </div>
            <div className={`${s['quote-card']} ${s['quote-card-regular']} ${s.reveal}`}>
              <p className={s['quote-text']}>&ldquo;I used a word from a session at a real restaurant without thinking. That&apos;s never happened with any other app.&rdquo;</p>
              <div className={s['quote-footer']}>
                <div className={s['quote-avatar']}>MR</div>
                <div>
                  <div className={s['quote-name']}>Maya R.</div>
                  <div className={s['quote-meta']}>N5 → N4 in 4 months</div>
                </div>
              </div>
            </div>
            <div className={`${s['quote-card']} ${s['quote-card-regular']} ${s.reveal}`}>
              <p className={s['quote-text']}>&ldquo;The corrections never feel like corrections. The conversation just... flows. Somehow I&apos;m absorbing the right forms without being stopped.&rdquo;</p>
              <div className={s['quote-footer']}>
                <div className={s['quote-avatar']}>TN</div>
                <div>
                  <div className={s['quote-name']}>Tom N.</div>
                  <div className={s['quote-meta']}>Intermediate · 1 year</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className={s['final-cta']}>
        <div className={s['final-cta-inner']}>
          <div className={s.reveal}>
            <h2 className={s['fctl-big']}>Stop studying.<br/>Start <span className={s['fctl-big-em']}>speaking.</span></h2>
            <p className={s['fctl-sub']}>Free during beta. No credit card. Start a conversation in under a minute.</p>
          </div>
          <div className={`${s['final-cta-right']} ${s.reveal}`}>
            <Link href="/sign-in" className={s['btn-cta-primary']}>Start practicing free →</Link>
            <span className={s['cta-footnote']}>No account needed to try</span>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className={s.footer}>
        <div className={s['footer-left']}>
          <Link href="/" className={s['footer-logo']}>
            <div className={s['footer-logo-mark']}><LogoSVG size={13} /></div>
            <span className={s['footer-logo-name']}>Lingle</span>
          </Link>
          <span className={s['footer-copy']}>© 2026 Lingle. All rights reserved.</span>
        </div>
        <div className={s['footer-links']}>
          <a href="#" className={s['footer-link']}>Privacy</a>
          <a href="#" className={s['footer-link']}>Terms</a>
          <a href="#" className={s['footer-link']}>Blog</a>
          <a href="#" className={s['footer-link']}>Support</a>
        </div>
      </footer>
    </div>
  )
}
