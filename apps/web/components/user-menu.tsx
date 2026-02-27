'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { LogOut, CircleUser } from 'lucide-react'
import type { ExpandedLearnerProfile } from '@linguist/shared/types'
import { createClient } from '@/lib/supabase/client'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

export function UserMenu() {
  const router = useRouter()
  const [user, setUser] = useState<{ email?: string; name?: string; avatarUrl?: string } | null>(null)
  const [profile, setProfile] = useState<ExpandedLearnerProfile | null>(null)

  useEffect(() => {
    api.userGetMe().then((u) => {
      if (u) setUser({ email: u.email ?? undefined, name: u.name ?? undefined, avatarUrl: u.avatarUrl ?? undefined })
    }).catch(() => {})
    api.profileGet().then(setProfile).catch(() => {})
  }, [])

  const displayName = user?.name || user?.email || 'Learner'
  const initials = displayName.charAt(0).toUpperCase()

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/sign-in')
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="size-8 rounded-full bg-transparent border-none cursor-pointer flex items-center justify-center p-0 text-text-secondary transition-colors duration-100 hover:text-text-primary">
          <CircleUser size={20} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        className="w-[280px] p-0"
      >
        {/* User header */}
        <div className="flex items-center gap-3 p-4">
          <div className={cn(
            'size-10 min-w-10 min-h-10 rounded-full overflow-hidden flex items-center justify-center',
            user?.avatarUrl ? 'bg-transparent' : 'bg-accent-brand'
          )}>
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt={displayName} width={40} height={40} className="rounded-full object-cover block" />
            ) : (
              <span className="text-lg font-bold text-white leading-none">{initials}</span>
            )}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-[13px] font-bold overflow-hidden text-ellipsis whitespace-nowrap">{displayName}</span>
            <span className="text-[11px] text-text-muted overflow-hidden text-ellipsis whitespace-nowrap">
              {profile ? `${profile.targetLanguage} (${profile.computedLevel})` : user?.email || 'Loading...'}
            </span>
          </div>
        </div>

        <Separator />

        {/* Stats */}
        <div className="flex flex-col gap-2 p-4">
          {[
            { label: 'Current level', value: profile?.computedLevel ?? '—' },
            { label: 'Streak', value: `${profile?.currentStreak ?? 0} day${(profile?.currentStreak ?? 0) !== 1 ? 's' : ''}` },
            { label: 'Total reviews', value: String(profile?.totalReviewEvents ?? 0) },
            { label: 'Sessions', value: String(profile?.totalSessions ?? 0) },
          ].map((row) => (
            <div key={row.label} className="flex justify-between items-center">
              <span className="text-[13px] text-text-secondary">{row.label}</span>
              <span className="text-[13px] font-medium">{row.value}</span>
            </div>
          ))}
        </div>

        <Separator />

        {/* Sign out */}
        <div className="p-2">
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 py-2 px-3 rounded-md cursor-pointer w-full bg-transparent border-none text-text-secondary text-[13px] transition-colors duration-100 hover:bg-bg-hover hover:text-text-primary"
          >
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
