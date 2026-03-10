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
        {['conversation partner', 'personal tutor', 'debate opponent', 'interview coach', 'travel companion', 'conversation partner'].map((word, i) => (
          <span key={i} className={s['cycle-word']}>{word}</span>
        ))}
      </span>
    </span>
  )
}

/* ── Animated Placeholder ── */
function AnimatedPlaceholder({ items }: { items: string[] }) {
  const innerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const inner = innerRef.current
    if (!inner) return
    const itemH = 26.4
    let idx = 0
    const els = inner.querySelectorAll(`.${s['placeholder-item']}`)

    const interval = setInterval(() => {
      idx++
      if (idx >= els.length - 1) {
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
        {items.map((text, i) => (
          <span key={i} className={s['placeholder-item']}>{text}</span>
        ))}
      </div>
    </div>
  )
}

/* ── Greeting Marquee ── */
const MARQUEE_GREETINGS = [
  { flag: '\uD83C\uDDEF\uD83C\uDDF5', text: '\u3053\u3093\u306B\u3061\u306F' },
  { flag: '\uD83C\uDDF0\uD83C\uDDF7', text: '\uC548\uB155\uD558\uC138\uC694' },
  { flag: '\uD83C\uDDE8\uD83C\uDDF3', text: '\u4F60\u597D' },
  { flag: '\uD83C\uDDEA\uD83C\uDDF8', text: '\u00A1Hola!' },
  { flag: '\uD83C\uDDEB\uD83C\uDDF7', text: 'Bonjour !' },
  { flag: '\uD83C\uDDE9\uD83C\uDDEA', text: 'Hallo!' },
  { flag: '\uD83C\uDDEE\uD83C\uDDF9', text: 'Ciao!' },
  { flag: '\uD83C\uDDE7\uD83C\uDDF7', text: 'Ol\u00E1!' },
]

function GreetingMarquee() {
  const items = [...MARQUEE_GREETINGS, ...MARQUEE_GREETINGS]
  return (
    <div className={s['marquee-wrap']} aria-hidden="true">
      <div className={s['marquee-track']}>
        {items.map((g, i) => (
          <span key={i} className={s['marquee-item']}>
            <span className={s['marquee-flag']}>{g.flag}</span>
            <span className={s['marquee-text']}>{g.text}</span>
          </span>
        ))}
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
    { key: 'conversation', icon: '🗣️', label: 'Conversation', comingSoon: false },
    { key: 'lesson', icon: '📖', label: 'Lesson', comingSoon: true },
    { key: 'immersion', icon: '🎧', label: 'Immersion', comingSoon: true },
    { key: 'reference', icon: '📚', label: 'Reference', comingSoon: true },
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
          {m.comingSoon && <span className={s['mode-btn-soon']}>Soon</span>}
        </button>
      ))}
    </div>
  )
}

/* ── Kanji Grid with shimmer effect ── */
function KanjiGrid() {
  const gridRef = useRef<HTMLDivElement>(null)
  const kanji = ['学','한','你','語','Hola','話','문','好','力','Café','聞','법','世','Ciao','界']

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
              `.${s['step-col']}, .${s['quote-card']}, .${s['stats-band-item']}, .${s['cs-item']}, .${s['level-row']}, .${s['bento-card']}, .${s['what-card']}`
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
const levelData: { num: number; width: string; name: string; tag: string; preview: string }[] = [
  { num: 1, width: '17%', name: 'Beginner', tag: 'Basic', preview: 'Simple phrases with full translation support. One sentence at a time.' },
  { num: 2, width: '33%', name: 'Elementary', tag: 'Guided', preview: 'Short sentences with key vocabulary highlighted. Annotations for complex words.' },
  { num: 3, width: '50%', name: 'Intermediate', tag: 'Mixed', preview: 'Natural sentences mixing familiar and new patterns. Less English scaffolding.' },
  { num: 4, width: '67%', name: 'Upper-Int.', tag: 'Natural', preview: 'Fluid conversation at natural speed. Colloquial expressions and contractions.' },
  { num: 5, width: '83%', name: 'Advanced', tag: 'Fluent', preview: 'Complex topics, nuanced vocabulary, idiomatic speech. Minimal English.' },
  { num: 6, width: '100%', name: 'Near-Native', tag: 'Native', preview: 'Unrestricted vocabulary and grammar. Regional expressions and slang.' },
]

/* ── Language Pills ── */
const LANG_PILLS = [
  { id: 'Japanese', flag: '\uD83C\uDDEF\uD83C\uDDF5', label: 'Japanese' },
  { id: 'Korean', flag: '\uD83C\uDDF0\uD83C\uDDF7', label: 'Korean' },
  { id: 'Mandarin Chinese', flag: '\uD83C\uDDE8\uD83C\uDDF3', label: 'Chinese' },
  { id: 'Spanish', flag: '\uD83C\uDDEA\uD83C\uDDF8', label: 'Spanish' },
  { id: 'French', flag: '\uD83C\uDDEB\uD83C\uDDF7', label: 'French' },
  { id: 'German', flag: '\uD83C\uDDE9\uD83C\uDDEA', label: 'German' },
  { id: 'Italian', flag: '\uD83C\uDDEE\uD83C\uDDF9', label: 'Italian' },
  { id: 'Portuguese', flag: '\uD83C\uDDE7\uD83C\uDDF7', label: 'Portuguese' },
]

/* ── Default content (no language selected) ── */
const DEFAULT_CHIPS = [
  { emoji: '\uD83C\uDF7D\uFE0F', label: 'Ordering food' },
  { emoji: '\uD83D\uDCBC', label: 'Job interview' },
  { emoji: '\uD83D\uDE89', label: 'Asking for directions' },
  { emoji: '\u2615', label: 'Caf\u00E9 small talk' },
  { emoji: '\uD83D\uDCDA', label: 'Grammar lesson' },
]

const DEFAULT_PLACEHOLDERS = [
  'I want to practice ordering food at a restaurant...',
  'Teach me common grammar patterns for everyday conversation...',
  'Show me what a formal job interview sounds like...',
  'I want to practice small talk with a coworker...',
  'Let\u2019s just chat casually about weekend plans...',
  'I want to practice ordering food at a restaurant...',
]

const DEFAULT_PROMPT_MAP: Record<string, string> = {
  'Ordering food': 'I want to practice ordering food at a restaurant. Keep it at my level.',
  'Job interview': 'Let\'s practice a job interview. I\'m applying for an office position.',
  'Asking for directions': 'I need to practice asking for directions at a train station.',
  'Caf\u00E9 small talk': 'Let\'s just chat casually over coffee. Keep it natural and friendly.',
  'Grammar lesson': 'Teach me a useful grammar pattern for everyday conversation.',
}

/* ── Per-language content ── */
const LANGUAGE_CONTENT: Record<string, {
  chips: { emoji: string; label: string }[]
  placeholders: string[]
  promptMap: Record<string, string>
}> = {
  Japanese: {
    chips: [
      { emoji: '\uD83C\uDF5C', label: 'Ordering ramen' },
      { emoji: '\uD83D\uDCBC', label: 'Job interview' },
      { emoji: '\uD83D\uDE89', label: 'At the station' },
      { emoji: '\u2615', label: 'Caf\u00E9 chat' },
      { emoji: '\uD83D\uDCDA', label: 'Keigo basics' },
    ],
    placeholders: [
      'I want to practice ordering ramen at a restaurant...',
      'Help me prepare for a job interview in Japanese...',
      'Let\u2019s practice asking for directions at a train station...',
      'I want to have a casual chat with a coworker...',
      'Teach me the basics of keigo for work situations...',
      'I want to practice ordering ramen at a restaurant...',
    ],
    promptMap: {
      'Ordering ramen': 'I want to practice ordering ramen at a Japanese restaurant. Keep it at my level.',
      'Job interview': 'Let\'s practice a job interview in Japanese. I\'m applying for an office position.',
      'At the station': 'I need to practice asking for directions at a Japanese train station.',
      'Caf\u00E9 chat': 'Let\'s have a casual chat over coffee in Japanese.',
      'Keigo basics': 'Teach me the basics of keigo (honorific speech) in Japanese.',
    },
  },
  Korean: {
    chips: [
      { emoji: '\uD83C\uDF72', label: 'Korean BBQ' },
      { emoji: '\uD83C\uDFE2', label: 'Office Korean' },
      { emoji: '\uD83D\uDED2', label: 'Market shopping' },
      { emoji: '\u2615', label: 'Caf\u00E9 date' },
      { emoji: '\uD83D\uDCDA', label: 'Honorifics' },
    ],
    placeholders: [
      'I want to practice ordering at a Korean BBQ restaurant...',
      'Help me with formal Korean for office meetings...',
      'Let\u2019s practice shopping at a traditional market...',
      'I want to practice casual Korean at a caf\u00E9...',
      'Teach me Korean honorific levels and when to use them...',
      'I want to practice ordering at a Korean BBQ restaurant...',
    ],
    promptMap: {
      'Korean BBQ': 'I want to practice ordering at a Korean BBQ restaurant. Keep it at my level.',
      'Office Korean': 'Help me practice formal Korean for a business meeting.',
      'Market shopping': 'Let\'s practice shopping at a traditional Korean market.',
      'Caf\u00E9 date': 'I want to have a casual caf\u00E9 conversation in Korean.',
      'Honorifics': 'Teach me Korean honorific levels and when to use each one.',
    },
  },
  'Mandarin Chinese': {
    chips: [
      { emoji: '\uD83E\uDD5F', label: 'Dim sum' },
      { emoji: '\uD83C\uDFE2', label: 'Business meeting' },
      { emoji: '\uD83D\uDE95', label: 'Taking a taxi' },
      { emoji: '\uD83C\uDF75', label: 'Tea house chat' },
      { emoji: '\uD83D\uDCDA', label: 'Tones practice' },
    ],
    placeholders: [
      'I want to practice ordering dim sum at a restaurant...',
      'Help me prepare for a business meeting in Mandarin...',
      'Let\u2019s practice giving directions to a taxi driver...',
      'I want to have a casual conversation at a tea house...',
      'Help me practice Mandarin tones with common phrases...',
      'I want to practice ordering dim sum at a restaurant...',
    ],
    promptMap: {
      'Dim sum': 'I want to practice ordering dim sum at a Chinese restaurant. Keep it at my level.',
      'Business meeting': 'Help me practice formal Mandarin for a business meeting.',
      'Taking a taxi': 'Let\'s practice giving directions to a taxi driver in Chinese.',
      'Tea house chat': 'I want to have a casual chat at a tea house in Mandarin.',
      'Tones practice': 'Help me practice Mandarin tones with common words and phrases.',
    },
  },
  Spanish: {
    chips: [
      { emoji: '\uD83C\uDF77', label: 'Ordering tapas' },
      { emoji: '\uD83C\uDFD6\uFE0F', label: 'Beach vacation' },
      { emoji: '\uD83C\uDFE5', label: 'At the pharmacy' },
      { emoji: '\uD83D\uDC83', label: 'Nightlife chat' },
      { emoji: '\uD83D\uDCDA', label: 'Subjunctive mood' },
    ],
    placeholders: [
      'I want to practice ordering tapas at a bar in Madrid...',
      'Help me with Spanish for a beach vacation...',
      'Let\u2019s practice asking for medicine at a pharmacy...',
      'I want to practice casual nightlife conversation...',
      'Teach me the Spanish subjunctive with examples...',
      'I want to practice ordering tapas at a bar in Madrid...',
    ],
    promptMap: {
      'Ordering tapas': 'I want to practice ordering tapas and drinks at a bar in Spain. Keep it at my level.',
      'Beach vacation': 'Help me practice Spanish for a beach vacation in Barcelona.',
      'At the pharmacy': 'Let\'s practice asking for medicine at a Spanish pharmacy.',
      'Nightlife chat': 'I want to practice casual Spanish for going out in Madrid.',
      'Subjunctive mood': 'Teach me the Spanish subjunctive with practical examples.',
    },
  },
  French: {
    chips: [
      { emoji: '\uD83E\uDD50', label: 'At the boulangerie' },
      { emoji: '\uD83C\uDFDB\uFE0F', label: 'Museum visit' },
      { emoji: '\uD83D\uDE87', label: 'M\u00E9tro directions' },
      { emoji: '\uD83C\uDF77', label: 'Wine tasting' },
      { emoji: '\uD83D\uDCDA', label: 'Pass\u00E9 compos\u00E9' },
    ],
    placeholders: [
      'I want to practice ordering at a Parisian boulangerie...',
      'Help me discuss art at a French museum...',
      'Let\u2019s practice asking for directions in the m\u00E9tro...',
      'I want to practice wine tasting vocabulary...',
      'Teach me pass\u00E9 compos\u00E9 vs imparfait...',
      'I want to practice ordering at a Parisian boulangerie...',
    ],
    promptMap: {
      'At the boulangerie': 'I want to practice ordering bread and pastries at a French boulangerie. Keep it at my level.',
      'Museum visit': 'Help me practice talking about art at a museum in Paris.',
      'M\u00E9tro directions': 'Let\'s practice asking for directions in the Paris m\u00E9tro.',
      'Wine tasting': 'I want to practice wine tasting vocabulary and conversation in French.',
      'Pass\u00E9 compos\u00E9': 'Teach me the French pass\u00E9 compos\u00E9 vs imparfait with examples.',
    },
  },
  German: {
    chips: [
      { emoji: '\uD83C\uDF7A', label: 'Beer garden' },
      { emoji: '\uD83D\uDE82', label: 'Train station' },
      { emoji: '\uD83C\uDFEB', label: 'University life' },
      { emoji: '\uD83E\uDD68', label: 'At the bakery' },
      { emoji: '\uD83D\uDCDA', label: 'Cases & articles' },
    ],
    placeholders: [
      'I want to practice ordering at a German beer garden...',
      'Help me navigate a German train station...',
      'Let\u2019s practice university German for seminars...',
      'I want to practice ordering at a German bakery...',
      'Teach me German cases with practical examples...',
      'I want to practice ordering at a German beer garden...',
    ],
    promptMap: {
      'Beer garden': 'I want to practice ordering food and beer at a Biergarten. Keep it at my level.',
      'Train station': 'Help me practice buying tickets at a German train station.',
      'University life': 'Let\'s practice German for university seminars and student life.',
      'At the bakery': 'I want to practice ordering bread at a German B\u00E4ckerei.',
      'Cases & articles': 'Teach me German cases with practical examples.',
    },
  },
  Italian: {
    chips: [
      { emoji: '\uD83C\uDF5D', label: 'Trattoria dinner' },
      { emoji: '\uD83C\uDF66', label: 'Gelato shop' },
      { emoji: '\uD83D\uDDFA\uFE0F', label: 'Asking directions' },
      { emoji: '\uD83D\uDC57', label: 'Fashion shopping' },
      { emoji: '\uD83D\uDCDA', label: 'Verb conjugation' },
    ],
    placeholders: [
      'I want to practice ordering at an Italian trattoria...',
      'Help me order gelato and chat with the shop owner...',
      'Let\u2019s practice asking for directions in Italian...',
      'I want to practice shopping for clothes in Milan...',
      'Teach me Italian verb conjugation patterns...',
      'I want to practice ordering at an Italian trattoria...',
    ],
    promptMap: {
      'Trattoria dinner': 'I want to practice ordering dinner at a trattoria in Rome. Keep it at my level.',
      'Gelato shop': 'Help me practice ordering gelato and chatting with the shop owner.',
      'Asking directions': 'Let\'s practice asking for directions to landmarks in Italian.',
      'Fashion shopping': 'I want to practice shopping for clothes in a Milan boutique.',
      'Verb conjugation': 'Teach me Italian verb conjugation patterns with practical examples.',
    },
  },
  Portuguese: {
    chips: [
      { emoji: '\uD83C\uDFD6\uFE0F', label: 'Beach bar chat' },
      { emoji: '\u26BD', label: 'Football talk' },
      { emoji: '\uD83C\uDF7D\uFE0F', label: 'Restaurant order' },
      { emoji: '\uD83C\uDFB6', label: 'Music & culture' },
      { emoji: '\uD83D\uDCDA', label: 'Verb tenses' },
    ],
    placeholders: [
      'I want to practice ordering at a beach bar in Rio...',
      'Help me talk about football with a Brazilian fan...',
      'Let\u2019s practice ordering a traditional meal...',
      'I want to discuss Brazilian music and culture...',
      'Teach me Portuguese verb tenses with examples...',
      'I want to practice ordering at a beach bar in Rio...',
    ],
    promptMap: {
      'Beach bar chat': 'I want to practice casual conversation at a beach bar in Brazil. Keep it at my level.',
      'Football talk': 'Help me practice talking about football with Brazilians.',
      'Restaurant order': 'Let\'s practice ordering a traditional meal at a Brazilian restaurant.',
      'Music & culture': 'I want to discuss Brazilian music, bossa nova, and cultural traditions.',
      'Verb tenses': 'Teach me Portuguese verb tenses with practical examples.',
    },
  },
}

/* ── Subtitle Map ── */
const subtitles: Record<string, string> = {
  conversation: 'Describe the scene — Lingle becomes whoever you need. A waiter, a hiring manager, a debate partner, a patient tutor. Just start talking.',
  lesson: 'Coming soon — Tell Lingle what you want to learn. It builds a structured lesson around it — grammar, vocabulary, patterns — with practice woven in from the start.',
  immersion: 'Coming soon — Pick a scenario. Lingle generates a native-style exchange, reads it aloud, then walks you through every choice — so you can jump straight in.',
  reference: 'Coming soon — Ask about any grammar point, conjugation pattern, or cultural concept. Lingle generates a clear, textbook-style explanation with examples, tables, and context — all tailored to your level.',
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
  const [lvFading, setLvFading] = useState(false)
  const [activeLang, setActiveLang] = useState<string | null>(null)
  const promptRef = useRef<HTMLTextAreaElement>(null)
  const levelRowsRef = useRef<HTMLDivElement>(null)
  const userPausedRef = useRef(false)
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /* ── Language-aware content ── */
  const langContent = activeLang ? LANGUAGE_CONTENT[activeLang] : null
  const currentChips = langContent?.chips ?? DEFAULT_CHIPS
  const currentPlaceholders = langContent?.placeholders ?? DEFAULT_PLACEHOLDERS
  const currentPromptMap = langContent?.promptMap ?? DEFAULT_PROMPT_MAP

  /* ── Auto-cycle levels when in view ── */
  useEffect(() => {
    const container = levelRowsRef.current
    if (!container) return

    let lvIdx = 1 // start at level 2 (0-based index)
    let intervalId: ReturnType<typeof setInterval> | null = null

    function advanceLevel() {
      if (userPausedRef.current) return
      lvIdx = (lvIdx + 1) % levelData.length
      setLvFading(true)
      setTimeout(() => {
        setActiveLevel(levelData[lvIdx].num)
        setLvFading(false)
      }, 300)
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            intervalId = setInterval(advanceLevel, 1800)
            observer.disconnect()
          }
        })
      },
      { threshold: 0.4 }
    )

    observer.observe(container)

    return () => {
      observer.disconnect()
      if (intervalId) clearInterval(intervalId)
    }
  }, [])

  const handleLevelClick = useCallback((num: number) => {
    userPausedRef.current = true
    setLvFading(true)
    setTimeout(() => {
      setActiveLevel(num)
      setLvFading(false)
    }, 300)
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current)
    resumeTimerRef.current = setTimeout(() => { userPausedRef.current = false }, 6000)
  }, [])

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
    const text = currentPromptMap[label] || label
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
  }, [currentPromptMap])

  return (
    <div ref={revealRef}>
      <div className={s['paper-bg']} />

      {/* ── NAV ── */}
      <nav className={s.nav}>
        <Link href="/" className={s['nav-logo']}>
          <div className={s['nav-logo-mark']}><LogoSVG /></div>
          <span className={s['nav-logo-text']}>Lingle</span>
          <span className={s['nav-beta-badge']}>Beta</span>
        </Link>
        <div className={s['nav-right']}>
          <div className={s['nav-links']}>
            <Link href="/faq" className={s['nav-link']}>FAQ</Link>
            <Link href="/support" className={s['nav-link']}>Support</Link>
            <a href="https://discord.gg/GetfucF4" target="_blank" rel="noopener noreferrer" className={s['nav-link']} aria-label="Discord">Discord</a>
          </div>
          <div className={s['nav-divider']} />
          <Link href="/sign-in" className={s['btn-nav-secondary']}>Sign in</Link>
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
          Open beta &mdash; free for early learners
        </div>

        <div className={s['hero-title-wrap']}>
          <span className={s['hero-title-top']}>Your language learning</span>
          <div className={s['hero-title-bottom']}>
            <WordCycle />
          </div>
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
                <AnimatedPlaceholder key={activeLang || 'default'} items={currentPlaceholders} />
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

          {/* LANGUAGE PILLS */}
          <div className={s['lang-pills']}>
            {LANG_PILLS.map((lp) => (
              <button
                key={lp.id}
                className={`${s['lang-pill']} ${activeLang === lp.id ? s['lang-pill-active'] : ''}`}
                onClick={() => setActiveLang(activeLang === lp.id ? null : lp.id)}
              >
                <span className={s['lang-pill-flag']}>{lp.flag}</span>
                {lp.label}
              </button>
            ))}
          </div>

          {/* EXAMPLE CHIPS */}
          <div className={s['example-chips']}>
            {currentChips.map((chip) => (
              <button key={chip.label} className={s['example-chip']} onClick={() => fillPrompt(chip.label)}>
                {chip.emoji} <span>{chip.label}</span>
              </button>
            ))}
          </div>
        </div>

      </section>

      {/* ── WHAT IS LINGLE ── */}
      <section className={s['what-section']}>
        <div className={s['what-inner']}>
          <span className={s['what-label']}>What is Lingle</span>
          <h2 className={s['what-headline']}>Structured practice for<br/><em className={s['what-headline-em']}>deliberate learners.</em></h2>
          <p className={s['what-lead']}>There&rsquo;s a gap between memorizing words and actually speaking. Lingle sits in that gap. Describe what you want to practice &mdash; a scenario, a grammar point, a situation &mdash; and it generates a full conversational session around it, calibrated to your level, with real corrections built in.</p>

          <div className={`${s['what-grid']} ${s.reveal}`}>
            <div className={s['what-card']}>
              <div className={s['what-card-num']}>1</div>
              <div>
                <div className={s['what-card-title']}>You set the curriculum</div>
                <div className={s['what-card-body']}>&ldquo;Practice ordering food&rdquo; creates a different restaurant, a different server, different conversational wrinkles every time. No fixed syllabus &mdash; you practice exactly what you need, when you need it.</div>
              </div>
            </div>

            <div className={s['what-card']}>
              <div className={s['what-card-num']}>2</div>
              <div>
                <div className={s['what-card-title']}>Corrections that don&rsquo;t baby you</div>
                <div className={s['what-card-body']}>When you make a mistake, the AI recasts the correct form naturally in its response &mdash; the way a good tutor would. Every correction is surfaced visually so nothing slips past.</div>
              </div>
            </div>

            <div className={s['what-card']}>
              <div className={s['what-card-num']}>3</div>
              <div>
                <div className={s['what-card-title']}>Voice and text, side by side</div>
                <div className={s['what-card-body']}>Push-to-talk voice conversations with real-time streaming. The AI speaks back sentence by sentence. Text is always there alongside &mdash; read along, review, or switch freely.</div>
              </div>
            </div>

            <div className={s['what-card']}>
              <div className={s['what-card-num']}>4</div>
              <div>
                <div className={s['what-card-title']}>Difficulty that matches you</div>
                <div className={s['what-card-body']}>Six calibrated levels control vocabulary, grammar complexity, script annotations, and register. Set it once &mdash; everything adapts. No hand-holding at the top, no overwhelm at the bottom.</div>
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
            {/* Step 1 */}
            <div className={`${s['step-col']} ${s.reveal}`}>
              <span className={s['step-num']}>1</span>
              <div className={s['step-icon-art']}>
                <div className={s['step-mockup']}>
                  <div className={s['sm-chrome']}>
                    <div className={s['sm-dots']}><span className={`${s['sm-dot']} ${s['sm-r']}`} /><span className={`${s['sm-dot']} ${s['sm-y']}`} /><span className={`${s['sm-dot']} ${s['sm-g']}`} /></div>
                    <div className={s['sm-bar']} />
                  </div>
                  <div className={`${s['sm-body']} ${s['sm-body-pad']}`}>
                    <div className={s['sm-input-row']}>
                      <div className={s['sm-input-text']}>Practice ordering food at a restaurant&hellip;<span className={s['sm-cursor-blink']}>|</span></div>
                    </div>
                    <div className={s['sm-chiprow']}>
                      <span className={s['sm-chip']}>My level</span>
                      <span className={s['sm-chip']}>Casual</span>
                      <span className={s['sm-chip']}>Restaurant</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className={s['step-title']}>Describe the scene</div>
              <div className={s['step-desc']}>Type anything — a scenario, a grammar point, a situation you want to practice. Lingle builds it in seconds.</div>
            </div>
            {/* Step 2 */}
            <div className={`${s['step-col']} ${s.reveal}`}>
              <span className={s['step-num']}>2</span>
              <div className={s['step-icon-art']}>
                <div className={s['step-mockup']}>
                  <div className={s['sm-chrome']}>
                    <div className={s['sm-dots']}><span className={`${s['sm-dot']} ${s['sm-r']}`} /><span className={`${s['sm-dot']} ${s['sm-y']}`} /><span className={`${s['sm-dot']} ${s['sm-g']}`} /></div>
                    <div className={s['sm-bar']} />
                    <div className={s['sm-status-pill']}><span className={s['sm-live-dot']} />Live</div>
                  </div>
                  <div className={`${s['sm-body']} ${s['sm-voice-body']}`}>
                    <div className={s['sm-voice-top']}>
                      <div className={s['sm-voice-orb']}>
                        <div className={`${s['sm-orb-ring']} ${s['sm-orb-ring-1']}`} />
                        <div className={`${s['sm-orb-ring']} ${s['sm-orb-ring-2']}`} />
                        <div className={s['sm-orb-center']}>AI</div>
                      </div>
                      <div className={s['sm-voice-wave-col']}>
                        {[8,14,20,12,18,10,16].map((h, i) => (
                          <div key={i} className={s['sm-vw-bar']} style={{ '--svh': h + 'px', animationDelay: (i * 0.1) + 's' } as React.CSSProperties} />
                        ))}
                      </div>
                    </div>
                    <div className={s['sm-voice-transcript']}>Listening and responding in real time...</div>
                    <div className={s['sm-mic-row']}>
                      <div className={s['sm-mic-btn']}>
                        <svg width="9" height="12" viewBox="0 0 9 12" fill="none"><rect x="2.5" y="0" width="4" height="7" rx="2" fill="currentColor"/><path d="M1 5.5C1 7.7 2.6 9.5 4.5 9.5S8 7.7 8 5.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none"/><line x1="4.5" y1="9.5" x2="4.5" y2="11.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                      </div>
                      <span className={s['sm-mic-label']}>Your turn&hellip;</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className={s['step-title']}>Just start speaking</div>
              <div className={s['step-desc']}>Your AI partner listens and responds in real time. Corrections are woven in naturally, never breaking the flow.</div>
            </div>
            {/* Step 3 */}
            <div className={`${s['step-col']} ${s.reveal}`}>
              <span className={s['step-num']}>3</span>
              <div className={s['step-icon-art']}>
                <div className={s['step-mockup']}>
                  <div className={s['sm-chrome']}>
                    <div className={s['sm-dots']}><span className={`${s['sm-dot']} ${s['sm-r']}`} /><span className={`${s['sm-dot']} ${s['sm-y']}`} /><span className={`${s['sm-dot']} ${s['sm-g']}`} /></div>
                    <div className={s['sm-bar']} />
                  </div>
                  <div className={`${s['sm-body']} ${s['sm-review-body']}`}>
                    <div className={s['sm-review-top']}>
                      <div className={s['sm-score-circle']}>84</div>
                      <div className={s['sm-score-label']}>Session score</div>
                    </div>
                    <div className={s['sm-review-bars']}>
                      {[
                        { label: 'Naturalness', width: '82%', val: '82' },
                        { label: 'Grammar', width: '74%', val: '74' },
                        { label: 'Vocab', width: '69%', val: '69' },
                      ].map((row) => (
                        <div key={row.label} className={s['sm-rbar-row']}>
                          <span className={s['sm-rbar-label']}>{row.label}</span>
                          <div className={s['sm-rbar-track']}><div className={s['sm-rbar-fill']} style={{ width: row.width }} /></div>
                          <span className={s['sm-rbar-val']}>{row.val}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <div className={s['step-title']}>Review and improve</div>
              <div className={s['step-desc']}>Every session is saved with a full transcript, corrections, new vocabulary, and a score. Nothing slips past.</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── BENTO SECTION ── */}
      <section className={s['bento-section']} id="modes">
        <div className={s['bento-inner']}>
          <div className={`${s['bento-header']} ${s.reveal}`}>
            <h2 className={s['bento-heading']}>One way to practice today.</h2>
            <p className={s['bento-heading-dim']}>Three more coming.</p>
          </div>

          <div className={s['bento-grid']}>
            {/* Card 1: Conversation — dark voice call UI */}
            <div className={`${s['bento-card']} ${s['bento-card-main']} ${s['bento-card-conversation']} ${s.reveal}`}>
              <div className={`${s['bento-mockup-wrap']} ${s['bento-mockup-dark']}`}>
                <div className={`${s['bm-window']} ${s['bm-dark']}`}>
                  <div className={`${s['bm-chrome']} ${s['bm-chrome-dark']}`}>
                    <div className={s['bm-dots']}><span className={s['bm-dot']} /><span className={s['bm-dot']} /><span className={s['bm-dot']} /></div>
                    <div className={s['bm-title-text']}>Lingle &middot; Conversation</div>
                    <div className={s['bm-live-badge']}><span className={s['bm-live-dot-dark']} />Live</div>
                  </div>
                  <div className={s['bm-voice-body']}>
                    <div className={s['bm-scene-bar']}>
                      <span className={s['bm-scene-label']}>🍽️ Restaurant</span>
                      <span className={s['bm-scene-sep']}>&middot;</span>
                      <span className={s['bm-scene-level']}>B1</span>
                    </div>
                    <div className={s['bm-orb-area']}>
                      <div className={`${s['bm-orb-ring']} ${s['bm-orb-r1']}`} />
                      <div className={`${s['bm-orb-ring']} ${s['bm-orb-r2']}`} />
                      <div className={`${s['bm-orb-ring']} ${s['bm-orb-r3']}`} />
                      <div className={s['bm-orb']}>AI</div>
                    </div>
                    <div className={s['bm-speaking-label']}>Your AI partner <span className={s['bm-speaking-dot-wrap']}><span className={s['bm-sdot']} /><span className={s['bm-sdot']} style={{ animationDelay: '.2s' }} /><span className={s['bm-sdot']} style={{ animationDelay: '.4s' }} /></span></div>
                    <div className={s['bm-center-wave']}>
                      {[8,18,28,38,22,34,44,30,40,24,16,32,20].map((h, i) => (
                        <div key={i} className={s['bm-cwbar']} style={{ '--cwh': h + 'px', animationDelay: (i * 0.06).toFixed(2) + 's' } as React.CSSProperties} />
                      ))}
                    </div>
                    <div className={s['bm-live-line']}>Welcome! How many in your party?</div>
                    <div className={s['bm-user-row']}>
                      <div className={s['bm-user-mic']}>
                        <svg width="11" height="14" viewBox="0 0 11 14" fill="none"><rect x="3" y="0" width="5" height="8.5" rx="2.5" fill="currentColor"/><path d="M1 7C1 9.8 3 12 5.5 12S10 9.8 10 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" fill="none"/><line x1="5.5" y1="12" x2="5.5" y2="13.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                      </div>
                      <span className={s['bm-user-label']}>Your turn — speak now</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className={s['bento-text']}>
                <span className={`${s['bento-label']} ${s['bento-label-dark']}`}>Conversation</span>
                <h3 className={`${s['bento-title']} ${s['bento-title-dark']}`}>Speak to anyone.<br/>Any scene.</h3>
                <p className={`${s['bento-sub']} ${s['bento-sub-dark']}`}>Waiter. Interviewer. Debate partner. Just describe it and start talking.</p>
              </div>
            </div>

            {/* Card 2: Lesson — grammar lesson mockup */}
            <div className={`${s['bento-card']} ${s['bento-card-light']} ${s['bento-card-lesson']} ${s['bento-card-soon']} ${s.reveal}`}>
              <div className={s['bento-soon-badge']}>Coming soon</div>
              <div className={`${s['bento-mockup-wrap']} ${s['bento-mockup-light']}`}>
                <div className={`${s['bm-window']} ${s['bm-light']}`}>
                  <div className={`${s['bm-chrome']} ${s['bm-chrome-light']}`}>
                    <div className={`${s['bm-dots']} ${s['bm-dots-light']}`}><span className={s['bm-dot-l']} /><span className={s['bm-dot-l']} /><span className={s['bm-dot-l']} /></div>
                    <div className={`${s['bm-title-text']} ${s['bm-title-dark']}`}>Lingle &middot; Lesson</div>
                  </div>
                  <div className={s['bm-lesson-body']}>
                    <div className={s['bm-lesson-tag']}>Grammar</div>
                    <div className={s['bm-lesson-jp']}>Connecting actions in sequence</div>
                    <div className={s['bm-lesson-rule']}>Eat, drink, and talk — learn to chain verbs naturally</div>
                    <div className={s['bm-lesson-divider']} />
                    <div className={s['bm-lesson-practice-label']}>Try it</div>
                    <div className={s['bm-lesson-blank']}><span className={s['bm-blank-text']}>Complete the pattern...</span><span className={s['bm-cursor-dark']}>|</span></div>
                  </div>
                </div>
              </div>
              <div className={s['bento-text-mid']}>
                <span className={`${s['bento-label']} ${s['bento-label-dark']}`}>Lesson</span>
                <h3 className={`${s['bento-title']} ${s['bento-title-dark']}`}>Learn exactly<br/>what you ask for.</h3>
                <p className={`${s['bento-sub']} ${s['bento-sub-dark']}`}>Tell it the grammar point. It builds the full lesson around you.</p>
              </div>
            </div>

            {/* Card 3: Immersion — audio player mockup */}
            <div className={`${s['bento-card']} ${s['bento-card-light']} ${s['bento-card-immersion']} ${s['bento-card-soon']} ${s.reveal}`}>
              <div className={s['bento-soon-badge']}>Coming soon</div>
              <div className={`${s['bento-mockup-wrap']} ${s['bento-mockup-light']}`}>
                <div className={`${s['bm-window']} ${s['bm-light']}`}>
                  <div className={`${s['bm-chrome']} ${s['bm-chrome-light']}`}>
                    <div className={`${s['bm-dots']} ${s['bm-dots-light']}`}><span className={s['bm-dot-l']} /><span className={s['bm-dot-l']} /><span className={s['bm-dot-l']} /></div>
                    <div className={`${s['bm-title-text']} ${s['bm-title-dark']}`}>Lingle &middot; Immersion</div>
                  </div>
                  <div className={s['bm-imm-body']}>
                    <div className={s['bm-imm-player']}>
                      <div className={s['bm-play-btn']}>&#9654;</div>
                      <div className={s['bm-imm-wave']}>
                        {[10,16,8,20,12,18,14,22].map((h, i) => (
                          <div key={i} className={`${s['bm-ibar']} ${i < 3 ? s['bm-ibar-played'] : ''}`} style={{ '--ih': h + 'px' } as React.CSSProperties} />
                        ))}
                      </div>
                      <div className={s['bm-imm-time']}>0:14</div>
                    </div>
                    <div className={s['bm-transcript']}>
                      <div className={`${s['bm-tline']} ${s['bm-tline-active']}`}>
                        <span className={s['bm-tspeaker']}>A</span>
                        <span className={s['bm-ttext']} dangerouslySetInnerHTML={{ __html: '<ruby>今日<rt>きょう</rt></ruby>は<ruby>天気<rt>てんき</rt></ruby>がいいね。' }} />
                      </div>
                      <div className={s['bm-tline']}>
                        <span className={s['bm-tspeaker']}>B</span>
                        <span className={s['bm-ttext']}>そうだね、どこか行く？</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className={s['bento-text-mid']}>
                <span className={`${s['bento-label']} ${s['bento-label-dark']}`}>Immersion</span>
                <h3 className={`${s['bento-title']} ${s['bento-title-dark']}`}>Hear it native.<br/>Then speak it.</h3>
                <p className={`${s['bento-sub']} ${s['bento-sub-dark']}`}>Native audio. Read along. Then jump into a live version.</p>
              </div>
            </div>

            {/* Card 4: Reference — resource grid mockup */}
            <div className={`${s['bento-card']} ${s['bento-card-light']} ${s['bento-card-reference']} ${s['bento-card-soon']} ${s.reveal}`}>
              <div className={s['bento-soon-badge']}>Coming soon</div>
              <div className={`${s['bento-mockup-wrap']} ${s['bento-mockup-light']}`}>
                <div className={`${s['bm-window']} ${s['bm-light']}`}>
                  <div className={`${s['bm-chrome']} ${s['bm-chrome-light']}`}>
                    <div className={`${s['bm-dots']} ${s['bm-dots-light']}`}><span className={s['bm-dot-l']} /><span className={s['bm-dot-l']} /><span className={s['bm-dot-l']} /></div>
                    <div className={`${s['bm-title-text']} ${s['bm-title-dark']}`}>Lingle &middot; Reference</div>
                  </div>
                  <div className={s['bm-ref-body']}>
                    <div className={s['bm-ref-header']}>
                      <span className={s['bm-ref-label']}>Reference</span>
                      <div className={s['bm-ref-collapse']}>&or;</div>
                    </div>
                    <div className={s['bm-ref-grid']}>
                      {[
                        { icon: <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 2h3.5v8H2z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/><path d="M6.5 2H10v8H6.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg>, text: 'Core vocabulary deck' },
                        { icon: <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><rect x="1.5" y="7" width="9" height="3" rx="1" stroke="currentColor" strokeWidth="1.2"/><rect x="1.5" y="2" width="6" height="3" rx="1" stroke="currentColor" strokeWidth="1.2"/></svg>, text: 'Grammar cheat sheet' },
                        { icon: <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 10V3l4-1.5L10 3v7" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/><path d="M4.5 10V7h3v3" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg>, text: 'Verb conjugations' },
                        { icon: <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.2"/><path d="M4 5.5h4M4 7.5h2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>, text: 'Common set phrases' },
                        { icon: <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 3h8M2 6h6M2 9h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>, text: 'Writing system guide' },
                        { icon: <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.2"/><path d="M6 4v2.5l1.5 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>, text: 'Cultural etiquette' },
                      ].map((item) => (
                        <div key={item.text} className={s['bm-ref-item']}>
                          <div className={s['bm-ref-item-icon']}>{item.icon}</div>
                          <span className={s['bm-ref-item-text']}>{item.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <div className={s['bento-text-mid']}>
                <span className={`${s['bento-label']} ${s['bento-label-dark']}`}>Reference</span>
                <h3 className={`${s['bento-title']} ${s['bento-title-dark']}`}>Textbook depth,<br/>on demand.</h3>
                <p className={`${s['bento-sub']} ${s['bento-sub-dark']}`}>Ask about any concept. Get a structured explanation — grammar rules, example sets, conjugation tables, cultural context.</p>
              </div>
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
            <p className={s['adapt-body']}>Vocabulary, grammar complexity, script annotations, register — all controlled by a single level setting. You never have to think about it again.</p>
          </div>
          <div className={`${s['adapt-visual']} ${s.reveal}`} ref={levelRowsRef}>
            {levelData.map((lv) => (
              <div key={lv.num}>
                <div
                  className={`${s['level-row']} ${activeLevel === lv.num ? s['level-row-active'] : ''}`}
                  onClick={() => handleLevelClick(lv.num)}
                >
                  <span className={s['lv-num']}>{lv.num}</span>
                  <div className={s['lv-track']}><div className={s['lv-fill']} style={{ width: lv.width }} /></div>
                  <span className={s['lv-name']}>{lv.name}</span>
                  <span className={s['lv-jp']}>{lv.tag}</span>
                </div>
                {activeLevel === lv.num && (
                  <div className={`${s['lv-preview-jp']} ${lvFading ? s['lv-preview-fading'] : ''}`}>{lv.preview}</div>
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

      {/* ── FINAL CTA ── */}
      <section className={s['final-cta']}>
        <div className={s['final-cta-inner']}>
          <div className={s.reveal}>
            <h2 className={s['fctl-big']}>Stop studying.<br/>Start <span className={s['fctl-big-em']}>speaking.</span></h2>
            <p className={s['fctl-sub']}>Free during beta. No credit card needed. Sign in with Google and start speaking.</p>
          </div>
          <div className={`${s['final-cta-right']} ${s.reveal}`}>
            <Link href="/sign-in" className={s['btn-cta-primary']}>Start speaking free →</Link>
            <span className={s['cta-footnote']}>Free tier includes 10 minutes of conversation daily</span>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className={s.footer}>
        <div className={s['footer-left']}>
          <Link href="/" className={s['footer-logo']}>
            <div className={s['footer-logo-mark']}><LogoSVG size={13} /></div>
            <span className={s['footer-logo-name']}>Lingle</span>
            <span className={s['footer-beta-badge']}>Beta</span>
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
