# Linguist

A language learning agent that builds a living, probabilistic knowledge model of the learner. Every interaction — reviews, conversations, lookups — updates a multi-dimensional map of what the learner knows, and the app uses that map to decide what they should encounter next.

Available as both a **desktop app** (Electron) and a **web app** (Next.js), sharing the same database and business logic via a Turborepo monorepo.

V1 target: Japanese. Text-only (voice in V2).

## Why Linguist Exists

Most language learning apps treat learners as interchangeable. Duolingo follows a fixed curriculum. Anki tracks card-level recall but has no concept of the learner as a whole. Conversation apps like Langua offer freeform practice but don't know what you're weak on.

Linguist's core thesis: **the learner profile is the product**. The app maintains a rich, multi-layered model of what you know, what you're shaky on, what you avoid, and where you're ready to grow — and every feature reads from and writes to that model.

### What Makes It Different

**Knowledge model, not a card deck.** Items aren't just "due" or "not due." Each item tracks mastery state, recognition vs. production strength, accumulated production weight, context breadth (how many distinct contexts you've used it in), and per-modality exposure (reading, writing, listening, speaking). Promotion through mastery tiers is gated by evidence: you can't reach journeyman without production, expert without context breadth, or master without demonstrating transfer to novel contexts.

**Theory of Mind engine.** The system infers higher-level beliefs about the learner beyond raw review data: avoidance patterns (items you drill but never use in conversation), confusion pairs (items that co-occur in errors), regression (previously stable items slipping), modality gaps (strong reading but weak writing), and transfer gaps (grammar patterns only used in the context where they were first learned). These inferences feed directly into session planning.

**Conversation partner with goals.** The AI conversation partner isn't generic — it reads the learner profile before every session and has explicit targets. It engineers natural moments to elicit specific vocabulary and grammar from the learner, tracks register usage, notes circumlocution as a positive strategy, and runs post-session analysis to update the knowledge model. Every conversation produces structured data that makes the next one better.

**Curriculum generator (i+1).** Instead of a fixed syllabus, the curriculum engine computes a "knowledge bubble" — a per-CEFR-level breakdown of what you know — identifies your current level and frontier, and recommends items just beyond your edge using Krashen's i+1 principle. Recommendations are scored by frequency, gap-filling priority, prerequisite readiness, and ToM signals.

**Pragmatic competence tracking.** Beyond vocabulary and grammar, the system tracks pragmatic skills: register accuracy (casual vs. polite), communication strategies (circumlocution, L1 fallback, silence), and avoided patterns. This is Layer 3 of the knowledge model — the dimension most apps ignore entirely.

## Stack

- **Monorepo:** Turborepo + pnpm workspaces
- **Desktop app:** Electron + React + TypeScript + Radix UI
- **Web app:** Next.js 15 (App Router) + React + TypeScript + Radix UI
- **Auth:** Supabase Auth (Google OAuth) via `@supabase/ssr`
- **Database:** Hosted Supabase (Postgres) + Prisma ORM
- **AI:** Claude Sonnet (conversation partner, session planning, post-session analysis, pragmatic analysis, daily brief polishing)
- **SRS:** FSRS (ts-fsrs), runs fully locally

## Prerequisites

- Node.js 20+
- [pnpm](https://pnpm.io/) (`npm install -g pnpm`)

## Getting Started

```bash
# Install dependencies
pnpm install

# Copy env and add your keys
cp .env.example .env
# Edit .env → set ANTHROPIC_API_KEY, DATABASE_URL, SUPABASE_URL, SUPABASE_ANON_KEY

# For the web app, create apps/web/.env.local:
#   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
#   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
#   DATABASE_URL=your-database-url
#   ANTHROPIC_API_KEY=your-api-key

# Generate the Prisma client
pnpm prisma generate

# Run database migrations
pnpm prisma migrate dev

# Start the web app
pnpm --filter @linguist/web dev

# Or start the desktop app
pnpm --filter @linguist/desktop dev
```

### Authentication

Both apps use Supabase Auth with Google OAuth against a hosted Supabase instance. Users sign in via Google, and a DB user record is created/updated on each sign-in. The web app uses cookie-based sessions via `@supabase/ssr`; the desktop app uses PKCE flow via Electron.

### Database Seeding

The seed script (`prisma/seed.ts`) populates the database with a realistic starter dataset so all features are immediately usable. It creates:

**Learner Profile:**
- Target language: Japanese, native language: English
- Daily new item limit: 10, target retention: 90%
- Computed level: A1

**Pragmatic Profile:**
- Preferred register: polite
- All accuracy/strategy counters initialized to zero

**30 Vocabulary Items** across 5 mastery states:

| State | Count | Items | FSRS State |
|---|---|---|---|
| `apprentice_1` | 8 | 食べる, 飲む, 大きい, 小さい, 学校, 先生, 時間, 新しい | stability ~1d, due today |
| `apprentice_2` | 6 | 水, 友達, 行く, 来る, 本, 天気 | stability ~2d, due today |
| `apprentice_3` | 4 | 人, 見る, 言う, 日本語 | stability ~4d, due today |
| `journeyman` | 4 | 私, する, ある, いい | stability ~14d, due today |
| `introduced` | 4 | 電車, 買う, 病院, 書く | not in SRS yet |
| `unseen` | 4 | 映画, 走る, 高い, 安い | not in SRS yet |

**8 Grammar Patterns:**

| State | Count | Patterns |
|---|---|---|
| `apprentice_1` | 3 | て-form, たい-form, ない-form |
| `apprentice_2` | 2 | です/だ copula, は topic marker |
| `introduced` | 2 | が subject marker, past tense |
| `unseen` | 1 | に particle |

All apprentice/journeyman items are set with FSRS due dates of today, so the review queue is immediately populated.

**To re-seed** (wipes existing data and starts fresh):
```bash
pnpm prisma db seed
```

**To reset everything** (drops all tables, re-migrates, and re-seeds):
```bash
pnpm prisma migrate reset
```

## Scripts

| Command | Description |
|---|---|
| `pnpm --filter @linguist/web dev` | Start Next.js web app (localhost:3000) |
| `pnpm --filter @linguist/desktop dev` | Launch Electron desktop app with hot reload |
| `pnpm --filter @linguist/web build` | Production build (web) |
| `pnpm turbo typecheck` | TypeScript check (all packages) |
| `pnpm prisma migrate dev` | Run Prisma migrations |
| `pnpm prisma studio` | Open Prisma Studio (DB browser) |
| `pnpm prisma generate` | Regenerate Prisma client |
| `pnpm prisma db seed` | Seed database with sample data |

## Architecture

### Monorepo Structure

```
linguist/
├── turbo.json                      # Turborepo task config
├── pnpm-workspace.yaml             # pnpm workspace definition
├── package.json                    # Root (devDeps: turbo, typescript, prisma)
├── prisma/
│   ├── schema.prisma               # Database schema (10+ models)
│   ├── seed.ts                     # Database seed script
│   └── migrations/
├── apps/
│   ├── desktop/                    # Electron app (@linguist/desktop)
│   │   ├── electron/               # Main process (IPC handlers, auth, DB)
│   │   └── src/                    # React renderer (pages, hooks, components)
│   └── web/                        # Next.js app (@linguist/web)
│       ├── app/                    # App Router pages + API routes
│       │   ├── (auth)/             # Sign-in, OAuth callback
│       │   ├── (app)/              # Authenticated pages (shared sidebar layout)
│       │   │   ├── dashboard/
│       │   │   ├── review/
│       │   │   ├── learn/
│       │   │   ├── knowledge/
│       │   │   ├── chat/
│       │   │   ├── settings/
│       │   │   ├── insights/
│       │   │   └── onboarding/
│       │   └── api/                # 30 API routes (replaces Electron IPC)
│       ├── lib/                    # Supabase clients, auth helpers, API client
│       ├── hooks/                  # Fetch-based data hooks
│       └── components/             # Shared UI components
├── packages/
│   ├── core/                       # Pure business logic (@linguist/core)
│   │   └── src/
│   │       ├── fsrs/               # FSRS scheduler (ts-fsrs)
│   │       ├── mastery/            # Evidence-gated state machine
│   │       ├── tom/                # Theory of Mind engine (5 detectors)
│   │       ├── conversation/       # Session planning + post-session analysis
│   │       ├── profile/            # CEFR ceilings, skill levels, streaks
│   │       ├── curriculum/         # Knowledge bubble + i+1 recommender
│   │       ├── pragmatics/         # Register accuracy, strategies
│   │       ├── narrative/          # AI daily brief templates
│   │       └── onboarding/         # Assessment items + placement
│   ├── shared/                     # TypeScript types (@linguist/shared)
│   │   └── src/types.ts
│   └── db/                         # Prisma client singleton (@linguist/db)
│       └── src/client.ts
└── supabase/                       # Supabase project config
```

**Boundary rules:**
- `packages/core/` is pure TypeScript — trivially testable, no framework deps
- Desktop: `electron/ipc/` calls `@linguist/core` + `@linguist/db`, exposes via IPC
- Web: `app/api/` routes call `@linguist/core` + `@linguist/db`, return JSON
- Desktop renderer accesses data through `window.linguist` IPC hooks
- Web pages access data through `lib/api.ts` fetch client
- `packages/shared/types.ts` is importable everywhere

### Data Flow

```
User action (review, conversation, lookup)
      ↓
Event logged to DB (ReviewEvent + ItemContextLog)
      ↓
Learner profile updated
  ├── FSRS state (recognition + production, per item)
  ├── Mastery state machine (evidence-gated promotions)
  ├── Modality counters (reading/writing/listening/speaking)
  ├── Context breadth (distinct context types per item)
  └── Production weight (accumulated, drill=0.5 conversation=1.0)
      ↓
ToM engine infers higher-level beliefs
  ├── Avoidance detection
  ├── Confusion pair detection
  ├── Regression detection
  ├── Modality gap detection
  └── Transfer gap detection
      ↓
Curriculum generator computes knowledge bubble + i+1 recommendations
      ↓
Conversation agent reads profile + ToM brief + curriculum
  → Plans session with specific targets (3-5 vocab, 1-2 grammar)
  → Conducts conversation with 10 behavioral rules
  → Post-session: analyzes transcript, updates knowledge model
  → Pragmatic analysis: register accuracy, strategies, avoided patterns
      ↓
Profile recalculated (CEFR ceilings, skill levels, streaks)
```

### Three-Layer Knowledge Model

**Layer 1 — Item-level knowledge:** Each vocabulary and grammar item has a mastery state, dual FSRS states (recognition/production), accumulated production weight, context breadth, and per-modality exposure counts. Mastery promotion is gated by evidence:

| Transition | Gate |
|---|---|
| apprentice_4 → journeyman | Production weight >= 1.0 |
| journeyman → expert | Context count >= 3 |
| expert → master | Novel context count >= 2 (grammar) |

**Layer 2 — Aggregate competence:** The profile calculator computes CEFR-level ceilings from item-level data. Comprehension ceiling = highest level where avg recognition retrievability > 0.80. Production ceiling = highest where avg production retrievability > 0.60. The curriculum generator uses these to identify the frontier level and recommend i+1 items.

**Layer 3 — Pragmatic competence:** Register accuracy (casual/polite), communication strategies (circumlocution, L1 fallback, silence), and avoided patterns. Updated after each conversation session via exponential moving average.

### Database Models

| Model | Purpose |
|---|---|
| `User` | Auth user with Google OAuth profile (name, email, avatar) |
| `LearnerProfile` | Computed CEFR level, comprehension/production ceilings, modality levels, streaks, pattern summaries |
| `LexicalItem` | Vocabulary with dual FSRS states, mastery state, context breadth, modality counters, production weight |
| `GrammarItem` | Grammar patterns with FSRS states, prerequisites, novel context tracking |
| `ReviewEvent` | Every SRS review graded with production weight and context type |
| `ConversationSession` | Transcript, system prompt, session plan, planned targets, hits, errors, avoidance events |
| `TomInference` | System beliefs: avoidance, confusion pairs, regression, modality gap, transfer gap |
| `ItemContextLog` | Every encounter per item across contexts (SRS, conversation, reading, drill) with modality + success |
| `PragmaticProfile` | Register accuracy (casual/polite), communication strategies, avoided patterns |
| `CurriculumItem` | Queued i+1 recommendations with priority scoring and introduction status |

## Pages

| Page | Status | Description |
|---|---|---|
| **Dashboard** | Working | Due count, today's review stats, AI-generated daily brief, 3 frontier visualizations (level progress, mastery distribution, gap count) |
| **Review** | Working | Full SRS session — recognition and production cards, keyboard shortcuts (1-4 for grading), FSRS scheduling, mastery transitions, session summary with accuracy stats |
| **Learn** | Working | Complete conversation partner flow — curriculum preview with skip/refresh → session planning via Claude API → in-session chat with session info bar → post-session analysis with target checklist, errors, new items, overall assessment |
| **Knowledge** | Working | Searchable/filterable vocabulary table with mastery state badges, due dates, FSRS stability, frequency rank |
| **Chat** | Working | Multi-conversation streaming chatbot with Claude (web uses Vercel AI SDK, desktop uses IPC streaming) |
| **Settings** | Working | Target/native language selectors, daily new item limit (5-30), target retention (80-97%), read-only progress stats |
| **Onboarding** | Working | Multi-step wizard: language selection → JLPT level self-report → vocabulary/grammar assessment → study preferences → item seeding |
| **Insights** | Stub | Placeholder for ToM inference visualization |

## Environment Variables

### Root `.env` (used by Prisma and desktop app)
```
ANTHROPIC_API_KEY=sk-ant-...
DATABASE_URL=postgresql://...
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=sb_publishable_...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

### Web app `apps/web/.env.local`
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
DATABASE_URL=postgresql://...
ANTHROPIC_API_KEY=sk-ant-...
```

## Progress

See [docs/progress/](docs/progress/) for detailed session-by-session development logs.

## Known Issues

- Learn page shows item IDs in session summary rather than surface forms (analysis returns IDs, needs lookup)
- Word bank detail view (editing, history) not built
- No error boundary or toast notifications for API failures — errors go to console only
- Session planning occasionally slow (Claude API latency) with no progress indicator beyond loading state
- Chat page is disconnected from the knowledge model — no profile-aware system prompt, no post-session analysis
