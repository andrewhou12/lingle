'use client'

import Link from 'next/link'
import { Flex, Box, Grid, Heading, Text, Button, Card } from '@radix-ui/themes'
import { BookOpen, MessageCircle, RotateCcw, GraduationCap } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface FeatureCardProps {
  icon: LucideIcon
  title: string
  description: string
}

function FeatureCard({ icon: Icon, title, description }: FeatureCardProps) {
  return (
    <Card size="3">
      <Flex direction="column" gap="3">
        <Icon size={24} style={{ color: 'var(--accent-11)' }} />
        <Heading size="4">{title}</Heading>
        <Text size="2" color="gray">{description}</Text>
      </Flex>
    </Card>
  )
}

const FEATURES: FeatureCardProps[] = [
  {
    icon: BookOpen,
    title: 'Adaptive Knowledge Model',
    description: 'Every vocabulary and grammar item is tracked with a mastery state that evolves as you learn.',
  },
  {
    icon: MessageCircle,
    title: 'AI Conversation Partner',
    description: 'Sessions are planned around your knowledge gaps, targeting items you need to practice most.',
  },
  {
    icon: RotateCcw,
    title: 'FSRS Spaced Repetition',
    description: 'Recognition and production are tracked separately with a state-of-the-art scheduling algorithm.',
  },
  {
    icon: GraduationCap,
    title: 'Theory of Mind Engine',
    description: 'Detects avoidance patterns, confusion pairs, and regressions to keep your learning on track.',
  },
]

export default function LandingPage({ isAuthenticated }: { isAuthenticated: boolean }) {
  return (
    <Flex direction="column" style={{ minHeight: '100vh' }}>
      {/* Hero */}
      <Flex
        direction="column"
        align="center"
        justify="center"
        style={{ flex: 1, padding: '80px 24px' }}
      >
        <Flex
          direction="column"
          align="center"
          gap="6"
          style={{ maxWidth: 640, textAlign: 'center' }}
        >
          <Heading size="8" style={{ letterSpacing: '-0.02em' }}>
            Linguist
          </Heading>
          <Text size="5" color="gray">
            A language learning app that builds a living model of what you know — and uses it to decide what you should learn next.
          </Text>
          <Button size="4" variant="solid" asChild>
            <Link href={isAuthenticated ? '/dashboard' : '/sign-in'}>
              {isAuthenticated ? 'Go to Dashboard' : 'Get Started'}
            </Link>
          </Button>
        </Flex>
      </Flex>

      {/* Features */}
      <Box style={{ padding: '0 24px 80px' }}>
        <Grid
          columns={{ initial: '1', sm: '2' }}
          gap="4"
          style={{ maxWidth: 800, margin: '0 auto' }}
        >
          {FEATURES.map((feature) => (
            <FeatureCard key={feature.title} {...feature} />
          ))}
        </Grid>
      </Box>

      {/* Footer */}
      <Flex
        align="center"
        justify="center"
        py="4"
        style={{ borderTop: '1px solid var(--gray-6)' }}
      >
        <Text size="2" color="gray">
          Linguist &copy; {new Date().getFullYear()}
        </Text>
      </Flex>
    </Flex>
  )
}
