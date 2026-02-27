'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  )
}

export default function SignInPage() {
  const [signingIn, setSigningIn] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleGoogleSignIn = async () => {
    setSigningIn(true)
    setError(null)
    try {
      const supabase = createClient()
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
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
    <div className="flex flex-col items-center justify-center h-screen bg-bg">
      <div className="flex flex-col items-center gap-8 max-w-[400px] w-full p-6">
        <div className="flex flex-col items-center gap-2">
          <span className="text-[32px] font-bold tracking-tight font-serif italic">
            Linguist
          </span>
          <span className="text-[15px] text-text-muted text-center">
            Your AI-powered language learning companion
          </span>
        </div>

        <div className="w-full rounded-xl border border-border bg-bg p-8">
          <div className="flex flex-col gap-5 items-center">
            <span className="text-lg font-medium">Welcome</span>
            <span className="text-[13px] text-text-muted text-center">
              Sign in to access your personalized learning experience
            </span>

            {error && (
              <div className="w-full p-3 rounded-md bg-[rgba(200,87,42,.06)] text-accent-warm text-[13px]">
                {error}
              </div>
            )}

            <button
              className={cn(
                "flex items-center justify-center gap-2 w-full py-3 px-4 rounded-md border border-border bg-bg text-sm font-medium text-text-primary transition-colors duration-150 hover:bg-bg-secondary",
                signingIn ? "cursor-wait opacity-60" : "cursor-pointer"
              )}
              onClick={handleGoogleSignIn}
              disabled={signingIn}
            >
              <GoogleLogo />
              {signingIn ? 'Signing in...' : 'Continue with Google'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
