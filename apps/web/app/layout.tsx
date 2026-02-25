import type { Metadata } from 'next'
import { Inter, Shippori_Mincho } from 'next/font/google'
import { Theme } from '@radix-ui/themes'
import '@radix-ui/themes/styles.css'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const shipporiMincho = Shippori_Mincho({
  weight: ['400', '600', '700'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-shippori',
})

export const metadata: Metadata = {
  title: 'Linguist',
  description: 'Language learning with adaptive knowledge modeling',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${shipporiMincho.variable}`}
      suppressHydrationWarning
    >
      <body>
        <Theme appearance="light" accentColor="blue" radius="large">
          {children}
        </Theme>
      </body>
    </html>
  )
}
