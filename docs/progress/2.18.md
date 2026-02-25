# Linguist V1 — Progress Log

## Session 1: Full Project Scaffold (2026-02-18)

### What Was Done

Scaffolded the entire Linguist V1 project from an empty directory. All 8 phases of the scaffold plan were completed.

#### Phase 1: Project Initialization
- Created `package.json` (single package, not monorepo)
- Created `.gitignore`, `.env`, `.env.example`
- Installed all dependencies:
  - **Production:** react, react-dom, react-router, @radix-ui/themes, @anthropic-ai/sdk, @prisma/client, ts-fsrs, @electron-toolkit/utils, @electron-toolkit/preload
  - **Dev:** electron, electron-vite, vite, @vitejs/plugin-react, typescript, @types/react, @types/react-dom, prisma, dotenv

#### Phase 2: TypeScript & Vite Configuration
- Created `tsconfig.json` (project references root)
- Created `tsconfig.node.json` (main/preload/core — targets ES2022, bundler module resolution, `@shared` and `@core` path aliases)
- Created `tsconfig.web.json` (renderer — adds JSX support, `@shared` alias only)
- Created `electron.vite.config.ts` with `externalizeDepsPlugin()` for Prisma compatibility, explicit entry points via `build.lib.entry`
- Created `src/index.html` with CSP headers

#### Phase 3: Database Setup
- Ran `npx supabase init` to create `supabase/` directory
- Supabase start was skipped — Docker Desktop was not running. Can be done later.
- Created `prisma/schema.prisma` with all 6 models: LearnerProfile, LexicalItem, GrammarItem, ReviewEvent, ConversationSession, TomInference
- Ran `npx prisma generate` to generate the Prisma client
- Migration (`prisma migrate dev`) deferred until Supabase is running
- Created `electron/db.ts` — Prisma client singleton (`getDb()` / `disconnectDb()`)

#### Phase 4: Shared Types
- Created `shared/types.ts` containing:
  - `MasteryState` enum (unseen → burned, 10 states)
  - `ReviewGrade`, `ReviewModality`, `ItemType` type aliases
  - `FsrsState` interface (serialized FSRS card state)
  - `IPC_CHANNELS` const object (14 channels across 4 domains)
  - All IPC payload types: ReviewSubmission, ReviewQueueItem, ReviewSummary, WordBankEntry, WordBankFilters, ConversationMessage, SessionPlan, TomBrief, PostSessionAnalysis

#### Phase 5: Core Business Logic
All modules are pure TypeScript with zero Electron/React/Prisma dependencies.

- **`core/fsrs/scheduler.ts`** — Wraps `ts-fsrs`:
  - `createInitialFsrsState()` for new items
  - `scheduleReview(state, grade)` returns next FSRS state + interval
  - `computeReviewQueue(items)` filters/sorts by due date, returns ordered queue
  - Grade mapping: again→1, hard→2, good→3, easy→4

- **`core/mastery/state-machine.ts`** — Mastery transitions:
  - `computeNextMasteryState(context)` handles promotion (good/easy), hold (hard), and demotion (again)
  - Enforces the critical rule: no advancement past `apprentice_4` to `journeyman` without production evidence
  - Helper functions: `isApprentice()`, `isActive()`

- **`core/tom/analyzer.ts`** — Theory of Mind engine:
  - `detectAvoidance()` — flags journeyman items with 3+ sessions and 0 conversation production
  - `detectConfusionPairs()` — finds items that co-occur in errors across 2+ sessions
  - `detectRegression()` — flags expert/master items with recent again/hard grades
  - `generateDailyBrief()` — aggregates all detectors into a TomBrief

- **`core/conversation/planner.ts`** — Prompt construction:
  - `buildPlanningPrompt()` — generates the session planning prompt for Claude API
  - `buildConversationSystemPrompt()` — generates the conversation system prompt with learner profile and behavioral rules

- **`core/conversation/analyzer.ts`** — Post-session analysis:
  - `buildAnalysisPrompt()` — generates the transcript analysis prompt
  - `parseAnalysis()` — parses Claude's JSON response into typed PostSessionAnalysis

#### Phase 6: Electron Main Process
- **`electron/main.ts`** — App entry:
  - Creates BrowserWindow with security settings (contextIsolation, no nodeIntegration, sandbox)
  - Registers all 4 IPC handler groups on `app.whenReady()`
  - Loads Vite dev server in dev mode, built file in production
  - Disconnects Prisma on `will-quit`

- **`electron/preload.ts`** — Context bridge:
  - Auto-generates `window.linguist` API from `IPC_CHANNELS`
  - Each channel becomes a camelCase `ipcRenderer.invoke()` wrapper

- **`electron/ipc/reviews.ts`** — Full implementation:
  - `review:get-queue` — fetches all non-unseen items, computes queue via FSRS, caps at 200
  - `review:submit` — logs ReviewEvent, updates FSRS state, computes mastery transition, updates item
  - `review:get-summary` — returns today's review count and accuracy

- **`electron/ipc/wordbank.ts`** — Full implementation:
  - `wordbank:list` — filterable by mastery state, tag, due-only
  - `wordbank:get` — single item lookup
  - `wordbank:add` — creates item with initial FSRS state
  - `wordbank:update` — updates meaning, tags, or mastery state
  - `wordbank:search` — case-insensitive search across surface form, reading, meaning

- **`electron/ipc/conversation.ts`** — Stub implementation:
  - `conversation:plan` — returns stub SessionPlan (TODO: Claude API integration)
  - `conversation:send` — returns stub response (TODO: Claude API integration)
  - `conversation:end` — updates session duration
  - `conversation:list` — returns recent sessions

- **`electron/ipc/tom.ts`** — Full implementation:
  - `tom:run-analysis` — gathers item histories and errors, runs all detectors, stores inferences in DB
  - `tom:get-brief` — generates and returns the daily TomBrief
  - `tom:get-inferences` — returns all unresolved inferences

#### Phase 7: React Renderer
- **`src/main.tsx`** — Entry point with React.StrictMode and Radix Theme
- **`src/env.d.ts`** — Full type declarations for `window.linguist` API
- **`src/app.tsx`** — HashRouter with routes to all 5 pages, wrapped in Radix Theme (dark mode, blue accent)
- **`src/components/app-shell.tsx`** — Sidebar navigation with NavLink active states
- **Page stubs:**
  - `dashboard/index.tsx` — Shows due count, today's review stats, links to review and conversation
  - `review/index.tsx` — Shows queue count, loading state, empty state
  - `conversation/index.tsx` — Placeholder
  - `wordbank/index.tsx` — Shows item count, loading state
  - `insights/index.tsx` — Placeholder
- **Hooks:**
  - `use-review.ts` — Manages review queue, submit, summary via IPC
  - `use-wordbank.ts` — Manages item list, filters, add, search via IPC
  - `use-conversation.ts` — Manages session lifecycle, messages, plan via IPC

#### Phase 8: Verification
- TypeScript compiles cleanly on both `tsconfig.node.json` and `tsconfig.web.json`
- Production build succeeds: `npm run build` produces `out/main/`, `out/preload/`, `out/renderer/`
- `npm run dev` is ready to launch once Supabase is running

### Issues Encountered & Resolved
1. **Supabase start failed** — Docker Desktop not running. Deferred; everything else works without it.
2. **Prisma JSON type casts** — `Record<string, unknown>` not assignable to `Prisma.InputJsonValue`. Fixed by importing `Prisma` type and casting through it.
3. **electron-vite entry points** — Initial config missing explicit entry points, causing build failure. Fixed by adding `build.lib.entry` for main and preload, and `build.rollupOptions.input` for renderer.
4. **Output filename mismatch** — `package.json` referenced `out/main/index.js` but electron-vite outputs `out/main/main.js`. Fixed by updating `package.json`.
5. **Preload path mismatch** — `electron/main.ts` referenced `../preload/index.js` but output is `preload.js`. Fixed.

---

## Session 2: Supabase Setup & Migration (2026-02-19)

### What Was Done
- Started Docker Desktop
- Ran `npx supabase start` — pulled all Docker images and started local Supabase instance
- Ran `npx prisma migrate dev --name init` — applied initial migration, created all 6 tables
- Verified tables exist via `docker exec` psql query

### Local Supabase Services Running
| Service | URL |
|---|---|
| Studio (DB browser) | http://127.0.0.1:54323 |
| Postgres | postgresql://postgres:postgres@127.0.0.1:54322/postgres |
| REST API | http://127.0.0.1:54321/rest/v1 |
| GraphQL | http://127.0.0.1:54321/graphql/v1 |
| Edge Functions | http://127.0.0.1:54321/functions/v1 |
| Mailpit | http://127.0.0.1:54324 |

### Database Tables Created
- `LearnerProfile`
- `LexicalItem`
- `GrammarItem`
- `ReviewEvent`
- `ConversationSession`
- `TomInference`
- `_prisma_migrations` (Prisma internal)

### Migration File
- `prisma/migrations/20260220001444_init/migration.sql`

---

## Current Project State

### What's Working
- Full build pipeline (TypeScript → electron-vite → production bundles)
- Local Supabase running with all 6 tables migrated
- Prisma client generated and connected to local Postgres
- All core business logic implemented and type-safe
- IPC handlers wired (reviews and wordbank fully implemented, conversation stubbed)
- React renderer with routing, sidebar navigation, and data hooks
- `npm run dev` is ready to launch the app

### What's Not Yet Working
- **Conversation partner** — Claude API integration is stubbed in `electron/ipc/conversation.ts`
- **Review UI** — Page exists but the card review interface isn't built yet
- **Onboarding flow** — No placement test or initial setup UI
- **Word bank UI** — Page exists but detail views not implemented
- **Insights UI** — Page is a placeholder

### Next Steps (Priority Order)
1. Build the SRS review card UI (the daily anchor habit)
2. Integrate Claude API for conversation partner
3. Build onboarding/placement flow
4. Build word bank detail views
5. Build insights/ToM display page

### File Tree (35 source files)
```
linguist/
├── .env, .env.example, .gitignore
├── package.json
├── tsconfig.json, tsconfig.node.json, tsconfig.web.json
├── electron.vite.config.ts
├── prisma/
│   └── schema.prisma
├── supabase/
│   └── config.toml (generated by supabase init)
├── shared/
│   └── types.ts
├── core/
│   ├── fsrs/
│   │   ├── index.ts
│   │   └── scheduler.ts
│   ├── mastery/
│   │   ├── index.ts
│   │   └── state-machine.ts
│   ├── tom/
│   │   ├── index.ts
│   │   └── analyzer.ts
│   └── conversation/
│       ├── index.ts
│       ├── planner.ts
│       └── analyzer.ts
├── electron/
│   ├── main.ts
│   ├── preload.ts
│   ├── db.ts
│   └── ipc/
│       ├── reviews.ts
│       ├── wordbank.ts
│       ├── conversation.ts
│       └── tom.ts
└── src/
    ├── index.html
    ├── main.tsx
    ├── env.d.ts
    ├── app.tsx
    ├── components/
    │   └── app-shell.tsx
    ├── pages/
    │   ├── dashboard/index.tsx
    │   ├── review/index.tsx
    │   ├── conversation/index.tsx
    │   ├── wordbank/index.tsx
    │   └── insights/index.tsx
    └── hooks/
        ├── use-review.ts
        ├── use-wordbank.ts
        └── use-conversation.ts
```
