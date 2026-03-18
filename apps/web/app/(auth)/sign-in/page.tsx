'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google'
import { createClient } from '@/lib/supabase/client'

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!

export default function SignInPage() {
  const router = useRouter()
  const [signingIn, setSigningIn] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
        router.push('/conversation/voice/test')
      } else {
        router.push('/conversation/voice/test')
      }
    } catch {
      setError('Something went wrong. Please try again.')
      setSigningIn(false)
    }
  }

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <div className="flex flex-col items-center justify-center h-screen bg-bg">
        <div className="flex flex-col items-center gap-8 max-w-[400px] w-full p-6">
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[32px] font-bold tracking-tight font-serif italic">
                Lingle
              </span>
              <span className="text-[11px] font-semibold tracking-wide uppercase bg-bg-hover text-text-secondary border border-border-strong rounded-sm px-1.5 py-0.5 leading-none mt-1">Beta</span>
            </div>
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
                  width="336"
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </GoogleOAuthProvider>
  )
}
