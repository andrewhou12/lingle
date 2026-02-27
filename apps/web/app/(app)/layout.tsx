'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import {
  BookOpen,
  MessageCircle,
  Clock,
  Settings,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { UserMenu } from '@/components/user-menu'
import { cn } from '@/lib/utils'

interface NavItem {
  href: string
  label: string
  icon: LucideIcon
}

const NAV_ITEMS: NavItem[] = [
  { href: '/conversation', label: 'Conversation', icon: MessageCircle },
  { href: '/knowledge', label: 'Knowledge Base', icon: BookOpen },
  { href: '/history', label: 'History', icon: Clock },
]

function LogoSVG() {
  return (
    <svg width="15" height="15" viewBox="0 0 32 32" fill="none">
      <path d="M24 3 C24 3, 18 5, 14 10 C10 15, 8 21, 8 26 C9 24, 11 19, 14 14 C17 9, 21 5, 24 3 Z" stroke="white" strokeWidth="2" strokeLinejoin="round" fill="none"/>
      <path d="M24 3 C24 3, 26 7, 24 13 C22 19, 17 24, 12 27 C14 23, 17 18, 20 13 C23 8, 25 5, 24 3 Z" stroke="white" strokeWidth="2" strokeLinejoin="round" fill="none"/>
      <path d="M8 26 L7 29" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  )
}

function NavLink({ href, label, icon: Icon, isActive }: NavItem & { isActive: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] no-underline transition-[background,color] duration-100',
        isActive
          ? 'font-medium text-text-primary bg-bg-active'
          : 'font-normal text-text-secondary bg-transparent hover:bg-bg-hover hover:text-text-primary'
      )}
    >
      <Icon size={16} />
      {label}
    </Link>
  )
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="flex h-screen bg-bg">
      {/* Sidebar */}
      <nav className="w-[220px] border-r border-border bg-bg-secondary shrink-0 flex flex-col px-2.5 py-3.5">
        {/* Logo */}
        <div className="flex items-center gap-[7px] px-1.5 pt-1 pb-4">
          <div className="w-6 h-6 bg-accent-brand rounded-[5px] flex items-center justify-center">
            <LogoSVG />
          </div>
          <span className="font-serif text-sm font-normal italic text-text-primary tracking-tight">
            Linguist
          </span>
        </div>

        {/* Section label */}
        <div className="text-[9.5px] uppercase tracking-[.07em] text-text-muted px-1.5 pt-2.5 pb-1 font-medium">
          Practice
        </div>

        {/* Nav items */}
        <div className="flex flex-col gap-0.5 flex-1">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.href} {...item} isActive={pathname === item.href} />
          ))}
        </div>

        {/* Settings at bottom */}
        <NavLink href="/settings" label="Settings" icon={Settings} isActive={pathname === '/settings'} />
      </nav>

      {/* Main content */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center justify-end px-6 h-12 border-b border-border shrink-0">
          <UserMenu />
        </div>
        {/* Content */}
        <div className="p-6 flex-1 overflow-auto">
          {children}
        </div>
      </div>
    </div>
  )
}
