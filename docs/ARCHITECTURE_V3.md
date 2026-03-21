# Lingle Architecture — V3 (March 2026)

> Voice-first AI language tutor. Real-time voice conversations over LiveKit
> with an intelligent tutor that tracks errors, adapts difficulty, and builds
> a personalized learner model over time.

---

## High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  BROWSER (React 19 + Next.js 15)                                                │
│                                                                                  │
│  ┌─────────────────────────┐  ┌──────────────────────────────────────────────┐   │
│  │  Session View            │  │  Whiteboard (auto-populated from Redis)      │   │
│  │  ┌───────────────────┐   │  │                                              │   │
│  │  │  VoiceAuraOrb     │   │  │  New Material: 会議, 締め切り                 │   │
│  │  │  (audio viz)      │   │  │  Corrections:  食べって → 食べて              │   │
│  │  └───────────────────┘   │  │                                              │   │
│  │  ┌───────────────────┐   │  │  Slides: pre-generated per phase             │   │
│  │  │  Subtitles        │   │  │  (warmup / review / core / debrief / close)  │   │
│  │  │  (live STT)       │   │  │                                              │   │
│  │  └───────────────────┘   │  └──────────────────────────────────────────────┘   │
│  │  ┌───────────────────┐   │                                                    │
│  │  │  ControlBar       │   │  State machine: planning → active → ending →       │
│  │  │  (mute/end/etc)   │   │                  summary → error                   │
│  │  └───────────────────┘   │                                                    │
│  └─────────────────────────┘                                                     │
│                                                                                  │
│  LiveKit Bridge:  @livekit/components-react → WebRTC audio                       │
│  Hooks:           useLiveKitVoice, useOnboarding, useLanguage                    │
└────────────┬───────────────────────────────┬─────────────────────────────────────┘
             │  HTTP (plan/end)               │  WebRTC (audio via LiveKit Cloud)
┌────────────┴────────────────────┐  ┌───────┴──────────────────────────────────┐
│  WEB SERVER (Next.js API Routes) │  │  AGENT WORKER (LiveKit Agents, Node.js)  │
│                                  │  │                                          │
│  /api/conversation/plan          │  │  index.ts       Agent entry point        │
│    → 1 Haiku LLM call (topic)   │  │  lingle-agent   6-slot system prompt     │
│    → Build LessonPlan            │  │  tools.ts       4 tools (flagError,      │
│    → Init Redis session state    │  │                  writeWhiteboard,         │
│    → Create Lesson record        │  │                  updateLessonPhase,       │
│                                  │  │                  endLesson)              │
│                                  │  │  session-state  Redis read/write         │
│  /api/conversation/end           │  │  claude-llm     Anthropic SDK adapter    │
│    → Read final Redis state      │  │  cartesia-tts   Persistent WS TTS       │
│    → 5-step post-session pipeline│  │  soniox-stt     Streaming multilingual   │
│    → Update LearnerModel + DB    │  │  config.ts      Provider resolution      │
│                                  │  │                                          │
│  /api/voice/livekit-token        │  │  Pipeline: Silero VAD                    │
│    → Create pinned room          │  │    → MultilingualModel turn detector     │
│    → Issue access token          │  │    → Deepgram/Soniox STT                 │
│                                  │  │    → Claude Haiku LLM                    │
│  /api/voice/start-agent          │  │    → Cartesia/Rime TTS                   │
│    → Dispatch agent to room      │  │    → WebRTC audio out                    │
│                                  │  │                                          │
│  Server Lib:                     │  │  Preemptive generation:                  │
│    post-session-pipeline.ts      │  │    LLM starts during turn detector       │
│    cefr-updater.ts (no LLM)     │  │    window (~750ms), hidden latency.      │
│    redis.ts                      │  │    Only with Cartesia (context_id).      │
│    usage-guard.ts                │  │                                          │
└────────────┬─────────────────────┘  └───────┬──────────────────────────────────┘
             │                                 │
┌────────────┴─────────────────────────────────┴─────────────────────────────────┐
│  DATA STORES                                                                    │
│                                                                                 │
│  Supabase Postgres (Prisma ORM)          Redis (ioredis)                        │
│  ┌─────────────────────────────────┐     ┌──────────────────────────────────┐   │
│  │  User (auth, profile, prefs)    │     │  session:{id} (4h TTL)           │   │
│  │  LearnerModel (CEFR, skills)    │     │                                  │   │
│  │  ProducedItem (vocab/grammar    │     │  RedisSessionState {             │   │
│  │    the learner has used)        │     │    lessonPlan, currentPhase,     │   │
│  │  IntroducedItem (per-session)   │     │    errorsLogged[], corrections,  │   │
│  │  Lesson (plan, summary, stage)  │     │    vocabIntroduced[],            │   │
│  │  ErrorLog (per-error detail)    │     │    grammarIntroduced[],          │   │
│  │  Subscription (Stripe)          │     │    currentSlide, phaseExtension  │   │
│  │  DailyUsage (rate limiting)     │     │                                  │   │
│  └─────────────────────────────────┘     │                                  │   │
│                                          │  }                               │   │
│  EXTERNAL SERVICES                       │                                  │   │
│  ┌─────────────────────────────────┐     │  Agent writes (tools)            │   │
│  │  Claude Haiku 4.5  (voice LLM,  │     │  Agent reads (per-turn inject)   │   │
│  │    planning, post-session)       │     │  Web reads (end route)           │   │
│  │  Deepgram Nova-3   (STT default) │     │  Web deletes (cleanup)           │   │
│  │  Soniox            (STT alt)     │     └──────────────────────────────────┘   │
│  │  Cartesia Sonic-3  (TTS default) │                                           │
│  │  Rime              (TTS English) │     Supabase Auth (Google OAuth)           │
│  │  LiveKit Cloud     (WebRTC SFU)  │     Stripe (subscriptions, free/pro)       │
│  │  Stripe            (billing)     │                                            │
│  └─────────────────────────────────┘                                            │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Session Lifecycle

Every session follows this exact sequence:

```
User clicks "Start Session"
    │
    ▼
POST /api/conversation/plan ─────────────────────────────────────────────────────
    │  1. Load LearnerModel (CEFR grammar/fluency, skills[21])
    │  2. Load User profile (interests, occupation, family, goals, recentUpdates)
    │  3. Load last session's IntroducedItems (for review phase)
    │  4. Load last session's ErrorLogs severity=minor|major (for review phase)
    │  5. Load ProducedItem bank (vocab + grammar the learner has used across sessions)
    │  6. Load CurriculumVocab/Grammar at learner's CEFR level, excluding already-produced
    │  7. generateTopic() via Haiku ← ONLY LLM call in planning
    │     Input:  user profile, CEFR scores, last 3 topics, last errors,
    │             produced vocab/grammar bank, curriculum suggestions (not yet produced)
    │     Output: { topic, angle, rationale, targetGrammar, vocabDifficulty }
    │     The LLM builds on known vocabulary and targets curriculum items
    │     the learner hasn't demonstrated yet.
    │  6. Build LessonPlan (5 phases, budgets, slides)
    │  7. If no review items → skip review, redistribute budget (+3m warmup, +5m core)
    │  8. Create Lesson record in Postgres
    │  9. Init RedisSessionState with plan + slide 1
    │  Return: { sessionId, lessonPlan, agentMetadata }
    │
    ▼
GET /api/voice/livekit-token ────────────────────────────────────────────────────
    │  Create pinned LiveKit room
    │  Issue AccessToken (publish/subscribe/data grants)
    │
    ▼
POST /api/voice/start-agent ─────────────────────────────────────────────────────
    │  Clean up stale dispatches
    │  Dispatch agent worker with agentMetadata JSON
    │
    ▼
Voice Session (WebRTC via LiveKit) ──────────────────────────────────────────────
    │  Agent joins room, builds 6-slot system prompt from metadata
    │  Per-turn: Redis session state injected into system prompt
    │  4 tools fire silently (return empty strings):
    │    flagError        (fire-and-forget → Redis)
    │    writeWhiteboard  (soft-blocking ~10ms → Redis)
    │    updateLessonPhase (blocking → Redis, triggers slide transition)
    │    endLesson        (blocking + 500ms drain → triggers pipeline)
    │  Context compression after 20+ turns (async, keeps last 5)
    │  Whiteboard auto-populated from Redis state
    │
    ▼
POST /api/conversation/end ──────────────────────────────────────────────────────
    │  1. Read final RedisSessionState
    │  2. Update Lesson timing + DailyUsage + User.totalMinutes
    │  3. Run 5-step post-session pipeline (see below)
    │  4. Delete Redis session key
    │  Return: { cefrDelta, errorsCount, correctionsDoc, sessionSummary }
```

---

## Voice Pipeline (per-turn latency path)

```
User speaks into microphone
    │ WebRTC audio
    ▼
Silero VAD (activation: 0.5, min speech: 100ms, min silence: 200ms)
    │ speech segments
    ▼
Turn Detector (LiveKit MultilingualModel)
    │ Context-aware end-of-turn detection (~750ms)
    │ Supports Japanese, Korean, Chinese, etc.
    │
    │ ┌─── PREEMPTIVE GENERATION ───────────────────────────────┐
    │ │ LLM starts generating during turn detector window.      │
    │ │ ~750ms of LLM work hidden behind turn detection delay.  │
    │ │ Only works with Cartesia TTS (context_id isolation).    │
    │ │ Rime does NOT support it (shared WS, causes audio leak).│
    │ └────────────────────────────────────────────────────────┘
    │
    ▼
STT: Deepgram Nova-3 (default) or Soniox (multilingual)
    │ transcript text
    ▼
Claude Haiku LLM (6-slot system prompt + Redis state injection)
    ├── Response text ──────────────────────▶ TTS
    │                                         │
    │                                    Cartesia Sonic-3 (persistent WebSocket)
    │                                    or Rime (English optimized)
    │                                         │
    └── Silent tool calls ──▶ Redis           ▼
        (flagError → errors)            WebRTC audio ──▶ User hears response
        (updateLessonPhase → phase)
        (endLesson → pipeline trigger)

Adaptive interruption handling (ML-based, 500ms minimum duration):
  Distinguishes real interruptions from backchanneling (うん, はい, uh-huh).
  Prevents tutor from stopping mid-sentence on acknowledgment sounds.

LATENCY BUDGET:
  ┌──────────────────────────────────────────────────────────┐
  │  VAD + turn detector + endpointing:     100-200ms        │
  │  STT finalize transcript:               200-400ms        │
  │  LLM first token (no tools):            300-500ms        │
  │  LLM first token (blocking tool):       500-800ms        │
  │  TTS first audio chunk:                 80-150ms         │
  │  Network/WebRTC:                        30-80ms          │
  │  ─────────────────────────────────────────────────        │
  │  Total (no tools):                      700ms-1.3s  ✓    │
  │  Total (1 blocking tool):              1.1s-1.8s   ⚠     │
  │  Total (fire-and-forget):              700ms-1.3s  ✓    │
  │                                                          │
  │  TARGET: 95% of turns under 1.5 seconds                  │
  └──────────────────────────────────────────────────────────┘

Latency optimizations:
  - Cartesia persistent WebSocket (saves 150-200ms TLS handshake/turn)
  - Prompt caching (ephemeral, system + tools cached after first turn)
  - State injection only when signature changes (preserves preemptive gen)
  - Minimal endpointing delay (400ms)
  - Per-token LLM streaming to TTS (zero buffer)
```

---

## Agent System Prompt (6-slot architecture)

Built fresh per session. Redis state injected as addendum every turn.

| Slot | Content | Source | Approx Tokens |
|------|---------|--------|---------------|
| 1 | **Identity & Role** — Persona, voice rules (no markdown, no narration, short turns), correction modes | Static in `lingle-agent.ts` | ~400 |
| 2 | **Learner Profile** — CEFR scores, name, occupation, family, goals, interests, recentUpdates (max 10). **Hallucination guard:** agent may ONLY reference facts listed here. | `agentMetadata` from dispatch | ~350 |
| 3 | **Lesson Plan** — Warmup hook, review items (or skip), core topic + angle + targetGrammar, phase budgets | `agentMetadata` from dispatch | ~200 |
| 4 | **Phase Instructions** — Exit criteria per phase, permission protocol (MUST ask before transition), one-extension rule (grant once, 3 min, then proceed) | Static in `lingle-agent.ts` | ~300 |
| 5 | **Tool Instructions** — flagError (minor/major only), writeWhiteboard (new_material/corrections), updateLessonPhase (ask first), endLesson (after closing) | Static in `lingle-agent.ts` | ~150 |
| 6 | **Behavioral Constraints** — STT failures, off-script users, disputed corrections, emotional users, above-level production, meta questions, Redis failure | Static in `lingle-agent.ts` | ~250 |
| **Per-turn** | **Redis Session State** — Current phase + elapsed time, whiteboard contents, errors flagged, corrections queued, phase extension status | Redis via `serializeForPrompt()` | ~80 |

**Target total: <2,000 tokens.** Alert if >2,500.

**Context compression:** After 20+ turns, old messages summarized via Haiku (async, never blocks). Keeps last 5 turns always uncompressed.

---

## Lesson Phases + Transition Rules

```
WARMUP ──▶ REVIEW (or skip) ──▶ CORE ──▶ DEBRIEF ──▶ CLOSING
 5-8 min      8 min (or 0)     variable    4 min      3 min
```

### Phase Exit Criteria

| Phase | Exit When | Time Limit |
|-------|-----------|------------|
| **WARMUP** | User shared personal update AND 4+ min elapsed | 6 min hard cap |
| **REVIEW** | All review items covered (each attempted once) | 10 min, wrap at 8 |
| **CORE** | Topic substantively explored AND 18+ min elapsed | 25 min hard cap |
| **DEBRIEF** | Major errors reviewed with correction attempts | 5 min |
| **CLOSING** | Terminal. Encourage, preview next session, call `endLesson` | — |

### Special Rules

- **Review skip:** If last session produced no IntroducedItems AND no ErrorLogs → skip review entirely. Budget redistributed: +3 min warmup, +5 min core.
- **First session:** No history → skip review, extended warmup (7-8 min), core is assessment-oriented. CEFR starts at 1.0 (A1).
- **Permission protocol:** Agent MUST ask learner before every phase transition. Wait for acknowledgment before calling `updateLessonPhase`.
- **One-extension rule:** If user wants to continue after agent proposes moving on → grant ONE extension (3 min max). Second request → "Let's save that for next time" → proceed.
- **User refuses phase:** Honor without argument. Skip it, move on. Do not explain pedagogical value.

---

## Agent Tool System

Exactly 4 tools. All return empty strings. Tool calls are invisible to the user.

| Tool | Execution | Purpose | When to call |
|------|-----------|---------|--------------|
| `flagError` | **Fire-and-forget** (returns `''` immediately, Redis write in background) | Log grammar/vocab/pronunciation/register/L1 error | Every error noticed, severity minor or major only. Pedantic errors NOT flagged. |
| `writeWhiteboard` | **Soft-blocking** (~10ms, awaits Redis write) | Add/update/delete items on the learner's whiteboard | When introducing vocabulary, grammar patterns, or showing corrections. The whiteboard is the authoritative record of introduced material. |
| `updateLessonPhase` | **Blocking** (awaited, Redis + slide update) | Advance to next phase, trigger slide transition | After asking permission AND receiving acknowledgment |
| `endLesson` | **Blocking** (500ms drain, then pipeline trigger) | Signal session end | After closing phase complete |

### flagError Schema
```typescript
{
  utteranceIndex: number      // turn index
  userUtterance: string       // what learner said verbatim
  errorType: 'grammar' | 'vocab' | 'pronunciation' | 'register' | 'l1_interference'
  errorDetail: string         // e.g. "Incorrect て-form — said 食べって, should be 食べて"
  correction: string          // correct form
  severity: 'minor' | 'major' // pedantic errors NOT flagged
}
```

### writeWhiteboard Schema
```typescript
{
  itemId: string           // stable ID for update/delete (e.g. "vocab_kaigi")
  section: 'new_material' | 'corrections'
  content: string          // display text (e.g. "空港 (くうこう) — airport")
  type: 'vocab' | 'grammar' | 'correction' | 'phrase'
  action: 'add' | 'update' | 'delete'
}
```

The whiteboard (`whiteboardContent` in Redis) is the authoritative record of introduced material. The `vocabIntroduced[]` and `grammarIntroduced[]` arrays have been removed — all whiteboard state flows through this tool.

### Tools NOT present (cut in V3)
`logError`, `noteStrength`, `saveMemory`, `queueCorrection`, `adjustDifficulty`, `advancePhase`, `deferTopic`, `flagForNextSession`, `setVocabHomework`, all whiteboard tools (`whiteboardOpen/Close/WriteCorrection/ShowVocabCluster/ShowTable`), all onboarding tools (`setGoal`, `calibrateLevel`, `setPreference`).

**Why only 4?** Everything else can be derived from the transcript post-session. Only these 4 require in-session execution: `flagError` has in-context pedagogical judgment, `writeWhiteboard` is the real-time visual channel to the learner, `updateLessonPhase` is a real-time UI signal, `endLesson` is a terminal signal.

---

## Post-Session Pipeline (5 steps)

Sequential, resumable via `Lesson.pipelineStage`. Each step idempotent. All LLM calls return structured JSON only.

```
Step 1: Error Classification ────────────────────────────────── pipelineStage = 'error_classification'
    │  LLM (Haiku): Parse transcript, classify every error
    │  Schema: { errors: [{ utteranceIndex, userUtterance, errorType, errorDetail,
    │                        correction, severity, likelySttArtifact }] }
    │  STT artifact detection: one-off, phonetically similar, no semantic disruption → filtered
    │  Output: ErrorLog[] (artifacts removed before DB write)
    │
    ▼
Step 2: Strength & Production Analysis ─────────────────────── pipelineStage = 'strength_analysis'
    │  LLM (Haiku): Identify demonstrated skills + fluency signals + produced items
    │  Only score skills DIRECTLY and CLEARLY evidenced. No inference.
    │  Output: { demonstratedSkills: [{ skill, masteryScore, evidence }],
    │            fluencySignals: { hesitationCount, l1SwitchCount,
    │                              selfCorrectionCount, clarificationRequestCount,
    │                              qualitativeSummary },
    │            producedVocab: string[],    // constrained to CurriculumVocab list
    │            producedGrammar: string[] } // constrained to CurriculumGrammar patterns
    │  LLM is given the full curriculum vocab/grammar lists for the target language
    │  and may ONLY emit items from those lists (deterministic, no free-form).
    │  Post-processing: Upsert ProducedItem records (increment occurrenceCount)
    │
    ▼
Step 3: Personal Facts Extraction ──────────────────────────── pipelineStage = 'personal_facts'
    │  LLM (Haiku): Extract new personal facts worth remembering
    │  Output: { newFacts: [{ category, fact, isTimeSensitive }] }
    │  Post-processing: Prepend to User.recentUpdates, cap at 10 items
    │
    ▼
Step 4: CEFR Delta Computation ─────────────────────────────── pipelineStage = 'cefr_delta'
    │  *** ALGORITHMIC ONLY — NO LLM ***
    │
    │  grammarDelta = 0.02
    │               - (majorErrors × 0.04) × minuteScale
    │               - (minorErrors × 0.01) × minuteScale
    │               + min(producedVocabCount × 0.005, 0.04)  ← vocab range bonus
    │
    │  fluencyDelta = 0.02
    │               - (l1SwitchCount × 0.03) × minuteScale
    │               - (hesitationCount × 0.005) × minuteScale
    │               + (selfCorrectionCount × 0.01) × minuteScale
    │               + min(producedGrammarCount × 0.008, 0.04)  ← grammar diversity bonus
    │
    │  Both capped at ±0.15 per session.
    │  minuteScale = min(sessionDurationMinutes / 30, 1.0)
    │  New score = max(1.0, min(6.0, currentScore + delta))
    │
    │  Also updates: LearnerModel.skills[], sessionCount, totalMinutes
    │  Also writes: ErrorLog entries to Postgres
    │
    ▼
Step 5: Summary Generation ─────────────────────────────────── pipelineStage = 'summary_generation'
    │  LLM (Haiku): Generate SessionSummary
    │  Output: { timeline: [{ phase, durationMinutes, summary }],
    │            tutorInsights: string[],
    │            suggestedFocusNextSession: string }
    │  Stored in: Lesson.sessionSummary (JSON) + Lesson.correctionsDoc (markdown)
    │
    ▼
Pipeline Complete ──────────────────────────────────────────── pipelineStage = 'complete'
```

**LLM call budget per session:**
- Planning: 1 call (topic generation)
- During session: 0 LLM calls from tools (all conversational)
- Post-session: 4 LLM calls (steps 1, 2, 3, 5)
- Context compression: ~1 call per 20 turns (async)

---

## Data Models

### Postgres (Supabase) — 10 Models

```
User
  ├── id (Supabase auth)
  ├── Profile: interests[], occupation, family, goals, recentUpdates[10]
  ├── Config: targetLanguage, nativeLanguage, sessionLengthMinutes
  ├── Prefs: correctionStyle, ttsProvider, sttProvider, voiceId
  └── Stats: totalLessons, totalMinutes

LearnerModel (1:1 with User)
  ├── cefrGrammar: Float (1.0-6.0)    // A1=1.0, A2=2.0, B1=3.0, B2=4.0, C1=5.0, C2=6.0
  ├── cefrFluency: Float (1.0-6.0)
  ├── skills: Json (SkillRecord[21])   // mastery 0-4 per skill
  ├── sessionCount, totalMinutes
  └── lastSessionDate

ProducedItem (running bank — vocab/grammar the learner has used)
  ├── type: vocab | grammar
  ├── surface: "会議" or "te_form"     // the word or pattern key
  ├── targetLanguage
  ├── occurrenceCount                  // incremented each session it appears
  ├── firstSeenAt, lastSeenAt
  ├── Unique per (userId, type, surface)
  └── Informs: CEFR calculation + lesson planning topic generation

CurriculumVocab (reference word list, seeded per language)
  ├── language, surface, reading, translation
  ├── cefrLevel (A1-C2), domain (food, travel, work, etc.)
  ├── Unique per (language, surface)
  └── Used to: constrain pipeline extraction, pick planning targets

CurriculumGrammar (reference grammar patterns, seeded per language)
  ├── language, pattern (machine key), displayName (human label)
  ├── cefrLevel, description
  ├── Unique per (language, pattern)
  └── Used to: constrain pipeline extraction, pick planning targets

IntroducedItem (many per session — what the tutor surfaced)
  ├── type: vocab | grammar | phrase
  ├── surface: "会議"                  // the word/pattern
  ├── translation, notes
  └── Linked to User + Lesson

Lesson (session record)
  ├── Timing: startedAt, endedAt, durationMinutes
  ├── lessonPlan: Json (LessonPlan)
  ├── transcript: Json (TranscriptTurn[])
  ├── correctionsDoc: String (markdown)
  ├── sessionSummary: Json (SessionSummary)
  ├── pipelineStage: String (for resumability)
  └── pipelineCompletedAt: DateTime

ErrorLog (per-error, per-session)
  ├── utteranceIndex, userUtterance
  ├── errorType: grammar | vocab | pronunciation | register | l1_interference
  ├── errorDetail, correction
  ├── severity: pedantic | minor | major
  └── likelySttArtifact: Boolean (filtered before storage)

Subscription (Stripe)
  └── plan: free | pro, status, period dates

DailyUsage (rate limiting)
  └── userId + date → conversationSeconds
```

### Models REMOVED in V3
`ErrorPattern` (replaced by ProducedItem for what the learner knows; errors are session-scoped), `VocabularyItem` (no SRS, no mastery state machine), `Memory` (replaced by User.recentUpdates).

Note: `CurriculumVocab` and `CurriculumGrammar` were brought back as simple reference lists (no state, no SRS). They constrain the pipeline's produced-item extraction and provide planning targets.

---

### Redis — Live Session State

Key: `session:{sessionId}` — TTL: 4 hours

```typescript
interface RedisSessionState {
  sessionId: string
  lessonPlan: LessonPlan           // full plan from planning step
  currentPhase: LessonPhase        // warmup | review | core | debrief | closing
  phaseStartTimeMs: number         // for elapsed time calculation
  phaseExtensionGranted: boolean   // one-extension rule tracking

  errorsLogged: ErrorLog[]         // accumulated from flagError calls
  correctionsQueued: ErrorLog[]    // subset for debrief + corrections doc
  vocabIntroduced: string[]        // auto-populates whiteboard New Material
  grammarIntroduced: string[]      // auto-populates whiteboard New Material

  currentSlide: SlideContent       // what the learner sees right now
}
```

**Who reads/writes:**
| Actor | Operation | Pattern |
|-------|-----------|---------|
| Web (plan route) | Write | Initialize state before agent joins |
| Agent (flagError) | Write | Fire-and-forget (appendFlaggedError) |
| Agent (updateLessonPhase) | Write | Blocking (setLessonPhase) |
| Agent (per-turn) | Read | injectSessionStateIfChanged → system prompt |
| Web (end route) | Read | getSessionState for pipeline input |
| Web (end route) | Delete | Cleanup after pipeline completes |

---

## CEFR + Skills Tracking

### CEFR (two independent floats, 1.0-6.0)

| Score Range | Label |
|-------------|-------|
| 1.0 - 1.9 | A1 |
| 2.0 - 2.9 | A2 |
| 3.0 - 3.9 | B1 |
| 4.0 - 4.9 | B2 |
| 5.0 - 5.9 | C1 |
| 6.0 | C2 |

Updated **algorithmically** after every session (Step 4, deterministic formula, NO LLM). Max ±0.15 per session. Displayed to users as band labels, not raw floats.

### Skills (21 hardcoded, no dynamic creation)

```
introduce_self, greet_farewell, tell_time, describe_location,
talk_about_family, talk_about_work, make_requests, give_opinions,
express_agreement_disagreement, handle_misunderstandings,
discuss_past_events, discuss_future_plans, make_comparisons,
interject_naturally, handle_phone_calls, order_food,
navigate_transport, small_talk, describe_emotions,
argue_a_point, narrate_a_story
```

Mastery scale: `0`=untested, `1`=struggled, `2`=with support, `3`=independent, `4`=automatic.

Updated by post-session Step 2 (LLM, evidenced-only constraint). Skills and CEFR are independent — neither computes from the other.

---

## Whiteboard & Slides

### Whiteboard (agent-driven via `writeWhiteboard` tool)

The agent writes to the whiteboard using the `writeWhiteboard` tool. The whiteboard state lives in `RedisSessionState.whiteboardContent` and is the authoritative record of introduced material.

| Section | Written by | Content |
|---------|-----------|---------|
| **New Material** | `writeWhiteboard(section: "new_material")` | Vocab, grammar, phrases the tutor introduces |
| **Corrections** | `writeWhiteboard(section: "corrections")` | Error corrections shown during debrief |

Each item has a stable `itemId` so the agent can update or delete it. The whiteboard accumulates throughout the session (never cleared between phases). Cleared only at session start.

The current whiteboard content is injected into the agent's turn state every turn so it knows what the learner sees and can reference it naturally ("as you can see on the board...").

### Slides (pre-generated at plan time)

| Phase | Slide Content |
|-------|---------------|
| WARMUP | "今日のレッスン" — session number, question of the day, today's topic |
| REVIEW | "前回の復習" — vocab from last session, grammar points, errors to revisit |
| CORE | Topic name — conversation angle bullets, target grammar note |
| DEBRIEF | "振り返り" — dynamically populated from `correctionsQueued` (only live-updated slide) |
| CLOSING | "お疲れ様でした" — CEFR level, focus summary, next session preview |

Slide transitions triggered by `updateLessonPhase` — no separate signal needed.

---

## Edge Case Handling

| Case | Agent Behavior |
|------|---------------|
| **STT incoherent** | Ask for clarification. Never fabricate meaning. "Sorry, I didn't catch that — could you say that again?" |
| **User off-script** | Acknowledge, redirect. "Great idea — let's save that for after our session." |
| **User disputes correction** | Explain reasoning once. If unconvinced, acknowledge disagreement, move on. Don't argue or capitulate. |
| **User emotional/frustrated** | PAUSE lesson structure. Acknowledge genuinely. Offer specific encouragement. Ask if they want to continue or stop. |
| **User refuses phase** | Honor without argument. Skip it, call `updateLessonPhase`, move on. |
| **User produces above level** | Do NOT raise difficulty. Continue at current level. Post-session analysis picks it up. |
| **Meta questions ("What level am I?")** | Brief answer from injected profile data. Redirect to current topic. |
| **Personal fact hallucination** | ONLY reference facts in the LEARNER PROFILE section. Never infer or embellish. |
| **Redis failure mid-session** | Degrade to conversational mode. No tool calls blocked. Session flagged `redis_degraded`. |
| **Pipeline partial failure** | Resume from failed `pipelineStage` (idempotent steps). User sees "summary processing" message. |

---

## Monorepo Structure

```
lingle/
├── apps/
│   ├── web/  (@lingle/web) ── Next.js 15 + React 19 + Tailwind CSS
│   │   ├── app/
│   │   │   ├── (app)/dashboard/              Home, CEFR display, start session
│   │   │   ├── (app)/conversation/voice/     Session flow (plan → voice → summary)
│   │   │   ├── (app)/onboarding/             Voice-based onboarding
│   │   │   ├── (app)/settings/               Correction style, session length
│   │   │   ├── (app)/upgrade/                Pricing / Stripe checkout
│   │   │   ├── api/conversation/plan/        Session planning (1 LLM call)
│   │   │   ├── api/conversation/end/         Post-session pipeline (4 LLM calls)
│   │   │   ├── api/voice/                    LiveKit token + agent dispatch
│   │   │   └── api/dev/                      Test plan, test pipeline, session state
│   │   ├── components/
│   │   │   ├── voice/                        VoiceAuraOrb, LiveKitBridge, ControlBar,
│   │   │   │                                 Subtitles, Whiteboard, DevTools
│   │   │   ├── session/                      SessionView, SessionSummary
│   │   │   └── ui/                           Shared primitives (shadcn/ui)
│   │   └── lib/
│   │       ├── post-session-pipeline.ts      5-step analysis pipeline
│   │       ├── cefr-updater.ts               Deterministic CEFR formula (no LLM)
│   │       ├── redis.ts                      Web-side Redis client
│   │       ├── usage-guard.ts                Rate limiting (free: 60m/day)
│   │       └── api-helpers.ts                withAuth, devOnly middleware
│   │
│   └── agent/ (@lingle/agent) ── LiveKit Agents SDK (Node.js)
│       └── src/
│           ├── index.ts                      Worker entry: VAD, STT, TTS, LLM setup
│           ├── lingle-agent.ts               6-slot system prompt + context compression
│           ├── tools.ts                      4 tools: flagError, writeWhiteboard, updateLessonPhase, endLesson
│           ├── session-state.ts              Redis CRUD + serializeForPrompt()
│           ├── claude-llm.ts                 Anthropic SDK adapter, prompt caching
│           ├── cartesia-tts.ts               Persistent WebSocket TTS (CJK modes)
│           ├── rime-tts.ts                   Rime TTS (English optimized)
│           ├── soniox-stt.ts                 Soniox streaming STT
│           └── config.ts                     Provider resolution, language maps
│
├── packages/
│   ├── shared/ (@lingle/shared)              TypeScript types, Skill enum, cefrLabel()
│   └── db/     (@lingle/db)                  Prisma client singleton
│
└── prisma/
    └── schema.prisma                         10 models
```

### Key Structural Rules
- `apps/agent/` has **zero dependency** on Next.js or React. Pure Node.js + LiveKit SDK.
- All DB access goes through Prisma in `apps/web/`. Agent never touches DB — reads metadata from dispatch, writes to Redis.
- `packages/shared/` is importable everywhere — TypeScript types only, no logic.
- Frontend data access goes through Next.js API routes. No direct Prisma imports in React.

---

## Provider Resolution

Resolution order: **metadata > env var > language-based default**

| Provider | Default | Override |
|----------|---------|----------|
| **STT** | Deepgram Nova-3 | `AGENT_STT_PROVIDER=soniox` or metadata.sttProvider |
| **TTS** | Cartesia Sonic-3 (CJK), Rime (English) | `AGENT_TTS_PROVIDER` or metadata.ttsProvider |
| **LLM** | Claude Haiku 4.5 | `AGENT_LLM_PROVIDER=openai\|gemini` |
| **CJK Mode** | `fast` (lower latency) | `AGENT_CJK_MODE=natural` (smoother audio) |

---

## Key Design Decisions

1. **The learner model is the product.** Every session reads from it (CEFR, skills, recentUpdates) and writes back (updated scores, new errors, new facts). Session plans are generated from this model.

2. **Errors are session-scoped only (v1 decision).** No cross-session ErrorPattern table, no longitudinal tracking. Review items come from last session only. Review is light — confirm the student remembers, then move on.

3. **Whiteboard is agent-driven via `writeWhiteboard`.** The agent explicitly writes vocab, grammar, corrections to the whiteboard. `whiteboardContent` in Redis is the authoritative record. Slide transitions from `updateLessonPhase`.

4. **Exactly 4 agent tools.** Each earned its place by requiring in-session execution. Everything else deferred to post-session transcript analysis.

5. **CEFR updates are deterministic.** No LLM involvement in scoring. Formula with ±0.15 cap ensures gradual, predictable progression. LLMs set skills, not CEFR.

6. **Latency is king.** Cartesia persistent WS saves 150-200ms/turn. Turn detector's 750ms is hidden by preemptive gen. Prompt caching on every turn. State injection skipped when unchanged.
