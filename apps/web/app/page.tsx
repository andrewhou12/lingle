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

    // Gap between words hides the previous word's descender overshoot.
    // DESC_EXTRA makes the wrapper taller so the *current* word's descenders are visible.
    // As long as GAP > DESC_EXTRA, the previous word's descenders fall in the gap
    // (outside the wrapper) while the current word's descenders are inside the wrapper.
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
              `.${s['mode-card']}, .${s['testimonial-card']}, .${s['stat-block']}, .${s['correction-card']}, .${s['history-session']}, .${s['callout-item']}`
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

/* ── Difficulty Data ── */
const diffData: Record<number, { label: string; jp: string; en: string; hint: string }> = {
  1: { label: 'Level 1 · N5 Beginner', jp: 'きょうは　てんきが　いいですね。どこかに　いきますか？', en: 'The weather is nice today, isn\'t it? Are you going anywhere?', hint: 'Hiragana only · Full English · Simple vocabulary · ます form' },
  2: { label: 'Level 2 · N4 Elementary', jp: '今日は天気がいいですね。どこかに行きますか？', en: 'The weather is nice today, isn\'t it? Are you going anywhere?', hint: 'Furigana on all kanji · Polite ます form · English hint visible' },
  3: { label: 'Level 3 · N3 Intermediate', jp: '今日は天気がいいね。どっかに行く？', en: 'Nice weather today. Going somewhere?', hint: 'Furigana for N3+ kanji · Casual form introduced · Less English' },
  4: { label: 'Level 4 · N2 Upper-Intermediate', jp: '今日ほんと天気いいね〜。どっか出かけんの？', en: 'Great weather today huh? You heading out somewhere?', hint: 'Natural contractions · Dialect hints · Rare furigana only' },
  5: { label: 'Level 5 · N1 Advanced', jp: '今日めちゃくちゃ天気いいな。どっか出かける気でもあんの？', en: 'The weather is insanely good today. You feel like going out or something?', hint: 'Slang · Register shifts · Furigana only for rare kanji' },
  6: { label: 'Level 6 · Near-Native', jp: '今日ほんまええ天気やなあ。どっか出かけるん？', en: 'Beautiful day today isn\'t it. Heading out?', hint: 'Osaka dialect · No furigana · Unrestricted complexity' },
}

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
        <div className={s['nav-links']}>
          <a href="#modes" className={s['nav-link']}>How it works</a>
          <a href="#corrections" className={s['nav-link']}>Feedback</a>
          <a href="#testimonials" className={s['nav-link']}>Testimonials</a>
        </div>
        <div className={s['nav-right']}>
          <Link href="/sign-in" className={s['btn-ghost']}>Sign in</Link>
          <Link href="/sign-in" className={s['btn-nav-primary']}>Get started free</Link>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className={s.hero}>
        <div className={s['hero-eyebrow']}>
          <div className={s['eyebrow-dot']}>
            <svg width="8" height="8" viewBox="0 0 10 10" fill="none"><circle cx="5" cy="5" r="4" fill="white"/></svg>
          </div>
          Now in open beta &middot; Japanese learning sandbox
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

      {/* ── MODES SECTION ── */}
      <section className={s['modes-section']} id="modes">
        <div className={s['modes-inner']}>
          <div className={`${s['modes-header']} ${s.reveal}`}>
            <div className={s['section-label']}>Three modes, one engine</div>
            <h2 className={s['section-title']}>One prompt. Lingle Agent builds the experience —<br/><span className={s['section-title-em']}>fully adapted to you.</span></h2>
          </div>
          <div className={s['modes-grid']}>
            {/* Card 1: Contextual Conversation */}
            <div className={`${s['mode-card']} ${s.reveal}`}>
              <div className={s['mode-card-number']}>01</div>
              <div className={s['mode-card-title']}>Contextual Conversation</div>
              <p className={s['mode-card-desc']}>Lingle Agent becomes a fully realized partner — calibrated to your level, adaptive to what you say.</p>
              <div className={`${s['mc-visual']}`}>
                <div className={s['mc-chat-header']}>
                  <div className={s['mc-avatar']}>居</div>
                  <div>
                    <div className={s['mc-name']}>居酒屋スタッフ</div>
                    <div className={s['mc-sub']}>Lingle Agent · N3</div>
                  </div>
                  <div className={s['mc-live']}><span className={s['mc-live-dot']} />Live</div>
                </div>
                <div className={s['mc-msgs']}>
                  <div className={`${s['mc-msg']}`}>
                    <div className={`${s['mc-bubble']} ${s['mc-bubble-ai']}`}>何にしますか？</div>
                    <div className={s['mc-tr']}>What would you like?</div>
                  </div>
                  <div className={`${s['mc-msg']} ${s['mc-msg-user']}`}>
                    <div className={`${s['mc-bubble']} ${s['mc-bubble-user']}`}>ビールをください！</div>
                  </div>
                  <div className={`${s['mc-msg']}`}>
                    <div className={`${s['mc-bubble']} ${s['mc-bubble-ai']}`}>生ビールですね。</div>
                    <div className={s['mc-note']}>💡 Also natural: 生ビールをお願いします</div>
                  </div>
                </div>
              </div>
              <span className={s['mode-card-jp']}>場面別会話練習</span>
            </div>

            {/* Card 2: Interactive Lesson */}
            <div className={`${s['mode-card']} ${s.reveal}`}>
              <div className={s['mode-card-number']}>02</div>
              <div className={s['mode-card-title']}>Interactive Lesson</div>
              <p className={s['mode-card-desc']}>Tell Lingle Agent what to teach. It builds the lesson for your exact level, with practice built in.</p>
              <div className={`${s['mc-visual']}`}>
                <div className={s['mc-lesson-header']}>
                  <span className={s['mc-lesson-tag']}>Grammar · N4</span>
                  <span className={s['mc-lesson-title']}>～てもいい — asking permission</span>
                </div>
                <div className={s['mc-grammar-block']}>
                  <div className={s['mc-pattern']}><span className={s['mc-pattern-jp']}>Verb て-form</span> + <span className={s['mc-pattern-accent']}>もいい</span></div>
                  <div className={s['mc-example-row']}>
                    <span className={s['mc-ex-jp']}>入ってもいいですか？</span>
                    <span className={s['mc-ex-en']}>May I come in?</span>
                  </div>
                  <div className={s['mc-example-row']}>
                    <span className={s['mc-ex-jp']}>写真を撮ってもいい？</span>
                    <span className={s['mc-ex-en']}>Can I take a photo? (casual)</span>
                  </div>
                </div>
                <div className={s['mc-exercise']}>
                  <div className={s['mc-ex-prompt']}>Try it: &quot;Is it okay if I sit here?&quot;</div>
                  <div className={s['mc-ex-input']}>ここに<span className={s['mc-cursor']}>|</span></div>
                </div>
              </div>
              <span className={s['mode-card-jp']}>構造的なレッスン</span>
            </div>

            {/* Card 3: Immersion */}
            <div className={`${s['mode-card']} ${s.reveal}`}>
              <div className={s['mode-card-number']}>03</div>
              <div className={s['mode-card-title']}>Immersion</div>
              <p className={s['mode-card-desc']}>Lingle Agent generates a native exchange — reads it aloud, breaks it down, then lets you jump in.</p>
              <div className={`${s['mc-visual']}`}>
                <div className={s['mc-imm-header']}>
                  <div className={s['mc-imm-scene']}>🏢 Friday afternoon · Office</div>
                  <div className={s['mc-imm-badge']}>Native audio</div>
                </div>
                <div className={s['mc-imm-transcript']}>
                  <div className={s['mc-imm-line']}>
                    <span className={s['mc-imm-speaker']}>田中</span>
                    <span className={s['mc-imm-text']}>お疲れ！今日飲みに行かない？</span>
                  </div>
                  <div className={s['mc-imm-line']}>
                    <span className={s['mc-imm-speaker']}>佐藤</span>
                    <span className={s['mc-imm-text']}>いいね！どこ行く？</span>
                  </div>
                </div>
                <div className={s['mc-imm-player']}>
                  <button className={s['mc-play-btn']}>
                    <svg width="9" height="9" viewBox="0 0 12 12" fill="currentColor"><path d="M3 2l7 4-7 4V2z"/></svg>
                  </button>
                  <div className={s['mc-waveform']}>
                    {[8,14,10,18,12,20,8,16,10,12].map((h, i) => (
                      <div key={i} className={`${s['mc-wave-bar']} ${i < 4 ? s['mc-wave-bar-played'] : ''}`} style={{ '--wh': h + 'px' } as React.CSSProperties} />
                    ))}
                  </div>
                  <span className={s['mc-time']}>0:04 / 0:12</span>
                </div>
                <div className={s['mc-imm-cta']}>Jump into a live version →</div>
              </div>
              <span className={s['mode-card-jp']}>リスニング練習</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── DEMO SECTION ── */}
      <section className={s['demo-section']}>
        <div className={s['demo-inner']}>
          <div className={`${s['demo-frame']} ${s.reveal}`}>
            <div className={s['demo-chrome']}>
              <div className={s['demo-dots']}>
                <div className={`${s['demo-dot']} ${s['demo-dot-r']}`} />
                <div className={`${s['demo-dot']} ${s['demo-dot-y']}`} />
                <div className={`${s['demo-dot']} ${s['demo-dot-g']}`} />
              </div>
              <div className={s['demo-title-bar']}>lingle.ai — conversation</div>
            </div>

            <div className={s['demo-body']}>
              {/* Chat Panel */}
              <div className={s['demo-panel']}>
                <div className={s['demo-panel-header']}>
                  <div className={s['demo-scenario']}>
                    <span className={s['demo-scenario-icon']}>🍜</span>
                    <div>
                      <div className={s['demo-scenario-title']}>Ordering at a ramen shop · Osaka</div>
                      <div className={s['demo-scenario-sub']}>Lingle Agent is playing: 店員さん</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div className={s['demo-panel-tab']}>
                      <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M2 11V3a1 1 0 011-1h8a1 1 0 011 1v5a1 1 0 01-1 1H5L2 11z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>
                      <span className={s['demo-panel-tab-label']}>Chat</span>
                    </div>
                    <div className={s['demo-level']}><div className={s['level-dot']} />N4</div>
                  </div>
                </div>

                <div className={s['demo-messages']}>
                  <div className={`${s.msg}`}>
                    <div className={`${s['msg-avatar']} ${s['msg-avatar-ai']}`}>店</div>
                    <div>
                      <div className={`${s['msg-bubble']} ${s['msg-bubble-ai']}`}>いらっしゃいませ！何名さまですか？</div>
                      <div className={`${s['msg-meta']} ${s['msg-meta-ai']}`}>Welcome! How many in your party?</div>
                    </div>
                  </div>
                  <div className={`${s.msg} ${s['msg-user']}`}>
                    <div className={`${s['msg-avatar']} ${s['msg-avatar-user']}`}>YOU</div>
                    <div>
                      <div className={`${s['msg-bubble']} ${s['msg-bubble-user']}`}>一人です。ラーメンを食べたいです。</div>
                      <div className={`${s['msg-meta']} ${s['msg-meta-user']}`}>Just me. I want to eat ramen.</div>
                    </div>
                  </div>
                  <div className={`${s.msg}`}>
                    <div className={`${s['msg-avatar']} ${s['msg-avatar-ai']}`}>店</div>
                    <div>
                      <div className={`${s['msg-bubble']} ${s['msg-bubble-ai']}`}>かしこまりました！醤油・塩・味噌、どれがよろしいですか？</div>
                      <div className={s['msg-correction']}>💡 Try ラーメンをお願いします for a more natural order.</div>
                      <div className={`${s['msg-meta']} ${s['msg-meta-ai']}`}>Of course! Soy sauce, salt, or miso — which do you prefer?</div>
                    </div>
                  </div>
                </div>

                <div className={s['demo-suggestions']}>
                  <div className={s['suggestion-chip']}>醤油ラーメンをください。</div>
                  <div className={s['suggestion-chip']}>おすすめは？</div>
                  <div className={s['suggestion-chip']}>味噌にします。</div>
                </div>
              </div>

              {/* Voice Panel */}
              <div className={`${s['demo-panel']} ${s['demo-panel-border']}`}>
                <div className={s['demo-panel-header']}>
                  <div className={s['demo-scenario']}>
                    <span className={s['demo-scenario-icon']}>💼</span>
                    <div>
                      <div className={s['demo-scenario-title']}>Job interview practice · Keigo</div>
                      <div className={s['demo-scenario-sub']}>Lingle Agent is playing: 面接官</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div className={s['demo-panel-tab']}>
                      <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M7 1a3 3 0 013 3v3a3 3 0 01-6 0V4a3 3 0 013-3z" stroke="currentColor" strokeWidth="1.3"/><path d="M2 7a5 5 0 0010 0M7 12v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                      <span className={s['demo-panel-tab-label']}>Voice</span>
                    </div>
                    <div className={s['demo-level']}><div className={s['level-dot']} />N2</div>
                  </div>
                </div>

                <div className={s['voice-panel-body']}>
                  <div className={s['voice-agent-info']}>
                    <div className={s['voice-agent-avatar']}>👔</div>
                    <div className={s['voice-agent-name']}>面接官 · Interviewer</div>
                    <div className={s['voice-agent-status']}>
                      <div className={s['voice-status-dot']} />
                      Speaking now
                    </div>
                  </div>

                  <div className={s['voice-visualizer']}>
                    {Array.from({ length: 15 }).map((_, i) => {
                      const heights = [12,22,36,44,30,48,38,20,32,16,40,28,14,24,10]
                      const delays = [0,.08,.16,.24,.32,.40,.48,.56,.64,.72,.80,.88,.96,.04,.12]
                      return <div key={i} className={s['voice-bar']} style={{ '--h': heights[i] + 'px', animationDelay: delays[i] + 's' } as React.CSSProperties} />
                    })}
                  </div>

                  <div className={s['voice-transcript']}>
                    <div className={s['vt-row']}>
                      <span className={s['vt-speaker']}>面接官</span>
                      <span className={s['vt-text']}>本日はお越しいただき、ありがとうございます。</span>
                      <span className={s['vt-translation']}>Thank you very much for coming in today.</span>
                    </div>
                    <div className={s['vt-divider']} />
                    <div className={s['vt-row']}>
                      <span className={s['vt-speaker']}>You</span>
                      <span className={s['vt-text']}>こちらこそ、よろしくお願いいたします。</span>
                      <span className={s['vt-translation']}>The pleasure is mine, I look forward to speaking with you.</span>
                    </div>
                  </div>

                  <div className={s['voice-input-bar']}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                      <button className={s['voice-btn']}>
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="white"><path d="M10 2a3 3 0 013 3v5a3 3 0 01-6 0V5a3 3 0 013-3z"/><path d="M4 9a6 6 0 0012 0M10 15v3" stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none"/></svg>
                      </button>
                      <span className={s['voice-hint']}>Tap to respond</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CORRECTIONS SECTION ── */}
      <section className={s['corrections-section']} id="corrections">
        <div className={s['corrections-inner']}>
          <div className={s.reveal}>
            <div className={s['section-label']}>Always improving</div>
            <h2 className={s['section-title']}>Corrections that never<br/>break the <span className={s['section-title-em']}>flow.</span></h2>
            <p className={s['section-sub']}>Lingle Agent watches every exchange. When you slip, it recasts naturally — and gives you the insight to understand why.</p>
          </div>

          <div className={s['corrections-layout']}>
            <div className={s['corrections-cards']}>
              <div className={`${s['correction-card']} ${s.reveal}`}>
                <div className={s['cc-header']}>
                  <div className={s['cc-icon']}>✏️</div>
                  <span className={s['cc-title']}>Natural recasting</span>
                </div>
                <div className={s['cc-body']}>Your error gets woven back in correctly — the conversation never stops. You absorb the right form without being interrupted.</div>
                <div className={s['cc-correction-demo']}>
                  <div className={s['cc-before']}><span className={s['cc-label']}>You</span><span className={s['cc-text-before']}>昨日、公園に行きましたた。</span></div>
                  <div className={s['cc-after']}><span className={s['cc-label']}>💬</span><span className={s['cc-text-after']}>そうか、昨日公園に行ったんだね。</span></div>
                </div>
              </div>

              <div className={`${s['correction-card']} ${s.reveal}`}>
                <div className={s['cc-header']}>
                  <div className={s['cc-icon']}>📊</div>
                  <span className={s['cc-title']}>Live fluency feedback</span>
                </div>
                <div className={s['cc-body']}>After every session, see a breakdown of your naturalness, grammar accuracy, and vocabulary range.</div>
                <div className={s['cc-feedback-demo']}>
                  {[
                    { label: 'Naturalness', pct: 82 },
                    { label: 'Grammar', pct: 74 },
                    { label: 'Vocab range', pct: 68 },
                  ].map((row) => (
                    <div key={row.label} className={s['cc-feedback-row']}>
                      <span className={s['cc-feedback-label']}>{row.label}</span>
                      <div className={s['cc-feedback-bar']}><div className={s['cc-feedback-fill']} style={{ width: row.pct + '%' }} /></div>
                      <span className={s['cc-feedback-score']}>{row.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className={`${s['correction-card']} ${s.reveal}`}>
                <div className={s['cc-header']}>
                  <div className={s['cc-icon']}>💡</div>
                  <span className={s['cc-title']}>On-demand clarification</span>
                </div>
                <div className={s['cc-body']}>Ask &quot;why did you say it that way?&quot; at any moment and Lingle Agent pauses to explain — then picks right back up.</div>
                <div className={s['cc-clarify-demo']}>
                  <div className={s['cc-clarify-q']}>Why did you say んだ at the end?</div>
                  <div className={s['cc-clarify-a']}>んだ adds a sense of explanation or shared understanding — it softens the statement and invites reaction.</div>
                </div>
              </div>
            </div>

            <div className={`${s['corrections-callout']} ${s.reveal}`}>
              {[
                { num: '1', title: 'Never punished for mistakes', desc: 'Real conversation doesn\'t stop when you say something wrong. Neither does Lingle. Errors are absorbed and corrected in context — not flagged mid-sentence.' },
                { num: '2', title: 'Corrections that actually stick', desc: 'Hearing the right form used naturally in response to your error is how native speakers actually acquire language. Lingle recasts — you absorb.' },
                { num: '3', title: 'Insight when you want it', desc: 'Pause any conversation for a grammar deep-dive or vocabulary card — then return exactly where you left off. Teaching happens on your schedule.' },
              ].map((item) => (
                <div key={item.num} className={s['callout-item']}>
                  <span className={s['callout-num']}>{item.num}</span>
                  <div>
                    <div className={s['callout-text-title']}>{item.title}</div>
                    <div className={s['callout-text-desc']}>{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── HISTORY SECTION ── */}
      <section className={s['history-section']}>
        <div className={s['history-inner']}>
          <div className={s.reveal}>
            <div className={s['section-label']}>Review & grow</div>
            <h2 className={s['section-title']}>Every session lives on.<br/>Every mistake becomes a <span className={s['section-title-em']}>lesson.</span></h2>
            <p className={s['section-sub']}>Full transcripts, annotated with corrections and insights. Revisit any conversation, see exactly where you slipped, and understand why.</p>
          </div>

          <div className={s['history-layout']}>
            <div className={`${s['history-sessions']} ${s.reveal}`}>
              {[
                { icon: '🍜', title: 'Ramen shop · Osaka', meta: 'Today · 14 min · Conversation · N4', score: '82%', active: true },
                { icon: '💼', title: 'Job interview practice', meta: 'Yesterday · 22 min · Conversation · N2', score: '74%', active: false },
                { icon: '📖', title: '～てもいい — asking permission', meta: '2 days ago · 18 min · Lesson · N4', score: '91%', active: false },
                { icon: '🏢', title: 'Friday office small talk', meta: '3 days ago · 11 min · Immersion · N3', score: '88%', active: false },
                { icon: '🚉', title: 'Asking for directions', meta: '4 days ago · 9 min · Conversation · N4', score: '79%', active: false },
              ].map((sess) => (
                <div key={sess.title} className={`${s['history-session']} ${sess.active ? s['history-session-active'] : ''}`}>
                  <div className={s['hs-icon']}>{sess.icon}</div>
                  <div className={s['hs-info']}>
                    <div className={s['hs-title']}>{sess.title}</div>
                    <div className={s['hs-meta']}>{sess.meta}</div>
                  </div>
                  <span className={s['hs-score']}>{sess.score}</span>
                </div>
              ))}
            </div>

            <div className={`${s['transcript-viewer']} ${s.reveal}`}>
              <div className={s['tv-header']}>
                <span className={s['tv-title']}>🍜 Ramen shop · Osaka</span>
                <span className={s['tv-meta']}>Today · 14 min · 3 corrections · 2 new words</span>
              </div>
              <div className={s['tv-tabs']}>
                <div className={`${s['tv-tab']} ${s['tv-tab-active']}`}>Transcript</div>
                <div className={s['tv-tab']}>Corrections</div>
                <div className={s['tv-tab']}>New vocab</div>
                <div className={s['tv-tab']}>Insights</div>
              </div>
              <div className={s['tv-body']}>
                <div className={s['tv-exchange']}>
                  <div className={s['tv-msg']}>
                    <div className={`${s['tv-bubble']} ${s['tv-bubble-ai']}`}>いらっしゃいませ！何名さまですか？</div>
                  </div>
                  <div className={s['tv-annotation']}><span className={`${s['tv-tag']} ${s['tv-tag-good']}`}>Natural</span>Standard polite greeting — exactly what you&apos;d hear.</div>
                </div>
                <div className={s['tv-exchange']}>
                  <div className={`${s['tv-msg']} ${s['tv-msg-user']}`}>
                    <div className={`${s['tv-bubble']} ${s['tv-bubble-user']}`}>一人です。ラーメンを食べたいです。</div>
                  </div>
                  <div className={s['tv-annotation']}><span className={`${s['tv-tag']} ${s['tv-tag-note']}`}>Tip</span>Natural but ラーメンをお願いします sounds more like a real order.</div>
                </div>
                <div className={s['tv-exchange']}>
                  <div className={s['tv-msg']}>
                    <div className={`${s['tv-bubble']} ${s['tv-bubble-ai']}`}>かしこまりました！醤油・塩・味噌、どれがよろしいですか？</div>
                  </div>
                  <div className={s['tv-annotation']}><span className={`${s['tv-tag']} ${s['tv-tag-good']}`}>Keigo</span>かしこまりました is formal acknowledgment — higher register than わかりました.</div>
                </div>
                <div className={s['tv-insight']}>
                  <span className={s['tv-insight-icon']}>✨</span>
                  <div className={s['tv-insight-text']}><strong>Session insight:</strong> You used polite ます form consistently throughout and handled the menu question naturally. Focus next on transitioning to casual register — you&apos;re ready for it.</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── DIFFICULTY SECTION ── */}
      <section className={s['difficulty-section']}>
        <div className={s['difficulty-inner']}>
          <div className={`${s['diff-section-header']} ${s.reveal}`}>
            <div className={s['section-label']}>Invisible difficulty</div>
            <h2 className={s['section-title']}>You set it once.<br/>Everything <span className={s['section-title-em']}>adapts.</span></h2>
            <p className={s['section-sub']}>Six calibrated levels control vocabulary, grammar, kanji density, English support, and register. You never think about it again.</p>
          </div>
          <div className={s['diff-grid']}>
            <div className={`${s['diff-levels']} ${s.reveal}`}>
              {[
                { num: 1, width: '17%', label: 'Beginner (N5)', sub: 'ひらがな' },
                { num: 2, width: '33%', label: 'Elementary (N4)', sub: '基本漢字' },
                { num: 3, width: '50%', label: 'Intermediate (N3)', sub: '混合' },
                { num: 4, width: '67%', label: 'Upper-Int. (N2)', sub: '自然体' },
                { num: 5, width: '83%', label: 'Advanced (N1)', sub: '上級' },
                { num: 6, width: '100%', label: 'Near-Native', sub: '無制限' },
              ].map((lv) => (
                <div
                  key={lv.num}
                  className={`${s['diff-level']} ${activeLevel === lv.num ? s['diff-level-active'] : ''}`}
                  onClick={() => setActiveLevel(lv.num)}
                >
                  <span className={s['diff-num']}>{lv.num}</span>
                  <div className={s['diff-bar-wrap']}><div className={s['diff-bar']} style={{ width: lv.width }} /></div>
                  <span className={s['diff-label']}>{lv.label}</span>
                  <span className={s['diff-sub']}>{lv.sub}</span>
                </div>
              ))}
            </div>
            <div className={`${s['diff-preview']} ${s.reveal}`}>
              <div className={s['diff-preview-label']}>{diffData[activeLevel].label} · example output</div>
              <div className={s['diff-preview-jp']}>{diffData[activeLevel].jp}</div>
              <div className={s['diff-preview-en']}>
                &ldquo;{diffData[activeLevel].en}&rdquo;
                <br/>
                <span style={{ color: 'var(--text-muted)', fontSize: '11.5px' }}>→ {diffData[activeLevel].hint}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section className={s['section-dark']} id="testimonials">
        <div className={s['testimonials-inner']}>
          <div className={s.reveal}>
            <div className={s['section-label']}>From learners</div>
            <h2 className={s['section-title']}>What people actually <span className={s['section-title-em']}>notice.</span></h2>
          </div>
          <div className={s['testimonials-grid']}>
            {[
              { quote: 'For the first time I feel like I\'m having a real conversation — not completing exercises. After 20 minutes I was genuinely tired from thinking in Japanese.', jp: '本物の会話をしている感覚', avatar: 'KS', name: 'Kenji S.', level: 'N4 · 8 months' },
              { quote: 'I used a word from a session at a real restaurant without thinking. That\'s never happened with any other app — ever.', jp: '自然に出てくるようになった', avatar: 'MR', name: 'Maya R.', level: 'N5 → N4 in 4 months' },
              { quote: 'The corrections never feel like corrections. The conversation just... flows. And somehow I\'m absorbing the right forms without being stopped.', jp: '自然な矯正が効く', avatar: 'TN', name: 'Tom N.', level: 'Intermediate · 1 year' },
            ].map((t) => (
              <div key={t.avatar} className={`${s['testimonial-card']} ${s.reveal}`}>
                <p className={s['testimonial-quote']}>&ldquo;{t.quote}&rdquo;</p>
                <span className={s['testimonial-jp']}>{t.jp}</span>
                <div className={s['testimonial-author']}>
                  <div className={s['testimonial-avatar']}>{t.avatar}</div>
                  <div>
                    <div className={s['testimonial-name']}>{t.name}</div>
                    <div className={s['testimonial-level']}>{t.level}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── STATS ── */}
      <div className={s['stats-section']}>
        <div className={s['stats-inner']}>
          {[
            { jp: '学習者', num: '2,400+', label: 'Learners in beta' },
            { jp: '会話', num: '18K+', label: 'Conversations started' },
            { jp: '場面', num: '21', label: 'Curated scenarios' },
            { jp: '定着', num: '89%', label: '30-day retention' },
          ].map((stat) => (
            <div key={stat.jp} className={`${s['stat-block']} ${s.reveal}`}>
              <span className={s['stat-jp']}>{stat.jp}</span>
              <div className={s['stat-num']}>{stat.num}</div>
              <div className={s['stat-label']}>{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── CTA ── */}
      <div className={s['cta-section']}>
        <div className={`${s['cta-band']} ${s.reveal}`}>
          <div className={s['cta-jp-watermark']}>話</div>
          <h2 className={s['cta-title']}>Stop studying Japanese.<br/>Start <span className={s['cta-title-em']}>speaking</span> it.</h2>
          <p className={s['cta-sub']}>Free during beta · No credit card required · Start in seconds</p>
          <div className={s['cta-actions']}>
            <Link href="/sign-in" className={s['btn-cta-white']}>Start practicing free →</Link>
            <button className={s['btn-cta-ghost']}>No account needed to try</button>
          </div>
        </div>
      </div>

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
