# Linguist: System Architecture & Core Mechanics

How the app works at a fundamental level — what's in the database, how knowledge is tracked, how new concepts are introduced, and how they're tested.

---

## The Database: What's Stored

The database has **three layers**: items, events, and meta.

### Items — The Knowledge Model

- **`LexicalItem`** — A vocabulary word (surfaceForm, reading, meaning, partOfSpeech). Each one has its own `masteryState`, two separate FSRS scheduling states (`recognitionFsrs` and `productionFsrs`), modality counters (reading/listening/speaking/writing exposures), a `productionWeight`, `contextCount`, and `cefrLevel`.
- **`GrammarItem`** — A grammar pattern (patternId, name, description). Same mastery/FSRS/modality tracking as lexical items, plus `novelContextCount` and `prerequisiteIds`.

### Events — The Evidence Trail

- **`ReviewEvent`** — Every SRS card flip: which item, what grade (again/hard/good/easy), what modality (recognition/production/cloze), and production weight.
- **`ItemContextLog`** — Every time an item is encountered anywhere (SRS review, conversation, drill): what modality, was it production, was it successful, with a context quote.
- **`ConversationSession`** — The full transcript, planned targets, targets actually hit, errors logged, avoidance events.
- **`TomInference`** — Higher-level beliefs the system has derived (avoidance patterns, confusion pairs, regressions).

### Meta — Aggregated State

- **`LearnerProfile`** — The single-row summary: computed CEFR level, comprehension/production ceilings, modality levels, streak, daily limits, target retention.
- **`PragmaticProfile`** — Register accuracy (casual/polite), circumlocution count, L1 fallbacks, avoided patterns.
- **`CurriculumItem`** — The queue of items recommended for introduction (queued/introduced/skipped).

---

## Knowledge Tracking: The Mastery State Machine + FSRS

Every item has **two independent systems** tracking its state:

### 1. Mastery State Machine (Qualitative)

A 10-state progression:

```
unseen → introduced → apprentice_1 → apprentice_2 → apprentice_3 → apprentice_4 → journeyman → expert → master → burned
```

Movement is **gated by evidence**, not just correct answers:

- **apprentice_1 through apprentice_4**: Advance on `good`/`easy` grades, demote on `again`. `hard` holds position.
- **apprentice_4 → journeyman**: **Blocked** until `productionWeight >= 1.0`. The learner must *produce* the item (in conversation or drill), not just recognize it. Conversation production = 1.0 weight, drill production = 0.5 weight.
- **journeyman → expert**: **Blocked** until `contextCount >= 3`. The item must appear in 3+ distinct context types (srs_review, conversation, reading, textbook, drill).
- **expert → master**: **Blocked** until `novelContextCount >= 2` (grammar only). The grammar pattern must be used correctly in contexts different from where it was first learned.

Demotion happens on `again` — one level back (e.g., journeyman → apprentice_4, master → expert).

### 2. FSRS Scheduling (Quantitative)

Each item has **two** FSRS cards — one for recognition ("see Japanese, recall meaning"), one for production ("see meaning, produce Japanese"). Each card independently tracks:

- **due** — When the next review is scheduled
- **stability** — How many days until retrievability drops to target retention (higher = more deeply learned)
- **difficulty** — 1–10, how inherently hard this card is for this learner
- **reps, lapses** — Total successful reviews and total failures

FSRS uses a mathematically-derived forgetting curve. After each review, it computes the optimal next review interval based on the grade. The review queue is computed at app startup: any card where `due <= now` goes into the queue, sorted most-overdue first, capped at 200.

---

## How New Concepts Are Introduced

There are **two pathways** for new items entering the system:

### 1. Curriculum Recommender (Proactive, Pre-Session)

Before each conversation session, the Learn page runs:

1. **Knowledge Bubble computation** (`core/curriculum/bubble.ts`) — Compares the learner's known items against a reference corpus of ~1000 vocab + ~100 grammar items, organized by CEFR level. Determines the learner's `currentLevel` (highest level with >=80% coverage) and `frontierLevel` (currentLevel + 1).

2. **Recommendation generation** (`core/curriculum/recommender.ts`) — Scores candidate items from the frontier and current level gaps. Scoring considers:
   - Frequency rank (more common words score higher)
   - Whether it fills a gap in the current level (+0.5) vs. being a frontier item
   - Grammar prerequisite satisfaction (+0.3 if all prereqs met, -2.0 if missing)
   - ToM adjustments: penalize areas with active regression (-0.3), boost grammar if avoidance detected (+0.2)

3. **Introduction** (`electron/ipc/curriculum.ts`) — When the user starts a session, each non-skipped recommended item gets created in the DB as a `LexicalItem` or `GrammarItem` with `masteryState: 'introduced'` and fresh FSRS states.

### 2. Conversation Discovery (Organic, During Session)

During the post-session analysis, Claude identifies `newItemsEncountered` — vocabulary the learner used that wasn't in their word bank. These get created as `LexicalItem` with `masteryState: 'introduced'` and `source: 'conversation'`.

Both pathways put items into the `introduced` state. To enter the SRS review queue, an item must reach `apprentice_1` — which happens on its first successful review.

---

## How Items Are Tested

### SRS Reviews (Daily Anchor)

The review page computes today's queue by checking all items where either `recognitionFsrs.due` or `productionFsrs.due` is in the past. For each card:

1. **Recognition cards**: Show the Japanese → recall meaning/reading
2. **Production cards**: Show meaning/reading → produce the Japanese

The learner self-grades: Again / Hard / Good / Easy. On submit:

- FSRS recomputes the next due date for that specific card (recognition or production)
- The mastery state machine evaluates whether to promote, demote, or hold
- A `ReviewEvent` is logged
- An `ItemContextLog` entry is created
- Modality counters are incremented
- Every 10 reviews, the `LearnerProfile` is recalculated

### Conversation Sessions (Production Testing)

The conversation partner is where the **real** testing happens for promotion past apprentice_4. The flow:

1. **Planning**: Claude receives the learner profile summary + ToM brief, produces a session plan with 3–5 target vocab items and 1–2 target grammar patterns to elicit.
2. **Conversation**: Claude steers the conversation to create natural contexts where those targets arise. Errors are corrected via recasting (using the correct form naturally, not explicit correction).
3. **Post-session analysis**: Claude analyzes the transcript and identifies which targets were produced, what errors occurred, what was avoided, and what new items appeared.
4. **DB updates**: Items that were successfully produced get their `productionWeight` and `productionCount` incremented — this is what unlocks the apprentice_4 → journeyman gate.

---

## The Feedback Loop

Everything feeds back into everything:

```
Reviews build FSRS stability → raise mastery states
      |
      v
Higher mastery → higher coverage at current level
      |
      v
Higher coverage → level up → new frontier items recommended
      |
      v
Conversation targets items stuck at gates (need production evidence)
      |
      v
Post-session analysis → updates production weight → unlocks promotions
      |
      v
ToM engine detects avoidance/confusion/regression patterns
      |
      v
Next session's plan prioritizes those patterns
      |
      v
Profile recalculation updates computed level, ceilings, streak
```

The key design insight: **recognition and production are tracked separately**, and the mastery gates enforce that a learner can't be considered proficient in an item just from flashcard drilling. They must demonstrate production in a real conversational context to advance past the apprentice tier.

---

## Key Files

| Area | File | Role |
|---|---|---|
| Schema | `prisma/schema.prisma` | All table definitions |
| Types | `shared/types.ts` | TypeScript interfaces shared everywhere |
| FSRS | `core/fsrs/scheduler.ts` | Scheduling, queue computation |
| Mastery | `core/mastery/state-machine.ts` | State transitions with promotion gates |
| Bubble | `core/curriculum/bubble.ts` | Knowledge coverage by CEFR level |
| Recommender | `core/curriculum/recommender.ts` | New item scoring and selection |
| Profile | `core/profile/calculator.ts` | Level/ceiling/streak recalculation |
| Pragmatics | `core/pragmatics/analyzer.ts` | Register accuracy, communication strategies |
| Reviews IPC | `electron/ipc/reviews.ts` | SRS review submission + DB writes |
| Curriculum IPC | `electron/ipc/curriculum.ts` | Item introduction + recommendation |
| Conversation IPC | `electron/ipc/conversation.ts` | Session planning, chat, post-session analysis |
