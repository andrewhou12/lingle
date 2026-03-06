'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import {
  MoreHorizontal,
  LogOut,
  ChevronRight,
} from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import { SUPPORTED_LANGUAGES } from '@/lib/languages'
import { LanguageProvider, useLanguage } from '@/hooks/use-language'
import { getDifficultyLevel } from '@/lib/difficulty-levels'

/* ── Nav Sections ── */

interface NavSectionItem {
  id: string
  href: string
  emoji: string
  label: string
  badge?: number
}

interface NavSection {
  label: string
  items: NavSectionItem[]
}

const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Practice',
    items: [
      { id: 'practice', href: '/conversation', emoji: '\uD83D\uDCAC', label: 'Practice' },
      // { id: 'review', href: '/conversation?tab=review', emoji: '\uD83D\uDD01', label: 'Review', badge: 12 },
    ],
  },
  // {
  //   label: 'Learn',
  //   items: [
  //     { id: 'lessons', href: '/conversation?tab=lessons', emoji: '\uD83D\uDCDA', label: 'Lessons' },
  //     { id: 'vocabulary', href: '/conversation?tab=vocabulary', emoji: '\uD83D\uDDC3\uFE0F', label: 'Vocabulary' },
  //     { id: 'kanji', href: '/conversation?tab=kanji', emoji: '\uD83C\uDE33', label: 'Kanji' },
  //   ],
  // },
  {
    label: 'Track',
    items: [
      { id: 'progress', href: '/progress', emoji: '\uD83D\uDD52', label: 'History' },
      { id: 'settings', href: '/settings', emoji: '\u2699\uFE0F', label: 'Settings' },
    ],
  },
]

/* ── Breadcrumb label map ── */

const BREADCRUMB_MAP: Record<string, string> = {
  '/conversation': 'Practice',
  '/progress': 'History',
  '/settings': 'Settings',
}

/* ── Subcomponents ── */

function LogoIcon() {
  return (
    <div className="w-8 h-8 bg-accent-brand rounded-[7px] flex items-center justify-center shrink-0 shadow-[0_1px_3px_rgba(0,0,0,.2),inset_0_1px_0_rgba(255,255,255,.08)]">
      <svg width="17" height="17" viewBox="0 0 32 32" fill="none">
        <path d="M24 3 C24 3, 18 5, 14 10 C10 15, 8 21, 8 26 C9 24, 11 19, 14 14 C17 9, 21 5, 24 3 Z" stroke="white" strokeWidth="2" strokeLinejoin="round" fill="none"/>
        <path d="M24 3 C24 3, 26 7, 24 13 C22 19, 17 24, 12 27 C14 23, 17 18, 20 13 C23 8, 25 5, 24 3 Z" stroke="white" strokeWidth="2" strokeLinejoin="round" fill="none"/>
        <path d="M8 26 L7 29" stroke="white" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    </div>
  )
}

function DailyGoalWidget() {
  const { targetLanguage } = useLanguage()
  const [level, setLevel] = useState<string | null>(null)
  const [streak, setStreak] = useState<number | null>(null)
  const [minutesToday, setMinutesToday] = useState<number | null>(null)
  const [goalMinutes, setGoalMinutes] = useState(30)

  useEffect(() => {
    api.profileGet().then((p) => {
      if (p) {
        const dl = getDifficultyLevel(p.difficultyLevel)
        setLevel(dl.label.match(/\(([^)]+)\)/)?.[1] ?? dl.label)
        setStreak(p.currentStreak)
        setGoalMinutes(p.dailyGoalMinutes ?? 30)
      }
    }).catch(() => {})

    api.statsToday().then((s) => {
      setMinutesToday(s.minutesToday)
    }).catch(() => {})
  }, [targetLanguage])

  const mins = minutesToday ?? 0
  const pct = Math.min(100, Math.round((mins / goalMinutes) * 100))

  return (
    <Link href="/progress" className="block mx-2.5 mt-2.5 mb-1 no-underline">
      <div className="p-3.5 bg-bg-pure border border-border-subtle rounded-xl shadow-[0_1px_2px_rgba(0,0,0,.04)] transition-colors duration-100 hover:bg-bg-hover cursor-pointer">
        <div className="flex justify-between items-center mb-2">
          <span className="text-[13px] font-medium text-text-primary">Daily goal</span>
          <span className="text-[12px] text-text-muted">{mins} / {goalMinutes} min</span>
        </div>
        <div className="h-1.5 rounded-full bg-bg-active overflow-hidden">
          <div className="h-full rounded-full bg-accent-brand transition-[width] duration-300" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex justify-between mt-2.5">
          <div>
            <div className="text-[13px] font-semibold text-text-primary">{streak ?? 0}</div>
            <div className="text-[12px] text-text-muted">day streak</div>
          </div>
          <div className="text-right">
            <div className="text-[13px] font-semibold text-text-primary">{level ?? '--'}</div>
            <div className="text-[12px] text-text-muted">current level</div>
          </div>
        </div>
      </div>
    </Link>
  )
}

function UserFooter() {
  const router = useRouter()
  const [user, setUser] = useState<{ email?: string; name?: string } | null>(null)

  useEffect(() => {
    api.userGetMe().then((u) => {
      if (u) setUser({ email: u.email ?? undefined, name: u.name ?? undefined })
    }).catch(() => {})
  }, [])

  const displayName = user?.name || user?.email || 'Learner'
  const initials = displayName.charAt(0).toUpperCase()

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/sign-in')
  }

  return (
    <div className="px-3.5 py-3 border-t border-border">
      <Popover>
        <PopoverTrigger asChild>
          <button className="flex items-center gap-3 w-full px-0 py-0 bg-transparent border-none cursor-pointer transition-colors duration-100 hover:opacity-80">
            <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-bg-active border border-border">
              <span className="text-[14px] font-semibold text-text-primary leading-none">{initials}</span>
            </div>
            <div className="flex flex-col min-w-0 flex-1 text-left">
              <span className="text-[14px] font-medium text-text-primary truncate leading-tight">{displayName}</span>
              <span className="text-[12px] text-text-muted">Intermediate</span>
            </div>
            <MoreHorizontal size={14} className="text-text-muted shrink-0" />
          </button>
        </PopoverTrigger>
        <PopoverContent side="top" align="start" className="w-[200px] p-1.5">
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 py-2 px-3 rounded-md cursor-pointer w-full bg-transparent border-none text-text-secondary text-[13px] transition-colors duration-100 hover:bg-bg-hover hover:text-text-primary"
          >
            <LogOut size={14} />
            Sign out
          </button>
        </PopoverContent>
      </Popover>
    </div>
  )
}

function OnlineIndicator() {
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true)

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  return (
    <div className="flex items-center gap-1.5 text-[12px] text-text-muted">
      <div className={`w-1.5 h-1.5 rounded-full ${online ? 'bg-green' : 'bg-text-muted'}`} />
      {online ? 'Online' : 'Offline'}
    </div>
  )
}

/* ── Layout ── */

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <LanguageProvider>
      <AppLayoutInner>{children}</AppLayoutInner>
    </LanguageProvider>
  )
}

function AppLayoutInner({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const { targetLanguage, setTargetLanguage } = useLanguage()

  // Prefetch common data on first mount
  useEffect(() => { api.prefetch() }, [])

  const isActive = (href: string) => {
    const basePath = href.split('?')[0]
    return pathname === basePath || pathname.startsWith(basePath + '/')
  }

  const breadcrumb = BREADCRUMB_MAP[pathname] ?? (pathname.startsWith('/progress/') ? 'Session Details' : '')
  const isVoiceRoute = pathname.startsWith('/conversation/voice')

  // Voice mode is full-screen — render children with no shell
  if (isVoiceRoute) {
    return <div style={{ fontFamily: "'Geist Sans', var(--font-sans)" }}>{children}</div>
  }

  return (
    <div className="flex h-screen bg-bg overflow-hidden" style={{ fontFamily: "'Geist Sans', var(--font-sans)" }}>
      {/* Sidebar */}
      <nav className="w-[240px] border-r border-border bg-bg-secondary shrink-0 flex flex-col overflow-hidden">
        {/* Logo header */}
        <div className="flex items-center gap-2.5 px-3.5 py-3 border-b border-border">
          <LogoIcon />
          <span className="font-serif text-[18px] font-normal italic text-text-primary tracking-tight">
            Lingle
          </span>
          <span className="text-[9px] font-semibold tracking-wide uppercase bg-bg-hover text-text-secondary border border-border-strong rounded-sm px-1.5 py-0.5 leading-none">Beta</span>
        </div>

        {/* Daily goal widget */}
        <DailyGoalWidget />

        {/* Nav sections */}
        <nav className="flex-1 overflow-y-auto px-2.5 pb-2.5">
          {NAV_SECTIONS.map((section) => (
            <div key={section.label}>
              <div className="text-[11px] font-semibold tracking-[0.07em] uppercase text-text-muted px-3 pt-5 pb-1.5">
                {section.label}
              </div>
              {section.items.map((item) => {
                const active = item.id === 'practice'
                  ? pathname === '/conversation'
                  : item.id === 'progress'
                  ? pathname === '/progress' || pathname.startsWith('/progress/')
                  : item.id === 'settings'
                  ? pathname === '/settings'
                  : false

                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-3 px-3 py-1.5 rounded-md text-[14px] font-medium no-underline transition-[background,color] duration-100 w-full',
                      active
                        ? 'text-text-primary bg-bg-active'
                        : 'text-text-secondary bg-transparent hover:bg-bg-hover hover:text-text-primary'
                    )}
                  >
                    <span className="w-5 text-[15px] flex items-center justify-center">{item.emoji}</span>
                    <span className="flex-1">{item.label}</span>
                    {item.badge !== undefined && (
                      <span className="inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded-full bg-accent-warm text-white text-[10.5px] font-bold leading-none">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>

        {/* User footer */}
        <UserFooter />
      </nav>

      {/* Main content */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Top bar */}
        <header className="flex items-center justify-between px-6 h-[48px] border-b border-border shrink-0 relative z-10 bg-bg">
          <div className="flex items-center gap-1.5 text-[14px] text-text-muted">
            <span>Lingle</span>
            <ChevronRight size={12} />
            <span className="text-text-primary font-medium">{breadcrumb || 'Home'}</span>
          </div>
          <div className="flex items-center gap-2.5">
            <OnlineIndicator />
            <Select value={targetLanguage} onValueChange={setTargetLanguage}>
              <SelectTrigger className="h-auto px-2.5 py-1 rounded-md border border-border bg-bg-pure text-[13px] font-medium text-text-secondary shadow-[0_1px_2px_rgba(0,0,0,.04)] hover:bg-bg-hover transition-colors gap-1.5 w-auto">
                <SelectValue>
                  {SUPPORTED_LANGUAGES.find(l => l.id === targetLanguage)?.nativeLabel ?? targetLanguage}
                </SelectValue>
              </SelectTrigger>
              <SelectContent position="popper" align="end" className="bg-bg-pure border border-border">
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <SelectItem key={lang.id} value={lang.id} className="text-[13px] text-text-primary cursor-pointer hover:bg-bg-hover">
                    <span className="flex items-center gap-2">
                      <span>{lang.flag}</span>
                      <span>{lang.nativeLabel}</span>
                      <span className="text-text-muted text-[12px]">{lang.label}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </header>

        {/* Content */}
        <div className={cn('p-6 flex-1 overflow-auto', pathname === '/conversation' && 'calligraphy-grid')}>
          <div className="relative z-[1] h-full">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
