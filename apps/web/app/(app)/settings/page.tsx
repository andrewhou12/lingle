'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft, Globe, BookOpen, Target, Flame } from 'lucide-react'
import type { ExpandedLearnerProfile } from '@linguist/shared/types'
import { Spinner } from '@/components/spinner'
import { api } from '@/lib/api'

export default function SettingsPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<ExpandedLearnerProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    api.profileGet().then((p) => {
      setProfile(p)
      setIsLoading(false)
    })
  }, [])

  const handleUpdate = async (
    updates: Partial<{ dailyNewItemLimit: number; targetRetention: number }>
  ) => {
    const updated = await api.profileUpdate(updates)
    setProfile(updated)
  }

  if (isLoading || !profile) {
    return (
      <div className="max-w-[640px] mx-auto">
        <div className="flex items-center gap-3 mt-6 justify-center">
          <Spinner size={18} />
          <span className="text-[13px] text-text-muted">Loading settings...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-[640px] mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button
          className="p-1.5 rounded-md text-text-secondary bg-transparent border-none cursor-pointer transition-colors duration-150 hover:bg-bg-hover"
          onClick={() => router.back()}
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-[28px] font-bold">Settings</h1>
      </div>

      <span className="text-[11px] font-medium text-text-muted uppercase tracking-wide block mb-3">
        General
      </span>

      <div className="rounded-xl border border-border bg-bg mb-5">
        <div className="flex flex-col">
          <SettingsRow icon={<Globe size={16} />} label="Target Language" description={profile.targetLanguage} />
          <hr className="border-t border-border m-0" />
          <SettingsRow icon={<Globe size={16} />} label="Native Language" description={profile.nativeLanguage} />
        </div>
      </div>

      <span className="text-[11px] font-medium text-text-muted uppercase tracking-wide block mb-3">
        Learning
      </span>

      <div className="rounded-xl border border-border bg-bg mb-5">
        <div className="flex flex-col">
          <SettingsRow
            icon={<BookOpen size={16} />}
            label="Daily New Items"
            description={`${profile.dailyNewItemLimit} new items per day`}
          >
            <Select
              value={String(profile.dailyNewItemLimit)}
              onValueChange={(v) => handleUpdate({ dailyNewItemLimit: parseInt(v) })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5</SelectItem>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="15">15</SelectItem>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="30">30</SelectItem>
              </SelectContent>
            </Select>
          </SettingsRow>

          <hr className="border-t border-border m-0" />

          <SettingsRow
            icon={<Target size={16} />}
            label="Target Retention"
            description={`${Math.round(profile.targetRetention * 100)}% target`}
          >
            <Select
              value={String(profile.targetRetention)}
              onValueChange={(v) => handleUpdate({ targetRetention: parseFloat(v) })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0.80">80%</SelectItem>
                <SelectItem value="0.85">85%</SelectItem>
                <SelectItem value="0.90">90%</SelectItem>
                <SelectItem value="0.95">95%</SelectItem>
                <SelectItem value="0.97">97%</SelectItem>
              </SelectContent>
            </Select>
          </SettingsRow>
        </div>
      </div>

      <span className="text-[11px] font-medium text-text-muted uppercase tracking-wide block mb-3">
        Progress
      </span>

      <div className="rounded-xl border border-border bg-bg">
        <div className="flex flex-col">
          <SettingsRow icon={<Flame size={16} />} label="Current Level" description={profile.computedLevel} />
          <hr className="border-t border-border m-0" />
          <SettingsRow icon={<Flame size={16} />} label="Streak" description={`${profile.currentStreak} day${profile.currentStreak !== 1 ? 's' : ''} (longest: ${profile.longestStreak})`} />
          <hr className="border-t border-border m-0" />
          <SettingsRow icon={<BookOpen size={16} />} label="Total Reviews" description={String(profile.totalReviewEvents)} />
          <hr className="border-t border-border m-0" />
          <SettingsRow icon={<Target size={16} />} label="Comprehension Ceiling" description={profile.comprehensionCeiling} />
          <hr className="border-t border-border m-0" />
          <SettingsRow icon={<Target size={16} />} label="Production Ceiling" description={profile.productionCeiling} />
        </div>
      </div>
    </div>
  )
}

function SettingsRow({
  icon, label, description, children,
}: {
  icon: React.ReactNode; label: string; description: string; children?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between py-3 px-1 gap-3">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="w-7 h-7 rounded-md bg-bg-secondary shrink-0 text-text-secondary flex items-center justify-center">
          {icon}
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-[13px] font-medium">{label}</span>
          <span className="text-[11px] text-text-muted overflow-hidden text-ellipsis whitespace-nowrap">{description}</span>
        </div>
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </div>
  )
}
