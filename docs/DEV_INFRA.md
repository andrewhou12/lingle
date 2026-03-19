# Dev Infrastructure

Quick reference for testing Lingle subsystems without going through the full auth -> onboarding -> session flow.

---

## Dev Auth Bypass

Set `DEV_USER_ID` in `apps/web/.env.local` to skip Supabase auth on all API routes:

```env
DEV_USER_ID=2b14a270-ed2a-41a2-bd8a-f4431f4d98d7
```

- `withAuth()` checks this before hitting Supabase — all authenticated routes use the dev user
- Throws an error if set in production (safety check)
- Remove or comment out to test real auth flow

**Implementation:** `apps/web/lib/api-helpers.ts` (`getDevUserId()`)

---

## Dev API Routes

All routes are wrapped in `devOnly()` — they return 404 in production.

### GET `/api/dev/session-state?sessionId=xxx`

Reads live session state from Redis for an active voice session. Useful for inspecting what the agent has logged (errors, corrections, phase, difficulty) mid-session.

**File:** `apps/web/app/api/dev/session-state/route.ts`

### POST `/api/dev/test-plan`

Runs the full curriculum planning pipeline and returns the plan + agentMetadata. Accepts optional CEFR overrides:

```bash
# Default (uses real user profile)
curl -s -X POST localhost:3000/api/dev/test-plan | jq

# Override CEFR scores
curl -s -X POST localhost:3000/api/dev/test-plan \
  -H 'Content-Type: application/json' \
  -d '{"cefrGrammar": 1.0, "cefrFluency": 1.0}'
```

**File:** `apps/web/app/api/dev/test-plan/route.ts`

### POST `/api/dev/test-post-session`

Runs the full post-session pipeline (CEFR scoring, error patterns, memory extraction) with synthetic fixture data. Creates a real lesson record in the DB.

```bash
# Fixtures: beginner, intermediate, advanced
curl -s -X POST localhost:3000/api/dev/test-post-session \
  -H 'Content-Type: application/json' \
  -d '{"fixture": "beginner"}' | jq
```

Returns: CEFR deltas, error counts, corrections doc, memories queued, full session state.

**File:** `apps/web/app/api/dev/test-post-session/route.ts`

---

## Session State Fixtures

Three synthetic `SessionState` objects for testing the post-session pipeline without a real voice session:

| Fixture | Errors | Corrections | Memories | Minutes |
|---|---|---|---|---|
| `beginner` | 5 | 3 | 2 | 12 |
| `intermediate` | 3 | 2 | 1 | 15 |
| `advanced` | 1 | 1 | 0 | 20 |

**File:** `apps/web/lib/dev-fixtures.ts`

---

## Dev Tools Panel

A collapsible panel on the voice test page (`/conversation/voice/test`). Click the **DEV** button in the top-right corner.

### Tabs

- **Session** — Connection info (session ID, voice state, duration, turn count) + quick actions (test post-session with fixtures, fetch session state, copy metadata JSON)
- **Redis State** — Live session state from Redis, auto-polls every 5s. Shows lesson phase, difficulty, errors logged, corrections queued, raw JSON.
- **Transcript** — Raw transcript with role labels, timestamps, and partial indicators.

**File:** `apps/web/components/voice/dev-tools-panel.tsx`

---

## Agent Prompt Inspector

CLI script that takes AgentMetadata JSON and prints the full 6-slot system prompt with a token estimate.

```bash
# Pipe from test-plan
curl -s -X POST localhost:3000/api/dev/test-plan | npx tsx scripts/inspect-agent-prompt.ts

# From a JSON file
npx tsx scripts/inspect-agent-prompt.ts metadata.json
```

**File:** `scripts/inspect-agent-prompt.ts`

---

## Quick Testing Recipes

### Test the curriculum planner

```bash
curl -s -X POST localhost:3000/api/dev/test-plan | jq '.plan'
```

### Test post-session scoring for a beginner

```bash
curl -s -X POST localhost:3000/api/dev/test-post-session \
  -H 'Content-Type: application/json' \
  -d '{"fixture":"beginner"}' | jq '{cefrDelta, errorsCount, correctionsCount}'
```

### Inspect what prompt the agent would get

```bash
curl -s -X POST localhost:3000/api/dev/test-plan | npx tsx scripts/inspect-agent-prompt.ts
```

### Check Redis state during a live session

```bash
curl -s 'localhost:3000/api/dev/session-state?sessionId=YOUR_SESSION_ID' | jq
```

### Voice test with dev panel

Navigate to `localhost:3000/conversation/voice/test`, click **DEV** in top-right.
