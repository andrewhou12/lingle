'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}

export default function GetStartedPage() {
  const router = useRouter()
  const [showAuth, setShowAuth] = useState(false)
  const [signingIn, setSigningIn] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [prompt, setPrompt] = useState('')

  useEffect(() => {
    try {
      const stored = localStorage.getItem('lingle_pending_prompt')
      if (stored) {
        const { prompt: p } = JSON.parse(stored)
        setPrompt(p)
      }
    } catch {}
  }, [])

  // Check if user is already authenticated
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        router.push('/conversation')
      }
    })
  }, [router])

  const handleGoogleSignIn = async () => {
    setSigningIn(true)
    setError(null)
    try {
      const supabase = createClient()
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=/onboarding`,
        },
      })
      if (authError) {
        setError(authError.message)
        setSigningIn(false)
      }
    } catch {
      setError('Something went wrong. Please try again.')
      setSigningIn(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-bg relative overflow-hidden">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 h-[54px] relative z-10 border-b border-border-subtle">
        <a href="/" className="flex items-center gap-2 no-underline">
          <div className="w-[30px] h-[30px] bg-accent-brand rounded-lg flex items-center justify-center shadow-[0_1px_3px_rgba(0,0,0,.2),inset_0_1px_0_rgba(255,255,255,.08)]">
            <svg width="17" height="17" viewBox="0 0 32 32" fill="none">
              <path d="M24 4C24 4, 18 7, 14 12C10 17, 8 23, 8 28C9 26, 11 21, 14 16C17 11, 21 7, 24 4Z" stroke="white" strokeWidth="2.2" strokeLinejoin="round" fill="none"/>
              <path d="M24 4C24 4, 27 9, 24 15C21 21, 16 26, 11 29C13 25, 17 20, 20 15C23 10, 26 7, 24 4Z" stroke="white" strokeWidth="2.2" strokeLinejoin="round" fill="none"/>
            </svg>
          </div>
          <span className="font-serif text-[18px] font-normal italic text-text-primary tracking-[-0.03em]">
            Lingle
          </span>
        </a>
        <div className="flex gap-2 items-center">
          <button
            onClick={() => setShowAuth(true)}
            className="text-[13px] text-text-secondary bg-transparent border-none px-3 py-1.5 rounded-md cursor-pointer hover:text-text-primary hover:bg-bg-hover transition-colors duration-150"
          >
            Sign In
          </button>
          <button
            onClick={() => setShowAuth(true)}
            className="text-[13px] font-medium text-white bg-accent-brand border-none rounded-xl px-4 py-[7px] cursor-pointer shadow-sm hover:shadow-md hover:scale-[1.02] transition-all duration-150"
          >
            Sign Up
          </button>
        </div>
      </nav>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center text-center px-6 relative z-[1]">
        <h1 className="text-[clamp(36px,5vw,64px)] font-bold text-text-primary tracking-[-0.04em] leading-[1.12] mb-6">
          Your learning experience<br />is{' '}
          <span className="font-serif italic font-light">almost ready</span>
        </h1>

        {/* Preview cards */}
        <div className="flex gap-4 mb-10">
          {/* Blurred chat preview */}
          <div className="w-[200px] h-[140px] rounded-xl border border-border-subtle bg-bg-pure p-4 flex flex-col gap-2 overflow-hidden shadow-sm">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-bg-active flex items-center justify-center text-[11px] text-text-muted font-semibold">
                AI
              </div>
              <div>
                <div className="text-[11px] text-text-secondary font-semibold">Lingle Agent</div>
                <div className="text-[11px] text-text-muted">Ready to chat</div>
              </div>
            </div>
            <div className="flex-1 rounded-lg bg-bg-secondary blur-[4px] flex flex-col gap-1.5 p-2">
              <div className="h-2 w-4/5 bg-bg-active rounded" />
              <div className="h-2 w-3/5 bg-bg-active rounded" />
              <div className="h-2 w-[70%] bg-bg-active rounded self-end" />
            </div>
          </div>

          <div className="w-[200px] h-[140px] rounded-xl border border-border-subtle bg-bg-pure p-4 flex flex-col gap-2 overflow-hidden shadow-sm">
            <div className="text-[11px] text-text-muted font-semibold tracking-[.06em] uppercase">
              Your prompt
            </div>
            <div className="flex-1 rounded-lg text-[13px] text-text-secondary leading-relaxed overflow-hidden">
              {prompt || 'Your conversation awaits...'}
            </div>
          </div>
        </div>

        {/* CTA */}
        <button
          onClick={() => setShowAuth(true)}
          className="rounded-xl bg-accent-brand px-8 py-3 text-[15px] font-semibold text-white border-none cursor-pointer transition-all duration-150 hover:shadow-md hover:scale-[1.02] active:scale-[0.98]"
        >
          Sign up for free to start
        </button>

        <p className="text-[13px] text-text-muted mt-4">
          Free forever. No credit card required.
        </p>
      </div>

      {/* Auth Modal Overlay */}
      {showAuth && (
        <div
          className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center animate-in fade-in duration-200"
          onClick={(e) => { if (e.target === e.currentTarget) setShowAuth(false) }}
        >
          <div className="w-full max-w-[420px] bg-bg-pure border border-border-subtle rounded-xl p-8 relative shadow-pop animate-in zoom-in-95 duration-200">
            {/* Close */}
            <button
              onClick={() => setShowAuth(false)}
              className="absolute top-4 right-4 w-7 h-7 rounded-lg bg-bg-hover border border-border-subtle cursor-pointer flex items-center justify-center text-text-muted text-[14px] hover:bg-bg-active transition-colors duration-150"
            >
              ✕
            </button>

            {/* Logo */}
            <div className="text-center mb-6">
              <span className="font-serif text-[28px] font-normal italic text-text-primary">
                Lingle
              </span>
              <div className="text-[15px] font-semibold text-text-primary mt-2">
                Create your account
              </div>
              <div className="text-[13px] text-text-secondary mt-1">
                Welcome! Sign in to get started.
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-warm-soft border border-warm-med text-accent-warm text-[13px] mb-4">
                {error}
              </div>
            )}

            {/* Google Sign In */}
            <button
              onClick={handleGoogleSignIn}
              disabled={signingIn}
              className={cn(
                "flex items-center justify-center gap-2.5 w-full py-3 px-4 bg-bg-secondary border border-border-subtle rounded-xl text-[14px] font-medium text-text-primary transition-all duration-150 hover:bg-bg-hover hover:border-border-strong",
                signingIn ? "cursor-wait opacity-60" : "cursor-pointer"
              )}
            >
              <GoogleLogo />
              {signingIn ? 'Signing in...' : 'Continue with Google'}
            </button>

            <p className="text-[11px] text-text-muted text-center mt-5 leading-normal">
              By continuing, you accept our Privacy Policy and Terms of Use.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
