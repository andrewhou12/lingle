'use client'

import Link from 'next/link'
import { useRef } from 'react'
import { Flex, Box, Heading, Text, Button } from '@radix-ui/themes'
import { BookOpen, MessageCircle, RotateCcw, GraduationCap } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { motion, useInView } from 'framer-motion'

const ease: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94]

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0 },
}

const staggerContainer = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.1,
    },
  },
}

interface FeatureCardProps {
  icon: LucideIcon
  title: string
  description: string
}

function FeatureCard({ icon: Icon, title, description }: FeatureCardProps) {
  return (
    <motion.div
      variants={fadeUp}
      transition={{ duration: 0.5, ease }}
      whileHover={{ y: -2 }}
      style={{
        padding: 24,
        borderRadius: 12,
        border: '1px solid var(--gray-a4)',
        background: 'var(--gray-a2)',
        transition: 'border-color 0.2s, box-shadow 0.2s',
        cursor: 'default',
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLElement
        el.style.borderColor = 'var(--gray-a6)'
        el.style.boxShadow = '0 8px 32px rgba(0,0,0,0.08)'
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLElement
        el.style.borderColor = 'var(--gray-a4)'
        el.style.boxShadow = 'none'
      }}
    >
      <Flex direction="column" gap="3">
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: 'var(--accent-a3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon size={20} style={{ color: 'var(--accent-11)' }} />
        </div>
        <Heading size="4">{title}</Heading>
        <Text size="2" style={{ color: 'var(--gray-11)' }}>
          {description}
        </Text>
      </Flex>
    </motion.div>
  )
}

const FEATURES: FeatureCardProps[] = [
  {
    icon: BookOpen,
    title: 'Adaptive Knowledge Model',
    description:
      'Every vocabulary and grammar item is tracked with a mastery state that evolves as you learn.',
  },
  {
    icon: MessageCircle,
    title: 'AI Conversation Partner',
    description:
      'Sessions are planned around your knowledge gaps, targeting items you need to practice most.',
  },
  {
    icon: RotateCcw,
    title: 'FSRS Spaced Repetition',
    description:
      'Recognition and production are tracked separately with a state-of-the-art scheduling algorithm.',
  },
  {
    icon: GraduationCap,
    title: 'Theory of Mind Engine',
    description:
      'Detects avoidance patterns, confusion pairs, and regressions to keep your learning on track.',
  },
]

export default function LandingPage({ isAuthenticated }: { isAuthenticated: boolean }) {
  const featuresRef = useRef<HTMLDivElement>(null)
  const featuresInView = useInView(featuresRef, { once: true, margin: '-80px' })

  return (
    <Flex direction="column" style={{ minHeight: '100vh' }}>
      {/* Hero */}
      <Flex
        direction="column"
        align="center"
        justify="center"
        style={{
          flex: 1,
          minHeight: '100vh',
          padding: '80px 24px',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Background gradient */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(ellipse 80% 50% at 50% -20%, var(--accent-a2), transparent)',
            pointerEvents: 'none',
          }}
        />

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          style={{
            maxWidth: 640,
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 24,
            position: 'relative',
          }}
        >
          {/* Kicker */}
          <motion.div variants={fadeUp} transition={{ duration: 0.5, ease }}>
            <Text
              size="2"
              weight="medium"
              style={{
                color: 'var(--accent-11)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              Language Learning, Reimagined
            </Text>
          </motion.div>

          {/* Main heading */}
          <motion.div variants={fadeUp} transition={{ duration: 0.5, ease }}>
            <Heading
              size={{ initial: '8', md: '9' }}
              style={{ letterSpacing: '-0.04em' }}
            >
              A living model of{' '}
              <span style={{ color: 'var(--accent-11)' }}>what you know</span>
            </Heading>
          </motion.div>

          {/* Tagline */}
          <motion.div variants={fadeUp} transition={{ duration: 0.5, ease }}>
            <Text size="4" style={{ color: 'var(--gray-11)', lineHeight: 1.6 }}>
              Linguist tracks every word and grammar pattern you encounter, building a
              probabilistic map of your competence — then uses it to decide what you
              should learn next.
            </Text>
          </motion.div>

          {/* CTA */}
          <motion.div
            variants={fadeUp}
            transition={{ duration: 0.5, ease }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <Button size="4" variant="solid" asChild style={{ paddingInline: 32 }}>
              <Link href={isAuthenticated ? '/dashboard' : '/sign-in'}>
                {isAuthenticated ? 'Go to Dashboard' : 'Get Started'}
              </Link>
            </Button>
          </motion.div>
        </motion.div>
      </Flex>

      {/* Divider */}
      <div
        style={{
          width: 120,
          height: 1,
          background: 'var(--gray-a4)',
          margin: '0 auto',
        }}
      />

      {/* Features */}
      <Box style={{ padding: '80px 24px' }} ref={featuresRef}>
        <Flex
          direction="column"
          align="center"
          gap="2"
          style={{ maxWidth: 800, margin: '0 auto 48px' }}
        >
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={featuresInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, ease }}
          >
            <Heading size="6" align="center" style={{ letterSpacing: '-0.02em' }}>
              Built for real learning
            </Heading>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={featuresInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, ease, delay: 0.1 }}
          >
            <Text
              size="3"
              align="center"
              style={{ color: 'var(--gray-11)' }}
            >
              Four systems working together to adapt to exactly where you are.
            </Text>
          </motion.div>
        </Flex>

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate={featuresInView ? 'visible' : 'hidden'}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 16,
            maxWidth: 800,
            margin: '0 auto',
          }}
        >
          {FEATURES.map((feature) => (
            <FeatureCard key={feature.title} {...feature} />
          ))}
        </motion.div>
      </Box>

      {/* Footer */}
      <Flex
        align="center"
        justify="center"
        py="6"
        style={{ borderTop: '1px solid var(--gray-a3)' }}
      >
        <Text size="1" style={{ color: 'var(--gray-9)' }}>
          Linguist &copy; {new Date().getFullYear()}
        </Text>
      </Flex>
    </Flex>
  )
}
