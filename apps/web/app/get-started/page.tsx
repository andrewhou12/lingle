'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

function LogoSVG({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <path d="M24 4C24 4, 18 7, 14 12C10 17, 8 23, 8 28C9 26, 11 21, 14 16C17 11, 21 7, 24 4Z" stroke="white" strokeWidth="2.2" strokeLinejoin="round" fill="none"/>
      <path d="M24 4C24 4, 27 9, 24 15C21 21, 16 26, 11 29C13 25, 17 20, 20 15C23 10, 26 7, 24 4Z" stroke="white" strokeWidth="2.2" strokeLinejoin="round" fill="none"/>
    </svg>
  )
}

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
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #1a1a1a 0%, #2a1f1a 30%, #1a1a1a 60%, #1a2020 100%)',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Ambient glow */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'radial-gradient(ellipse 80% 60% at 50% 40%, rgba(200,87,42,.08) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* Nav */}
      <nav style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 32px',
        height: 54,
        position: 'relative',
        zIndex: 10,
      }}>
        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
          <div style={{
            width: 30, height: 30, background: '#2f2f2f', borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <LogoSVG />
          </div>
          <span style={{
            fontFamily: 'var(--font-serif)', fontSize: 18, fontWeight: 400,
            fontStyle: 'italic', color: '#f0ede8',
          }}>Lingle</span>
        </a>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={() => setShowAuth(true)}
            style={{
              fontFamily: 'var(--font-sans)', fontSize: 13.5, color: 'rgba(240,237,232,.5)',
              background: 'transparent', border: 'none', padding: '6px 12px',
              borderRadius: 6, cursor: 'pointer',
            }}
          >
            Sign In
          </button>
          <button
            onClick={() => setShowAuth(true)}
            style={{
              fontFamily: 'var(--font-sans)', fontSize: 13.5, fontWeight: 500,
              color: '#fff', background: '#2f2f2f', border: 'none',
              borderRadius: 10, padding: '7px 16px', cursor: 'pointer',
            }}
          >
            Sign Up
          </button>
        </div>
      </nav>

      {/* Main content */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '0 24px',
        position: 'relative',
        zIndex: 1,
      }}>
        <h1 style={{
          fontSize: 'clamp(36px, 5vw, 64px)',
          fontWeight: 700,
          color: '#f0ede8',
          letterSpacing: '-.04em',
          lineHeight: 1.12,
          marginBottom: 24,
          animation: 'fadeUp .5s ease both',
        }}>
          Your learning experience<br />is <span style={{
            fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: 300,
          }}>almost ready</span>
        </h1>

        {/* Preview cards */}
        <div style={{
          display: 'flex',
          gap: 16,
          marginBottom: 40,
          animation: 'fadeUp .5s ease .1s both',
        }}>
          {/* Blurred chat preview */}
          <div style={{
            width: 200, height: 140,
            background: 'linear-gradient(135deg, rgba(255,255,255,.08) 0%, rgba(255,255,255,.03) 100%)',
            borderRadius: 16,
            border: '1px solid rgba(255,255,255,.1)',
            backdropFilter: 'blur(10px)',
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            overflow: 'hidden',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 8,
                background: 'rgba(255,255,255,.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, color: 'rgba(255,255,255,.5)', fontWeight: 600,
              }}>AI</div>
              <div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,.6)', fontWeight: 600 }}>Lingle Agent</div>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,.3)' }}>Ready to chat</div>
              </div>
            </div>
            <div style={{
              flex: 1, borderRadius: 8,
              background: 'rgba(255,255,255,.05)',
              filter: 'blur(4px)',
              display: 'flex', flexDirection: 'column', gap: 6, padding: 8,
            }}>
              <div style={{ height: 8, width: '80%', background: 'rgba(255,255,255,.1)', borderRadius: 4 }} />
              <div style={{ height: 8, width: '60%', background: 'rgba(255,255,255,.1)', borderRadius: 4 }} />
              <div style={{ height: 8, width: '70%', background: 'rgba(255,255,255,.1)', borderRadius: 4, alignSelf: 'flex-end' }} />
            </div>
          </div>

          <div style={{
            width: 200, height: 140,
            background: 'linear-gradient(135deg, rgba(200,87,42,.12) 0%, rgba(255,255,255,.03) 100%)',
            borderRadius: 16,
            border: '1px solid rgba(255,255,255,.1)',
            backdropFilter: 'blur(10px)',
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            overflow: 'hidden',
          }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,.5)', fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase' as const }}>
              Your prompt
            </div>
            <div style={{
              flex: 1, borderRadius: 8,
              fontSize: 13, color: 'rgba(255,255,255,.7)', lineHeight: 1.6,
              overflow: 'hidden',
            }}>
              {prompt || 'Your conversation awaits...'}
            </div>
          </div>
        </div>

        {/* CTA */}
        <button
          onClick={() => setShowAuth(true)}
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 16, fontWeight: 600,
            color: '#fff',
            background: 'linear-gradient(135deg, #c8572a 0%, #e06b3a 100%)',
            border: 'none',
            borderRadius: 14,
            padding: '14px 36px',
            cursor: 'pointer',
            boxShadow: '0 2px 12px rgba(200,87,42,.4), 0 8px 32px rgba(200,87,42,.2)',
            transition: 'all .15s',
            animation: 'fadeUp .5s ease .2s both',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)'
            e.currentTarget.style.boxShadow = '0 4px 20px rgba(200,87,42,.5), 0 12px 40px rgba(200,87,42,.25)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)'
            e.currentTarget.style.boxShadow = '0 2px 12px rgba(200,87,42,.4), 0 8px 32px rgba(200,87,42,.2)'
          }}
        >
          Sign up for free to start
        </button>

        <p style={{
          fontSize: 13, color: 'rgba(240,237,232,.35)', marginTop: 16,
          animation: 'fadeUp .5s ease .3s both',
        }}>
          Free forever. No credit card required.
        </p>
      </div>

      {/* Auth Modal Overlay */}
      {showAuth && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(0,0,0,.6)',
            backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'fadeIn .2s ease both',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowAuth(false) }}
        >
          <div style={{
            width: '100%', maxWidth: 420,
            background: '#1a1a1a',
            border: '1px solid rgba(255,255,255,.12)',
            borderRadius: 20,
            padding: '36px 32px',
            position: 'relative',
            animation: 'scaleIn .25s ease both',
          }}>
            {/* Close */}
            <button
              onClick={() => setShowAuth(false)}
              style={{
                position: 'absolute', top: 16, right: 16,
                width: 28, height: 28, borderRadius: 8,
                background: 'rgba(255,255,255,.06)',
                border: '1px solid rgba(255,255,255,.1)',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'rgba(255,255,255,.4)', fontSize: 14,
              }}
            >
              ✕
            </button>

            {/* Logo */}
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <span style={{
                fontFamily: 'var(--font-serif)', fontSize: 28, fontWeight: 400,
                fontStyle: 'italic', color: '#f0ede8',
              }}>Lingle</span>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#f0ede8', marginTop: 8 }}>
                Create your account
              </div>
              <div style={{ fontSize: 13, color: 'rgba(240,237,232,.5)', marginTop: 4 }}>
                Welcome! Sign in to get started.
              </div>
            </div>

            {error && (
              <div style={{
                padding: '10px 14px', borderRadius: 8,
                background: 'rgba(200,87,42,.1)',
                border: '1px solid rgba(200,87,42,.2)',
                color: '#e06b3a', fontSize: 13,
                marginBottom: 16,
              }}>
                {error}
              </div>
            )}

            {/* Google Sign In */}
            <button
              onClick={handleGoogleSignIn}
              disabled={signingIn}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: 10, width: '100%', padding: '12px 16px',
                background: '#fff', border: 'none', borderRadius: 10,
                fontSize: 14, fontWeight: 500, color: '#1a1a1a',
                cursor: signingIn ? 'wait' : 'pointer',
                opacity: signingIn ? 0.6 : 1,
                transition: 'all .15s',
              }}
              onMouseEnter={(e) => { if (!signingIn) e.currentTarget.style.background = '#f5f5f5' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#fff' }}
            >
              <GoogleLogo />
              {signingIn ? 'Signing in...' : 'Continue with Google'}
            </button>

            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              margin: '20px 0',
            }}>
              <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,.1)' }} />
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,.3)' }}>or</span>
              <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,.1)' }} />
            </div>

            <button
              onClick={() => { setShowAuth(false); router.push('/sign-in') }}
              style={{
                width: '100%', padding: '11px 16px',
                background: 'transparent',
                border: '1px solid rgba(255,255,255,.15)',
                borderRadius: 10,
                fontSize: 14, color: 'rgba(240,237,232,.7)',
                cursor: 'pointer',
                transition: 'all .15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,.3)' }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,.15)' }}
            >
              Sign in
            </button>

            <p style={{
              fontSize: 11, color: 'rgba(240,237,232,.3)', textAlign: 'center', marginTop: 20, lineHeight: 1.5,
            }}>
              By continuing, you accept our Privacy Policy and Terms of Use.
            </p>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes scaleIn { from { opacity: 0; transform: scale(.95); } to { opacity: 1; transform: scale(1); } }
      `}</style>
    </div>
  )
}
