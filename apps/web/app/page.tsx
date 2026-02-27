'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import s from './landing.module.css'

/* ── SVG Logo Mark ── */
function LogoSVG({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <path d="M24 3 C24 3, 18 5, 14 10 C10 15, 8 21, 8 26 C9 24, 11 19, 14 14 C17 9, 21 5, 24 3 Z" stroke="white" strokeWidth="2" strokeLinejoin="round" fill="none"/>
      <path d="M24 3 C24 3, 26 7, 24 13 C22 19, 17 24, 12 27 C14 23, 17 18, 20 13 C23 8, 25 5, 24 3 Z" stroke="white" strokeWidth="2" strokeLinejoin="round" fill="none"/>
      <path d="M8 26 L7 29" stroke="white" strokeWidth="2" strokeLinecap="round"/>
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
      interval = setInterval(advance, 1900)
    })
    const fallback = setTimeout(() => {
      if (!slotSize) {
        measure()
        interval = setInterval(advance, 1900)
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
        {['proactive.', 'adaptive.', 'perceptive.', 'automatic.', 'seamless.', 'intelligent.', 'hyper\u2011personal.', 'proactive.'].map((word, i) => (
          <span key={i} className={s['cycle-word']}>{word}</span>
        ))}
      </span>
    </span>
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
            entry.target.classList.add(s['reveal-visible'])
            // Stagger children
            const children = entry.target.querySelectorAll(
              `.${s['feature-card']}, .${s['step-card']}, .${s['testimonial-card']}, .${s['stat-block']}, .${s['tagline-item']}, .${s['fluency-card']}, .${s['engine-point']}`
            )
            children.forEach((child, i) => {
              ;(child as HTMLElement).style.transitionDelay = i * 70 + 'ms'
              child.classList.add(s.reveal)
              setTimeout(() => child.classList.add(s['reveal-visible']), i * 70)
            })
          }
        })
      },
      { threshold: 0.06 }
    )

    // Observe this element and any nested .reveal elements
    const revealEls = el.querySelectorAll(`.${s.reveal}`)
    revealEls.forEach((r) => observer.observe(r))
    if (el.classList.contains(s.reveal)) observer.observe(el)

    return () => observer.disconnect()
  }, [])

  return ref
}

export default function LandingPage() {
  const revealRef = useReveal()

  return (
    <div ref={revealRef}>
      {/* ── NAV ── */}
      <nav className={s.nav}>
        <Link href="/" className={s['nav-logo']}>
          <div className={s['nav-logo-mark']}><LogoSVG /></div>
          <span className={s['nav-logo-text']}>Linguist</span>
        </Link>
        <div className={s['nav-links']}>
          <a href="#adaptive" className={s['nav-link']}>The Engine</a>
          <a href="#features" className={s['nav-link']}>Features</a>
          <a href="#how" className={s['nav-link']}>How it works</a>
        </div>
        <div className={s['nav-right']}>
          <Link href="/sign-in" className={s['btn-ghost']}>Sign in</Link>
          <Link href="/sign-in" className={s['btn-primary']}>Get started free</Link>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className={s.hero}>
        <div className={s['hero-eyebrow']}>
          <div className={s['eyebrow-pulse']}>
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><circle cx="4" cy="4" r="2.5" fill="white"/></svg>
          </div>
          State-of-the-art &middot; Japanese &middot; Free in beta
        </div>
        <div className={s['hero-title-wrap']}>
          <span className={s['hero-title-line1']}>Modern Japanese learning</span>
          <div className={s['hero-title-line2']}>
            <span className={s['title-static']}>is&nbsp;</span>
            <WordCycle />
          </div>
          <span className={s['hero-title-jp']}>あなたに合わせて、進化し続ける</span>
        </div>
        <p className={s['hero-sub']}>
          Linguist is the first Japanese learning system with a <strong>live model of exactly what you know.</strong> It guides you forward and leads you to mastery through natural conversation — <strong>adapting its feedback, corrections, and challenges to you in real time.</strong>
        </p>
        <div className={s['hero-actions']}>
          <Link href="/sign-in" className={s['btn-hero']}>Start learning free →</Link>
          <a href="#adaptive" className={s['btn-hero-outline']}>See how it adapts</a>
        </div>
        <div className={s['hero-social']}>
          <div className={s['avatar-stack']}>
            {['K', 'M', 'S', 'R', '+'].map((letter) => (
              <div key={letter} className={s['avatar-sm']}>{letter}</div>
            ))}
          </div>
          Join 2,400+ learners with a system that knows them
        </div>
      </section>

      {/* ── PRODUCT PREVIEW ── */}
      <div className={s['preview-section']}>
        <div className={s['preview-frame']}>
          <div className={s['frame-chrome']}>
            <div className={s['chrome-dots']}>
              <div className={s['chrome-dot']} />
              <div className={s['chrome-dot']} />
              <div className={s['chrome-dot']} />
            </div>
            <div className={s['chrome-bar']}>app.linguist.ai</div>
          </div>
          <div className={s['frame-body']}>
            {/* SIDEBAR */}
            <div className={s['frame-sidebar']}>
              <div className={s['frame-logo-row']}>
                <div className={s['frame-logo-mark']}><LogoSVG size={15} /></div>
                <span className={s['frame-logo-name']}>Linguist</span>
              </div>
              <div className={s['frame-section-label']}>Practice</div>
              <div className={`${s['frame-nav-item']} ${s['frame-nav-item-active']}`}>
                <span className={s['frame-nav-icon']}>💬</span> Conversation
              </div>
              <div className={s['frame-nav-item']}>
                <span className={s['frame-nav-icon']}>⚡</span> Flashcards <span className={s['frame-nav-badge']}>12</span>
              </div>
              <div className={s['frame-nav-item']}>
                <span className={s['frame-nav-icon']}>▶</span> Native clips
              </div>
              <div className={s['frame-section-label']}>Learn</div>
              <div className={s['frame-nav-item']}>
                <span className={`${s['frame-nav-icon']} ${s['frame-nav-icon-jp']}`}>文</span> Lessons
              </div>
              <div className={s['frame-nav-item']}>
                <span className={`${s['frame-nav-icon']} ${s['frame-nav-icon-jp']}`}>帳</span> Vocab bank
              </div>
              <div className={s['frame-adapt-widget']}>
                <div className={s['frame-adapt-title']}>Adapting to you</div>
                <div className={s['frame-adapt-row']}>
                  <span className={s['frame-adapt-label']}>Speaking gap</span>
                  <div className={s['frame-adapt-bar']}><div className={s['frame-adapt-fill']} style={{ width: '68%' }} /></div>
                </div>
                <div className={s['frame-adapt-row']}>
                  <span className={s['frame-adapt-label']}>〜てから ready</span>
                  <div className={s['frame-adapt-bar']}><div className={s['frame-adapt-fill']} style={{ width: '85%' }} /></div>
                </div>
                <div className={s['frame-adapt-row']}>
                  <span className={s['frame-adapt-label']}>Register slip</span>
                  <div className={s['frame-adapt-bar']}><div className={s['frame-adapt-fill']} style={{ width: '40%' }} /></div>
                </div>
                <div className={s['frame-adapt-live']}><div className={s['frame-adapt-pulse']} /> Updating live</div>
              </div>
            </div>

            {/* CHAT COLUMN */}
            <div className={s['frame-chat']}>
              <div className={s['frame-topbar']}>
                <div className={s['frame-topbar-left']}>
                  <span className={s['frame-topbar-title']}>Chat with Sensei</span>
                  <span className={s['frame-topbar-session']}>Session 14 · Restaurant roleplay</span>
                </div>
                <span className={s['frame-challenge-pill']}>3 challenges today</span>
              </div>

              {/* Challenge card mini */}
              <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 8px', marginBottom: 10 }}>
                <div style={{ fontSize: '8.5px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '.05em', marginBottom: 3 }}>Today&apos;s challenges</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '9.5px', color: '#16a34a', marginBottom: 2 }}>
                  <span style={{ width: 13, height: 13, borderRadius: '50%', background: '#16a34a', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '7px' }}>✓</span>
                  Use ください to make a request
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '9.5px', color: '#16a34a', marginBottom: 2 }}>
                  <span style={{ width: 13, height: 13, borderRadius: '50%', background: '#16a34a', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '7px' }}>✓</span>
                  Produce すみません in context
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '9.5px', color: 'var(--text-secondary)' }}>
                  <span style={{ width: 13, height: 13, borderRadius: '50%', border: '1.5px solid var(--border-strong)', display: 'inline-block' }} />
                  Try 〜ありますか
                  <span style={{ marginLeft: 'auto', fontSize: '8px', fontWeight: 600, color: 'var(--accent-warm)', background: 'rgba(200,87,42,.07)', padding: '1px 5px', borderRadius: 100 }}>STRETCH</span>
                </div>
              </div>

              <div className={s['frame-msgs']}>
                {/* AI msg 1 */}
                <div className={s['frame-msg']}>
                  <div className={`${s['frame-avatar']} ${s['frame-avatar-ai']}`}>先</div>
                  <div className={`${s['frame-bubble']} ${s['frame-bubble-ai']}`}>
                    OK, the waiter is looking at us. Get their attention and ask for a menu! You&apos;ll need:{' '}
                    <span style={{ borderBottom: '1.5px solid var(--accent-warm)', fontFamily: 'var(--font-jp)', fontWeight: 500 }}>すみません</span> and{' '}
                    <span style={{ borderBottom: '1.5px solid var(--accent-warm)', fontFamily: 'var(--font-jp)', fontWeight: 500 }}>ください</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 5, fontSize: '8.5px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      <span style={{ display: 'inline-block', width: 32, height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden', position: 'relative' as const }}>
                        <span style={{ display: 'block', width: '91%', height: '100%', background: '#16a34a', borderRadius: 2 }} />
                      </span>
                      91% known
                    </span>
                  </div>
                </div>

                {/* User msg 1 */}
                <div className={`${s['frame-msg']} ${s['frame-msg-user']}`}>
                  <div className={`${s['frame-avatar']} ${s['frame-avatar-usr']}`}>A</div>
                  <div>
                    <div className={`${s['frame-bubble']} ${s['frame-bubble-user']}`} style={{ fontFamily: 'var(--font-jp)', fontSize: '10.5px', letterSpacing: '.02em' }}>
                      すみません、メニューをください
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 3 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '8.5px', fontWeight: 500, color: '#16a34a', background: 'rgba(45,138,78,.08)', border: '1px solid rgba(45,138,78,.15)', padding: '1px 6px', borderRadius: 100, fontFamily: 'var(--font-mono)' }}>
                        <span style={{ display: 'inline-block', width: 4, height: 4, borderRadius: '50%', background: '#16a34a' }} />
                        Natural
                      </span>
                    </div>
                  </div>
                </div>

                {/* AI msg 2 with correction + register */}
                <div className={s['frame-msg']}>
                  <div className={`${s['frame-avatar']} ${s['frame-avatar-ai']}`}>先</div>
                  <div className={`${s['frame-bubble']} ${s['frame-bubble-ai']}`}>
                    <div>いいね！That was perfect.</div>
                    {/* Correction diff */}
                    <div style={{ marginTop: 6, border: '1px solid var(--border)', borderRadius: 5, overflow: 'hidden' }}>
                      <div style={{ padding: '4px 7px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ fontSize: '8.5px', fontWeight: 600, color: 'var(--accent-warm)', textTransform: 'uppercase' as const, letterSpacing: '.04em' }}>✦ Note</span>
                        <span style={{ fontSize: '8px', padding: '1px 5px', borderRadius: 100, background: 'rgba(200,87,42,.07)', color: 'var(--accent-warm)', fontWeight: 500 }}>Style tip</span>
                      </div>
                      <div style={{ padding: '7px 8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                          <span style={{ fontFamily: 'var(--font-jp)', fontSize: 11, color: 'var(--text-muted)', textDecoration: 'line-through', textDecorationColor: '#c2553b', opacity: 0.6 }}>メニューをください</span>
                          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>→</span>
                          <span style={{ fontFamily: 'var(--font-jp)', fontSize: 11, fontWeight: 500, background: 'rgba(45,138,78,.08)', padding: '1px 5px', borderRadius: 3, border: '1px solid rgba(45,138,78,.15)' }}>メニューください</span>
                        </div>
                        <div style={{ fontSize: '9.5px', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                          Drop <strong style={{ color: 'var(--text-primary)' }}>を</strong> in casual speech — both are correct.
                        </div>
                      </div>
                    </div>
                    {/* Register toggle */}
                    <div style={{ marginTop: 6, border: '1px solid var(--border)', borderRadius: 5, overflow: 'hidden' }}>
                      <div style={{ padding: '4px 7px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)', fontSize: '8.5px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '.04em' }}>✦ Register</div>
                      <div style={{ padding: '6px 8px' }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 3 }}>
                          <span style={{ fontSize: '8px', fontWeight: 600, color: '#16a34a', background: 'rgba(45,138,78,.08)', padding: '1px 5px', borderRadius: 3, textTransform: 'uppercase' as const, letterSpacing: '.03em', display: 'inline-block', width: 38, textAlign: 'center' as const }}>Casual</span>
                          <span style={{ fontFamily: 'var(--font-jp)', fontSize: '10.5px', fontWeight: 500 }}>メニューください</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 3 }}>
                          <span style={{ fontSize: '8px', fontWeight: 600, color: '#3b6ec2', background: 'rgba(59,110,194,.07)', padding: '1px 5px', borderRadius: 3, textTransform: 'uppercase' as const, letterSpacing: '.03em', display: 'inline-block', width: 38, textAlign: 'center' as const }}>Polite</span>
                          <span style={{ fontFamily: 'var(--font-jp)', fontSize: '10.5px', fontWeight: 500 }}>
                            メニューを<span style={{ background: 'rgba(59,110,194,.1)', borderRadius: 2, padding: '0 2px' }}>お願いします</span>
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                          <span style={{ fontSize: '8px', fontWeight: 600, color: '#7c5cbf', background: 'rgba(124,92,191,.07)', padding: '1px 5px', borderRadius: 3, textTransform: 'uppercase' as const, letterSpacing: '.03em', display: 'inline-block', width: 38, textAlign: 'center' as const }}>Formal</span>
                          <span style={{ fontFamily: 'var(--font-jp)', fontSize: '10.5px', fontWeight: 500 }}>
                            メニューを<span style={{ background: 'rgba(124,92,191,.07)', borderRadius: 2, padding: '0 2px' }}>いただけますか</span>
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* User msg 2 */}
                <div className={`${s['frame-msg']} ${s['frame-msg-user']}`}>
                  <div className={`${s['frame-avatar']} ${s['frame-avatar-usr']}`}>A</div>
                  <div className={`${s['frame-bubble']} ${s['frame-bubble-user']}`} style={{ fontFamily: 'var(--font-jp)', fontSize: '10.5px', letterSpacing: '.02em' }}>
                    ラーメンをください！
                  </div>
                </div>

                {/* AI msg 3 */}
                <div className={s['frame-msg']}>
                  <div className={`${s['frame-avatar']} ${s['frame-avatar-ai']}`}>先</div>
                  <div className={`${s['frame-bubble']} ${s['frame-bubble-ai']}`}>
                    完璧！The waiter says{' '}
                    <span style={{ fontFamily: 'var(--font-jp)', fontWeight: 500, borderBottom: '1.5px solid #3b6ec2' }}>少々お待ちください</span>
                    ✦ This place has{' '}
                    <span style={{ background: 'rgba(124,92,191,.07)', borderBottom: '1.5px solid #7c5cbf', padding: '0 2px', borderRadius: 2, fontFamily: 'var(--font-jp)', fontWeight: 500 }}>ベジタリアン向け</span>
                    <span style={{ fontSize: '7px', fontWeight: 600, color: '#7c5cbf', marginLeft: 2 }}>CHUNK</span>{' '}
                    options. Try{' '}
                    <span style={{ borderBottom: '1.5px solid var(--accent-warm)', fontFamily: 'var(--font-jp)', fontWeight: 500 }}>ありますか</span>
                    {' '}— your stretch goal! 💪
                  </div>
                </div>
              </div>

              {/* Escape hatch + input */}
              <div style={{ marginTop: 6, marginBottom: 6 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '3px 8px', borderRadius: 100, border: '1px dashed var(--border-strong)', fontSize: '9px', color: 'var(--text-muted)' }}>
                  💬 Stuck? Say it in English
                </span>
              </div>
              <div className={s['frame-input-bar']}>
                <span className={s['frame-input-text']}>Type in Japanese or English…</span>
                <div className={s['frame-input-send']}>↑</div>
              </div>
            </div>

            {/* RIGHT PANEL — Knowledge model */}
            <div className={s['frame-knowledge']}>
              <div className={s['frame-panel-header']}>
                <span className={s['frame-panel-title']}>Live knowledge model</span>
                <span className={s['frame-panel-live']}>
                  <span className={s['frame-panel-live-dot']} /> Active
                </span>
              </div>
              <div>
                <div className={s['frame-mastery-item']}>
                  <div className={s['frame-mastery-jp']}>ください</div>
                  <div className={s['frame-mastery-info']}>
                    <div className={s['frame-mastery-word']}>please (give me)</div>
                    <div className={s['frame-mastery-sub']}>↑ Produced ×2 in conversation today</div>
                  </div>
                  <span className={`${s['frame-mastery-badge']} ${s['badge-journeyman']}`}>Journeyman</span>
                </div>
                <div className={s['frame-mastery-item']}>
                  <div className={s['frame-mastery-jp']}>すみません</div>
                  <div className={s['frame-mastery-info']}>
                    <div className={s['frame-mastery-word']}>excuse me</div>
                    <div className={s['frame-mastery-sub']}>Spontaneous — interval extended</div>
                  </div>
                  <span className={`${s['frame-mastery-badge']} ${s['badge-apprentice']}`}>Apprentice IV</span>
                </div>
                <div className={s['frame-mastery-item']}>
                  <div className={s['frame-mastery-jp']}>メニュー</div>
                  <div className={s['frame-mastery-info']}>
                    <div className={s['frame-mastery-word']}>menu</div>
                    <div className={s['frame-mastery-sub']}>3 contexts · stable</div>
                  </div>
                  <span className={`${s['frame-mastery-badge']} ${s['badge-expert']}`}>Expert</span>
                </div>
              </div>
              <div className={s['frame-session-plan']}>
                <div className={s['frame-plan-header']}>Today&apos;s adaptive plan</div>
                <div className={s['frame-plan-item']}>
                  <span className={`${s['frame-plan-dot']} ${s['frame-plan-dot-done']}`} />Use ください in conversation ✓
                </div>
                <div className={s['frame-plan-item']}>
                  <span className={`${s['frame-plan-dot']} ${s['frame-plan-dot-done']}`} />Produce すみません ✓
                </div>
                <div className={s['frame-plan-item']}>
                  <span className={s['frame-plan-dot']} />Elicit 〜ありますか (stretch)
                </div>
              </div>
              <div className={s['frame-proactive-note']}>
                <div className={s['frame-proactive-label']}>⚡ Proactive</div>
                <div className={s['frame-proactive-text']}>ありますか is your stretch challenge — Sensei will engineer a natural opportunity next.</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── TAGLINE BAND ── */}
      <div className={s['tagline-band']}>
        <div className={s['tagline-inner']}>
          <div className={`${s['tagline-item']} ${s.reveal}`}>
            <div className={s['tagline-icon']}>⚡</div>
            <div>
              <div className={s['tagline-heading']}>Proactive, not reactive</div>
              <div className={s['tagline-text']}>Acts before you forget. No overdue cards.</div>
            </div>
          </div>
          <div className={`${s['tagline-item']} ${s.reveal}`}>
            <div className={s['tagline-icon']}>🔗</div>
            <div>
              <div className={s['tagline-heading']}>One memory. Every surface.</div>
              <div className={s['tagline-text']}>Chat, flashcards, and reading share one model.</div>
            </div>
          </div>
          <div className={`${s['tagline-item']} ${s.reveal}`}>
            <div className={s['tagline-icon']}>🎯</div>
            <div>
              <div className={s['tagline-heading']}>Hyper-personalized from day one</div>
              <div className={s['tagline-text']}>Your model becomes irreplaceable over time.</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── ADAPTIVE ENGINE SECTION ── */}
      <div className={s['engine-section']} id="adaptive">
        <div className={s['engine-inner']}>
          <div className={s.reveal}>
            <div className={s['section-label']}>The Adaptive Engine</div>
            <h2 className={s['section-title']}>A living picture of <em>exactly</em> what you know —<br/>and a system that <em>acts on it.</em></h2>
          </div>

          {/* Frontier diagram */}
          <div className={`${s['frontier-diagram-wrap']} ${s.reveal}`}>
            <div className={s['frontier-visual']}>
              <div className={s['frontier-visual-inner']}>
                <div className={`${s['frontier-ring']} ${s['frontier-ring-unknown']}`} />
                <div className={`${s['frontier-ring']} ${s['frontier-ring-frontier']}`} />
                <div className={`${s['frontier-ring']} ${s['frontier-ring-comfortable']}`} />
                <div className={`${s['frontier-ring']} ${s['frontier-ring-mastered']}`} />
                <span className={`${s['frontier-label']} ${s['frontier-label-unknown']}`}>Not yet encountered</span>
                <span className={`${s['frontier-label']} ${s['frontier-label-frontier']}`}>← Learning frontier</span>
                <span className={`${s['frontier-label']} ${s['frontier-label-comfortable']}`}>Comfortable</span>
                <span className={`${s['frontier-label']} ${s['frontier-label-mastered']}`}>Mastered</span>
                <div className={s['frontier-nodes']}>
                  {/* Mastered */}
                  <div className={`${s['frontier-node']} ${s['frontier-node-mastered']}`} style={{ top: '44%', left: '42%' }}>食べる</div>
                  <div className={`${s['frontier-node']} ${s['frontier-node-mastered']}`} style={{ top: '52%', left: '52%' }}>好き</div>
                  <div className={`${s['frontier-node']} ${s['frontier-node-mastered']}`} style={{ top: '44%', left: '55%' }}>です</div>
                  {/* Comfortable */}
                  <div className={`${s['frontier-node']} ${s['frontier-node-comfortable']}`} style={{ top: '28%', left: '30%' }}>注文</div>
                  <div className={`${s['frontier-node']} ${s['frontier-node-comfortable']}`} style={{ top: '62%', left: '28%' }}>欲しい</div>
                  <div className={`${s['frontier-node']} ${s['frontier-node-comfortable']}`} style={{ top: '30%', left: '58%' }}>準備</div>
                  <div className={`${s['frontier-node']} ${s['frontier-node-comfortable']}`} style={{ top: '64%', left: '56%' }}>〜前に</div>
                  {/* Frontier */}
                  <div className={`${s['frontier-node']} ${s['frontier-node-frontier']}`} style={{ top: '14%', left: '42%' }}>〜てから</div>
                  <div className={`${s['frontier-node']} ${s['frontier-node-frontier']}`} style={{ top: '20%', left: '18%' }}>〜たら</div>
                  <div className={`${s['frontier-node']} ${s['frontier-node-frontier']}`} style={{ top: '76%', left: '22%' }}>敬語</div>
                  <div className={`${s['frontier-node']} ${s['frontier-node-frontier']}`} style={{ top: '74%', left: '60%' }}>〜ために</div>
                  {/* Unknown */}
                  <div className={`${s['frontier-node']} ${s['frontier-node-unknown']}`} style={{ top: '4%', left: '60%' }}>?</div>
                  <div className={`${s['frontier-node']} ${s['frontier-node-unknown']}`} style={{ top: '86%', left: '44%' }}>?</div>
                  <div className={`${s['frontier-node']} ${s['frontier-node-unknown']}`} style={{ top: '6%', left: '26%' }}>?</div>
                </div>
              </div>
            </div>
            <div>
              <div className={s['frontier-copy-title']}>Maps your skills — then <em>stretches the edge</em></div>
              <div className={s['frontier-legend']}>
                <div className={s['frontier-legend-item']}><div className={s['frontier-legend-marker']} style={{ background: 'rgba(74,222,128,.6)' }} /><div className={s['frontier-legend-label']}>Mastered — produced spontaneously</div></div>
                <div className={s['frontier-legend-item']}><div className={s['frontier-legend-marker']} style={{ background: 'rgba(96,165,250,.6)' }} /><div className={s['frontier-legend-label']}>Comfortable — needs more exposure</div></div>
                <div className={s['frontier-legend-item']}><div className={s['frontier-legend-marker']} style={{ background: 'var(--accent-warm)' }} /><div className={s['frontier-legend-label']}>Frontier — where growth happens</div></div>
                <div className={s['frontier-legend-item']}><div className={s['frontier-legend-marker']} style={{ background: 'var(--border-strong)' }} /><div className={s['frontier-legend-label']}>Not yet — waiting for readiness</div></div>
              </div>
            </div>
          </div>

          {/* Sub-heading */}
          <div className={`${s['engine-subheading']} ${s.reveal}`}>
            <h2 className={s['engine-subheading-title']}>One model.<br/><em>Every dimension.</em></h2>
            <p className={s['engine-subheading-desc']}>Speaking, listening, reading, writing — tracked independently. Every word across five mastery stages. The system sees where you&apos;re strong and where the gaps are.</p>
          </div>

          {/* Wide diagram row */}
          <div className={`${s['engine-wide-row']} ${s.reveal}`}>
            {/* Radar */}
            <div className={s['engine-panel']}>
              <div className={s['engine-panel-title']}>Modality balance</div>
              <div className={s['radar-visual']}>
                <svg viewBox="0 0 300 300" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <polygon points="150,30 270,150 150,270 30,150" stroke="#e9e9e7" strokeWidth="1" fill="none"/>
                  <polygon points="150,60 240,150 150,240 60,150" stroke="#e9e9e7" strokeWidth="1" fill="none"/>
                  <polygon points="150,90 210,150 150,210 90,150" stroke="#e9e9e7" strokeWidth="1" fill="none"/>
                  <polygon points="150,120 180,150 150,180 120,150" stroke="#e9e9e7" strokeWidth="1" fill="none"/>
                  <line x1="150" y1="30" x2="150" y2="270" stroke="#e9e9e7" strokeWidth="1"/>
                  <line x1="30" y1="150" x2="270" y2="150" stroke="#e9e9e7" strokeWidth="1"/>
                  <polygon points="150,58 232,150 150,195 68,150" fill="rgba(96,165,250,.08)" stroke="rgba(96,165,250,.3)" strokeWidth="1.5"/>
                  <circle cx="150" cy="58" r="5" fill="#60a5fa" stroke="#fff" strokeWidth="2"/>
                  <circle cx="232" cy="150" r="5" fill="#4ade80" stroke="#fff" strokeWidth="2"/>
                  <circle cx="150" cy="195" r="5" fill="var(--accent-warm)" stroke="#fff" strokeWidth="2"/>
                  <circle cx="68" cy="150" r="5" fill="#a78bfa" stroke="#fff" strokeWidth="2"/>
                  <text x="150" y="20" textAnchor="middle" fontFamily="Geist,sans-serif" fontSize="12" fontWeight="600" fill="#1a1a1a">Reading</text>
                  <text x="282" y="154" textAnchor="start" fontFamily="Geist,sans-serif" fontSize="12" fontWeight="600" fill="#1a1a1a">Listening</text>
                  <text x="150" y="292" textAnchor="middle" fontFamily="Geist,sans-serif" fontSize="12" fontWeight="600" fill="#c8572a">Speaking</text>
                  <text x="18" y="154" textAnchor="end" fontFamily="Geist,sans-serif" fontSize="12" fontWeight="600" fill="#1a1a1a">Writing</text>
                  <line x1="150" y1="195" x2="188" y2="228" stroke="var(--accent-warm)" strokeWidth="1" strokeDasharray="3,3"/>
                  <rect x="166" y="222" width="112" height="24" rx="4" fill="rgba(200,87,42,.08)" stroke="rgba(200,87,42,.2)" strokeWidth="1"/>
                  <text x="222" y="238" textAnchor="middle" fontFamily="Geist,sans-serif" fontSize="9.5" fontWeight="600" fill="#c8572a">↑ Gap detected — focus here</text>
                </svg>
              </div>
              <div className={s['radar-legend']}>
                <div className={s['radar-legend-item']}><div className={s['radar-legend-dot']} style={{ background: '#60a5fa' }} /><span className={s['radar-legend-label']}>Reading</span><span className={s['radar-legend-value']}>N4</span></div>
                <div className={s['radar-legend-item']}><div className={s['radar-legend-dot']} style={{ background: '#4ade80' }} /><span className={s['radar-legend-label']}>Listening</span><span className={s['radar-legend-value']}>N4–N5</span></div>
                <div className={s['radar-legend-item']}><div className={s['radar-legend-dot']} style={{ background: 'var(--accent-warm)' }} /><span className={s['radar-legend-label']}>Speaking</span><span className={s['radar-legend-value']}>N5</span></div>
                <div className={s['radar-legend-item']}><div className={s['radar-legend-dot']} style={{ background: '#a78bfa' }} /><span className={s['radar-legend-label']}>Writing</span><span className={s['radar-legend-value']}>N5</span></div>
              </div>
            </div>

            {/* Mastery breakdown */}
            <div className={s['engine-panel']}>
              <div className={s['engine-panel-title']}>Mastery breakdown</div>
              <div className={s['mastery-states']}>
                {[
                  { name: 'Master', color: '#4ade80', width: '18%', count: '214' },
                  { name: 'Expert', color: '#60a5fa', width: '32%', count: '381' },
                  { name: 'Journeyman', color: '#f59e0b', width: '24%', count: '287' },
                  { name: 'Apprentice', color: '#f87171', width: '14%', count: '168' },
                  { name: 'Introduced', color: '#e5e7eb', width: '12%', count: '143' },
                ].map((row) => (
                  <div key={row.name} className={s['mastery-row']}>
                    <div className={s['mastery-dot']} style={{ background: row.color }} />
                    <span className={s['mastery-state-name']}>{row.name}</span>
                    <div className={s['mastery-bar-wrap']}>
                      <div className={s['mastery-bar-fill']} style={{ width: row.width, background: row.color }} />
                    </div>
                    <span className={s['mastery-count']}>{row.count}</span>
                  </div>
                ))}
              </div>
              <div className={s['mastery-note']}>Advancing past Apprentice requires <em>producing</em> the word in conversation — not just recognizing it.</div>
            </div>
          </div>

          {/* Points */}
          <div className={`${s['engine-points-row']} ${s.reveal}`}>
            <div className={s['engine-point']}>
              <div className={s['engine-point-number']}>01</div>
              <div className={s['engine-point-title']}>Always <em>current</em></div>
              <div className={s['engine-point-desc']}>Every turn, tap, and flashcard writes to the same model in real time.</div>
            </div>
            <div className={s['engine-point']}>
              <div className={s['engine-point-number']}>02</div>
              <div className={s['engine-point-title']}>Everything <em>reads from it</em></div>
              <div className={s['engine-point-desc']}>Conversations, reviews, clips, and lessons all draw from one source.</div>
            </div>
            <div className={s['engine-point']}>
              <div className={s['engine-point-number']}>03</div>
              <div className={s['engine-point-title']}>Becomes <em>irreplaceable</em></div>
              <div className={s['engine-point-desc']}>Six months in, no other app can replicate what this knows about you.</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── STRUCTURED FLUENCY ── */}
      <div className={s['fluency-section']}>
        <div className={s['fluency-inner']}>
          <div className={s.reveal}>
            <div className={s['section-label']}>What you&apos;ll actually learn</div>
            <h2 className={s['section-title']}>Rigorous structure, delivered through<br/><em>real conversation.</em></h2>
          </div>
          <div className={s['fluency-grid']}>
            <div className={`${s['fluency-card']} ${s.reveal}`}>
              <div className={s['fluency-card-overline']}>
                <div className={`${s['fluency-card-icon']} ${s['fluency-card-icon-grammar']}`}>
                  <span style={{ fontFamily: 'var(--font-jp)', fontWeight: 500, color: '#1e40af' }}>文</span>
                </div>
                <span className={s['fluency-card-tag']}>Grammar</span>
              </div>
              <div className={s['fluency-card-title']}>Systematic grammar, taught in context</div>
              <div className={s['fluency-card-desc']}>Every pattern is sequenced and tracked — but you encounter it in conversation, not a textbook. You advance only when you can produce it.</div>
            </div>
            <div className={`${s['fluency-card']} ${s.reveal}`}>
              <div className={s['fluency-card-overline']}>
                <div className={`${s['fluency-card-icon']} ${s['fluency-card-icon-vocab']}`}>
                  <span style={{ fontSize: 14 }}>📖</span>
                </div>
                <span className={s['fluency-card-tag']}>Vocabulary</span>
              </div>
              <div className={s['fluency-card-title']}>Words you&apos;ll actually use, when you need them</div>
              <div className={s['fluency-card-desc']}>Frequency-ranked, introduced through dialogue, reinforced by flashcards drawn from your own conversations.</div>
            </div>
            <div className={`${s['fluency-card']} ${s.reveal}`}>
              <div className={s['fluency-card-overline']}>
                <div className={`${s['fluency-card-icon']} ${s['fluency-card-icon-pragmatics']}`}>
                  <span style={{ fontSize: 14 }}>🎭</span>
                </div>
                <span className={s['fluency-card-tag']}>Pragmatics</span>
              </div>
              <div className={s['fluency-card-title']}>Sound right — not just be correct</div>
              <div className={s['fluency-card-desc']}>Formality, indirectness, social nuance. The unspoken rules textbooks barely cover.</div>
            </div>
            <div className={`${s['fluency-card']} ${s.reveal}`}>
              <div className={s['fluency-card-overline']}>
                <div className={`${s['fluency-card-icon']} ${s['fluency-card-icon-production']}`}>
                  <span style={{ fontSize: 14 }}>💬</span>
                </div>
                <span className={s['fluency-card-tag']}>Production</span>
              </div>
              <div className={s['fluency-card-title']}>You speak from day one</div>
              <div className={s['fluency-card-desc']}>No tapping, matching, or selecting. You generate language from scratch every session.</div>
            </div>
          </div>
          <div className={`${s['fluency-banner']} ${s.reveal}`}>
            <div className={s['fluency-banner-icon']}>🎯</div>
            <div>
              <div className={s['fluency-banner-title']}>The goal is always <em>conversational fluency</em></div>
              <div className={s['fluency-banner-text']}>Everything in Linguist exists in service of one thing: holding a real conversation in Japanese.</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── FEATURES ── */}
      <section className={`${s['section-tinted']}`} id="features">
        <div className={s.reveal}>
          <div className={s['section-label']}>Features</div>
          <h2 className={s['section-title']}>Five dimensions of fluency.<br/>One <em>seamless</em> system.</h2>
        </div>
        <div className={`${s['features-grid']} ${s.reveal}`}>
          <div className={s['feature-card']}>
            <div className={`${s['feature-icon-wrap']} ${s['feature-icon-wrap-jp']}`}>知</div>
            <div className={s['feature-title']}>Unified knowledge model</div>
            <div className={s['feature-desc']}>One live graph. Every activity updates it. No more siloed apps.</div>
          </div>
          <div className={s['feature-card']}>
            <div className={s['feature-icon-wrap']}>💬</div>
            <div className={s['feature-title']}>Purposeful conversations</div>
            <div className={s['feature-desc']}>Every chat has a hidden challenge layer targeting your weak points.</div>
          </div>
          <div className={s['feature-card']}>
            <div className={`${s['feature-icon-wrap']} ${s['feature-icon-wrap-jp']}`}>文</div>
            <div className={s['feature-title']}>Grammar when you&apos;re ready</div>
            <div className={s['feature-desc']}>New patterns unlock only when your foundation can support them.</div>
          </div>
          <div className={s['feature-card']}>
            <div className={s['feature-icon-wrap']}>⚡</div>
            <div className={s['feature-title']}>SRS that listens</div>
            <div className={s['feature-desc']}>Produce a word in conversation and its review interval extends automatically.</div>
          </div>
          <div className={s['feature-card']}>
            <div className={s['feature-icon-wrap']}>▶</div>
            <div className={s['feature-title']}>Native content, calibrated</div>
            <div className={s['feature-desc']}>Real clips shown only when you&apos;ll understand enough to acquire.</div>
          </div>
          <div className={s['feature-card']}>
            <div className={s['feature-icon-wrap']}>📈</div>
            <div className={s['feature-title']}>Progress you can feel</div>
            <div className={s['feature-desc']}>30-day proof reports show growth in sentences you can now read.</div>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className={s.section} id="how">
        <div className={s.reveal}>
          <div className={s['section-label']}>How it works</div>
          <h2 className={s['section-title']}>You choose what to do.<br/>The system chooses <em>what&apos;s inside it.</em></h2>
        </div>
        <div className={s['steps-grid']}>
          <div className={`${s['step-card']} ${s.reveal}`}>
            <div className={s['step-number']}>01</div>
            <div className={s['step-title']}>Have a conversation</div>
            <p className={s['step-desc']}>The system already knows your level, what&apos;s slipping, and what to push. Every session has a purpose you never have to set.</p>
            <span className={s['step-jp']}>毎日の会話練習</span>
          </div>
          <div className={`${s['step-card']} ${s.reveal}`}>
            <div className={s['step-number']}>02</div>
            <div className={s['step-title']}>A small, personal review</div>
            <p className={s['step-desc']}>Flashcards drawn from your own conversations. Words you&apos;re about to forget. Never generic, never more than needed.</p>
            <span className={s['step-jp']}>スマートな復習</span>
          </div>
          <div className={`${s['step-card']} ${s.reveal}`}>
            <div className={s['step-number']}>03</div>
            <div className={s['step-title']}>Watch and read real Japanese</div>
            <p className={s['step-desc']}>Native clips calibrated to your level. Every lookup updates the model. Five minutes on the train is never wasted.</p>
            <span className={s['step-jp']}>本物のコンテンツ</span>
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section className={s['section-dark']}>
        <div className={s.reveal}>
          <div className={s['section-label']}>From learners</div>
          <h2 className={s['section-title']}>What people actually notice.</h2>
        </div>
        <div className={s['testimonials-grid']}>
          <div className={`${s['testimonial-card']} ${s.reveal}`}>
            <p className={s['testimonial-quote']}>&ldquo;Linguist is the first app where I feel like it actually knows me — the right word shows up right when I&apos;m ready.&rdquo;</p>
            <span className={s['testimonial-jp']}>知ってる言葉がどんどん広がる感覚</span>
            <div className={s['testimonial-author']}>
              <div className={s['testimonial-avatar']}>KS</div>
              <div>
                <div className={s['testimonial-name']}>Kenji S.</div>
                <div className={s['testimonial-level']}>N4 · 8 months in</div>
              </div>
            </div>
          </div>
          <div className={`${s['testimonial-card']} ${s.reveal}`}>
            <p className={s['testimonial-quote']}>&ldquo;I used a flashcard word in conversation without thinking. That&apos;s never happened with any other app — ever.&rdquo;</p>
            <span className={s['testimonial-jp']}>自然に出てくるようになった</span>
            <div className={s['testimonial-author']}>
              <div className={s['testimonial-avatar']}>MR</div>
              <div>
                <div className={s['testimonial-name']}>Maya R.</div>
                <div className={s['testimonial-level']}>N5 → N4 in 4 months</div>
              </div>
            </div>
          </div>
          <div className={`${s['testimonial-card']} ${s.reveal}`}>
            <p className={s['testimonial-quote']}>&ldquo;Same NHK sentence, three months apart. I could read all of it. First time I truly believed I was improving.&rdquo;</p>
            <span className={s['testimonial-jp']}>成長が目で見えた瞬間</span>
            <div className={s['testimonial-author']}>
              <div className={s['testimonial-avatar']}>TN</div>
              <div>
                <div className={s['testimonial-name']}>Tom N.</div>
                <div className={s['testimonial-level']}>Intermediate · 1 year</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── WHY LINGUIST (Comparison) ── */}
      <section className={s.section}>
        <div className={s.reveal}>
          <div className={s['section-label']}>Why Linguist</div>
          <h2 className={s['section-title']}>Every other app teaches Japanese.<br/>Linguist <em>learns</em> you.</h2>
        </div>
        <div className={`${s['compare-wrap']} ${s.reveal}`}>
          <table className={s['compare-table']}>
            <thead>
              <tr>
                <th>Capability</th>
                <th>Duolingo</th>
                <th>Anki + tutor</th>
                <th className={s['compare-table-linguist-th']}>Linguist</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Personalized to your exact knowledge</td>
                <td className={s['check-partial']}>Partial</td>
                <td className={s['check-no']}>No</td>
                <td className={`${s['compare-table-linguist-td']} ${s['check-yes']}`}>Yes — every mode, always</td>
              </tr>
              <tr>
                <td>Proactive — acts before you forget</td>
                <td className={s['check-no']}>No</td>
                <td className={s['check-no']}>No</td>
                <td className={`${s['compare-table-linguist-td']} ${s['check-yes']}`}>Monitors retention continuously</td>
              </tr>
              <tr>
                <td>Conversations target weak points</td>
                <td className={s['check-no']}>No</td>
                <td className={s['check-partial']}>Depends</td>
                <td className={`${s['compare-table-linguist-td']} ${s['check-yes']}`}>Every session, automatically</td>
              </tr>
              <tr>
                <td>SRS updated by conversation</td>
                <td className={s['check-no']}>No</td>
                <td className={s['check-no']}>No</td>
                <td className={`${s['compare-table-linguist-td']} ${s['check-yes']}`}>Production = longer interval</td>
              </tr>
              <tr>
                <td>Requires production to advance</td>
                <td className={s['check-no']}>No</td>
                <td className={s['check-partial']}>Partial</td>
                <td className={`${s['compare-table-linguist-td']} ${s['check-yes']}`}>Always — conversation gated</td>
              </tr>
              <tr>
                <td>Native content calibrated to level</td>
                <td className={s['check-no']}>No</td>
                <td className={s['check-no']}>No</td>
                <td className={`${s['compare-table-linguist-td']} ${s['check-yes']}`}>98% comprehension threshold</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* ── STATS ── */}
      <div className={s['stats-section']}>
        <div className={s['stats-inner']}>
          <div className={`${s['stat-block']} ${s.reveal}`}>
            <span className={s['stat-jp']}>学習者</span>
            <div className={s['stat-num']}>2,400+</div>
            <div className={s['stat-label']}>Active learners in beta</div>
          </div>
          <div className={`${s['stat-block']} ${s.reveal}`}>
            <span className={s['stat-jp']}>単語</span>
            <div className={s['stat-num']}>48K</div>
            <div className={s['stat-label']}>Vocabulary items tracked</div>
          </div>
          <div className={`${s['stat-block']} ${s.reveal}`}>
            <span className={s['stat-jp']}>文法</span>
            <div className={s['stat-num']}>600+</div>
            <div className={s['stat-label']}>Grammar patterns</div>
          </div>
          <div className={`${s['stat-block']} ${s.reveal}`}>
            <span className={s['stat-jp']}>定着</span>
            <div className={s['stat-num']}>89%</div>
            <div className={s['stat-label']}>30-day retention rate</div>
          </div>
        </div>
      </div>

      {/* ── CTA ── */}
      <div className={s['cta-section']}>
        <div className={`${s['cta-band']} ${s.reveal}`}>
          <div className={s['cta-jp-watermark']}>語</div>
          <div>
            <h2 className={s['cta-title']}>A system that adapts to <em>you</em> — from the first message.</h2>
            <p className={s['cta-sub']}>Free during beta. No credit card required.</p>
          </div>
          <div className={s['cta-actions']}>
            <Link href="/sign-in" className={s['btn-cta-white']}>Get started free →</Link>
            <button className={s['btn-cta-ghost']}>No account needed to try</button>
          </div>
        </div>
      </div>

      {/* ── FOOTER ── */}
      <footer className={s.footer}>
        <div className={s['footer-left']}>
          <Link href="/" className={s['footer-logo']}>
            <div className={s['footer-logo-mark']}><LogoSVG size={17} /></div>
            <span className={s['footer-logo-name']}>Linguist</span>
          </Link>
          <span className={s['footer-copy']}>© 2026 Linguist. All rights reserved.</span>
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
