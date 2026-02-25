# Web App Migration: Electron → Next.js

## Overview

Migrating Linguist from Electron to a Next.js web app is straightforward because the architecture was designed with a clean separation: `core/` has zero Electron dependencies, all data access goes through IPC handlers, and the renderer never touches Prisma directly. The migration is mostly plumbing — swapping IPC wiring for HTTP wiring.

---

## What Doesn't Change At All

### `core/` — 100% Portable
Every file in `core/` is pure TypeScript with no Electron, Prisma, or React imports. This includes:
- `core/fsrs/` — FSRS scheduling algorithm
- `core/mastery/` — state machine logic
- `core/tom/` — theory of mind analysis
- `core/conversation/` — session planning, post-session analysis
- `core/pragmatics/` — register/politeness tracking
- `core/profile/` — learner profile recalculation
- `core/curriculum/` — knowledge bubble, recommendations
- `core/narrative/` — brief generation

Moves as-is. No changes needed.

### `shared/types.ts` — 100% Portable
Just TypeScript interfaces and enums. No logic, no dependencies.

### `prisma/` — 100% Portable
Prisma works identically in Next.js API routes. Same schema, same client, same queries.

### `electron/db.ts` — Portable
Just a Prisma singleton. No Electron APIs. Move to `lib/db.ts` in the Next.js project.

### `electron/logger.ts` and `core/logger.ts` — Portable
Pure TypeScript console wrappers. No Electron APIs.

---

## What Needs Conversion

### 1. IPC Handlers → API Routes (~33 handlers)

Every file in `electron/ipc/` wraps its logic in `ipcMain.handle()`. The actual handler bodies are async functions that call Prisma + `core/` functions. Strip the IPC wrapper and put the same function body in a Next.js API route.

**Before (Electron):**
```typescript
ipcMain.handle('review:get-queue', async () => {
  const db = getDb()
  const items = await db.lexicalItem.findMany({ ... })
  return computeReviewQueue(items)
})
```

**After (Next.js):**
```typescript
// app/api/review/get-queue/route.ts
export async function POST(req: Request) {
  const { userId } = await getSession(req)  // auth
  const db = getDb()
  const items = await db.lexicalItem.findMany({ where: { userId }, ... })
  return Response.json(computeReviewQueue(items))
}
```

The core logic is identical — just different wiring.

**Full route mapping:**

| Electron IPC Channel | Next.js API Route | Method |
|---|---|---|
| `review:get-queue` | `/api/review/get-queue` | POST |
| `review:submit` | `/api/review/submit` | POST |
| `review:get-summary` | `/api/review/summary` | GET |
| `wordbank:list` | `/api/wordbank` | GET |
| `wordbank:get` | `/api/wordbank/[id]` | GET |
| `wordbank:add` | `/api/wordbank` | POST |
| `wordbank:update` | `/api/wordbank/[id]` | PATCH |
| `wordbank:search` | `/api/wordbank/search` | GET |
| `conversation:plan` | `/api/conversation/plan` | POST |
| `conversation:send` | `/api/conversation/[sessionId]/message` | POST |
| `conversation:end` | `/api/conversation/[sessionId]/end` | POST |
| `conversation:list` | `/api/conversation` | GET |
| `tom:run-analysis` | `/api/tom/analyze` | POST |
| `tom:get-brief` | `/api/tom/brief` | GET |
| `tom:get-inferences` | `/api/tom/inferences` | GET |
| `profile:get` | `/api/profile` | GET |
| `profile:update` | `/api/profile` | PATCH |
| `profile:recalculate` | `/api/profile/recalculate` | POST |
| `curriculum:get-bubble` | `/api/curriculum/bubble` | GET |
| `curriculum:get-recommendations` | `/api/curriculum/recommendations` | GET |
| `curriculum:introduce-item` | `/api/curriculum/introduce` | POST |
| `curriculum:skip-item` | `/api/curriculum/skip` | POST |
| `curriculum:regenerate` | `/api/curriculum/regenerate` | POST |
| `pragmatic:get-state` | `/api/pragmatic` | GET |
| `pragmatic:update` | `/api/pragmatic` | PATCH |
| `context-log:list` | `/api/context-log` | GET |
| `context-log:add` | `/api/context-log` | POST |
| `dashboard:get-frontier` | `/api/dashboard/frontier` | GET |
| `dashboard:get-weekly-stats` | `/api/dashboard/weekly-stats` | GET |
| `narrative:build-draft` | `/api/narrative/draft` | POST |
| `narrative:polish` | `/api/narrative/polish` | POST |
| `chat:send` | `/api/chat/send` | POST (streaming) |
| `chat:stop` | `/api/chat/stop` | POST |

### 2. Renderer Hooks (~6 files)

All data access goes through `window.linguist.*` calls defined in `preload.ts`. Replace with `fetch()` calls or TanStack Query:

**Before:**
```typescript
const queue = await window.linguist.reviewGetQueue()
```

**After:**
```typescript
const queue = await fetch('/api/review/get-queue', { method: 'POST' }).then(r => r.json())
```

Or with TanStack Query for caching/loading states:
```typescript
const { data: queue } = useQuery({ queryKey: ['reviewQueue'], queryFn: () => fetch(...) })
```

Files to update:
- `hooks/use-review.ts`
- `hooks/use-conversation.ts`
- `hooks/use-wordbank.ts`
- `hooks/use-frontier.ts`
- Various `pages/**/*.tsx` files that call `profileGet()`, `profileUpdate()`, etc.

### 3. Chat Streaming

Currently uses Electron IPC events (`event.sender.send('chat:chunk')` → `ipcRenderer.on('chat:chunk')`). In Next.js, use Server-Sent Events or `ReadableStream`:

**Next.js API route:**
```typescript
export async function POST(req: Request) {
  const { messages } = await req.json()
  const stream = await streamText({ model, messages })
  return stream.toDataStreamResponse()
}
```

**Client:**
```typescript
const response = await fetch('/api/chat/send', { method: 'POST', body: JSON.stringify({ messages }) })
const reader = response.body.getReader()
// read chunks as they arrive
```

This is actually cleaner than the IPC approach.

### 4. Routing

Current: `HashRouter` (required for Electron, uses `/#/review` style URLs).
Next.js: File-based routing. Move each `src/pages/*/index.tsx` to `app/*/page.tsx`.

---

## What Gets Deleted

| File | Reason |
|---|---|
| `electron/main.ts` | App lifecycle, window creation — irrelevant for web |
| `electron/preload.ts` | IPC bridge — replaced by HTTP |
| `src/env.d.ts` | `window.linguist` type declarations — no longer needed |
| `electron.vite.config.ts` | Replaced by `next.config.js` |

**Dependencies to drop:** `electron`, `electron-vite`, `@electron-toolkit/preload`, `@electron-toolkit/utils`

**Dependencies to add:** `next`, optionally `@tanstack/react-query`

**Keep:** Prisma, Anthropic SDK, @radix-ui, Tailwind, React, TypeScript, ts-fsrs

---

## Database Changes

### The Big Shift: Multi-Tenancy

The current database assumes a single user. Every table implicitly belongs to "the one user." For a web app with multiple users, this needs to change.

**Singleton rows that break:**
- `LearnerProfile` — hardcoded `@id @default(1)`, every query does `findUnique({ where: { id: 1 } })`
- `PragmaticProfile` — same pattern, hardcoded to id=1

**No user scoping:** `LexicalItem`, `GrammarItem`, `ReviewEvent`, `ConversationSession`, `TomInference`, `ItemContextLog`, `CurriculumItem` — none have a `userId` field.

### What to Add

**1. User model:**
```prisma
model User {
  id        String   @id @default(uuid())
  email     String   @unique
  createdAt DateTime @default(now())
}
```

**2. `userId` on every existing table:**

Every model gets:
```prisma
userId String
user   User   @relation(fields: [userId], references: [id])
@@index([userId])
```

The singletons change from hardcoded id=1 to a one-to-one relation with User:
```prisma
model LearnerProfile {
  id     Int    @id @default(autoincrement())  // no longer hardcoded to 1
  userId String @unique
  user   User   @relation(fields: [userId], references: [id])
  // ... rest stays the same
}
```

**3. Every query gets scoped:**

```typescript
// Before
const items = await db.lexicalItem.findMany()

// After
const items = await db.lexicalItem.findMany({ where: { userId } })
```

~80-100 Prisma calls across 13 handler files need the `userId` filter. Mechanical but can't miss any — missing one leaks data between users. A helper function prevents mistakes:

```typescript
function scopedDb(userId: string) {
  return {
    lexicalItem: {
      findMany: (args) => db.lexicalItem.findMany({ ...args, where: { ...args?.where, userId } }),
      // ... etc
    }
  }
}
```

### Schema Shape Doesn't Change

The table structures, relationships, field types, JSON column formats (FSRS state, session plans, transcripts) — all stay identical. Multi-tenancy is just adding a `userId` column and filtering by it.

---

## Infrastructure: Supabase & Docker

### Supabase

**Current usage:** Supabase CLI runs a local Postgres instance via Docker. No Supabase client library, no Supabase Auth, no Realtime, no Row Level Security. It's just a convenient Postgres launcher. Prisma connects directly to the Postgres connection string.

**For web app — three options:**

| Option | What it means | When to use |
|---|---|---|
| **A: Supabase as hosted Postgres** | Use Supabase Cloud for the database only. Keep Prisma for all queries. Get the dashboard, backups, and connection pooling for free. | Simplest path. Good default. |
| **B: Use Supabase features** | Adopt Supabase Auth for login/signup/OAuth. Enable Row Level Security for database-level multi-tenancy guarantees. Optionally use Supabase Realtime for live updates. | If you want auth handled for you and the strongest data isolation. |
| **C: Drop Supabase** | Use Neon/Railway/Vercel Postgres for the database + NextAuth/Clerk for auth. | If you don't want the Supabase ecosystem. |

**Recommendation:** Option A or B. Supabase Cloud free tier gives you hosted Postgres + Auth + dashboard for $0. You're already familiar with it from local development. Whether to adopt Supabase Auth (vs NextAuth, Clerk) is a separate decision — all work fine with Next.js.

### Docker

**Current usage:** Docker only runs because Supabase CLI uses it under the hood to spin up local Postgres, GoTrue, and Studio. You never interact with Docker directly.

**For web app:** Almost certainly not needed.

| Scenario | Docker? |
|---|---|
| Deploy to Vercel / Netlify | No |
| Supabase Cloud for Postgres | No |
| Neon / Railway for Postgres | No |
| Self-host on a VPS | Optional |
| Local development | Only if you want local Postgres via `npx supabase start` (same as today). Otherwise point `.env` at a cloud dev database and skip Docker entirely. |

**Simplest production setup (zero Docker):**
- Next.js on Vercel (free tier, auto-deploys from git)
- Postgres on Supabase Cloud (free tier, 500MB)
- Auth via Supabase Auth or NextAuth
- `DATABASE_URL` in Vercel environment variables

For local development, either keep `npx supabase start` (Docker under the hood, same as today) or point `.env` at a Supabase Cloud dev project and skip Docker entirely.

---

## Gotchas

### In-Memory State
`electron/ipc/conversation.ts` holds an `activeSessions` Map in memory for conversation state. This works in Electron (single process, single user) but breaks with multiple server instances. Keep as-is for single-server deployment, or move session state to the database/Redis if scaling.

### Query Latency
Currently all Prisma queries hit localhost (~0ms). Cloud Postgres adds 5-50ms per query. The review submission flow makes 3-4 queries per card — noticeable but not blocking. Can batch or optimize later if needed.

### API Key Security
The `ANTHROPIC_API_KEY` currently lives in the Electron main process (trusted). In a web app, it lives in server-side API routes (also trusted — never exposed to the client). No issue, but make sure API routes are server-only and the key never leaks to the browser.

---

## Effort Estimate

| Category | Work | Estimate |
|---|---|---|
| Drop Electron infrastructure | Delete main.ts, preload.ts, build config | 2-4 hours |
| IPC → API routes (33 handlers) | Mechanical conversion, same logic | 6-10 hours |
| Add userId scoping to all queries | Add userId filter to ~80-100 Prisma calls | 4-6 hours |
| Update React hooks | Replace `window.linguist.*` with fetch | 2-3 hours |
| Next.js setup | next.config, API route structure, routing | 1-2 hours |
| Auth integration | Supabase Auth or NextAuth setup | 3-5 hours |
| Chat streaming conversion | IPC events → ReadableStream/SSE | 2-3 hours |
| Testing & debugging | Integration testing, auth flows | 4-6 hours |
| **Total** | | **~25-40 hours** |

The auth + multi-tenancy work adds ~7-11 hours on top of the pure Electron→Next.js conversion.
