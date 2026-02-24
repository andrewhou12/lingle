import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react'
import type { AuthUser } from '@shared/types'

interface AuthState {
  user: AuthUser | null
  loading: boolean
  error: string | null
  needsOnboarding: boolean
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
  completeOnboarding: () => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [needsOnboarding, setNeedsOnboarding] = useState(false)

  useEffect(() => {
    window.linguist
      .authGetSession()
      .then((result) => {
        const u = result?.user ?? null
        setUser(u)
        if (u && !u.onboardingCompleted) {
          setNeedsOnboarding(true)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const signInWithGoogle = useCallback(async () => {
    setError(null)
    try {
      const result = await window.linguist.authSignInGoogle()
      setUser(result.user)
      if (!result.user.onboardingCompleted) {
        setNeedsOnboarding(true)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign-in failed'
      if (message !== 'Sign-in window was closed') {
        setError(message)
      }
    }
  }, [])

  const signOut = useCallback(async () => {
    try {
      await window.linguist.authSignOut()
      setUser(null)
      setNeedsOnboarding(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-out failed')
    }
  }, [])

  const completeOnboarding = useCallback(() => {
    setNeedsOnboarding(false)
    if (user) {
      setUser({ ...user, onboardingCompleted: true })
    }
  }, [user])

  return (
    <AuthContext.Provider
      value={{ user, loading, error, needsOnboarding, signInWithGoogle, signOut, completeOnboarding }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
