# Lingle

An AI voice tutor for language learners. Real-time voice conversations with an intelligent tutor that tracks your errors, adapts to your level, and builds a personalized learner model over time.

Think Preply or iTalki, but the tutor is an AI that remembers everything, never cancels, and is available 24/7.

## Why Lingle Exists

Language learning apps either drill you with flashcards (Duolingo) or drop you into unstructured conversations with human tutors (iTalki). Neither builds a persistent model of what you know.

Lingle's approach: a **voice-first AI tutor** that maintains a living learner profile. Every session reads from it and writes back to it. The tutor knows your CEFR level, your recurring errors, your weak grammar patterns, and your personal context — and uses all of it to plan what happens next.

### What Makes It Different

**Voice-first.** Real-time conversations over LiveKit with sub-second latency. The tutor speaks, listens, and responds naturally. No text boxes.

**Persistent learner model.** CEFR scores (grammar + fluency) updated after every session. Error patterns tracked longitudinally. The tutor gets smarter about you over time.

**Curriculum-aware planning.** Each session is planned from your learner profile — target vocabulary from spaced repetition schedules, grammar focus from your weak areas, review items from past errors. "Free conversation" for a learner who keeps misusing て-form automatically surfaces て-form practice.

**Silent error tracking.** The tutor logs every error, notes strengths, and queues corrections — all via tool calls that never interrupt the conversation. You get a corrections document after each session.

**Adaptive difficulty.** The tutor adjusts mid-session if you're struggling or breezing through. Difficulty constraints flow from your CEFR scores into the system prompt.

## Stack

- **Monorepo:** Turborepo + pnpm workspaces
- **Web app:** Next.js 15 (App Router) + React 19 + TypeScript + Tailwind CSS
- **Voice agent:** LiveKit Agents SDK (Node.js) — runs as a separate process
- **LLM:** Claude (Anthropic) — Sonnet for the tutor, Haiku for post-session analysis
- **STT:** Soniox (realtime streaming, Japanese + multilingual) / Deepgram (fallback)
- **TTS:** Cartesia Sonic (low-latency, multilingual)
- **Auth:** Supabase Auth (Google OAuth)
- **Database:** Supabase Postgres + Prisma ORM
- **Session state:** Redis (live error/correction tracking during voice sessions)
- **Payment:** Stripe (checkout, billing portal, webhooks)

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│  BROWSER                                                  │
│                                                          │
│  Dashboard → Plan → Voice Session → Summary               │
│                                                          │
│  Components: VoiceAuraOrb, LiveSubtitles, ControlBar,    │
│              Whiteboard, ChatTranscript                   │
│                                                          │
│  Hooks: useLiveKitVoice (room, tracks, state machine)    │
└──────────────────────┬───────────────────────────────────┘
                       │  HTTP (plan, end, token, agent dispatch)
                       │  WebRTC (audio via LiveKit)
                       │  DataChannel (whiteboard content)
┌──────────────────────┴───────────────────────────────────┐
│  NEXT.JS SERVER (apps/web)                                │
│                                                          │
│  /api/conversation/plan      Curriculum-based planning    │
│  /api/conversation/end       Post-session pipeline        │
│  /api/conversation/onboarding-plan                        │
│  /api/voice/livekit-token    Room token generation        │
│  /api/voice/start-agent      Agent dispatch               │
│  /api/profile                Learner profile CRUD         │
│  /api/lessons                Session history              │
│  /api/usage                  Daily usage tracking         │
│  /api/stripe/*               Billing                      │
│  /api/dev/*                  Dev testing routes            │
└──────────────────────┬───────────────────────────────────┘
                       │
┌──────────────────────┴───────────────────────────────────┐
│  LIVEKIT AGENT (apps/agent)                               │
│                                                          │
│  LingleAgent (extends voice.Agent)                        │
│  ├── 6-slot system prompt from learner profile            │
│  ├── 11 tools (logError, noteStrength, saveMemory,        │
│  │   queueCorrection, adjustDifficulty, updatePhase,     │
│  │   setVocabHomework, endLesson, whiteboard tools)       │
│  ├── Redis session state (read/write per turn)            │
│  ├── Context compression (summarize old turns)            │
│  └── STT: Soniox/Deepgram | TTS: Cartesia                │
└──────────────────────┬───────────────────────────────────┘
                       │
┌──────────────────────┴───────────────────────────────────┐
│  DATA LAYER                                               │
│                                                          │
│  Supabase Postgres (Prisma)     Redis                     │
│  ├── User                       ├── SessionState          │
│  ├── LearnerModel (CEFR)        │   ├── errorsLogged      │
│  ├── ErrorPattern               │   ├── corrections       │
│  ├── VocabularyItem             │   ├── lessonPhase        │
│  ├── Lesson                     │   ├── difficultyLevel    │
│  ├── ErrorLog                   │   └── memoriesQueued     │
│  ├── CurriculumVocab            └────────────────────────│
│  ├── CurriculumGrammar                                    │
│  ├── Memory                                               │
│  ├── Subscription                                         │
│  └── DailyUsage                                           │
└──────────────────────────────────────────────────────────┘
```

### Session Flow

```
User clicks "Start session"
    ↓
POST /api/conversation/plan
    ├── Load learner model (CEFR scores, weak areas)
    ├── Load error patterns (longitudinal)
    ├── Run curriculum queries:
    │   ├── getVocabTargets (spaced repetition)
    │   ├── getNextGrammarFocus (weak patterns)
    │   ├── selectNextDomain (topic rotation)
    │   └── searchMemories (personal context)
    ├── Build agentMetadata (profile + plan + constraints)
    └── Return plan + session ID
    ↓
GET /api/voice/livekit-token → join room
POST /api/voice/start-agent → dispatch agent with metadata
    ↓
Voice session (WebRTC via LiveKit)
    ├── Agent builds 6-slot system prompt from metadata
    ├── Each turn: inject Redis session state into prompt
    ├── Tools fire silently: logError, noteStrength, etc.
    ├── Whiteboard content sent via DataChannel
    └── Context compressed after 20+ turns
    ↓
POST /api/conversation/end
    ├── Read final session state from Redis
    ├── Update CEFR scores (grammar + fluency deltas)
    ├── Update longitudinal error patterns
    ├── Write error logs to DB
    ├── Generate corrections document
    ├── Extract and persist memories
    └── Return post-session summary
    ↓
Summary screen (CEFR deltas, errors, corrections doc)
```

### Agent Tool System

All tools write to Redis and return empty strings so the LLM never narrates tool calls.

| Tool | Pattern | Purpose |
|---|---|---|
| `logError` | Silent tracking | Log grammar/vocab/pronunciation/register errors |
| `noteStrength` | Silent tracking | Note demonstrated skills |
| `saveMemory` | Silent tracking | Save personal facts for future sessions |
| `queueCorrection` | Silent tracking | Queue errors for post-session corrections doc |
| `adjustDifficulty` | Lesson mgmt | Adjust difficulty up/down mid-session |
| `updateLessonPhase` | Lesson mgmt | Advance warmup → main → review → wrapup |
| `setVocabHomework` | Lesson mgmt | Set vocab review list |
| `endLesson` | Lesson mgmt | Signal lesson should end |
| `showWhiteboard` | Whiteboard | Display content on learner's whiteboard |
| `updateWhiteboard` | Whiteboard | Update whiteboard content |
| `clearWhiteboard` | Whiteboard | Clear the whiteboard |

### Monorepo Structure

```
lingle/
├── apps/
│   ├── web/                          Next.js 15 app (@lingle/web)
│   │   ├── app/
│   │   │   ├── page.tsx              Landing page
│   │   │   ├── (auth)/               Sign-in, OAuth callback
│   │   │   ├── (app)/                Authenticated routes
│   │   │   │   ├── dashboard/        Home — start session, CEFR display
│   │   │   │   ├── conversation/
│   │   │   │   │   └── voice/        Session flow (plan → voice → summary)
│   │   │   │   │       └── test/     Direct voice test page
│   │   │   │   ├── onboarding/       Voice-based onboarding
│   │   │   │   ├── settings/         Correction style, session length
│   │   │   │   └── upgrade/          Pricing / Stripe checkout
│   │   │   └── api/
│   │   │       ├── conversation/     plan, end, onboarding-plan
│   │   │       ├── voice/            livekit-token, start-agent
│   │   │       ├── dev/              test-plan, test-post-session, session-state
│   │   │       ├── stripe/           checkout, portal, webhook
│   │   │       └── ...               profile, lessons, usage, subscription, user
│   │   ├── components/
│   │   │   ├── voice/                VoiceAuraOrb, LiveKitBridge, ControlBar,
│   │   │   │                         Subtitles, Transcript, Whiteboard, DevTools
│   │   │   ├── session/              SessionView, SessionSummary, OnboardingView
│   │   │   └── ui/                   Shared UI primitives
│   │   ├── hooks/                    useLiveKitVoice, useOnboarding, useLanguage
│   │   └── lib/                      API client, auth, curriculum, CEFR updater,
│   │                                 error patterns, memory, Redis, usage guard
│   └── agent/                        LiveKit voice agent (@lingle/agent)
│       └── src/
│           ├── index.ts              Agent worker entry point
│           ├── lingle-agent.ts       LingleAgent class + system prompt builder
│           ├── tools.ts              11 agent tools (error tracking, lesson mgmt)
│           ├── session-state.ts      Redis session state read/write
│           ├── config.ts             AgentMetadata, voice provider config
│           ├── whiteboard-tools.ts   Whiteboard DataChannel tools
│           ├── soniox-stt.ts         Custom Soniox STT integration
│           ├── cartesia-tts.ts       Cartesia TTS integration
│           └── claude-llm.ts         Claude LLM adapter for LiveKit
├── packages/
│   ├── shared/                       TypeScript types (@lingle/shared)
│   └── db/                           Prisma client singleton (@lingle/db)
├── prisma/
│   ├── schema.prisma                 11 models
│   └── migrations/
├── scripts/
│   └── inspect-agent-prompt.ts       CLI: inspect full agent system prompt
└── docs/
    ├── DEV_INFRA.md                  Dev testing infrastructure guide
    ├── PRODUCT_VISION.md
    ├── ARCHITECTURE_V2.md            (outdated — predates voice pivot)
    └── design-system.md
```

## Prerequisites

- Node.js 20+
- [pnpm](https://pnpm.io/) (`npm install -g pnpm`)
- A LiveKit server (local or cloud)
- Redis (for session state)

## Getting Started

```bash
# Install dependencies
pnpm install

# Generate Prisma client
pnpm prisma generate

# Run database migrations
pnpm prisma migrate dev

# Start the web app
pnpm --filter @lingle/web dev

# Start the voice agent (separate terminal)
pnpm --filter @lingle/agent dev
```

### Environment Variables

**Web app** (`apps/web/.env.local`):
```env
# Auth
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...

# Database
DATABASE_URL=postgresql://...

# AI
ANTHROPIC_API_KEY=sk-ant-...

# LiveKit
LIVEKIT_URL=wss://...
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
NEXT_PUBLIC_LIVEKIT_URL=wss://...

# Redis
REDIS_URL=redis://...

# Stripe
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID=price_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_...
NEXT_PUBLIC_APP_URL=https://...

# Dev (optional — bypasses Supabase auth)
# DEV_USER_ID=your-user-uuid
```

**Agent** (`apps/agent/.env`):
```env
ANTHROPIC_API_KEY=sk-ant-...
LIVEKIT_URL=wss://...
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
REDIS_URL=redis://...
SONIOX_API_KEY=...
CARTESIA_API_KEY=...
CARTESIA_VOICE_JA=...
```

## Scripts

| Command | Description |
|---|---|
| `pnpm --filter @lingle/web dev` | Start Next.js web app (localhost:3000) |
| `pnpm --filter @lingle/agent dev` | Start LiveKit voice agent |
| `pnpm --filter @lingle/web build` | Production build (web) |
| `pnpm turbo typecheck` | TypeScript check (all packages) |
| `pnpm prisma migrate dev` | Run Prisma migrations |
| `pnpm prisma studio` | Open Prisma Studio (DB browser) |
| `npx tsx scripts/inspect-agent-prompt.ts` | Inspect agent system prompt |

## Database Models

| Model | Purpose |
|---|---|
| `User` | Auth user (Google OAuth via Supabase) |
| `LearnerModel` | CEFR grammar + fluency scores, weak areas, session count |
| `ErrorPattern` | Longitudinal error tracking (rule, count, sessions) |
| `VocabularyItem` | Spaced repetition vocabulary with FSRS scheduling |
| `Lesson` | Completed session record (transcript, plan, corrections doc) |
| `ErrorLog` | Per-error log entries linked to lessons |
| `CurriculumVocab` | Vocabulary curriculum items with domain tags |
| `CurriculumGrammar` | Grammar curriculum with CEFR levels |
| `Memory` | Learner personal facts for cross-session context |
| `Subscription` | Stripe subscription state (free/pro) |
| `DailyUsage` | Conversation seconds per user per day |

## Monetization

| Plan | Limit | Price |
|---|---|---|
| Free | 10 min/day | $0 |
| Pro | Unlimited | $8/month |

## Dev Infrastructure

See [docs/DEV_INFRA.md](docs/DEV_INFRA.md) for testing subsystems without the full flow. Includes:
- Dev auth bypass (`DEV_USER_ID`)
- Dev API routes for testing plan generation and post-session pipeline
- Session state fixtures (beginner/intermediate/advanced)
- Dev tools panel on `/conversation/voice/test`
- Agent prompt inspection script

## Documentation

| Document | Description |
|---|---|
| [DEV_INFRA.md](docs/DEV_INFRA.md) | Dev testing infrastructure |
| [PRODUCT_VISION.md](docs/PRODUCT_VISION.md) | Product direction (partially outdated) |
| [design-system.md](docs/design-system.md) | UI design system reference |
