# Lingle — Claude Code Instructions

## What This Is

Lingle is a **voice-first AI language tutor**. Real-time voice conversations over LiveKit with an intelligent tutor that tracks errors, adapts difficulty, and builds a personalized learner model over time. Think Preply/iTalki, but the tutor is an AI that remembers everything.

**Target stack:** Turborepo monorepo — Next.js 15 + React 19 + LiveKit Agents SDK (Node.js) + Supabase + Prisma + Redis

---

## Architecture

### Core Principle
The **learner model** is the product. Every session reads from it (CEFR scores, error patterns, memories) and writes back to it (updated scores, new errors, new memories). The voice agent's session plans are generated from this model.

### App Stack
- **Monorepo:** Turborepo + pnpm workspaces
- **Web app:** Next.js 15 (App Router) + React 19 + TypeScript + Tailwind CSS
- **Voice agent:** LiveKit Agents SDK (Node.js) — runs as a separate deployed process
- **LLM:** Claude (Anthropic) — Haiku for the voice tutor (latency-critical), Sonnet for planning/analysis
- **STT:** Soniox (realtime streaming, multilingual) / Deepgram (fallback)
- **TTS:** Cartesia Sonic 3 (low-latency, multilingual) / Rime (English)
- **Turn detection:** LiveKit MultilingualModel (context-aware end-of-turn, supports Japanese/Korean/Chinese/etc.)
- **Interruption handling:** Adaptive mode (ML-based, distinguishes real interruptions from backchanneling)
- **VAD:** Silero
- **Auth:** Supabase Auth (Google OAuth)
- **DB:** Supabase Postgres + Prisma ORM
- **Session state:** Redis (live error/correction tracking during voice sessions)
- **Payment:** Stripe

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
│           ├── index.ts              Agent worker entry — VAD, turn detector, session setup
│           ├── lingle-agent.ts       LingleAgent class + 6-slot system prompt builder
│           ├── tools.ts              Agent tools (error tracking, lesson mgmt, onboarding)
│           ├── session-state.ts      Redis session state read/write
│           ├── config.ts             AgentMetadata, voice provider config
│           ├── whiteboard-tools.ts   Whiteboard DataChannel tools
│           ├── soniox-stt.ts         Custom Soniox STT integration
│           ├── cartesia-tts.ts       Cartesia TTS with persistent WebSocket
│           ├── rime-tts.ts           Rime TTS integration
│           └── claude-llm.ts         Claude LLM adapter for LiveKit agents framework
├── packages/
│   ├── shared/                       TypeScript types (@lingle/shared)
│   └── db/                           Prisma client singleton (@lingle/db)
├── prisma/
│   ├── schema.prisma                 11 models
│   └── migrations/
└── docs/
    ├── DEV_INFRA.md                  Dev testing infrastructure guide
    └── design-system.md
```

### Key Structural Rules
- `apps/agent/src/` has zero dependency on Next.js or React. Pure Node.js + LiveKit SDK.
- All DB access goes through Prisma in `apps/web/`. The agent never touches the DB directly — it reads metadata from LiveKit job dispatch and writes to Redis.
- `packages/shared/` is importable everywhere — TypeScript interfaces only, no logic.
- Frontend data access goes through Next.js API routes. No direct Prisma imports in React components.

---

## Voice Pipeline

```
User speaks into microphone
    ↓ WebRTC audio
Silero VAD (voice activity detection)
    ↓ speech segments
Turn Detector (MultilingualModel — context-aware end-of-turn)
    ↓ turn committed
Soniox/Deepgram STT → transcript text
    ↓
Claude Haiku LLM → response text
    ├── Silent tool calls (logError, noteStrength, etc.) → Redis
    └── Whiteboard content → DataChannel
    ↓
Cartesia/Rime TTS → audio
    ↓ WebRTC audio
User hears response
```

### Adaptive Interruption Handling
The agent uses LiveKit's adaptive interruption mode (ML-based) to distinguish genuine interruptions from backchanneling (e.g., "うん", "はい", "uh-huh"). This prevents the tutor from stopping mid-sentence when the learner is just acknowledging.

### Latency Tracking
Every turn logs a detailed breakdown: EOU delay (VAD + turn detector + endpointing), transcription delay, LLM TTFT, TTS TTFB, and wall-clock E2E. Check agent logs for `[latency]` lines.

---

## Session Flow

```
User clicks "Start session"
    ↓
POST /api/conversation/plan
    ├── Load learner model (CEFR scores, weak areas)
    ├── Load error patterns (longitudinal)
    ├── Run curriculum queries (vocab targets, grammar focus, topic rotation, memories)
    └── Return plan + session ID + agentMetadata
    ↓
GET /api/voice/livekit-token → join LiveKit room
POST /api/voice/start-agent → dispatch agent with metadata
    ↓
Voice session (WebRTC via LiveKit)
    ├── Agent builds 6-slot system prompt from metadata
    ├── Each turn: inject Redis session state into system prompt
    ├── Tools fire silently (return empty string, no speech narration)
    ├── Context compressed after 20+ turns (summarize via Haiku)
    └── Whiteboard content sent via DataChannel
    ↓
POST /api/conversation/end
    ├── Read final session state from Redis
    ├── Update CEFR scores (grammar + fluency deltas)
    ├── Update longitudinal error patterns
    ├── Generate corrections document
    ├── Extract and persist memories
    └── Return post-session summary
```

---

## Agent System Prompt (6-Slot Architecture)

| Slot | Content | Source |
|---|---|---|
| 1 | Persona, behavioral rules, tool instructions, voice mode rules | Static in `lingle-agent.ts` |
| 2 | Learner profile: CEFR scores, weak areas, error patterns, personal notes | `agentMetadata` from dispatch |
| 3 | Session state: lesson phase, errors logged, difficulty level | Redis (injected per-turn) |
| 4 | Episodic memories: personal facts from past sessions | `agentMetadata` from dispatch |
| 5 | Conversation window | Managed by context compression |
| 6 | Current utterance | Handled by LiveKit framework |

---

## Agent Tools

All tools write to Redis and return empty strings so the LLM never narrates tool calls.

**Silent tracking:** `logError`, `noteStrength`, `saveMemory`, `queueCorrection`
**Lesson management:** `adjustDifficulty`, `updateLessonPhase`, `setVocabHomework`, `endLesson`
**Whiteboard:** `whiteboardOpen`, `whiteboardClose`, `whiteboardWriteCorrection`, `whiteboardShowVocabCluster`, `whiteboardShowTable`
**Onboarding-only:** `setGoal`, `calibrateLevel`, `setPreference`

---

## Database Models (Prisma)

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

---

## Development

### Prerequisites
- Node.js 20+
- pnpm (`npm install -g pnpm`)
- LiveKit server (local or cloud)
- Redis

### Commands

| Command | Description |
|---|---|
| `pnpm install` | Install all dependencies |
| `pnpm --filter @lingle/web dev` | Start Next.js web app (localhost:3000) |
| `pnpm --filter @lingle/agent dev` | Start LiveKit voice agent (dev mode) |
| `pnpm turbo typecheck` | TypeScript check (all packages) |
| `pnpm prisma generate` | Generate Prisma client |
| `pnpm prisma migrate dev` | Run Prisma migrations |

### Environment Variables

See `.env.example` for all required variables. Key ones:
- `ANTHROPIC_API_KEY` — Claude API access
- `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` — LiveKit connection
- `REDIS_URL` — Session state storage
- `SONIOX_API_KEY` — STT provider
- `CARTESIA_API_KEY`, `CARTESIA_VOICE_JA` — TTS provider + voice IDs
- `DATABASE_URL` — Supabase Postgres connection

### LiveKit Docs MCP
A LiveKit MCP server is configured for Claude Code access to up-to-date LiveKit documentation. LiveKit APIs change frequently — always check docs before relying on training data for LiveKit-specific APIs.

---

## Coding Conventions

- **No markdown in agent speech.** The agent's spoken output must be plain text — no bullets, headers, code blocks, or emojis. This is enforced in the system prompt.
- **Tools return empty strings.** All agent tools return `''` so the LLM doesn't narrate tool usage.
- **Redis for live state, Postgres for persistent state.** During a voice session, all state mutations go to Redis. Post-session pipeline reads Redis and writes to Postgres.
- **Context compression.** After 20+ turns, older messages are summarized via Haiku and replaced in the chat context.
- **Latency is critical.** The voice pipeline targets < 1s user-silent-to-agent-speaking. Every pipeline stage streams. Don't add blocking operations to the hot path.
