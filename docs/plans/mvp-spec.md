# Linguist MVP — Technical Specification

## February 2026

---

## 1. The Thesis

The MVP validates one claim: **a conversation partner with persistent knowledge state produces measurably better learning outcomes than one without it.**

The conversation is the gravitational center of the product. It's where curriculum delivery, mastery reinforcement, error correction, and new item introduction all happen. But it doesn't exist in a vacuum — the learner needs to see the knowledge model growing, and they need to review what happened in past sessions.

The MVP ships three surfaces:

1. **The Conversation** — the primary learning interface. Session-planned, knowledge-model-driven, with structured content delivered inline.
2. **The Knowledge Base** — a browsable, searchable view of everything the learner knows: vocabulary, grammar patterns, and phrases (collocations/chunks). The learner's progress made visible.
3. **Session History** — annotated transcripts of past conversations with errors, corrections, targets hit, and insights recorded. The learner's learning trail.

Everything else (standalone SRS review, dedicated lesson pages, input feed, kanji track) stays in the codebase as infrastructure but is hidden from the user. The existing `/review`, `/learn`, `/dashboard` pages remain in the code — they're just not in the sidebar nav or accessible to the user.

### What We're Validating

1. The conversation agent's session plans visibly improve as the knowledge model grows (sessions at day 20 are measurably more targeted than day 1)
2. The post-session analysis loop correctly identifies and tracks mastery evidence from natural conversation
3. Items that the system targets in conversation are retained at a higher rate than items encountered passively
4. A learner who uses this daily for 30 days has a demonstrably richer, more accurate knowledge model than on day 1

### What We're NOT Validating Yet

- Whether standalone SRS reviews improve retention beyond conversation reinforcement
- Whether structured lessons produce faster grammar acquisition than conversation exposure
- Whether native input content drives acquisition
- Whether kanji should be built in-house or integrated
- Voice/audio

---

## 2. Product Shape

### The Conversation

The learner opens the app and the conversation is front and center. The agent is a language practice partner — not a character with a name and backstory, just a capable conversation partner that speaks the target language, adapts to the learner's level, and has clear pedagogical goals for each session.

Above the chat, a small **challenge card** shows today's targets:

```
Today's challenges:
[ ] Use ～てから at least once
[ ] Use a polite negative (～ません)
[ ] Stretch: try 締め切り in context
```

Challenges check off in real-time as the learner hits them. This gives the open-ended conversation a game-like structure — clear goals, visible progress, immediate feedback.

#### Structured Content Delivered In-Chat

The conversation partner isn't limited to free dialogue. It can inject structured learning moments as **rich message types** within the chat flow:

**Vocabulary introduction cards.** When the session plan calls for introducing a new word, the agent sends a structured card and then uses the word in context:

```
┌─────────────────────────────────┐
│  New word                       │
│  締め切り (しめきり)              │
│  deadline                       │
│                                 │
│  あしたが締め切りです。            │
│  "Tomorrow is the deadline."    │
└─────────────────────────────────┘
```

**Grammar spotlight cards.** Brief explanation surfaced before or after natural usage:

```
┌─────────────────────────────────────────┐
│  Grammar: ～てから (after doing ~)       │
│                                         │
│  ご飯を食べてから、勉強した。              │
│  "After eating, I studied."             │
│                                         │
│  V-て form + から = "after V-ing"       │
└─────────────────────────────────────────┘
```

**Inline review prompts.** Quick recall checks embedded mid-conversation:

```
┌───────────────────────────────────┐
│  Quick check                      │
│  How do you say "deadline"?       │
│                                   │
│  [ Show answer ]                  │
└───────────────────────────────────┘
```

**Error correction recasts.** Natural recast with a subtle correction note:

```
You: 学校を行きました
Agent: あ、学校に行ったんだ。何をした？

┌──────────────────────────────────────────┐
│  学校に行く (not を)                      │
│  Movement verbs use に for destination    │
└──────────────────────────────────────────┘
```

**Session summary.** When the conversation ends, a summary card renders inline:

```
┌─────────────────────────────────────────┐
│  Session Complete · 12 min              │
│                                         │
│  Challenges: 2/3 hit                    │
│  ✓ Used ～てから (twice!)               │
│  ✓ Used 締め切り naturally              │
│  ✗ Avoided ～ません (collapsed to ない)  │
│                                         │
│  Errors: 1 particle (に/を)             │
│  New words encountered: 都合             │
│                                         │
│  → Tomorrow: target ～ません again       │
└─────────────────────────────────────────┘
```

### The Knowledge Base

The existing Knowledge Base page (`/knowledge`) currently shows only vocabulary in a flat table. For the MVP, it needs to become a **full view of everything the learner knows**, organized into three tabs:

**Vocabulary tab.** All lexical items. The current table structure works but needs:
- Both recognition AND production FSRS states visible (currently only recognition)
- Sortable columns (by mastery, stability, due date, frequency — not just first-seen)
- Clickable rows that expand to show detail: full FSRS state, exposure/production counts, context history, recent review events
- Pagination or virtualization (current implementation loads everything at once)

**Grammar tab.** All grammar patterns the learner has encountered. Same table structure as vocabulary:
- Pattern name, description, CEFR level
- Mastery state badge
- Recognition/production FSRS states
- Context count (how many distinct contexts the pattern has been used in)
- Expand to see detail + recent review events

**Phrases tab.** Collocations, chunks, and pragmatic formulas from ChunkItem. These are the multi-word units the learner has encountered:
- Phrase, reading, meaning
- Type badge (collocation / chunk / pragmatic formula)
- Register (casual / polite / formal) where applicable
- Mastery state
- Component items (linked to the vocabulary/grammar that make up this phrase)

All three tabs share the existing search and mastery filter controls. The mastery badge colors are already defined in `constants/mastery.ts`.

**Implementation notes:**
- The Prisma schema already has `LexicalItem`, `GrammarItem`, and `ChunkItem` with full FSRS tracking
- API routes for grammar and chunks need to be built (vocabulary routes already exist at `/api/wordbank`)
- The `WordBankChunkEntry` type is already defined in shared types but has no UI

### Session History

A new page (`/history`) that shows past conversation sessions with annotated transcripts. This is where the learner goes to review what they practiced, see errors that were flagged, and understand what the system learned about them.

**Session list view.** List of all past sessions, most recent first:
- Date and duration
- Session focus (from session plan)
- Challenge completion (e.g., "2/3 targets hit")
- Quick stats: items produced, errors logged

**Session detail view.** Click into a session to see the full annotated transcript:

The transcript is rendered with the original messages (using the existing `MessageBubble` component) plus **inline annotations** drawn from the post-session analysis:

- **Target hits** highlighted in the learner's messages — when they successfully produced a target item, it's visually marked (e.g., underlined or highlighted with a small "target hit" badge)
- **Errors** annotated — the incorrect usage is marked with the correction and explanation shown as a subtle annotation beneath the message
- **Avoidance events** noted — moments where the learner avoided a target item, with context
- **New items encountered** flagged — words the agent used that were new to the learner

Below the transcript, a **session analysis panel** shows:
- Targets planned vs. hit
- Errors by type (particle, conjugation, vocabulary, register)
- Register accuracy breakdown
- Communication strategies used (circumlocution, L1 fallback)
- Overall assessment (the one-sentence summary from the analyzer)

**Implementation notes:**
- The `ConversationSession` model already stores: full transcript (JSON), session plan, targets planned/hit, errors logged, avoidance events, and system prompt
- The `/api/conversation/list` route already returns recent sessions (metadata only)
- Need a new route to fetch a single session's full data (transcript + analysis)
- The `ItemContextLog` entries with `sessionId` can link annotations back to specific items
- The `PostSessionAnalysis` contains `context_quotes` that map errors/avoidance to specific moments in the transcript

### Navigation

The sidebar shows only the three MVP surfaces plus settings. All other pages stay in the codebase but are removed from the nav:

```
Linguist

├─ Conversation    (primary — the learning interface)
├─ Knowledge Base  (vocab + grammar + phrases)
├─ History         (annotated past sessions)
└─ Settings        (learner preferences)
```

Pages that remain in the codebase but are hidden from navigation: `/dashboard`, `/review`, `/learn`, `/chat`, `/insights`. They can be reactivated later.

---

## 3. Architecture

### Platform: Web (Next.js)

The MVP ships as a web app. The Electron desktop app continues to exist but the MVP validation happens on web for distribution and iteration speed.

### What Already Exists (and What Needs Work)

**Fully built and usable as-is:**
- `packages/core/` — All business logic: conversation planner, post-session analyzer, FSRS scheduler, ToM engine, curriculum recommender, pragmatics analyzer, profile calculator
- `prisma/schema.prisma` — Complete schema with all models
- `packages/core/src/curriculum/data/` — Reference data: vocabulary.json, grammar.json, collocations.json, chunks.json, pragmatic-formulas.json, curriculum-spine.json
- `apps/web/app/api/conversation/{plan,send,end}/` — Conversation API routes (plan and send fully working; end needs post-analysis wiring)
- Auth via Supabase Google OAuth
- Onboarding flow — 8-step wizard with placement, reading challenge, comprehension test, and DB seeding

**Needs extension for MVP:**
- `conversation/end` route — Needs the full post-analysis pipeline ported from the desktop handler (`apps/desktop/electron/ipc/conversation.ts`, lines ~400-700)
- `conversation/send` route — Add streaming (currently waits for full response)
- Conversation system prompt — Add structured card emission instructions
- Knowledge Base page — Add grammar tab, phrases tab, item detail expansion, sorting, pagination
- New API routes for grammar items and chunk items (vocabulary routes exist)

**Needs to be built:**
- Rich message type rendering (vocab cards, grammar cards, inline reviews, correction cards) in chat UI
- Challenge card component with real-time target tracking
- Session History page with annotated transcript view
- Message parser for structured card blocks in agent responses
- API route for fetching full session detail (transcript + analysis)

### Onboarding

The onboarding flow already exists as an 8-step wizard:

1. Welcome
2. Language selection (native language; target = Japanese)
3. Self-reported level (Beginner / N5 / N4 / N3 / N2 / N1)
4. Vocabulary & grammar assessment (mark items as known)
5. Reading challenge (kanji → hiragana, 5 items)
6. Comprehension challenge (Japanese → English translation, keyword matching)
7. Study preferences (daily new item limit)
8. Completion summary with computed level

On completion, the system seeds:
- `LearnerProfile` with computed CEFR level
- `PragmaticProfile` with defaults
- `LexicalItem` records from the vocabulary corpus (below level → `introduced`, known items → `apprentice_2`)
- `GrammarItem` records from the grammar corpus (same logic)

**What may need adjustment for MVP:**
- **Richer seeding of chunks/phrases.** The current onboarding only seeds LexicalItem and GrammarItem. ChunkItems (collocations, chunks, pragmatic formulas) from the curriculum data should also be seeded based on the learner's level, so the Phrases tab in the Knowledge Base isn't empty from day one.
- **Seeding scale for lower levels.** A beginner gets only N5 items seeded. This is correct but sparse. The curriculum spine's Unit 1-3 items should be introduced immediately to give the conversation planner enough targets for meaningful early sessions.
- **Don't change the flow itself.** The wizard UX works. The level computation is conservative (can only raise, not lower). The 8 steps are reasonable. Leave it alone.

### Data Flow

```
Learner opens app
    ↓
Plan session (API: /api/conversation/plan)
    → Reads learner profile, active items, ToM inferences
    → Generates curriculum recommendations
    → Calls Claude to produce session plan
    → Stores session + system prompt in DB
    → Returns challenge targets to UI
    ↓
Conversation
    ↓
Each message (API: /api/conversation/send)
    → Appends to transcript in DB
    → Sends to Claude with system prompt + recent transcript
    → Agent may return structured content (vocab card, grammar card, review prompt)
    → Response streamed to UI
    → UI parses target-hit metadata → updates challenge card
    ↓
End session (API: /api/conversation/end)
    → Post-session analysis (Claude call against transcript + plan)
    → Extracts: targets hit, errors, avoidance, new items, register accuracy
    → Updates FSRS states for items with evidence
    → Logs ItemContextLog entries
    → Evaluates mastery state transitions
    → Updates PragmaticProfile
    → Runs ToM analysis
    → Recalculates LearnerProfile
    → Returns summary → renders as inline summary card
    → Session data available in History page
```

### Structured Message Protocol

The system prompt instructs Claude to emit structured blocks using a simple markup convention that the frontend parses:

```
[VOCAB_CARD]
surface: 締め切り
reading: しめきり
meaning: deadline
example: あしたが締め切りです。
example_translation: Tomorrow is the deadline.
[/VOCAB_CARD]

ところで、最近何か締め切りある？仕事忙しそうだね。
```

The frontend parser splits agent messages into segments: plain text (rendered as normal chat bubbles) and structured blocks (rendered as cards).

Card types:

| Tag | Purpose | Fields |
|---|---|---|
| `VOCAB_CARD` | Introduce new vocabulary | surface, reading, meaning, example, example_translation |
| `GRAMMAR_CARD` | Explain grammar pattern | pattern, meaning, example, example_translation, formation |
| `REVIEW_PROMPT` | Inline recall check | prompt, item_type, item_id |
| `CORRECTION` | Gentle error correction | incorrect, correct, explanation |

The session summary is NOT generated by Claude — it's constructed by the frontend from the post-session analysis response.

### Real-Time Challenge Tracking

The system prompt asks Claude to include a metadata line at the end of each response:

```
[TARGETS_HIT: 締め切り, ～てから]
```

The frontend strips this line before rendering and updates the challenge card. More accurate than client-side regex matching, negligible token cost.

### Conversation Partner Design

The conversation partner is **not a named character**. It's a knowledgeable language practice partner that:

- Speaks primarily in the target language at the learner's level
- Engineers natural conversational moments to elicit target items
- Corrects errors via recasting (uses the correct form naturally in the next turn)
- Adapts register, topic, and complexity based on the session plan
- Does not have a persistent personality, backstory, or ongoing life events
- Does not roleplay or pretend to be a person

The system prompt frames it as a practice partner, not a friend:

```
You are a Japanese language practice partner. Your job is to have natural
conversations with the learner at their level while engineering opportunities
for them to use specific target vocabulary and grammar patterns.

Speak in Japanese at the specified difficulty level. When the learner makes
an error, correct via recasting — use the correct form naturally in your
next turn without explicitly pointing out the mistake. If the error is on
a target item, give the learner a second chance to produce it correctly.

Do not adopt a persona or character. Do not pretend to have personal
experiences. Keep the focus on the learner's practice.
```

This can evolve later if character-driven conversation proves valuable, but the MVP tests the knowledge model loop without the confound of whether the learner likes the character.

---

## 4. The Knowledge Model (MVP Scope)

### What's Tracked

The full schema is already built. For the MVP, the subset that matters:

**LexicalItem** — Every vocabulary item the learner has encountered or been seeded with:
- `masteryState` — State machine position (unseen → burned)
- `recognitionFsrs` / `productionFsrs` — Separate FSRS scheduling states
- `exposureCount` / `productionCount` — How often seen vs. produced
- `contextTypes` / `contextCount` — Where and how often encountered

**GrammarItem** — Every grammar pattern tracked. Same mastery + FSRS structure.

**ChunkItem** — Collocations, chunks, pragmatic formulas. Tracked as units with component dependencies. `itemKind` distinguishes collocation / chunk / pragmatic_formula.

**ConversationSession** — Full transcript, session plan, analysis results, system prompt. The audit trail.

**TomInference** — Avoidance detection, confusion pairs, regression flags. Drives session planning.

**ReviewEvent** — Every mastery evidence event. Logged from both inline reviews and post-session analysis.

**ItemContextLog** — Per-interaction evidence with modality and success tracking. Links to sessionId for transcript annotation.

### Mastery Evidence Sources

All evidence comes from or through the conversation:

| Source | Evidence Type | Weight |
|---|---|---|
| Learner produces target item spontaneously | Production, highest | FSRS "easy" equivalent |
| Learner produces target item after agent elicitation | Production, high | FSRS "good" equivalent |
| Learner answers inline review prompt correctly | Recognition or production | FSRS grade as selected |
| Learner answers inline review prompt incorrectly | Negative signal | FSRS "again" |
| Agent introduces item, learner uses it later in session | Production, medium | Logged to context, FSRS "good" |
| Agent introduces item, learner does not use it | Exposure only | Exposure count +1, no FSRS update |
| Learner avoids target item despite opportunity | Avoidance signal | TomInference created/updated |
| Learner makes error on item | Error signal | Logged to ItemContextLog, TomInference |

### State Machine Transitions

The full state machine (unseen → burned) applies. Critical gate preserved: **items cannot advance past apprentice_4 to journeyman without production evidence from conversation.**

Transitions evaluated during post-session analysis:
- Unseen → Introduced: Agent presents item via VOCAB_CARD or natural usage
- Introduced → Apprentice_1: Learner engages with item (responds to review prompt, uses it once)
- Apprentice_N → Apprentice_N+1: FSRS recognition review graded good/easy
- Apprentice_4 → Journeyman: Production evidence logged (learner produced it in conversation)
- Journeyman → Expert: Consistent production + recognition over multiple sessions
- Expert → Master: Stable across 3+ distinct context types

---

## 5. Post-Session Analysis Pipeline

This is the critical loop that makes the knowledge model live. When a session ends:

### Step 1: Transcript Analysis (Claude call)

Send the full transcript + session plan to Claude. Get back structured JSON:
- `targets_hit`: Item IDs successfully produced by the learner
- `errors_logged`: Errors with item ID, type, and context quote
- `avoidance_events`: Items the learner avoided despite opportunity
- `new_items_encountered`: Items used by the agent that were new to the learner
- `register_accuracy`: Correct uses vs. slips for the target register
- `strategy_events`: Circumlocutions, L1 fallbacks, silence events
- `context_logs`: Per-item interaction records with modality and success

Prompt and parser already exist: `buildAnalysisPrompt` and `parseAnalysis` in `packages/core/src/conversation/analyzer.ts`.

### Step 2: FSRS Updates

For each target hit: update `productionFsrs` with "good" grade, increment `productionCount`, log ReviewEvent.
For each error on a known item: update FSRS with "again" or "hard", log ReviewEvent.
For inline review responses: apply grade directly to FSRS.

### Step 3: Mastery State Transitions

Evaluate each touched item against state machine rules. Promote or hold.

### Step 4: Context Logging

Create ItemContextLog entries for each interaction. Include `sessionId` so they can be linked back to the transcript for the History view.

### Step 5: ToM Update

Run ToM analyzer: flag avoidance patterns, detect confusion pairs, flag regressions, update/resolve existing inferences.

### Step 6: Pragmatic Profile Update

Update PragmaticProfile from register accuracy and strategy events.

### Step 7: Profile Recalculation

Recompute overall level, comprehension/production ceilings, streak data.

### Implementation Note

Steps 1-7 are already implemented in the desktop IPC handler (`apps/desktop/electron/ipc/conversation.ts`, ~400-700). The web `conversation/end` route needs to be extended with the same logic using the framework-agnostic core functions.

---

## 6. Technical Implementation Plan

### Phase 1: Wire the Learning Loop (Web)

**Goal:** Full conversation → analysis → knowledge update cycle working end-to-end.

1. **Extend `conversation/end` route** with the full post-analysis pipeline (steps 1-7). Port logic from the desktop handler.
2. **Add streaming to `conversation/send`** route. Use Vercel AI SDK or raw SSE.
3. **Add structured message instructions** to the system prompt (VOCAB_CARD, GRAMMAR_CARD, REVIEW_PROMPT, CORRECTION markup).
4. **Add target-hit metadata line** instruction to system prompt.
5. **Reframe conversation partner** — update system prompt to be a practice partner, not a character.

### Phase 2: Conversation UI

**Goal:** Primary conversation interface with rich message rendering and challenge tracking.

1. **Build the conversation page** as the primary entry point. Keep `/learn` and `/chat` pages in place but build the new conversation UI as the default landing.
2. **Build the message parser** — splits agent responses into plain text segments and structured card blocks.
3. **Build card components** — React components for VOCAB_CARD, GRAMMAR_CARD, REVIEW_PROMPT, CORRECTION rendered inline in the message flow.
4. **Build the challenge card** component — reads targets from session plan, parses `[TARGETS_HIT]` metadata, shows real-time checkmarks.
5. **Build the inline session summary** — rendered from post-session analysis response data.
6. **Session management** — start session button, end session button, transition between sessions.

### Phase 3: Knowledge Base Upgrade

**Goal:** Full browsable knowledge state across vocabulary, grammar, and phrases.

1. **Add grammar API routes** — list, search, filter by mastery. Mirror the existing wordbank routes.
2. **Add chunk/phrase API routes** — list, search, filter by mastery and type (collocation/chunk/pragmatic formula).
3. **Build tabbed Knowledge Base UI** — three tabs: Vocabulary, Grammar, Phrases. Each with search, mastery filter, sortable columns.
4. **Build item detail expansion** — click a row to see full FSRS state, context history, review events.
5. **Add pagination/virtualization** — current implementation loads all items at once.

### Phase 4: Session History

**Goal:** Annotated transcript view of past conversations.

1. **Build session detail API route** — fetch full transcript + analysis for a single session.
2. **Build session list page** (`/history`) — list of past sessions with metadata and challenge completion.
3. **Build annotated transcript component** — renders messages with inline annotations for target hits, errors, avoidance events, and new items. Uses `context_quote` from analysis to map annotations to specific message segments.
4. **Build session analysis panel** — displayed alongside or below the transcript. Targets planned vs. hit, error breakdown, register accuracy, communication strategies, overall assessment.

### Phase 5: Onboarding Adjustments

**Goal:** Richer initial knowledge model from day one.

1. **Seed ChunkItems during onboarding** — based on the assessed level, seed collocations, chunks, and pragmatic formulas from the curriculum data so the Phrases tab isn't empty.
2. **Seed Unit 1-3 curriculum items for beginners** — ensure the conversation planner has enough targets for meaningful early sessions.
3. **Leave the onboarding wizard UI as-is.** The 8-step flow works.

### Phase 6: Polish and Validate

1. **Prompt tuning** — session planning, conversation, and analysis prompts need iterative tuning based on real conversations.
2. **Error handling** — fallback behavior when Claude returns malformed JSON in analysis.
3. **Cold start UX** — first 3-5 sessions need to feel valuable despite sparse model. Lean on curriculum spine data.
4. **30-day validation** — 3-5 real learners for 30 days. Measure knowledge model growth, session plan quality, engagement.

---

## 7. What's Deferred

The following exist in the codebase but are hidden from the user (removed from sidebar nav, pages remain at their routes but are not linked):

- **Dashboard** (`/dashboard`) — Frontier visualization, daily stats. Keep code, hide from nav.
- **Standalone SRS review** (`/review`) — Review engine with card UI and grading. Keep code, hide from nav. Inline review prompts in conversation are the MVP mechanism.
- **Learn page** (`/learn`) — Three-phase conversation flow. Keep code, hide from nav. Replaced by the new Conversation page.
- **Chat page** (`/chat`) — Generic chat with no learning awareness. Keep code, hide from nav. Replaced by Conversation.
- **Insights page** (`/insights`) — ToM inference display (currently a placeholder anyway). Keep code, hide from nav. ToM runs silently for session planning.

The following are not yet built and remain out of scope:

- **Input feed** (clips, mini-dramas, graded reading) — V2.
- **Multiple conversation partners** — MVP ships with one generic practice partner. Characters, format rotation, etc. come later if validated.
- **Free practice mode** — Every session is planned. Unstructured practice comes later.
- **Kanji track** — Deferred entirely.
- **Voice/audio** — Text only.
- **Desktop app** — Continues to exist, not the MVP deployment target.
- **Narrative engine / daily brief UI** — ToM brief runs silently; no user-facing narrative.

---

## 8. Success Criteria

### Must-hit for MVP validation

1. **Knowledge model accuracy.** After 10 sessions, manually audit 20 items. Mastery state should match human assessment for ≥80% of items.

2. **Session plan quality.** Session plans at session 20 should reference specific items, avoidance patterns, and mastery gaps that didn't exist at session 5.

3. **Target hit rate.** ≥40% of planned vocabulary targets and ≥30% of grammar targets naturally produced by the learner per session. (<40%/30% = agent failing to elicit; >80% = targets too easy.)

4. **Retention signal.** Items that were conversation targets should show higher FSRS stability than passively encountered items.

5. **Learner engagement.** 15+ sessions over 30 days from a motivated learner.

### Nice-to-have signals

- Learner reports that "the conversation knows what I need to practice"
- ToM avoidance detections match learner self-reports
- Session duration stable or growing over 30 days
- Learner asks for features beyond what MVP ships (signal the core loop works)
- Knowledge Base usage — learner returns to check their progress unprompted

---

## 9. Design Decisions

These were open questions. Here are the resolved approaches for MVP.

### 1. Structured Card Frequency

**Decision: Adaptive, tied to session maturity.**

The number of structured cards (VOCAB_CARD, GRAMMAR_CARD, etc.) scales with how much the learner needs explicit instruction vs. natural conversation practice:

- **Early sessions (< 20 active items in knowledge model):** Up to 5 cards per session. The conversation is more lesson-like because the learner doesn't have enough vocabulary to sustain extended free conversation. This is fine — the learner expects scaffolding at this stage.
- **Mid sessions (20-80 active items):** 2-4 cards per session. The conversation can sustain itself but still needs introductions and corrections.
- **Mature sessions (80+ active items):** 0-2 cards per session. The conversation is genuinely conversational. Cards appear only for new introductions or notable corrections. Most learning happens through natural production and elicitation.

The session planner already knows the learner's active item count. Add a `card_budget` field to the session plan that the system prompt references. The agent uses this as a soft cap — it can emit fewer cards than the budget allows, but not more.

**Constraint:** Never more than 1 card per 3 conversational turns. Cards should never stack back-to-back. The conversation must breathe.

### 2. Inline Review UX

**Decision: Reviews are just conversation. No special mode.**

When the agent wants to test recall, it asks conversationally — "How do you say 'deadline' in Japanese?" or "Can you use ～てから in a sentence?" This is rendered as a REVIEW_PROMPT card for visual distinction, but the learner responds in the normal chat input. The agent evaluates the response in its next turn ("そうそう！締め切り！" or "惜しい — 締め切り（しめきり）だよ").

FSRS updates for these interactions happen in post-session analysis, not in real-time. The analysis prompt already identifies per-item production events and grades them. Adding real-time FSRS updates per review would add complexity for marginal benefit — the post-session pipeline handles it.

This means the review interaction is just a normal conversational exchange that happens to be about recall. No special client-side grading UI, no "answer mode," no extra API calls. The structured REVIEW_PROMPT card is purely visual — it signals "this is a recall moment" to the learner but doesn't change the interaction model.

### 3. Session Length Management

**Decision: User-driven end, with agent wind-down after targets are covered.**

- The learner always has an "End Session" button visible in the conversation UI.
- The agent tracks (via the system prompt) how many target items have been attempted. After all targets have been attempted OR after approximately 15-20 conversational turns (whichever comes first), the agent begins winding down naturally — shorter responses, a natural closing line in the target language.
- If the learner keeps chatting past the wind-down, the agent continues conversationally but stops introducing new material or pushing targets. This extra conversation is still logged and analyzed — spontaneous production still counts as evidence.
- The system prompt includes a `turn_count` instruction: "After turn 20, begin wrapping up. Do not introduce new vocabulary or grammar after this point."

**No time-based enforcement.** The learner might spend 5 minutes or 30 minutes. The system doesn't care about clock time — it cares about whether targets were attempted. A focused 8-minute session where all targets were hit is more valuable than a rambling 30-minute session.

### 4. Multiple Sessions Per Day

**Decision: Allowed, with today-aware target filtering.**

A learner can start a new session after completing one. The planner already reads the learner's full state. Add one filter:

When computing targets for a new session plan, query today's completed `ConversationSession` records (where `timestamp` is today) and collect all `targetsHit` item IDs. Exclude those from the candidate pool. This prevents the planner from re-targeting items the learner already successfully produced today.

If ALL candidate items were already hit today (the learner has been very productive), the planner falls back to:
1. Items from the next curriculum unit not yet introduced
2. Items flagged as avoidance or confusion pairs (worth re-attempting regardless)
3. Free conversation with no explicit targets (rare — indicates the learner is ahead of the curriculum)

### 5. Session History Annotation Granularity

**Decision: Hybrid — message-level annotation badges + summary panel.**

The analysis returns `context_quote` strings for each error, avoidance event, and target hit. Use these to anchor annotations to specific messages:

1. For each annotation, do a simple `message.content.includes(context_quote)` check against the transcript messages. If a match is found, attach the annotation to that message.
2. Render matched annotations as small badges or chips below the relevant message: `[target hit: 締め切り]`, `[error: に→を]`, `[avoidance: ～ません]`.
3. If a `context_quote` doesn't match any message (the analyzer paraphrased or truncated), the annotation falls through to the summary panel only — no inline display.

This is cheap to implement (string matching, no NLP) and good enough for MVP. The summary panel at the bottom always shows the complete analysis regardless of whether inline matching succeeded. Inline annotations are a bonus, not a requirement.

**Component structure:**
- `AnnotatedMessage` wraps `MessageBubble` and renders any matched annotations beneath it
- `SessionAnalysisPanel` renders the full analysis breakdown (targets, errors, strategies, assessment)
- The session detail page lays them out as: transcript with annotations on the left/main area, analysis panel in a sidebar or below

### 6. Knowledge Base Item Actions

**Decision: Mostly read-only, with one action: "Start Practicing."**

The Knowledge Base is for viewing progress, not for managing study queues. One exception:

- Items in `introduced` or `unseen` state show a "Start Practicing" button that promotes the item to `apprentice_1` and sets an initial FSRS state. This lets the learner flag specific items they want the system to actively target in conversation.

Everything else is read-only for MVP:
- No editing meanings or tags
- No manual "mark as burned"
- No manual FSRS adjustment
- No bulk operations

The rationale: the knowledge model should be updated by evidence (conversation production, review responses), not manual overrides. If a learner thinks an item's mastery state is wrong, the right fix is to use it (or fail to use it) in conversation — the system will self-correct. Manual overrides create a maintenance burden and undermine the model's integrity.

### 7. Early Sessions (Day 1-3): The Cold Start Strategy

**Decision: Curriculum-heavy mode that gracefully transitions to conversation-heavy mode.**

The session planner detects cold start conditions and adjusts behavior:

**Cold start condition:** `active_items < 30` (items in apprentice_1 through journeyman).

**Cold start session plan adjustments:**
- `card_budget`: 4-5 (higher than normal — more explicit instruction)
- Targets come directly from the curriculum spine's earliest incomplete unit (usually Unit 1 or 2)
- The system prompt adds: "The learner is a beginner. Use more English/native language for explanations. Keep Japanese utterances short (5-10 words). Focus on introducing vocabulary through structured cards before attempting conversational elicitation."
- Session focus is thematic: "self-introduction," "basic objects," "daily routine" — drawn from the curriculum unit's communicative goal
- The agent asks more closed-ended questions (yes/no, A or B choices) to scaffold production rather than open-ended prompts

**Transition:** As the learner's active items grow past 30, 50, 80, the planner naturally shifts: fewer cards, more open conversation, more elicitation, less L1 scaffolding. This transition is continuous — there's no hard mode switch. The `card_budget` and system prompt tone shift gradually based on active item count.

**First session specifically:**
After onboarding seeds the knowledge model, the first planned session targets items the learner marked as "known" during the assessment (seeded at `apprentice_2`). These are items the learner claims to know but hasn't proven in production. The first session is essentially a production verification pass: "You said you know these — show me." This is both pedagogically sound (validates the cold start assumptions) and creates an engaging first experience (the learner gets to demonstrate what they know rather than being taught from scratch).
