'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import {
  Cog6ToothIcon,
  CreditCardIcon,
  EllipsisHorizontalIcon,
  ArrowRightStartOnRectangleIcon,
  ChevronRightIcon,
  Bars3Icon,
  PhoneIcon,
} from '@heroicons/react/24/outline'
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

/* ── Nav Sections ── */

const IC = 'w-[18px] h-[18px]'

interface NavSectionItem {
  id: string
  href: string
  icon: ReactNode
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
      { id: 'voice-test', href: '/conversation/voice/test', icon: <PhoneIcon className={IC} />, label: 'Voice Session' },
    ],
  },
  {
    label: 'Account',
    items: [
      { id: 'plan', href: '/upgrade', icon: <CreditCardIcon className={IC} />, label: 'Plan' },
      { id: 'settings', href: '/settings', icon: <Cog6ToothIcon className={IC} />, label: 'Settings' },
    ],
  },
]

/* ── Breadcrumb label map ── */

const BREADCRUMB_MAP: Record<string, string> = {
  '/conversation/voice/test': 'Voice Session',
  '/settings': 'Settings',
  '/upgrade': 'Plan',
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

function UsageBanner() {
  const { targetLanguage } = useLanguage()
  const [usage, setUsage] = useState<{ usedSeconds: number; limitSeconds: number; isLimitReached: boolean; plan: string } | null>(null)
  const [goalMinutes, setGoalMinutes] = useState(30)

  useEffect(() => {
    api.usageGet().then(setUsage).catch(() => {})
    api.profileGet().then((p) => {
      if (p) {
        setGoalMinutes(p.sessionLengthMinutes ?? 30)
      }
    }).catch(() => {})
  }, [targetLanguage])

  const isPro = usage?.plan === 'pro'
  const usedMinutes = usage ? Math.floor(usage.usedSeconds / 60) : 0
  const limitMinutes = usage && usage.limitSeconds !== -1 ? Math.floor(usage.limitSeconds / 60) : null
  const percentage = usage && limitMinutes ? Math.min(100, (usage.usedSeconds / usage.limitSeconds) * 100) : 0
  const isNearLimit = percentage >= 80
  const isAtLimit = usage?.isLimitReached ?? false

  return (
    <div className="block mx-2.5 mt-2.5 mb-1">
      <div className="p-3.5 bg-bg-pure border border-border-subtle rounded-xl shadow-[0_1px_2px_rgba(0,0,0,.04)]">
        <div className="flex justify-between items-center mb-2">
          <span className="text-[13px] font-medium text-text-primary">
            {isPro ? 'Daily goal' : 'Daily limit'}
          </span>
          <span className="text-[12px] text-text-muted">
            {isPro
              ? `${usedMinutes} / ${goalMinutes} min`
              : `${usedMinutes} / ${limitMinutes ?? '?'} min`}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-bg-active overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-[width] duration-300',
              !isPro && isAtLimit ? 'bg-accent-warm' : !isPro && isNearLimit ? 'bg-[#d4a017]' : 'bg-accent-brand'
            )}
            style={{ width: `${percentage}%` }}
          />
        </div>
        {usage && !isPro && (
          <Link
            href="/upgrade"
            className={cn(
              'mt-3 flex items-center justify-center gap-1.5 w-full py-1.5 rounded-lg text-[13px] font-medium no-underline transition-colors duration-100',
              isAtLimit
                ? 'bg-accent-warm text-white hover:opacity-90'
                : 'bg-accent-brand/10 text-accent-brand hover:bg-accent-brand/20'
            )}
          >
            {isAtLimit ? 'Limit reached — upgrade now' : 'Become an Early Adopter'}
          </Link>
        )}
      </div>
    </div>
  )
}

function UserFooter({ collapsed }: { collapsed: boolean }) {
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
    router.push('/')
  }

  return (
    <div className={cn('py-3 border-t border-border', collapsed ? 'px-0 flex justify-center' : 'px-3.5')}>
      <Popover>
        <PopoverTrigger asChild>
          <button
            className={cn(
              'flex items-center w-full bg-transparent border-none cursor-pointer transition-colors duration-100 hover:opacity-80',
              collapsed ? 'justify-center px-0 py-0' : 'gap-3 px-0 py-0'
            )}
            title={collapsed ? displayName : undefined}
          >
            <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-bg-active border border-border">
              <span className="text-[14px] font-semibold text-text-primary leading-none">{initials}</span>
            </div>
            {!collapsed && (
              <>
                <div className="flex flex-col min-w-0 flex-1 text-left">
                  <span className="text-[14px] font-medium text-text-primary truncate leading-tight">{displayName}</span>
                </div>
                <EllipsisHorizontalIcon className="w-3.5 h-3.5 text-text-muted shrink-0" />
              </>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent side="top" align="start" className="w-[200px] p-1.5">
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 py-2 px-3 rounded-md cursor-pointer w-full bg-transparent border-none text-text-secondary text-[13px] transition-colors duration-100 hover:bg-bg-hover hover:text-text-primary"
          >
            <ArrowRightStartOnRectangleIcon className="w-3.5 h-3.5" />
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

  // Sidebar collapse state with localStorage persistence
  const [collapsed, setCollapsed] = useState(false)
  useEffect(() => {
    const stored = localStorage.getItem('lingle_sidebar_collapsed')
    if (stored === 'true') setCollapsed(true)
  }, [])
  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      localStorage.setItem('lingle_sidebar_collapsed', String(!prev))
      return !prev
    })
  }

  // Prefetch common data on first mount
  useEffect(() => { api.prefetch() }, [])

  const breadcrumb = BREADCRUMB_MAP[pathname] ?? ''
  const isVoiceRoute = pathname.startsWith('/conversation/voice')

  // Voice mode is full-screen — render children with no shell
  if (isVoiceRoute) {
    return <div style={{ fontFamily: "'Geist Sans', var(--font-sans)" }}>{children}</div>
  }

  return (
    <div className="flex h-screen bg-bg overflow-hidden" style={{ fontFamily: "'Geist Sans', var(--font-sans)" }}>
      {/* Sidebar */}
      <nav className={cn(
        'border-r border-border bg-bg-secondary shrink-0 flex flex-col overflow-hidden transition-[width] duration-200',
        collapsed ? 'w-[60px]' : 'w-[240px]'
      )}>
        {/* Logo header */}
        <div className={cn(
          'flex items-center border-b border-border',
          collapsed ? 'px-0 py-3 justify-center' : 'gap-2.5 px-3.5 py-3'
        )}>
          {collapsed ? (
            <button
              onClick={toggleCollapsed}
              className="group bg-transparent border-none cursor-pointer p-0 flex items-center justify-center relative w-8 h-8"
              title="Expand sidebar"
            >
              <span className="transition-opacity duration-150 group-hover:opacity-0">
                <LogoIcon />
              </span>
              <span className="absolute inset-0 flex items-center justify-center text-text-muted opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                <Bars3Icon className="w-[18px] h-[18px]" />
              </span>
            </button>
          ) : (
            <>
              <LogoIcon />
              <span className="font-serif text-[18px] font-normal italic text-text-primary tracking-tight whitespace-nowrap overflow-hidden">
                Lingle
              </span>
              <span className="text-[9px] font-semibold tracking-wide uppercase bg-bg-hover text-text-secondary border border-border-strong rounded-sm px-1.5 py-0.5 leading-none whitespace-nowrap">Beta</span>
              <button
                onClick={toggleCollapsed}
                className="ml-auto bg-transparent border-none cursor-pointer p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors duration-100 shrink-0 flex items-center justify-center"
                title="Collapse sidebar"
              >
                <Bars3Icon className="w-4 h-4" />
              </button>
            </>
          )}
        </div>

        {/* Usage & daily goal widget — hidden when collapsed */}
        {!collapsed && <UsageBanner />}

        {/* Nav sections */}
        <nav className={cn('flex-1 overflow-y-auto pb-2.5', collapsed ? 'px-1' : 'px-2.5')}>
          {NAV_SECTIONS.map((section, i) => (
            <div key={section.label}>
              {!collapsed && (
                <div className="text-[11px] font-semibold tracking-[0.07em] uppercase text-text-muted px-3 pt-5 pb-1.5">
                  {section.label}
                </div>
              )}
              {collapsed && i > 0 && <div className="mx-2 my-2 border-t border-border" />}
              {collapsed && i === 0 && <div className="pt-3" />}
              {section.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + '/')

                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      'flex items-center rounded-md text-[14px] font-medium no-underline transition-[background,color] duration-100 w-full',
                      collapsed ? 'justify-center px-0 py-2' : 'gap-3 px-3 py-1.5',
                      active
                        ? 'text-text-primary bg-bg-active'
                        : 'text-text-secondary bg-transparent hover:bg-bg-hover hover:text-text-primary'
                    )}
                  >
                    <span className="w-5 flex items-center justify-center shrink-0">{item.icon}</span>
                    {!collapsed && <span className="flex-1 whitespace-nowrap overflow-hidden">{item.label}</span>}
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>

        {/* User footer */}
        <UserFooter collapsed={collapsed} />
      </nav>

      {/* Main content */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Top bar */}
        <header className="flex items-center justify-between px-6 h-[48px] border-b border-border shrink-0 relative bg-bg">
          <div className="flex items-center gap-1.5 text-[14px] text-text-muted">
            <span>Lingle</span>
            <ChevronRightIcon className="w-3 h-3" />
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
        <div className="p-6 flex-1 overflow-auto">
          <div className="relative z-[1] h-full">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
