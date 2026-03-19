'use client'

import dynamic from 'next/dynamic'

const OnboardingView = dynamic(
  () => import('@/components/session/onboarding-view').then((m) => m.OnboardingView),
  { ssr: false, loading: () => <div className="h-screen bg-bg" /> },
)

export default function OnboardingPage() {
  return <OnboardingView />
}
