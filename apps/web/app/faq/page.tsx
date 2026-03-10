'use client'

import { useState } from 'react'
import Link from 'next/link'
import s from './faq.module.css'

function LogoSVG({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <path d="M24 4C24 4, 18 7, 14 12C10 17, 8 23, 8 28C9 26, 11 21, 14 16C17 11, 21 7, 24 4Z" stroke="white" strokeWidth="2.2" strokeLinejoin="round" fill="none"/>
      <path d="M24 4C24 4, 27 9, 24 15C21 21, 16 26, 11 29C13 25, 17 20, 20 15C23 10, 26 7, 24 4Z" stroke="white" strokeWidth="2.2" strokeLinejoin="round" fill="none"/>
    </svg>
  )
}

const FAQ_ITEMS = [
  {
    q: 'What is Lingle?',
    a: 'Lingle is a generative language practice engine. You describe what you want to practice — a scenario, a grammar point, a real-life situation — and it builds a structured conversational session around it, calibrated to your level. Text and voice.',
  },
  {
    q: 'What languages does Lingle support?',
    a: 'We\'re launching with Japanese, Korean, Mandarin Chinese, Spanish, French, German, Italian, and Portuguese.',
  },
  {
    q: 'Is Lingle free?',
    a: 'Yes, during the beta. The free tier includes 10 minutes of conversation daily. We\'ll introduce paid plans later for heavier usage.',
  },
  {
    q: 'How is this different from ChatGPT or other AI chatbots?',
    a: 'Generic chatbots will happily chat with you, but they don\'t structure the practice, calibrate difficulty, or give you rigorous corrections. Lingle generates sessions with a plan — target vocabulary, a personality, a difficulty ceiling — and every mistake gets surfaced clearly so nothing slips past.',
  },
  {
    q: 'How is this different from Duolingo?',
    a: 'Duolingo follows a fixed curriculum with pre-written exercises. Lingle is generative — every session is novel, built from your prompt, and focused on conversational practice rather than isolated vocabulary drills.',
  },
  {
    q: 'Does Lingle have voice?',
    a: 'Yes. Push-to-talk voice conversations with real-time streaming. The AI speaks back sentence by sentence as it generates. Text is always available alongside.',
  },
  {
    q: 'How do corrections work?',
    a: 'When you make a mistake, the AI uses the correct form naturally in its next response — the way a good tutor would. Corrections also appear as visual overlays on the transcript so you can review them.',
  },
  {
    q: 'What are the difficulty levels?',
    a: 'Six levels that control vocabulary, grammar complexity, script annotations (like furigana), and register. Set it once and everything adapts — from full beginner support to unrestricted native-level conversation.',
  },
  {
    q: 'Do I need to create an account?',
    a: 'Yes — sign in with Google. It takes a few seconds and lets us save your sessions and preferences.',
  },
  {
    q: 'Where can I give feedback or report bugs?',
    a: 'Join our Discord community! We read everything and ship fixes fast.',
  },
]

export default function FAQPage() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  return (
    <div className={s.page}>
      <nav className={s.nav}>
        <Link href="/" className={s['nav-logo']}>
          <div className={s['nav-logo-mark']}><LogoSVG /></div>
          <span className={s['nav-logo-text']}>Lingle</span>
          <span className={s['nav-beta-badge']}>Beta</span>
        </Link>
        <div className={s['nav-right']}>
          <Link href="/" className={s['nav-link']}>Home</Link>
          <a href="https://discord.gg/GetfucF4" target="_blank" rel="noopener noreferrer" className={s['nav-icon-link']} aria-label="Discord">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>
          </a>
          <Link href="/sign-in" className={s['btn-nav-secondary']}>Sign in</Link>
          <Link href="/sign-in" className={s['btn-nav-primary']}>Get started free</Link>
        </div>
      </nav>

      <main className={s.main}>
        <h1 className={s.title}>Frequently asked questions</h1>
        <div className={s.list}>
          {FAQ_ITEMS.map((item, i) => (
            <div
              key={i}
              className={`${s.item} ${openIndex === i ? s['item-open'] : ''}`}
            >
              <button
                className={s.question}
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
              >
                <span>{item.q}</span>
                <span className={s.chevron}>{openIndex === i ? '\u2212' : '+'}</span>
              </button>
              {openIndex === i && (
                <div className={s.answer}>{item.a}</div>
              )}
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
