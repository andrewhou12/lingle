import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import { Fraunces, Noto_Serif_JP, Noto_Sans_JP } from 'next/font/google'
import { TooltipProvider } from '@/components/ui/tooltip'
import './globals.css'

const fraunces = Fraunces({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  variable: '--font-fraunces',
  display: 'swap',
})

const notoSerifJP = Noto_Serif_JP({
  weight: ['300', '400', '500', '600', '700'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-noto-serif-jp',
})

const notoSansJP = Noto_Sans_JP({
  weight: ['300', '400', '500', '600', '700'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-noto-sans-jp',
})

export const metadata: Metadata = {
  title: 'Lingle — Modern Language Learning',
  description: 'The first Japanese learning system with a live model of exactly what you know.',
  icons: {
    icon: '/icon.svg',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} ${fraunces.variable} ${notoSerifJP.variable} ${notoSansJP.variable}`}
      suppressHydrationWarning
    >
      <body>
        <TooltipProvider>
          {children}
        </TooltipProvider>
      </body>
    </html>
  )
}
