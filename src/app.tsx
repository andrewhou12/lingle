import { HashRouter, Routes, Route, Navigate } from 'react-router'
import { Theme } from '@radix-ui/themes'
import { AuthProvider, useAuth } from './contexts/auth-context'
import { AppShell } from './components/app-shell'
import { Spinner } from './components/spinner'
import { SignInPage } from './pages/sign-in'
import { OnboardingPage } from './pages/onboarding'
import { DashboardPage } from './pages/dashboard'
import { ReviewPage } from './pages/review'
import { LearnPage } from './pages/learn'
import { KnowledgePage } from './pages/knowledge'
import { ChatPage } from './pages/chat'
import { SettingsPage } from './pages/settings'

function AppContent() {
  const { user, loading, needsOnboarding } = useAuth()

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
        }}
      >
        <Spinner size={32} />
      </div>
    )
  }

  if (!user) {
    return <SignInPage />
  }

  if (needsOnboarding) {
    return <OnboardingPage />
  }

  return (
    <HashRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/review" element={<ReviewPage />} />
          <Route path="/learn" element={<LearnPage />} />
          <Route path="/knowledge" element={<KnowledgePage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </AppShell>
    </HashRouter>
  )
}

export function App() {
  return (
    <Theme appearance="dark" accentColor="blue" radius="medium">
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </Theme>
  )
}
