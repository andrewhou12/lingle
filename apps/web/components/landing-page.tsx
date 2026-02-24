'use client'

import Link from 'next/link'
import { useRef } from 'react'
import { Flex, Box, Heading, Text, Button } from '@radix-ui/themes'
import {
  BookOpen,
  MessageCircle,
  RotateCcw,
  GraduationCap,
  Target,
  TrendingUp,
  Zap,
  ArrowRight,
  ArrowDown,
} from 'lucide-react'
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
    transition: { staggerChildren: 0.1 },
  },
}

/* ── Section label ── */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text
      size="2"
      weight="medium"
      style={{
        color: 'var(--accent-11)',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        display: 'block',
        marginBottom: 12,
      }}
    >
      {children}
    </Text>
  )
}

/* ── Feature Cards ── */

interface FeatureCardProps {
  icon: LucideIcon
  title: string
  description: string
  detail: string
}

function FeatureCard({ icon: Icon, title, description, detail }: FeatureCardProps) {
  return (
    <motion.div
      variants={fadeUp}
      transition={{ duration: 0.5, ease }}
      whileHover={{ y: -2 }}
      style={{
        padding: 28,
        borderRadius: 16,
        border: '1px solid var(--gray-a4)',
        background: 'var(--color-surface)',
        transition: 'border-color 0.2s, box-shadow 0.2s',
        cursor: 'default',
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLElement
        el.style.borderColor = 'var(--gray-a6)'
        el.style.boxShadow = '0 8px 32px rgba(0,0,0,0.06)'
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
            width: 44,
            height: 44,
            borderRadius: 12,
            background: 'var(--accent-a3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon size={22} style={{ color: 'var(--accent-11)' }} />
        </div>
        <Heading size="4">{title}</Heading>
        <Text size="2" style={{ color: 'var(--gray-11)', lineHeight: 1.6 }}>
          {description}
        </Text>
        <Text size="1" style={{ color: 'var(--gray-9)', lineHeight: 1.5, marginTop: 2 }}>
          {detail}
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
      'Every word and grammar pattern lives in an 8-stage mastery pipeline — from first encounter to fully burned.',
    detail:
      'Items can\'t advance past apprentice without production evidence. The system creates natural opportunities to generate it.',
  },
  {
    icon: MessageCircle,
    title: 'AI Conversation Partner',
    description:
      'Each session is planned around your knowledge gaps. The AI steers conversation toward items you need to practice most.',
    detail:
      'Errors are corrected via natural recasting — no flow-breaking corrections. Post-session analysis logs every hit and miss.',
  },
  {
    icon: RotateCcw,
    title: 'FSRS Spaced Repetition',
    description:
      'Recognition and production tracked with separate FSRS models — because reading a word and producing it are different skills.',
    detail:
      'Pre-trained on 700M+ reviews. Personalizes to your learning patterns after ~50 reviews per item type.',
  },
  {
    icon: GraduationCap,
    title: 'Theory of Mind Engine',
    description:
      'Detects when you\'re avoiding a grammar pattern, confusing similar words, or regressing on items you once knew.',
    detail:
      'Generates a daily brief read by the conversation partner before every session, keeping practice precisely targeted.',
  },
]

/* ── How It Works ── */

interface StepProps {
  number: string
  title: string
  description: string
  icon: LucideIcon
}

const STEPS: StepProps[] = [
  {
    number: '01',
    title: 'Take a 2-minute assessment',
    description:
      'Select your level and mark vocabulary you already know. Linguist builds your initial knowledge map — no empty start.',
    icon: Target,
  },
  {
    number: '02',
    title: 'Practice with purpose',
    description:
      'SRS reviews and AI conversations are planned around your actual knowledge state. Every card and every exchange has a reason.',
    icon: Zap,
  },
  {
    number: '03',
    title: 'Watch your model evolve',
    description:
      'The system learns your patterns — what you avoid, what you confuse, what\'s regressing. Each session gets smarter than the last.',
    icon: TrendingUp,
  },
]

/* ── Comparisons ── */

const COMPARISONS = [
  { before: 'Generic curricula', after: 'Session plans built from your knowledge state' },
  { before: 'One review score per item', after: 'Separate recognition and production tracking' },
  { before: 'Passive flashcard drills', after: 'AI conversations with targeted goals' },
]

/* ── Main Component ── */

export default function LandingPage({ isAuthenticated }: { isAuthenticated: boolean }) {
  const howItWorksRef = useRef<HTMLDivElement>(null)
  const howItWorksInView = useInView(howItWorksRef, { once: true, margin: '-80px' })
  const featuresRef = useRef<HTMLDivElement>(null)
  const featuresInView = useInView(featuresRef, { once: true, margin: '-80px' })
  const diffRef = useRef<HTMLDivElement>(null)
  const diffInView = useInView(diffRef, { once: true, margin: '-80px' })
  const ctaRef = useRef<HTMLDivElement>(null)
  const ctaInView = useInView(ctaRef, { once: true, margin: '-80px' })

  const ctaHref = isAuthenticated ? '/dashboard' : '/sign-in'

  return (
    <Flex direction="column" style={{ minHeight: '100vh' }}>
      {/* ── Hero ── */}
      <Flex
        direction="column"
        align="center"
        justify="center"
        style={{
          minHeight: '100vh',
          padding: '80px 24px',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
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
            maxWidth: 680,
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 24,
            position: 'relative',
          }}
        >
          {/* Badge */}
          <motion.div variants={fadeUp} transition={{ duration: 0.5, ease }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 16px',
                borderRadius: 100,
                border: '1px solid var(--accent-a4)',
                background: 'var(--accent-a2)',
              }}
            >
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: 'var(--accent-9)',
                }}
              />
              <Text size="1" weight="medium" style={{ color: 'var(--accent-11)' }}>
                Now in beta
              </Text>
            </div>
          </motion.div>

          {/* Heading */}
          <motion.div variants={fadeUp} transition={{ duration: 0.5, ease }}>
            <Heading
              size={{ initial: '8', md: '9' }}
              style={{ letterSpacing: '-0.04em', lineHeight: 1.1 }}
            >
              A living model of{' '}
              <span style={{ color: 'var(--accent-11)' }}>what you know</span>
            </Heading>
          </motion.div>

          {/* Tagline */}
          <motion.div variants={fadeUp} transition={{ duration: 0.5, ease }}>
            <Text
              size="4"
              style={{
                color: 'var(--gray-11)',
                lineHeight: 1.7,
                maxWidth: 560,
                display: 'block',
              }}
            >
              Linguist builds a probabilistic map of your Japanese — every word, every
              grammar pattern, every conversation — then uses it to decide exactly what
              you should encounter next.
            </Text>
          </motion.div>

          {/* CTAs */}
          <motion.div
            variants={fadeUp}
            transition={{ duration: 0.5, ease }}
            style={{
              display: 'flex',
              gap: 12,
              alignItems: 'center',
              flexWrap: 'wrap',
              justifyContent: 'center',
            }}
          >
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <Button size="4" variant="solid" asChild style={{ paddingInline: 28 }}>
                <Link
                  href={ctaHref}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  {isAuthenticated ? 'Go to Dashboard' : 'Start Learning Japanese'}
                  <ArrowRight size={16} />
                </Link>
              </Button>
            </motion.div>
            {!isAuthenticated && (
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <Button
                  size="4"
                  variant="outline"
                  style={{ paddingInline: 28, cursor: 'pointer' }}
                  onClick={() =>
                    howItWorksRef.current?.scrollIntoView({ behavior: 'smooth' })
                  }
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    See How It Works
                    <ArrowDown size={16} />
                  </span>
                </Button>
              </motion.div>
            )}
          </motion.div>

          {/* Trust line */}
          {!isAuthenticated && (
            <motion.div variants={fadeUp} transition={{ duration: 0.5, ease }}>
              <Text size="1" style={{ color: 'var(--gray-9)' }}>
                Free to use. 2-minute setup. No credit card required.
              </Text>
            </motion.div>
          )}
        </motion.div>
      </Flex>

      {/* ── How It Works ── */}
      <Box ref={howItWorksRef} style={{ padding: '80px 24px', background: 'var(--gray-a2)' }}>
        <Flex direction="column" align="center" style={{ maxWidth: 960, margin: '0 auto' }}>
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={howItWorksInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, ease }}
            style={{ textAlign: 'center', marginBottom: 48 }}
          >
            <SectionLabel>How It Works</SectionLabel>
            <Heading size="6" style={{ letterSpacing: '-0.02em' }}>
              From zero to personalized in minutes
            </Heading>
          </motion.div>

          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate={howItWorksInView ? 'visible' : 'hidden'}
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: 8,
              width: '100%',
            }}
          >
            {STEPS.map((step) => (
              <motion.div
                key={step.number}
                variants={fadeUp}
                transition={{ duration: 0.5, ease }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 16,
                  padding: 28,
                }}
              >
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 14,
                    border: '1px solid var(--gray-a4)',
                    background: 'var(--color-surface)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <step.icon size={22} style={{ color: 'var(--accent-11)' }} />
                </div>
                <div>
                  <Text
                    size="1"
                    weight="medium"
                    style={{ color: 'var(--accent-11)', letterSpacing: '0.05em' }}
                  >
                    STEP {step.number}
                  </Text>
                  <Heading size="4" style={{ marginTop: 4 }}>
                    {step.title}
                  </Heading>
                </div>
                <Text size="2" style={{ color: 'var(--gray-11)', lineHeight: 1.6 }}>
                  {step.description}
                </Text>
              </motion.div>
            ))}
          </motion.div>
        </Flex>
      </Box>

      {/* ── Features ── */}
      <Box ref={featuresRef} style={{ padding: '80px 24px' }}>
        <Flex
          direction="column"
          align="center"
          style={{ maxWidth: 960, margin: '0 auto 48px', textAlign: 'center' }}
        >
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={featuresInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, ease }}
          >
            <SectionLabel>Under the Hood</SectionLabel>
            <Heading size="6" style={{ letterSpacing: '-0.02em', marginBottom: 8 }}>
              Four systems, one learner model
            </Heading>
            <Text size="3" style={{ color: 'var(--gray-11)' }}>
              Every component reads from and writes to your knowledge state.
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
            maxWidth: 960,
            margin: '0 auto',
          }}
        >
          {FEATURES.map((feature) => (
            <FeatureCard key={feature.title} {...feature} />
          ))}
        </motion.div>
      </Box>

      {/* ── Differentiator ── */}
      <Box ref={diffRef} style={{ padding: '80px 24px', background: 'var(--gray-a2)' }}>
        <Flex direction="column" align="center" style={{ maxWidth: 640, margin: '0 auto' }}>
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={diffInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, ease }}
            style={{ textAlign: 'center', marginBottom: 40 }}
          >
            <Heading size="6" style={{ letterSpacing: '-0.02em', marginBottom: 12 }}>
              Not another flashcard app
            </Heading>
            <Text size="3" style={{ color: 'var(--gray-11)', lineHeight: 1.7 }}>
              Most apps treat language as a set of cards to memorize. Linguist treats it
              as a skill to model — tracking not just what you&apos;ve seen, but what you
              can produce, what you avoid, and what&apos;s starting to fade.
            </Text>
          </motion.div>

          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate={diffInView ? 'visible' : 'hidden'}
            style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}
          >
            {COMPARISONS.map((item) => (
              <motion.div
                key={item.before}
                variants={fadeUp}
                transition={{ duration: 0.4, ease }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  padding: '16px 20px',
                  borderRadius: 12,
                  background: 'var(--color-surface)',
                  border: '1px solid var(--gray-a3)',
                }}
              >
                <Text
                  size="2"
                  style={{
                    color: 'var(--gray-9)',
                    flex: 1,
                    textDecoration: 'line-through',
                  }}
                >
                  {item.before}
                </Text>
                <ArrowRight
                  size={16}
                  style={{ color: 'var(--accent-9)', flexShrink: 0 }}
                />
                <Text size="2" weight="medium" style={{ color: 'var(--gray-12)', flex: 1 }}>
                  {item.after}
                </Text>
              </motion.div>
            ))}
          </motion.div>
        </Flex>
      </Box>

      {/* ── Final CTA ── */}
      <Box ref={ctaRef} style={{ padding: '80px 24px' }}>
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={ctaInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, ease }}
        >
          <Flex
            direction="column"
            align="center"
            gap="4"
            style={{ maxWidth: 560, margin: '0 auto', textAlign: 'center' }}
          >
            <Heading size="6" style={{ letterSpacing: '-0.02em' }}>
              Your journey starts with knowing where you are
            </Heading>
            <Text size="3" style={{ color: 'var(--gray-11)', lineHeight: 1.7 }}>
              Take a 2-minute placement test and Linguist will map your current
              Japanese — then build every session around getting you further.
            </Text>
            <motion.div
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              style={{ marginTop: 8 }}
            >
              <Button size="4" variant="solid" asChild style={{ paddingInline: 32 }}>
                <Link
                  href={ctaHref}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  {isAuthenticated ? 'Go to Dashboard' : 'Take the Placement Test'}
                  <ArrowRight size={16} />
                </Link>
              </Button>
            </motion.div>
            {!isAuthenticated && (
              <Text size="1" style={{ color: 'var(--gray-9)' }}>
                Free to use. No credit card required.
              </Text>
            )}
          </Flex>
        </motion.div>
      </Box>

      {/* ── Footer ── */}
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
