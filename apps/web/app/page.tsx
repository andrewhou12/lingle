import Link from 'next/link'
import TopoCanvas from '@/components/TopoCanvas'
import styles from './landing.module.css'

export default function Home() {
  return (
    <div className={styles.page}>
      <TopoCanvas />

      {/* ── Header ── */}
      <header className={styles.header}>
        <Link href="/" className={styles.logo}>
          <div className={styles.logoMark}>語</div>
          Linguist
        </Link>
        <nav className={styles.nav}>
          <a href="#" className={styles.navLink}>Product</a>
          <a href="#" className={styles.navLink}>About</a>
          <a href="#" className={styles.navLink}>Blog</a>
          <Link href="/dashboard" className={styles.navCta}>Get Started</Link>
        </nav>
      </header>

      {/* ── Main ── */}
      <main className={styles.main}>
        <div className={styles.badge}>
          <div className={styles.badgeDot}>語</div>
          Now in beta &middot; Japanese V1
        </div>

        <h1 className={styles.heading}>
          Learn Japanese the way your <em>brain</em> does.
        </h1>

        <p className={styles.tagline}>
          Every review, conversation, and lookup updates a living model of what
          you know — so you always encounter exactly what you&apos;re ready for.
        </p>

        <div className={styles.ctaRow}>
          <Link href="/dashboard" className={styles.ctaPrimary}>
            Start Learning →
          </Link>
          <a href="#about" className={styles.ctaSecondary}>
            See how it works
          </a>
        </div>

        <div className={styles.socialProof}>
          <div className={styles.avatars}>
            <div className={styles.avatar}>語</div>
            <div className={styles.avatar}>知</div>
            <div className={styles.avatar}>学</div>
            <div className={styles.avatar}>脳</div>
          </div>
          Join learners building real fluency
        </div>
      </main>

      <div id="about" />

      {/* ── Footer ── */}
      <footer className={styles.footer}>
        <span className={styles.footerLeft}>© 2026 Linguist</span>
        <div className={styles.footerRight}>
          <a href="#" className={styles.footerLink}>Privacy</a>
          <a href="#" className={styles.footerLink}>Terms</a>
          <a href="#" className={styles.footerLink}>Support</a>
        </div>
      </footer>
    </div>
  )
}
