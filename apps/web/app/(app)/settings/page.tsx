'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeftIcon, GlobeAltIcon, LanguageIcon } from '@heroicons/react/24/outline'
import { api } from '@/lib/api'

type ProfileData = Awaited<ReturnType<typeof api.profileGet>>

export default function SettingsPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    setIsLoading(true)
    api.profileGet().then((p) => {
      setProfile(p)
      setIsLoading(false)
    })
  }, [])

  if (isLoading || !profile) {
    return (
      <div className="max-w-[640px] mx-auto">
        <div className="flex items-center gap-3 mt-6 justify-center">
          <span className="text-[13px] text-text-muted">Loading settings...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-[640px] mx-auto pb-10">
      <div className="flex items-center gap-3 mb-6">
        <button
          className="p-1.5 rounded-md text-text-secondary bg-transparent border-none cursor-pointer transition-colors duration-150 hover:bg-bg-hover"
          onClick={() => router.back()}
        >
          <ArrowLeftIcon className="w-[18px] h-[18px]" />
        </button>
        <h1 className="text-[28px] font-bold">Settings</h1>
      </div>

      <span className="text-[11px] font-medium text-text-muted block mb-3">
        Language
      </span>

      <div className="rounded-xl border border-border bg-bg mb-6">
        <div className="flex flex-col">
          <SettingsRow icon={<LanguageIcon className="w-4 h-4" />} label="Target Language" value={profile.targetLanguage ?? '—'} />
          <hr className="border-t border-border m-0" />
          <SettingsRow icon={<GlobeAltIcon className="w-4 h-4" />} label="Native Language" value={profile.nativeLanguage ?? '—'} />
        </div>
      </div>

      <span className="text-[11px] font-medium text-text-muted block mb-3">
        Session
      </span>

      <div className="rounded-xl border border-border bg-bg mb-6">
        <div className="flex flex-col">
          <SettingsRow icon={<span className="text-[12px]">⏱</span>} label="Session Length" value={`${profile.sessionLengthMinutes} min`} />
          <hr className="border-t border-border m-0" />
          <SettingsRow icon={<span className="text-[12px]">✏️</span>} label="Correction Style" value={profile.correctionStyle} />
          <hr className="border-t border-border m-0" />
          <SettingsRow icon={<span className="text-[12px]">📊</span>} label="Sessions Completed" value={String(profile.sessionsCompleted)} />
        </div>
      </div>

      {profile.cefrGrammar != null && (
        <>
          <span className="text-[11px] font-medium text-text-muted block mb-3">
            CEFR Scores
          </span>
          <div className="rounded-xl border border-border bg-bg mb-6">
            <div className="flex flex-col">
              <SettingsRow icon={<span className="text-[12px]">📝</span>} label="Grammar" value={profile.cefrGrammar.toFixed(1)} />
              <hr className="border-t border-border m-0" />
              <SettingsRow icon={<span className="text-[12px]">🗣</span>} label="Fluency" value={(profile.cefrFluency ?? 0).toFixed(1)} />
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function SettingsRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-3 px-4 gap-3">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="w-7 h-7 rounded-md bg-bg-secondary shrink-0 text-text-secondary flex items-center justify-center">
          {icon}
        </div>
        <span className="text-[13px] font-medium">{label}</span>
      </div>
      <span className="text-[13px] text-text-secondary">{value}</span>
    </div>
  )
}
