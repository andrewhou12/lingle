'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Box, Flex, Text } from '@radix-ui/themes'
import type { CSSProperties, ReactNode } from 'react'
import {
  LayoutDashboard,
  RotateCcw,
  GraduationCap,
  BookOpen,
  MessageCircle,
  Settings,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { UserMenu } from '@/components/user-menu'

interface NavItem {
  href: string
  label: string
  icon: LucideIcon
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/review', label: 'Review', icon: RotateCcw },
  { href: '/learn', label: 'Learn', icon: GraduationCap },
  { href: '/knowledge', label: 'Knowledge Base', icon: BookOpen },
  { href: '/chat', label: 'Chat', icon: MessageCircle },
]

function navLinkStyle(isActive: boolean): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    borderRadius: 'var(--radius-2)',
    textDecoration: 'none',
    color: isActive ? 'var(--accent-11)' : 'var(--gray-11)',
    backgroundColor: isActive ? 'var(--accent-3)' : 'transparent',
    fontWeight: isActive ? 600 : 400,
  }
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()

  return (
    <Flex style={{ height: '100vh' }}>
      <nav
        style={{
          width: 240,
          borderRight: '1px solid var(--gray-4)',
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ padding: 16, flex: 1, display: 'flex', flexDirection: 'column' }}>
          <Text size="5" weight="bold" mb="4" asChild>
            <h1 style={{ margin: 0 }}>Linguist</h1>
          </Text>
          <Flex direction="column" gap="1" mt="4" style={{ flex: 1 }}>
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link key={item.href} href={item.href} style={navLinkStyle(isActive)}>
                  <item.icon size={18} />
                  {item.label}
                </Link>
              )
            })}
          </Flex>
          <Link href="/settings" style={navLinkStyle(pathname === '/settings')}>
            <Settings size={18} />
            Settings
          </Link>
        </div>
      </nav>

      <Flex direction="column" style={{ flex: 1, overflow: 'hidden' }}>
        <Flex
          align="center"
          justify="end"
          px="6"
          style={{ height: 48, flexShrink: 0 }}
        >
          <UserMenu />
        </Flex>
        <Box px="6" pb="6" style={{ flex: 1, overflow: 'auto' }}>
          {children}
        </Box>
      </Flex>
    </Flex>
  )
}
