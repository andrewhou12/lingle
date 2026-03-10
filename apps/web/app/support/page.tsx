'use client'

import Link from 'next/link'
import s from './support.module.css'

function LogoSVG({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <path d="M24 4C24 4, 18 7, 14 12C10 17, 8 23, 8 28C9 26, 11 21, 14 16C17 11, 21 7, 24 4Z" stroke="white" strokeWidth="2.2" strokeLinejoin="round" fill="none"/>
      <path d="M24 4C24 4, 27 9, 24 15C21 21, 16 26, 11 29C13 25, 17 20, 20 15C23 10, 26 7, 24 4Z" stroke="white" strokeWidth="2.2" strokeLinejoin="round" fill="none"/>
    </svg>
  )
}

export default function SupportPage() {
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
          <Link href="/faq" className={s['nav-link']}>FAQ</Link>
          <Link href="/sign-in" className={s['btn-nav-secondary']}>Sign in</Link>
          <Link href="/sign-in" className={s['btn-nav-primary']}>Get started free</Link>
        </div>
      </nav>

      <main className={s.main}>
        <h1 className={s.title}>Support</h1>
        <p className={s.lead}>We&rsquo;re a small team and we read everything. Reach out however works best for you.</p>

        <div className={s.cards}>
          <a href="mailto:andrew@lingle.ai" className={s.card}>
            <div className={s['card-icon']}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-10 7L2 7"/></svg>
            </div>
            <div className={s['card-title']}>Email</div>
            <div className={s['card-detail']}>andrew@lingle.ai</div>
            <div className={s['card-desc']}>Bug reports, feature requests, or anything else. We typically reply within a day.</div>
          </a>

          <a href="https://discord.gg/GetfucF4" target="_blank" rel="noopener noreferrer" className={s.card}>
            <div className={s['card-icon']}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>
            </div>
            <div className={s['card-title']}>Discord</div>
            <div className={s['card-detail']}>@axceldayo</div>
            <div className={s['card-desc']}>Join the community. Ask questions, share feedback, or just say hi.</div>
          </a>

        </div>
      </main>
    </div>
  )
}
