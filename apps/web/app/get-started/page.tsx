'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google'
import { createClient } from '@/lib/supabase/client'

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!

const FLOATING_CHARS = [
  '\u3042', '\uD55C', '\u4F60', 'Hola', '\u304B', '\uBB38', '\u597D', 'Bonjour',
  '\u8A71', '\uD559', '\u4E16', '\u00F1', '\u30A2', '\uBC95', '\u754C', '\u00FC',
  '\u5B66', 'Ciao', '\u8A00', '\uC5B4', '\u97F3', 'Ol\u00E1', '\u8AAD', '\u00E7',
  '\u66F8', '\uC0AC', '\u58F0', 'Gr\u00FC\u00DF', '\u805E', '\u611B',
]

function FloatingCharacters() {
  const chars = useMemo(() =>
    FLOATING_CHARS.map((char, i) => ({
      char,
      left: `${5 + (i * 31.7) % 90}%`,
      top: `${8 + (i * 23.3) % 80}%`,
      delay: (i * 0.4) % 5,
      duration: 6 + (i % 4) * 2,
      size: 22 + (i % 3) * 10,
    })), [])

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes floatChar {
          0%, 100% { transform: translateY(0px) rotate(-3deg); }
          50% { transform: translateY(-20px) rotate(5deg); }
        }
      `}} />
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0" aria-hidden="true">
        {chars.map((c, i) => (
          <span
            key={i}
            style={{
              position: 'absolute',
              left: c.left,
              top: c.top,
              fontSize: c.size,
              color: '#9b9b9b',
              opacity: 0.15,
              fontFamily: '"Noto Sans JP", sans-serif',
              userSelect: 'none',
              animation: `floatChar ${c.duration}s ease-in-out ${c.delay}s infinite`,
            }}
          >
            {c.char}
          </span>
        ))}
      </div>
    </>
  )
}

export default function GetStartedPage() {
  const router = useRouter()
  const [showAuth, setShowAuth] = useState(false)
  const [signingIn, setSigningIn] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Check if user is already authenticated
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        router.push('/dashboard')
      }
    })
  }, [router])

  const handleCredentialResponse = async (credential: string) => {
    setSigningIn(true)
    setError(null)
    try {
      const supabase = createClient()
      const { error: authError } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: credential,
      })
      if (authError) {
        setError(authError.message)
        setSigningIn(false)
        return
      }

      // Sync user to Prisma DB and check onboarding
      const res = await fetch('/api/auth/sync-user', { method: 'POST' })
      if (res.ok) {
        const { onboardingCompleted } = await res.json()
        router.push(onboardingCompleted ? '/dashboard' : '/onboarding')
      } else {
        router.push('/dashboard')
      }
    } catch {
      setError('Something went wrong. Please try again.')
      setSigningIn(false)
    }
  }

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <div className="min-h-screen flex flex-col bg-bg relative overflow-hidden">
        <FloatingCharacters />
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
            <span className="text-[9px] font-semibold tracking-wide uppercase bg-bg-hover text-text-secondary border border-border-strong rounded-sm px-1.5 py-0.5 leading-none">Beta</span>
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
          <h1 className="text-[clamp(36px,5vw,64px)] font-bold text-text-primary tracking-[-0.04em] leading-[1.12] mb-4">
            Your language learning<br />experience{' '}
            <span className="font-serif italic font-light">starts here</span>
          </h1>

          <p className="text-[17px] text-text-secondary mb-10 max-w-[440px] leading-relaxed">
            Sign up to immerse yourself in real conversations, tailored to your level.
          </p>

          {/* CTA */}
          <button
            onClick={() => setShowAuth(true)}
            className="rounded-xl bg-accent-brand px-8 py-3 text-[15px] font-semibold text-white border-none cursor-pointer transition-all duration-150 hover:shadow-md hover:scale-[1.02] active:scale-[0.98]"
          >
            Get started free
          </button>

          <p className="text-[13px] text-text-muted mt-4">
            No credit card required.
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
                <div className="flex items-center justify-center gap-2">
                  <span className="font-serif text-[28px] font-normal italic text-text-primary">
                    Lingle
                  </span>
                  <span className="text-[9px] font-semibold tracking-wide uppercase bg-bg-hover text-text-secondary border border-border-strong rounded-sm px-1.5 py-0.5 leading-none">Beta</span>
                </div>
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
              <div className="flex justify-center">
                {signingIn ? (
                  <div className="py-3 text-[14px] text-text-muted">Signing in...</div>
                ) : (
                  <GoogleLogin
                    onSuccess={(credentialResponse) => {
                      if (credentialResponse.credential) {
                        handleCredentialResponse(credentialResponse.credential)
                      }
                    }}
                    onError={() => setError('Google sign-in failed. Please try again.')}
                    theme="outline"
                    size="large"
                    shape="rectangular"
                    text="continue_with"
                    width="356"
                  />
                )}
              </div>

              <p className="text-[11px] text-text-muted text-center mt-5 leading-normal">
                By continuing, you accept our Privacy Policy and Terms of Use.
              </p>
            </div>
          </div>
        )}
      </div>
    </GoogleOAuthProvider>
  )
}
