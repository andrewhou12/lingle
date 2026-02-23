# Linguist

A desktop language learning agent that builds a living, probabilistic knowledge model of the learner. Every interaction — reviews, conversations, lookups — updates a multi-dimensional map of what the learner knows, and the app uses that map to decide what they should encounter next.

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

- **Desktop:** Electron
- **Frontend:** React + TypeScript + Radix UI
- **Database:** Supabase (local via CLI) + Prisma ORM
- **AI:** Claude Sonnet (conversation partner, session planning, post-session analysis, pragmatic analysis, daily brief polishing)
- **SRS:** FSRS (ts-fsrs), runs fully locally

## Prerequisites

- Node.js 20+
- [Docker Desktop](https://docs.docker.com/desktop/) (required for local Supabase)

## Getting Started

```bash
# Install dependencies
npm install

# Start local Supabase (Docker must be running)
npx supabase start

# Run database migrations
npx prisma migrate dev

# Generate the Prisma client
npx prisma generate

# Seed the database with sample data
npx prisma db seed

# Copy env and add your API key
cp .env.example .env
# Edit .env → set ANTHROPIC_API_KEY

# Start the app in dev mode
npm run dev
```

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

All apprentice/journeyman items are set with FSRS due dates of today, so the review queue is immediately populated. Each item has realistic FSRS state (stability, difficulty, reps) appropriate to its mastery level.

**To re-seed** (wipes existing data and starts fresh):
```bash
npx prisma db seed
```

**To reset everything** (drops all tables, re-migrates, and re-seeds):
```bash
npx prisma migrate reset
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Launch Electron app with hot reload |
| `npm run build` | Production build |
| `npm run typecheck` | TypeScript check (all) |
| `npm run typecheck:node` | TypeScript check (main/preload/core) |
| `npm run typecheck:web` | TypeScript check (renderer) |
| `npm run db:migrate` | Run Prisma migrations |
| `npm run db:studio` | Open Prisma Studio (DB browser) |
| `npm run db:generate` | Regenerate Prisma client |
| `npx prisma db seed` | Seed database with sample data |

## Architecture

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

### Conversation Session Pipeline

The Learn page runs a three-phase flow:

**Phase 1 — Planning:**
1. Compute knowledge bubble (coverage per CEFR level)
2. Generate curriculum recommendations (scored by frequency, gap-filling, prerequisites, ToM)
3. User previews recommendations, can skip items
4. Introduce non-skipped items to DB (set to `introduced` mastery state)
5. Call Claude API with learner summary + ToM brief → receive session plan (target items, difficulty, register, focus)

**Phase 2 — Conversation:**
- Claude acts as conversation partner with 10 behavioral rules (engineer target moments, recast errors, track register, model circumlocution, introduce i+1 items, test transfer in novel contexts)
- User converses in target language via text chat

**Phase 3 — Post-Session Analysis:**
1. Claude analyzes full transcript → identifies targets hit, errors, avoidance events, new items encountered
2. Context logs created per item (modality, production flag, success flag)
3. Item modality counters updated (readingExposures, writingProductions, etc.)
4. Production weight accumulated on items successfully produced
5. New vocabulary encountered added to DB as `introduced`
6. Separate Claude call for pragmatic analysis → register accuracy, circumlocution, L1 fallbacks, silence events
7. Pragmatic profile updated via exponential moving average (alpha=0.3)
8. Full learner profile recalculated (computed level, ceilings, streak)

### Three-Layer Knowledge Model

**Layer 1 — Item-level knowledge:** Each vocabulary and grammar item has a mastery state, dual FSRS states (recognition/production), accumulated production weight, context breadth, and per-modality exposure counts. Mastery promotion is gated by evidence:

| Transition | Gate |
|---|---|
| apprentice_4 → journeyman | Production weight >= 1.0 |
| journeyman → expert | Context count >= 3 |
| expert → master | Novel context count >= 2 (grammar) |

**Layer 2 — Aggregate competence:** The profile calculator computes CEFR-level ceilings from item-level data. Comprehension ceiling = highest level where avg recognition retrievability > 0.80. Production ceiling = highest where avg production retrievability > 0.60. The curriculum generator uses these to identify the frontier level and recommend i+1 items.

**Layer 3 — Pragmatic competence:** Register accuracy (casual/polite), communication strategies (circumlocution, L1 fallback, silence), and avoided patterns. Updated after each conversation session via exponential moving average.

### Project Structure

```
linguist/
├── core/                        # Pure business logic (no Electron/React/Prisma deps)
│   ├── fsrs/                    # FSRS scheduler wrapper (ts-fsrs)
│   ├── mastery/                 # Mastery state machine (evidence-gated transitions)
│   ├── tom/                     # Theory of Mind engine (5 detectors + expanded brief)
│   ├── conversation/            # Prompt construction for planning, conversation, analysis
│   ├── profile/                 # Profile calculator (CEFR ceilings, skill levels, streaks)
│   ├── curriculum/              # Knowledge bubble + i+1 recommender
│   │   └── data/                # Static CEFR reference corpus (japanese-reference.json)
│   ├── pragmatics/              # Pragmatic competence analysis (register, strategies)
│   ├── narrative/               # AI-generated daily brief templates
│   └── logger.ts                # Structured logger for core layer
├── electron/                    # Electron main process
│   ├── main.ts                  # App entry, window management, IPC handler registration
│   ├── preload.ts               # Context bridge (exposes IPC as window.linguist)
│   ├── db.ts                    # Prisma client singleton
│   ├── logger.ts                # Structured logger for electron layer
│   └── ipc/                     # IPC handlers (one file per domain, 12 files)
│       ├── reviews.ts           # Review queue, submit, summary + FSRS + mastery transitions
│       ├── conversation.ts      # Full conversation pipeline (plan → chat → analysis → pragmatics)
│       ├── wordbank.ts          # Word bank CRUD + search
│       ├── chat.ts              # Streaming general-purpose chat with Claude
│       ├── tom.ts               # 5-detector ToM analysis + inference storage
│       ├── profile.ts           # Profile CRUD + recalculation
│       ├── curriculum.ts        # Knowledge bubble + recommendations + introduce/skip
│       ├── pragmatics.ts        # Pragmatic state get/update
│       ├── context-log.ts       # Context log list/add
│       ├── dashboard.ts         # Frontier data + mastery distribution
│       └── narrative.ts         # AI-polished daily brief
├── src/                         # React renderer
│   ├── app.tsx                  # Root component with routing
│   ├── components/              # Shared UI (app shell, sidebar, user menu, message bubbles)
│   ├── pages/                   # 7 page modules:
│   │   ├── dashboard/           #   Due count, stats, AI daily brief, frontier visualizations
│   │   ├── review/              #   Full SRS session (recognition + production cards, keyboard shortcuts)
│   │   ├── learn/               #   Conversation partner (session preview → chat → summary)
│   │   ├── knowledge/           #   Searchable vocabulary table with mastery badges
│   │   ├── chat/                #   Multi-conversation streaming chatbot
│   │   ├── settings/            #   Language, daily limits, target retention, progress stats
│   │   └── insights/            #   ToM inferences display
│   └── hooks/                   # IPC data hooks (use-review, use-conversation, etc.)
├── shared/
│   └── types.ts                 # TypeScript types shared across all layers (33 IPC channels)
├── prisma/
│   ├── schema.prisma            # Database schema (10 models)
│   ├── seed.ts                  # Database seed script (30 vocab + 8 grammar + profiles)
│   └── migrations/              # 3 migrations
├── supabase/                    # Local Supabase config
└── markdown/                    # Documentation
    ├── progress/                #   Session-by-session development logs
    ├── specs/                   #   Architecture specifications
    └── plans/                   #   Future design documents
```

**Boundary rules:**
- `core/` is pure TypeScript — trivially testable, no framework deps
- `electron/ipc/` is the only layer that touches Prisma and calls `core/`
- `src/` (renderer) accesses data only through `window.linguist` IPC hooks
- `shared/types.ts` is the one file importable everywhere

### Database Models

| Model | Purpose |
|---|---|
| `LearnerProfile` | Computed CEFR level, comprehension/production ceilings, modality levels, streaks, pattern summaries |
| `LexicalItem` | Vocabulary with dual FSRS states, mastery state, context breadth, modality counters, production weight |
| `GrammarItem` | Grammar patterns with FSRS states, prerequisites, novel context tracking |
| `ReviewEvent` | Every SRS review graded with production weight and context type |
| `ConversationSession` | Transcript, session plan, planned targets, hits, errors, avoidance events |
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
| **Chat** | Working | Multi-conversation streaming chatbot with Claude, abort support, conversation history |
| **Settings** | Working | Target/native language selectors, daily new item limit (5-30), target retention (80-97%), read-only progress stats |
| **Insights** | Stub | Placeholder for ToM inference visualization |

## Environment Variables

```
ANTHROPIC_API_KEY=sk-ant-...    # Required for conversation, analysis, and daily brief
DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres
```

## Logging

Structured logging is implemented across the entire backend (24 files). Every IPC handler logs on entry and exit, API calls log model + elapsed time, mastery transitions log from/to state, and errors are logged with context before re-throwing.

Format: `[2026-02-19T10:30:45.123Z] [INFO] [ipc:conversation] Session plan created {"sessionId":"abc","targets":5}`

Namespaces: `app`, `db`, `ipc:conversation`, `ipc:reviews`, `ipc:tom`, `ipc:curriculum`, `ipc:wordbank`, `ipc:profile`, `ipc:pragmatics`, `ipc:context-log`, `ipc:dashboard`, `ipc:narrative`, `ipc:chat`, `core:fsrs`, `core:mastery`, `core:planner`, `core:analyzer`, `core:tom`, `core:bubble`, `core:recommender`, `core:profile`, `core:pragmatics`

## Progress

See [markdown/progress/](markdown/progress/) for detailed session-by-session development logs.

## Known Issues

- Learn page shows item IDs in session summary rather than surface forms (analysis returns IDs, needs lookup)
- No onboarding/placement flow — new users land on dashboard with seeded data
- Word bank detail view (editing, history) not built
- No error boundary or toast notifications for API failures — errors go to console only
- Session planning occasionally slow (Claude API latency) with no progress indicator beyond loading state
- Chat page is disconnected from the knowledge model — no profile-aware system prompt, no post-session analysis
