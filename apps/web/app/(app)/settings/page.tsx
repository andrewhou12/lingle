'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeftIcon, GlobeAltIcon, LanguageIcon, CheckIcon } from '@heroicons/react/24/outline'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

type ProfileData = Awaited<ReturnType<typeof api.profileGet>>

const CORRECTION_STYLES = [
  { value: 'recast', label: 'Recast', description: 'Correct form used naturally in response' },
  { value: 'explicit', label: 'Explicit', description: 'Errors pointed out and explained' },
  { value: 'none', label: 'None', description: 'No corrections unless miscommunication' },
]

const SESSION_LENGTHS = [
  { value: 15, label: '15 min' },
  { value: 20, label: '20 min' },
  { value: 30, label: '30 min' },
]

const LESSON_STYLES = [
  { value: 'conversational', label: 'Conversational', description: 'Natural free-flowing conversation' },
  { value: 'structured', label: 'Structured', description: 'Focused drills and exercises' },
  { value: 'mixed', label: 'Mixed', description: 'A balance of both approaches' },
]

export default function SettingsPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [savedField, setSavedField] = useState<string | null>(null)

  useEffect(() => {
    setIsLoading(true)
    api.profileGet().then((p) => {
      setProfile(p)
      setIsLoading(false)
    })
  }, [])

  const updateField = useCallback(async (field: string, value: unknown) => {
    if (!profile) return
    setProfile({ ...profile, [field]: value })
    try {
      await api.profilePatch({ [field]: value })
      setSavedField(field)
      setTimeout(() => setSavedField(null), 1500)
    } catch (err) {
      console.error('[Settings] Failed to update:', err)
    }
  }, [profile])

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
        Session Preferences
      </span>

      <div className="rounded-xl border border-border bg-bg mb-6">
        <div className="flex flex-col">
          {/* Correction Style */}
          <SettingsSelect
            icon={<span className="text-[12px]">&#9998;</span>}
            label="Correction Style"
            saved={savedField === 'correctionStyle'}
            options={CORRECTION_STYLES}
            value={profile.correctionStyle}
            onChange={(v) => updateField('correctionStyle', v)}
          />
          <hr className="border-t border-border m-0" />

          {/* Session Length */}
          <div className="py-3 px-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-7 h-7 rounded-md bg-bg-secondary shrink-0 text-text-secondary flex items-center justify-center">
                <span className="text-[12px]">&#9201;</span>
              </div>
              <span className="text-[13px] font-medium flex-1">Session Length</span>
              {savedField === 'sessionLengthMinutes' && (
                <span className="text-[11px] text-green font-medium flex items-center gap-1">
                  <CheckIcon className="w-3 h-3" /> Saved
                </span>
              )}
            </div>
            <div className="flex gap-2 ml-10">
              {SESSION_LENGTHS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => updateField('sessionLengthMinutes', opt.value)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-[13px] font-medium cursor-pointer border transition-colors',
                    profile.sessionLengthMinutes === opt.value
                      ? 'bg-accent-brand text-white border-accent-brand'
                      : 'bg-bg-pure text-text-secondary border-border hover:border-border-strong hover:bg-bg-hover',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <hr className="border-t border-border m-0" />

          {/* Lesson Style */}
          <SettingsSelect
            icon={<span className="text-[12px]">&#128218;</span>}
            label="Lesson Style"
            saved={savedField === 'lessonStylePreference'}
            options={LESSON_STYLES}
            value={profile.lessonStylePreference}
            onChange={(v) => updateField('lessonStylePreference', v)}
          />
        </div>
      </div>

      {/* Voice & AI */}
      <span className="text-[11px] font-medium text-text-muted block mb-3">
        Voice & AI
      </span>

      <div className="rounded-xl border border-border bg-bg mb-6">
        <div className="flex flex-col">
          <SettingsSelect
            icon={<span className="text-[12px]">&#127908;</span>}
            label="TTS Provider"
            saved={savedField === 'ttsProvider'}
            options={[
              { value: '', label: 'Auto', description: 'Rime for English, Cartesia for others' },
              { value: 'cartesia', label: 'Cartesia', description: 'Sonic-3 — low latency, multilingual' },
              { value: 'rime', label: 'Rime', description: 'Arcana — natural English voices' },
            ]}
            value={profile.ttsProvider ?? ''}
            onChange={(v) => updateField('ttsProvider', v || null)}
          />
          <hr className="border-t border-border m-0" />

          <SettingsSelect
            icon={<span className="text-[12px]">&#127897;</span>}
            label="STT Provider"
            saved={savedField === 'sttProvider'}
            options={[
              { value: '', label: 'Auto', description: 'Deepgram Nova-3 (default)' },
              { value: 'deepgram', label: 'Deepgram', description: 'Nova-3 — fast finals, lower E2E' },
              { value: 'soniox', label: 'Soniox', description: 'Realtime preview — fast interims' },
            ]}
            value={profile.sttProvider ?? ''}
            onChange={(v) => updateField('sttProvider', v || null)}
          />
          <hr className="border-t border-border m-0" />

          {/* Voice ID */}
          <div className="py-3 px-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-7 h-7 rounded-md bg-bg-secondary shrink-0 text-text-secondary flex items-center justify-center">
                <span className="text-[12px]">&#128483;</span>
              </div>
              <span className="text-[13px] font-medium flex-1">Voice ID</span>
              {savedField === 'voiceId' && (
                <span className="text-[11px] text-green font-medium flex items-center gap-1">
                  <CheckIcon className="w-3 h-3" /> Saved
                </span>
              )}
            </div>
            <div className="ml-10">
              <input
                type="text"
                value={profile.voiceId ?? ''}
                onChange={(e) => {
                  const val = e.target.value || null
                  setProfile({ ...profile, voiceId: val })
                }}
                onBlur={() => updateField('voiceId', profile.voiceId || null)}
                placeholder="Leave blank for default voice"
                className="w-full px-3 py-1.5 rounded-lg text-[13px] border border-border bg-bg-pure text-text-primary placeholder:text-text-muted/50 outline-none focus:border-accent-brand/50"
              />
              <span className="text-[11px] text-text-muted mt-1 block">
                Cartesia: voice UUID &middot; Rime: speaker name (e.g. yukiko, luna)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats (read-only) */}
      <span className="text-[11px] font-medium text-text-muted block mb-3">
        Progress
      </span>

      <div className="rounded-xl border border-border bg-bg mb-6">
        <div className="flex flex-col">
          <SettingsRow icon={<span className="text-[12px]">&#128202;</span>} label="Sessions Completed" value={String(profile.sessionsCompleted)} />
          {profile.cefrGrammar != null && (
            <>
              <hr className="border-t border-border m-0" />
              <SettingsRow icon={<span className="text-[12px]">&#128221;</span>} label="Grammar (CEFR)" value={profile.cefrGrammar.toFixed(1)} />
              <hr className="border-t border-border m-0" />
              <SettingsRow icon={<span className="text-[12px]">&#128483;</span>} label="Fluency (CEFR)" value={(profile.cefrFluency ?? 0).toFixed(1)} />
            </>
          )}
        </div>
      </div>
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

function SettingsSelect({
  icon,
  label,
  options,
  value,
  onChange,
  saved,
}: {
  icon: React.ReactNode
  label: string
  options: { value: string; label: string; description: string }[]
  value: string
  onChange: (value: string) => void
  saved?: boolean
}) {
  return (
    <div className="py-3 px-4">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-7 h-7 rounded-md bg-bg-secondary shrink-0 text-text-secondary flex items-center justify-center">
          {icon}
        </div>
        <span className="text-[13px] font-medium flex-1">{label}</span>
        {saved && (
          <span className="text-[11px] text-green font-medium flex items-center gap-1">
            <CheckIcon className="w-3 h-3" /> Saved
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1.5 ml-10">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={cn(
              'flex flex-col text-left px-3 py-2 rounded-lg cursor-pointer border transition-colors',
              value === opt.value
                ? 'bg-accent-brand/5 border-accent-brand/30'
                : 'bg-bg-pure border-border hover:border-border-strong hover:bg-bg-hover',
            )}
          >
            <span className={cn(
              'text-[13px] font-medium',
              value === opt.value ? 'text-text-primary' : 'text-text-secondary',
            )}>
              {opt.label}
            </span>
            <span className="text-[11px] text-text-muted">{opt.description}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
