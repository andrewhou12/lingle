# Linguist: Future Architecture Design Document (Written 2/20)

## Context

The V1 app is functional end-to-end: SRS reviews, AI conversation partner, curriculum recommender, ToM engine, knowledge bubble. But the system has structural gaps that will become blockers as the app matures. This document addresses five areas the app needs to evolve in, plus issues identified from the codebase analysis.

---

## 1. Richer Learner Profile

### Current State

The `LearnerProfile` is a thin singleton row: computed CEFR level, comprehension/production ceilings, modality levels (listening/speaking hardcoded to 0), streak, and totals. The `PragmaticProfile` adds register accuracy and strategy counts. The real richness is scattered: individual item mastery states, `TomInference` rows, `ItemContextLog` entries. But nobody synthesizes these into a cohesive learner model.

Notable gaps:
- `errorPatternSummary` and `avoidancePatternSummary` fields on LearnerProfile exist but are never populated — ToM stores inferences in a separate table instead
- `avoidedVocabIds` on PragmaticProfile is defined but never written to
- No temporal patterns (when does the learner study? how long? what produces best results?)
- No learning velocity metric (how fast do they acquire new items?)
- No actual retention rate measurement (FSRS predicts 90%, but is it accurate?)

### Design: Three-Layer Profile

**Layer 1: Extend LearnerProfile with computed behavioral metrics**

Add fields that the profile calculator derives from session/review data:

| Field | Type | Source |
|---|---|---|
| `averageSessionMinutes` | Float | Avg duration across all StudySessions |
| `optimalStudyHour` | Int? | Hour of day with highest accuracy (0-23) |
| `learningVelocity` | Float | Items reaching apprentice_3+ per active day, rolling 30d |
| `measuredRetention` | Float | Actual % of items recalled when due vs FSRS prediction |
| `sessionsSinceLastLevel` | Int | Sessions since last level-up — detects plateaus |
| `preferredModality` | String? | Which review modality yields best accuracy |

These are all computed, not user-set. The profile calculator already runs on every review batch — extend it.

**Layer 2: New `StudySession` table for temporal analysis**

```
StudySession {
  id, type ("review"|"conversation"|"lesson"|"drill"),
  startedAt, endedAt, durationSeconds,
  dayOfWeek, hourOfDay,
  itemsAttempted, itemsCorrect, newItemsAdded, masteryChanges,
  averageGrade (1-4 scale),
  focusScore (accuracy relative to session length)
}
```

This lets the ToM engine detect: "learner performs 15% worse after 8pm" or "sessions over 20 minutes show declining accuracy." Currently no session-level aggregation exists — review events and conversation sessions are separate tables with no unified session concept.

**Layer 3: Structured error taxonomy (replaces free-form strings)**

Current state: `PostSessionAnalysis.errorsLogged[].errorType` is a free-form string from Claude. Cannot aggregate across sessions.

New `LearnerError` table with a structured `ErrorCategory` enum:

```
ErrorCategory:
  wrong_word, wrong_reading, wrong_meaning,           (lexical)
  wrong_conjugation, wrong_particle, wrong_counter,    (morphological)
  wrong_word_order, missing_element, extra_element,     (syntactic)
  wrong_register, wrong_formality,                      (pragmatic)
  wrong_pitch_accent, wrong_mora, sound_substitution,   (phonological, V2)
  l1_transfer, overgeneralization                       (strategic)
```

Each error row: `{ category, itemId?, itemType?, sessionId?, contextQuote, correction, isRecurring, timestamp }`.

This enables: "14 particle errors in the last 30 days, predominantly は/が confusion" — actionable for the curriculum and session planning.

**What NOT to model:** Motivation, personality, or learning style. These are not measurable. Model *behavior* instead — session frequency, length trends, time-to-first-activity. The ToM engine infers engagement from patterns.

---

## 2. Expanded Item Types

### Current State

Only `lexical` (vocabulary) and `grammar` item types exist. The mastery state machine and FSRS are both item-type-agnostic — they operate on abstract `MasteryContext` and `FsrsState`. Adding new item types is mechanically straightforward but pedagogically expensive: each type needs review card UI, conversation analyzer integration, and curriculum data.

### Design: Add Kanji Now, Collocations Next, Defer the Rest

**Add: `KanjiItem`** — highest impact for Japanese

```
KanjiItem {
  character (unique), meanings[], onReadings[], kunReadings[],
  strokeCount, cefrLevel, frequencyRank,
  masteryState, recognitionFsrs, recallFsrs,
  componentOf: Int[]  // LexicalItem IDs that use this kanji
}
```

The `componentOf` relationship creates a knowledge network. When a learner masters 食べる, the kanji 食 gets exposure credit. When 食 reaches sufficient mastery, all words using it get a recognition boost. This is the network effect the current flat item model lacks.

Kanji uses the same 10-state mastery progression. Recognition = see kanji, recall meaning/readings. Recall = see meaning, produce/select kanji.

**Add: `CollocationItem`** — important for natural speech

```
CollocationItem {
  phrase ("電話をかける"), reading, meaning,
  componentIds: Int[]  // constituent LexicalItem IDs
  cefrLevel, masteryState, recognitionFsrs, productionFsrs
}
```

Knowing 電話 and かける individually does not predict knowing 電話をかける ("make a phone call"). Collocations must be tracked separately.

**Defer to V3:**
- **Discourse patterns** (conversation openings, disagreement strategies, storytelling) — better handled through guided flows (section 5) than through item-level mastery tracking
- **Phonological patterns** (pitch accent) — should be properties of lexical items assessed during voice review, not standalone items with their own FSRS state
- **Cultural knowledge** — assessed through the pragmatic profile, not flashcards

**Integration:** The `ReviewEvent`, `ItemContextLog`, and mastery state machine already use string-based `itemType` fields. Add `'kanji'` and `'collocation'` to the `ItemType` union. Add optional foreign keys in ReviewEvent. The conversation analyzer prompt needs updating to detect kanji usage and collocation production.

---

## 3. Unified Grading Pipeline

### Current State — The Critical Gap

This is the biggest structural problem in the app:

- **SRS reviews** (`reviews.ts`): User self-grades → `scheduleReview()` → `computeNextMasteryState()` → FSRS + mastery updated
- **Conversation** (`conversation.ts`): Claude grades post-session → updates `targetsHit`, `errorsLogged`, modality counters, `productionWeight` — but **never calls `scheduleReview()` or `computeNextMasteryState()`**
- **Chat**: No grading at all

A learner who consistently fails to produce a word in conversation keeps the same FSRS schedule as if they'd never attempted it. Conversation errors are logged to a JSON blob on `ConversationSession` but never affect the item's scheduling or mastery state. The two assessment systems are completely disconnected.

### Design: `core/grading/pipeline.ts`

All assessment pathways flow through one function:

```typescript
interface GradingInput {
  itemId: number
  itemType: ItemType
  modality: 'recognition' | 'production' | 'cloze'
  learningModality: 'reading' | 'writing' | 'speaking' | 'listening'
  contextType: ContextType
  source: GradingSource
  confidence: number  // 0-1
}

type GradingSource =
  | { type: 'self_grade'; grade: ReviewGrade }         // SRS reviews
  | { type: 'exact_match'; matched: boolean }          // typed production auto-check
  | { type: 'fuzzy_match'; similarity: number }        // typed production fuzzy
  | { type: 'claude_analysis'; grade: ReviewGrade }    // conversation analysis
  | { type: 'stt_comparison'; pronunciationScore: number }  // voice (V2)

function processGrade(input: GradingInput, currentItem: ItemState): GradingResult {
  // 1. Resolve grade from source
  // 2. Apply confidence weighting
  // 3. Update FSRS (calls scheduleReview)
  // 4. Evaluate mastery transition (calls computeNextMasteryState)
  // return { grade, newFsrsState, newMasteryState, masteryChanged }
}
```

**Confidence weighting is critical.** Claude analyzing a conversation transcript is less reliable than a user self-grading a flashcard. The rule:
- Confidence >= 0.8: use grade as-is
- Confidence < 0.7 and grade is "again": downgrade to "hard" (prevents spurious Claude analysis from tanking mastery state)

This means conversation errors will affect scheduling (push the item's next review sooner) without causing catastrophic mastery demotions from a single uncertain analysis.

**Grade resolution by source:**

| Source | again | hard | good | easy |
|---|---|---|---|---|
| self_grade | Direct | Direct | Direct | Direct |
| exact_match | No match | — | — | Match |
| fuzzy_match | < threshold-0.1 | < threshold | >= threshold | >= 0.95 |
| claude_analysis | Failed production | Partial/hesitant | Correct | — |
| stt_comparison | score < 0.5 | score < 0.7 | score >= 0.7 | score >= 0.9 |

**How this fixes the conversation gap:**

In `conversation.ts`, after the post-session analysis produces `contextLogs`, each entry gets fed through `processGrade()`:

```typescript
for (const log of analysis.contextLogs) {
  const result = processGrade({
    itemId: log.itemId,
    itemType: log.itemType,
    modality: log.wasProduction ? 'production' : 'recognition',
    learningModality: log.modality,
    contextType: 'conversation',
    source: {
      type: 'claude_analysis',
      grade: log.wasSuccessful ? 'good' : 'hard',  // note: 'hard' not 'again'
    },
    confidence: 0.75,
  }, currentItemState)

  // Apply FSRS and mastery state updates to the item
}
```

**For SRS production reviews:** The typed answer comparison (`typedAnswer.trim() === item.surfaceForm`) already exists in the review card UI for display purposes. Layer automated grading on top:
1. Compute exact/fuzzy match from typed answer
2. Present as suggestion: "We think this is **Good** — do you agree?"
3. Let user override
4. Send final grade through the pipeline

This preserves learner agency while adding objectivity. Over time, the self-grade override becomes optional.

**For voice (V2):** The grading source changes to `stt_comparison`. Self-grading is impractical during speech — the pipeline handles it automatically.

**Refactor:** The grading logic currently in `reviews.ts` (lines 111-177 for lexical, 191-244 for grammar) gets extracted into `core/grading/pipeline.ts`. The IPC handler becomes a thin wrapper that gathers data and calls the pipeline. `conversation.ts` calls the same pipeline. This is the single most important change — it unifies the two assessment systems.

---

## 4. Voice Conversation Partner

### Current State

CLAUDE.md specifies the V2 pipeline: Mic → STT (gpt-4o-mini-transcribe) → LLM (Claude) → TTS (ElevenLabs Flash) → Speaker. Latency budget: < 1s to first audio. The app currently has `listeningLevel` and `speakingLevel` hardcoded to 0 in `profile/calculator.ts`.

### Design: Voice as a Transport Layer, Not a Separate System

**Principle:** Voice uses the exact same conversation pipeline (plan → converse → analyze) with a voice-specific transport layer and additional grading signals. Do not build a separate voice system.

```
Voice Transport Layer
┌─────────────────┐
Mic ───> │ STT Engine      │──> transcript ──> Same conversation engine
         └─────────────────┘                   (planner, CONVERSATION_SEND,
                                                post-session analysis)
         ┌─────────────────┐
Speaker <── │ TTS Engine      │<── response text <── Same conversation engine
         └─────────────────┘
```

**Voice-specific metrics per utterance:**

| Metric | Source | Purpose |
|---|---|---|
| `sttConfidence` | STT API | Grades pronunciation (feeds into grading pipeline) |
| `pauseBeforeMs` | Audio timing | Detects hesitation (feeds into pragmatic profile) |
| `wordsPerMinute` | STT output | Tracks fluency over time |
| `selfCorrections` | STT restarts | Positive signal — learner catches own errors |
| `detectedLanguage` | STT metadata | Detects L1 intrusion |
| `responseDurationMs` | Audio timing | Response speed for pragmatic analysis |

These feed into the grading pipeline via `stt_comparison` source type and into the pragmatic profile for fluency tracking.

**Real-time vs post-session grading:**

| Signal | Timing | Confidence |
|---|---|---|
| Target item produced (STT match) | Real-time | Medium (STT dependent) |
| Hesitation detected | Real-time | High |
| L1 intrusion | Real-time | High |
| Error analysis | Post-session (Claude) | Medium |
| Register accuracy | Post-session (Claude) | Medium |
| Overall assessment | Post-session (Claude) | High |

Real-time grades are provisional — they update FSRS immediately but Claude's post-session analysis can revise them. This prevents waiting until session end while maintaining accuracy.

**Conversation AI behavior changes for voice mode:**

Add `mode: 'text' | 'voice'` to session plan. When voice:
1. Shorter responses (50-80 words vs 100-150) — voice turns are shorter
2. More discourse markers (えっと、あのう) — model natural speech
3. Slower speaking pace for lower levels — TTS rate adjustment
4. Gentle prompting after 5s silence — don't wait indefinitely
5. Reduce kanji-dependent disambiguation — works in text, not speech
6. Speak at level-appropriate vocabulary and grammar complexity

**Streaming requirement:** The current `CONVERSATION_SEND` handler waits for the full Claude response before returning. Voice needs streaming — feed LLM tokens to TTS as they arrive. The `chat.ts` handler already uses streaming (`chat:chunk` events). The conversation handler needs the same pattern, with chunks going to both the renderer (for transcript display) and the TTS engine.

**Profile calculator update:** Once voice data flows, remove the `listeningLevel = 0` and `speakingLevel = 0` hardcodes. Compute from FSRS retrievability on items with `listeningExposures > 0` and `speakingProductions > 0`, same as reading/writing.

---

## 5. Guided Learning Flows

### Current State

Two modes exist: SRS flashcard drill and free-form conversation with hidden targets. Nothing in between. The Chat page is a raw Claude proxy with no learner profile, no post-session analysis, no DB persistence — completely disconnected from the learning system. There's no way for a learner to say "teach me て-form" or "practice ordering at a restaurant."

### Design: A Flow Engine with Four Flow Types

**Core concept:** A "flow" is a structured learning sequence that produces grading events. All flows feed into the same grading pipeline → FSRS → mastery state machine. Flows are the content engine the app lacks.

**Flow Type 1: Micro-lesson (2-3 minutes, build first)**

The atomic unit. Targets one item or concept:
1. Show item in context (one example sentence)
2. One recognition question
3. One production question
4. Done

Generated on the fly from the review queue and ToM brief. Bridges "nothing to do" and "start a 15-minute conversation." Ideal for items stuck at gates — the micro-lesson creates the production or context evidence needed to unlock promotion.

**Flow Type 2: Drill (5-10 minutes, build second)**

Focused repetition targeting a specific weakness detected by ToM. If the learner confuses は/が, generate 10-15 sentences requiring particle selection.

Steps: `cloze | production | recognition` — all auto-gradeable (exact/fuzzy match). No Claude API call needed during the drill, only for generation.

Drills produce high-confidence grading events with full production weight. This directly solves the "stuck at apprentice_4" problem for items that need production evidence but don't naturally arise in conversation.

**Flow Type 3: Scenario (10-15 minutes, build third)**

Structured roleplay with defined context and goals:
- "You're at an izakaya. Order drinks and food for two."
- "Your coworker invites you to a nomikai. Decline politely."

Uses the conversation engine with a more structured system prompt that includes the scenario definition and evaluation rubric. Post-session analysis evaluates against the scenario goals, not just general targets.

**Flow Type 4: Lesson (15-20 minutes, build last)**

Full structured lesson: concept → explanation → examples → guided practice → test.

Generated by Claude from a template + target items + learner level. Avoids hand-authoring hundreds of lessons.

Steps: `explain → example → example → cloze → production → guided_conversation(3 turns)`.

**Flow generation:**

Flows are not hand-authored. Claude generates them from templates:

```typescript
// core/flows/generator.ts
async function generateFlow(
  type: FlowType,
  targetItems: TargetItem[],
  learnerLevel: string,
  tomBrief: ExpandedTomBrief
): Promise<FlowDefinition>
```

Each flow step that requires learner input produces a `GradingInput` → grading pipeline → FSRS + mastery. The knowledge model treats flow evidence identically to SRS and conversation evidence.

**Fix Chat:** Transform the Chat page from a disconnected proxy into a profile-aware practice space:
1. Add system prompt with learner profile summary (level, known items, weaknesses)
2. Run lightweight per-message analysis (not full post-session)
3. Log `ItemContextLog` entries for items the learner uses
4. Persist conversations to DB (currently only in React state)

Minimal change: add a system prompt in `chat.ts` + per-message lightweight analysis. Chat stops being an island and becomes another data source.

---

## 6. Additional Issues to Fix

### Assessment Asymmetry (Critical — fix first)

Already covered in section 3. After implementing the grading pipeline, the `conversation.ts` end handler calls `processGrade()` for each context log entry. ~20 lines of change in the IPC handler. This is a correctness bug, not a feature request.

### Introduced-but-Stuck Items

Items created from conversation are set to `introduced` with initial FSRS state but nothing auto-promotes them to `apprentice_1`. The only path is manual addition through the word bank.

Fix: During review queue computation, auto-promote items that have been `introduced` for 3+ days and have at least one context log entry. They enter the queue as `apprentice_1` with `due = now`.

### No Compositional Tracking

Individual items are tracked but not the ability to combine them. Knowing word A and grammar B doesn't track the ability to produce sentence AB.

Extend `ItemContextLog` with an optional `coOccurringItemIds: Int[]` field. Update the conversation analyzer prompt to detect when multiple target items appear in the same utterance. Add a `detectCompositionalGap` function to the ToM analyzer: "Learner knows X and Y independently but has never combined them."

### Curriculum Sequencing

The recommender scores items independently with no thematic coherence. Add a `semanticDomain` field to reference corpus items (food, travel, school, work). After scoring, cluster recommendations so items in the same domain are taught together.

---

## Priority Ordering

**Phase 1 — Fix what's broken (patch, ~1-2 weeks):**
1. Grading pipeline (`core/grading/pipeline.ts`) — extract from reviews.ts, call from conversation.ts
2. Auto-promote introduced items after 3 days
3. Structured error taxonomy in conversation analyzer prompt
4. Give Chat a learner-aware system prompt + persist conversations

**Phase 2 — Core expansion (~3-4 weeks):**
5. StudySession table + temporal analysis in ToM
6. KanjiItem model with component-of relationships
7. Micro-lessons and drills (simplest flow types)
8. Profile calculator extensions (learningVelocity, measuredRetention)

**Phase 3 — Voice (V2, ~6-8 weeks):**
9. Voice transport layer (STT/TTS integration)
10. Voice grading (STT comparison, hesitation detection)
11. Streaming conversation handler
12. Scenario flows

**Phase 4 — Depth (ongoing):**
13. CollocationItem model
14. Full lesson flows
15. Compositional tracking
16. Thematic curriculum clustering
17. Long-term learning velocity trending

---

## Key Architectural Decisions

1. **One grading pipeline, many sources.** Every assessment — self-graded, auto-graded, Claude-analyzed, voice-analyzed — flows through the same `processGrade()` function. This is the single most important design decision.

2. **Confidence weighting prevents bad demotions.** Low-confidence grades (Claude guessing, fuzzy match near threshold) are capped — they can push items to review sooner but can't cause catastrophic mastery drops.

3. **Flows are generated, not authored.** Claude generates lesson/drill/scenario content from templates + learner state. No hand-authored content library to maintain.

4. **Voice is a transport layer.** Same conversation engine, same planning, same analysis. New inputs (audio timing, STT confidence), but same pipeline.

5. **Profile richness comes from computation, not storage.** Don't ask the learner about their learning style. Measure their behavior and compute what works for them.
