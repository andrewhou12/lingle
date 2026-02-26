# LINGUIST
## Full-Stack Language Learning
### Working Product Vision · v2.1
### February 2026

---

## 1. What We Are Building

Linguist is a full-stack language learning system. Not a flashcard app with a chatbot bolted on. Not a conversation partner that forgets you between sessions. A complete, integrated system that covers every dimension of language acquisition — input, explicit instruction, vocabulary retention, grammar internalisation, production practice — and makes them work together rather than in isolation.

The organizing principle is simple: the learner has a persistent knowledge state, and everything in the product reads from it and writes to it. Every flashcard review, every conversation turn, every native clip watched — all of it updates the same underlying model of what the learner knows. The system uses that model to decide what the learner encounters next, at what difficulty, in what format, with what support.

The goal is not to be the best flashcard app, or the best conversation partner, or the best input platform. The goal is to be the only tool a serious language learner needs — because it does all of it, and because each part makes the others better.

### The Five Dimensions of Acquisition

Every learner needs all five of these to achieve real fluency. Every existing product covers at most two. Linguist covers all five.

- **Comprehensible Input:** Exposure to how the language actually sounds and flows — native conversations, real media, authentic text — calibrated to be just above the learner's current level.
- **Explicit Instruction:** Structured introduction of vocabulary and grammar patterns with clear explanation, example, and immediate practice.
- **Retention:** Spaced repetition that keeps learned items in long-term memory with the minimum review overhead required.
- **Production Practice:** Actual use of the language in communicative contexts — not fill-in-the-blank, but real generative output under natural pressure.
- **Cumulative Density:** Every session builds on everything previously learned. Known vocabulary and constructions appear constantly in new contexts. Nothing is learned and filed away — everything is alive and in continuous use.

---

## 2. The Knowledge Model

The knowledge model is the product's core data structure. Everything reads from it; everything writes to it. It is the primary moat — a learner who has used Linguist for six months has a detailed, accurate, deeply personalised model of their competence that no other product can replicate or import.

### What It Tracks

**Lexical State**
Every word, phrase, and character the learner has encountered, with two separate FSRS tracks: recognition (can they identify this item when they see it?) and production (can they generate it correctly?). Recognition almost always precedes production mastery, so they are scored and scheduled independently. Additional fields per item: modality coverage (reading / listening / speaking), context breadth (how many different contexts has it appeared in), and production count (how many times has the learner generated it in open conversation).

**Grammatical State**
Every grammar construction tracked across four dimensions: recognition, comprehension under time pressure, production in drills, and spontaneous transfer in conversation. A grammar pattern is not considered mastered until the learner has produced it spontaneously in open conversation — not just in a controlled exercise.

**Construction and Chunk State**
Beyond individual words and grammar rules, the system tracks multi-word chunks: collocations, fixed phrases, sentence-final expressions, idiomatic patterns. These are tracked as units, not decomposed into their parts. A learner who knows 食べる, の, and 好き individually may not yet control 食べるのが好き as a natural production unit. The system tracks this distinction and targets chunks explicitly once their component parts are consolidated.

**Pragmatic and Register State**
The hardest layer. Tracks whether the learner controls register (casual vs. polite vs. formal), whether they slip into the wrong register under pressure, whether they have avoidance patterns in specific social contexts, and how their conversational repair strategies are developing. This layer is updated exclusively from conversation evidence.

**Modality Gap**
Continuous comparison of estimated proficiency across reading, listening, and speaking/writing production. The system detects when one modality significantly lags the others and triggers targeted remediation.

### The Mastery State Machine

Every lexical item and grammar construction moves through the same state machine. The critical rule: production evidence from open conversation gates advancement to Journeyman and above. Flashcard recognition alone cannot advance an item beyond Apprentice IV.

- **Unseen** — Not yet encountered.
- **Introduced** — Seen once in context (conversation, lesson, clip). Not yet in SRS rotation.
- **Apprentice I–IV** — In active SRS rotation. Short intervals (1–10 days). Recognition track active.
- **Journeyman** — Consistent recognition. Production drills begin. Requires at least one production event in conversation before this tier unlocks. Intervals 10–30 days.
- **Expert** — Recognition and production stable. Context history tracks the range of situations in which the item has been produced. Transfer challenges begin. Intervals 1–3 months.
- **Master** — Stable across all modalities and at least 3 distinct context types. Intervals 3–12 months.
- **Burned** — Correct recall after 4+ months. Removed from active rotation. Still used as a generation resource in all content.

Burned items are not retired. They are the foundation. Every piece of content the system generates — conversations, lessons, clips, flashcard example sentences — is required to use high-confidence (Expert/Master/Burned) vocabulary at 65–70% of running words. The learner's accumulated knowledge is always visible in what they read and hear.

---

## 3. The Activity Model

> **Design principle:** The learner chooses what to do. The system chooses what's inside it.

Previous versions of this document described a fixed sequential pipeline (review → input → conversation → lesson). That approach guarantees coverage of all learning dimensions but creates a rigid, class-schedule experience that discourages daily use. A 35–50 minute mandatory session means skipped days, and skipped days kill the learning model.

Instead, Linguist presents a **flexible activity model** where conversation is the gravitational center, other activities exist as support infrastructure, and the knowledge model ensures the right items get coverage regardless of which path the learner takes.

### The Home Screen

The home screen surfaces one primary action and smart side offerings:

> **"Yuki is waiting. Today's challenges: use ~てから, try a polite negative."**
>
> Below that: "15 items due for quick review" · "New clip: workplace conversation" · "Lesson 12 ready"

The learner can jump straight into conversation, do a quick flashcard warmup first, watch a clip, or start a lesson. Their choice. The minimum viable session is a single conversation — even 10 minutes updates the knowledge model meaningfully.

### How Each Dimension Gets Covered

| Dimension | Primary Surface | Secondary | Notes |
|---|---|---|---|
| Retention (apprentice tier) | Flashcard reviews | — | Raw reps for items still building basic recognition |
| Retention (journeyman+) | Session conversation | Flashcard fallback | Conversation production = highest-weight FSRS evidence |
| Kanji / reading | Dedicated kanji track | — | Visual pattern matching; conversation cannot teach this |
| Production | Session conversation | Free practice mode | |
| Input | Standalone native feed | Referenced in conversation | Low-commitment browsing, items logged to word bank |
| Instruction | Mastery-gated lessons | — | Triggered by system when prerequisites are met |
| Free exploration | Free practice mode | — | Learner's sandbox, no targets or plans |

### Adaptive Coverage Over a Rolling Window

The tradeoff of flexibility is that some dimensions may get neglected. The system handles this through **nudges over a rolling window** rather than daily enforcement:

- If the learner hasn't done any input in a week, surface it more prominently on the home screen.
- If review debt is growing, the conversation agent prioritizes those items harder as targets.
- If the kanji track is falling behind relative to vocabulary, prompt the learner to do a quick kanji session.
- The system tracks dimension coverage over 7-day and 30-day windows and adjusts recommendations accordingly.

The intelligence is in how the system compensates for the learner's actual behavior, not in enforcing ideal behavior.

---

## 3.1 The Kanji Track

Kanji recognition is fundamentally different from vocabulary and grammar acquisition. It is **visual pattern matching** — the learner must see the character, recall its readings and meanings, and build associations between components. Conversation cannot teach this. You could talk to a character for a year and never learn to distinguish 持 from 待 from 特.

Linguist needs a dedicated kanji/reading track that runs parallel to everything else, with its own SRS schedule. This track is not part of the conversation loop — it's its own activity.

**Open question:** Should Linguist build a full kanji learning system (similar to WaniKani's radical → kanji → vocabulary progression), or integrate with existing tools via API and focus engineering effort on the parts no one else does well? The build-vs-integrate decision has significant scope implications for V1.

**If built in-house:**
- Radical → kanji → vocabulary dependency chain
- Separate SRS queue for kanji recognition
- Mnemonics and component breakdowns
- Integration with the main knowledge model (kanji mastery gates vocabulary items that use those kanji)

**If integrated (e.g., WaniKani API):**
- Sync learner's kanji state from external tool
- Use synced state to inform vocabulary introduction (don't introduce vocabulary with unknown kanji)
- Focus Linguist's engineering on conversation, curriculum, and the knowledge model

---

## 3.2 Native Input

### Purpose

Expose the learner to how the target language actually sounds and flows — the register variation, the ellipsis, the prosody, the incomplete sentences, the filler words — in a way that is calibrated to their current level and actively feeds the knowledge model.

### The Problem With Existing Input Tools

Existing input tools (Language Reactor, NHK Web Easy, graded readers) treat input as passive consumption. You watch, you look things up, nothing is connected to your learning history. Linguist's input layer is the opposite: every word encountered is checked against the learner's word bank, every unknown word is logged, the content selection is driven by the 98% comprehension threshold, and the vocabulary encountered feeds the SRS queue.

### Content Types

**Curated Native Clips**
Short (60–180 second) excerpts of real native conversation — drama scenes, variety show moments, vlog exchanges, podcast dialogue. Not textbook dialogue. Not scripted teaching content. Real speech, with all the features real speech has: overlapping turns, sentence-final particles, vague reference, ellipsis, casual contractions, regional expressions.

Each clip has an interactive transcript. Tapping any word gives definition, reading, and a note on usage register. Tapping any phrase gives a chunk-level breakdown. Words and phrases tapped are logged to the word bank as low-confidence ambient encounters and scheduled for SRS entry. The clip is scored against the learner's word bank before being surfaced — only clips where the learner knows 90%+ of the vocabulary are shown, ensuring comprehension is sufficient for acquisition.

**AI-Generated Mini-Dramas**
Short (4–10 line) exchanges generated against the learner's current knowledge model, designed to demonstrate authentic conversational patterns at the learner's exact level. The critical design constraint: these must sound like real people, not textbooks.

> A: ねえ、昨日のあれ見た？
> B: え、何？
> A: だから、田中さんのやつ。
> B: あー、見た見た。ありえないよね。
> A: でしょ。なんであんなことするんだろ。

The above exchange teaches nothing explicitly. It shows: pro-drop, vague reference (あれ, やつ), sentence-final particles (よね、でしょ), the repetition pattern (見た見た) used for strong confirmation, and the rhetorical question form (~んだろ). A learner who absorbs this as a unit knows something a textbook learner does not. Generated mini-dramas target these authentic patterns deliberately, using vocabulary from the learner's Apprentice and Journeyman tiers embedded in natural-sounding exchanges.

**Register Variation Pairs**
The same exchange generated in two registers — casual and polite — shown side by side. The learner sees concretely what changes when you shift register. This is more effective than explaining register in the abstract, and it is the primary mechanism for preventing learners from getting locked into one register permanently.

### Primary Surface: Standalone Feed

Native input lives as a **standalone browsable feed**, not a prerequisite to conversation. The learner can scroll through clips and mini-dramas on the train for 5 minutes — a low-commitment touchpoint that keeps the app useful even without time for a full conversation.

### Secondary Surface: Conversation Bridge

Occasionally the conversation agent references content from the input feed — "did you see that clip about X?" — creating a natural bridge between passive input and active production. This is a light touch, not a required flow.

---

## 3.3 Curriculum and Lessons

### Architecture

The curriculum is a directed dependency graph, not a linear sequence and not fully generative. The graph structure — which items must be mastered before others can be introduced — is hand-curated from frequency lists, JLPT-aligned grammar progressions, and validated linguistic dependency research. The AI generates the content that teaches each node; it does not determine the order.

This distinction matters. A fully AI-generated curriculum produces fluffy, inconsistent ordering. A rigidly fixed curriculum (WaniKani, Duolingo) cannot adapt to individual gaps. The hybrid — fixed dependencies, AI-generated content, mastery-gated unlocks — gets both: correct ordering and dynamic content.

### Lesson Trigger

Lessons are **mastery-gated and system-triggered.** A lesson is generated when three conditions are met:

1. The learner's Apprentice queue is below threshold (fewer than 25 active items)
2. Their current-level items are stable (average R above 0.85)
3. The next curriculum node's prerequisites are all at Journeyman or above

The learner does not request lessons — the system surfaces them when ready. The learner cannot skip ahead. This is one place where rigidity is correct: it prevents the "I'll just move on" impulse that leaves gaps.

However, lessons are **pull-based from the learner's perspective.** The system says "a new lesson is ready" on the home screen. The learner chooses when to do it. It is not injected into a mandatory daily sequence.

### Lesson Structure

Each lesson is a generated artifact — a readable document, not an interactive session. It takes 20–30 minutes and contains the following sections in order:

- **Hook dialogue:** 8–12 lines of conversation in an interest-matched scenario. Written entirely within the learner's known vocabulary plus the 2–3 new patterns being introduced. The new patterns appear highlighted. The learner reads with near-full comprehension; the new items stand out against a familiar background.
- **Pattern breakdown:** Plain-language explanation of each new grammar pattern. Not academic description — practical framing with examples using only known vocabulary. Grammar is the only variable.
- **Vocabulary introduction:** 8–12 new items shown in sentence context first, never in isolation. Each sentence uses known grammar so vocabulary is the only new element. Items enter SRS rotation staggered after lesson completion (3–4 per day), never in bulk.
- **Chunk introduction:** 3–5 multi-word constructions or fixed expressions that use the lesson's new vocabulary or grammar in natural combinations. Shown in context, not as a list. Tracked as chunk items in the knowledge model.
- **Production exercises:** 6–10 sentence construction prompts. Not multiple choice. The learner must produce the form. These count as weak production evidence and update the grammar item's state.
- **Closing dialogue:** Same scenario as the hook, 12–16 lines, using the new patterns more extensively. Functions as a comprehension check without feeling like a test.

### Content Personalization

Scenario and character choices are driven by the learner's interest profile. Two learners at the same curriculum node get structurally identical lessons with completely different surfaces. The grammar taught is identical. The characters, scenario, and example sentences are generated against the learner's stated interests. This is real personalization: the learning content feels like it was made for this person.

---

## 3.4 SRS Review Engine

### Philosophy

Reviews maintain retrievability for items the learner has not recently used in context. They are not the primary evidence of mastery. They are the safety net — what catches items that are decaying without conversational reinforcement.

**Critical split:** Flashcard reviews are the right tool for **apprentice-tier items** where the learner is still building basic recognition. Raw reps are genuinely the most efficient approach here — the overhead of engineering a conversation around a word you've seen 3 times is too high. For **journeyman+ items**, conversation is the primary retention mechanism, with flashcards as a fallback for items that haven't come up in conversation recently.

### The Unified Evidence Model

Flashcard reviews and conversational production are not two separate systems. They are two input channels into the same FSRS state machine, with different evidence weights:

- **Spontaneous correct production in conversation:** Highest weight. Counts as an Easy response in FSRS terms. Pushes next interval out significantly.
- **Correct production under conversational elicitation:** High weight. Counts as a Good response.
- **Correct recognition flashcard review:** Medium weight. Updates recognition track only.
- **Correct production in cloze or fill-in-the-blank drill:** Low weight. Small positive delta on production track.
- **Avoidance in conversation:** Negative signal. Suppresses production state even when flashcard performance is strong.

The practical consequence: a learner who uses a word correctly twice in conversation this week does not need a flashcard review for that word this week. The conversation already provided stronger evidence. The review queue self-drains for active learners. The queue only grows for items not recently encountered in context.

### Session Design

The daily queue is capped at 20–25 items regardless of how many are technically due. Overdue items beyond the cap are folded into conversation targets rather than piling up as flashcard debt. The review interface shows a progress indicator counting down to zero so the session always feels completable.

Each flashcard shows not just the item but a context sentence — ideally a sentence from a conversation the learner actually had. The review is a memory of a real exchange, not an abstract drill. After the review session ends, the transition to conversation is suggested but not enforced.

### Review Types

- **Recognition review:** Show the item; recall meaning and reading.
- **Production review:** Show the English/L1 equivalent; produce the L2 item. Graded separately from recognition.
- **Cloze review:** Sentence with the target item blanked. Fill in the blank.
- **Chunk review:** Show the first word of a tracked chunk; complete the full expression.

---

## 3.5 Conversation Partner

### The Core Bet

The conversation partner is where Linguist creates its sharpest differentiation. Unlike any existing product, the agent enters every session having read the learner's full knowledge state and generated a structured plan. It knows exactly what to target, what to avoid breaking, what to let go, and what to push on. The learner experiences this as a conversation that somehow always puts them in exactly the right productive struggle.

### Two Conversation Modes

**Session Conversation (with characters, planned, targets, storyline)**

The core learning loop. Character-driven, format-rotated, plan-driven conversation with persistent characters. The system engineers natural opportunities for the day's targets. This is the mode that updates the knowledge model most aggressively.

**Free Practice (no targets, no plan, learner-directed)**

A separate mode where there is no session plan, no hidden targets, no post-session analysis updating the knowledge model. Just the learner and a conversation partner, practicing whatever they want, with corrections and help.

This solves a real problem: the planned conversation is powerful but it is the system's conversation, not the learner's. Sometimes you want to practice ordering at a restaurant because you're going to Japan next week, not because the curriculum says so. Sometimes you just want to try expressing an idea in Japanese and see what happens.

Free practice mode still passively logs evidence to the knowledge model (correct production is still data), but it does not drive the session or engineer contexts. It is purely reactive.

### Pre-Session Planning (Session Conversation only)

Before each session, a planning call reads the learner profile and outputs a structured session plan:

```
target_vocabulary: [疲れる, 予定, 締め切り]  // due for review + not yet produced in conversation
target_grammar: [〜てから]  // near-miss last session, escalate
avoidance_probe: [〜ません]  // 5th session flagged, high priority
scenario: Yuki just got exam results back — she's in a mood
agent_register: casual (だ/だよ)
difficulty: N4+
must_elicit: [〜てから, ません]
introduce_if_natural: [締め切り]
```

This plan is a hidden instruction layer. The learner never sees it. From their perspective, they are just talking to Yuki.

### Visible Challenge Layer (Session Conversation only)

The system shows the learner a small challenge card at the top of the conversation interface:

> Today's challenges: Use ~てから at least once · Use a polite negative (~ません) · Stretch: try て-form chaining

These are framed as challenges, not instructions. The learner knows what they are aiming for. Completed challenges get a checkmark in real time. This turns the session from "talk to an AI" into "talk to an AI while hitting these targets" — a game with meaningful stakes rather than an open-ended exercise that goes nowhere.

### Character Design and Storyline

Every session conversation happens with a named, persistent character with a real personality. Not a neutral assistant. Yuki has opinions, things she finds boring, a specific sense of humor, ongoing situations in her life that continue across sessions. She started a new part-time job last month. She is stressed about her thesis. She had a disagreement with her roommate. Her storyline evolves session to session, seeded from the previous session's closing notes.

This matters for two reasons. First, it creates genuine communicative investment — the learner responds to something real, not a generic prompt. Second, it enables the agent to recycle vocabulary and constructions from past sessions naturally: "hey, you mentioned a deadline at work last week — did that work out?" The word 締め切り comes back in a new context. Cross-context production of the same item is the mechanism that cements long-term retention.

### Multiple Characters, Multiple Dynamics

Learners should encounter at least three distinct characters with different relationship dynamics:

- **Peer (e.g. Yuki):** Casual register, relaxed conversational style, the core daily character.
- **Senior figure (e.g. a professor, boss, or family elder):** Requires polite register, careful formality, very different production demands.
- **Fast/slangy speaker:** Targets listening comprehension specifically — speaks quickly, uses contractions and colloquialisms, requires the learner to process under pressure rather than just produce.

### Session Format Rotation

Not every session is a free chat. Rotating formats prevent the experience from becoming predictable:

- **Catch-up chat:** Standard open-ended conversation. Character follows up on the learner's life.
- **Drop-in scenario:** Learner is placed mid-situation with no preamble — already at a convenience store counter, already in a meeting, already in an argument. Immediate communicative pressure.
- **Story mode:** Character tells the learner something that happened. Learner's job is active listening — backchanneling, reacting, asking follow-up questions. Targets listening and responsiveness rather than production volume.
- **Cooperative task:** Learner and character must accomplish something together — plan an event, resolve a scheduling conflict, decide something. Information gaps create natural communicative necessity.
- **Debate/opinion mode:** Character takes a position. Learner must argue the other side. Forces opinion language, conditional structures, disagreement vocabulary.

### Error Handling

Errors are handled differently depending on their type:

- **Minor errors that don't impede understanding:** Recast in the next agent turn without interruption. The learner absorbs the correct form; the conversation continues.
- **Errors that cause genuine confusion:** The agent reacts as a real person would — "ん？どういう意味？" — prompting repair without stepping out of character.
- **Errors on today's challenge items:** The agent gives the learner a second shot — "あれ、もう一回言って？" — without explaining why.
- **Complete vocabulary gaps:** An escape hatch button in the UI lets the learner type what they want to say in English and receive the Japanese. The lookup is logged as a gap event. The session continues without shame or interruption.

### Post-Session Processing

After each conversation, a structured processing call analyzes the transcript against the session plan and generates:

```
targets_hit: [〜てから ×2 (spontaneous), 疲れる ×1 (elicited)]
targets_missed: [ません — avoided twice, collapsed to ない]
errors_logged: [{item: 予定, error: particle selection, count: 1}]
chunks_produced: [食べてから, 時間がありません (post-recast)]
new_words_encountered: [締め切り (introduced naturally), 都合]
character_note: Yuki mentioned exam results — follow up next session
tom_updates: {ません avoidance: session 6, escalate to drop-in scenario next time}
```

This structured output updates the learner profile. The transcript is stored and compressed into the character's episodic memory. The ToM engine reads the output and updates the daily brief for next session.

---

## 4. The Daily Experience

> **Previous approach (v2.0):** A fixed 35–50 minute sequential pipeline: review → input → conversation → lesson. Every day, same order.
>
> **Current approach (v2.1):** A flexible home screen with smart recommendations. The learner picks what to do. The system ensures coverage over time.

### What the Learner Sees

The app opens to a home screen that surfaces the day's most valuable activities:

1. **Primary action:** A conversation with their character, with today's challenges displayed. Always available, always the centerpiece.
2. **Quick review:** N items due for flashcard review (apprentice-tier). Short, completable, optional on any given day.
3. **Kanji track:** If applicable, a short kanji review session from the dedicated track.
4. **Input feed:** Clips and mini-dramas scored to their level. Browsable anytime.
5. **Lesson ready:** When the system determines prerequisites are met. Pull-based — the learner chooses when.
6. **Free practice:** Always available. No targets, no plans, just conversation.

### Time Flexibility

- **5 minutes:** Quick flashcard review, or browse a clip in the input feed.
- **10 minutes:** One conversation with Yuki. Knowledge model still updates meaningfully.
- **20 minutes:** Review warmup + conversation. The "standard" daily session for most learners.
- **30–40 minutes:** Review + conversation + input browsing or a lesson. The "full" session.
- **Anytime:** Free practice. No time commitment, no structure.

The system tracks what the learner actually does and adjusts recommendations. If someone consistently skips reviews, the conversation agent folds those items into targets more aggressively. If someone does reviews but skips conversation, the system nudges toward production practice. The intelligence is in how the system compensates, not in enforcing a sequence.

### The Learner's Felt Experience

"I opened the app, saw Yuki had a challenge for me, jumped straight into conversation. The conversation naturally used words I'd been studying. I hit 2 of 3 challenges. Afterward I scrolled through a couple clips while waiting for the bus. Tomorrow I'll try for all three challenges and maybe do that lesson that's been sitting there."

---

## 5. Cumulative Density — The Experience Building on Itself

This is the dimension that separates Linguist from everything else at a fundamental level. Every other product teaches items and files them away. Linguist treats everything the learner has ever learned as active material — always available, always in use, always being extended into new contexts.

### The Vocabulary Density Contract

Every piece of content the system generates — conversation turns, lesson dialogues, flashcard example sentences, mini-dramas, clip selections — is generated against a hard constraint on vocabulary distribution:

- 65–70% of running words must come from the learner's Master or Burned tier — their fluent foundation
- 15–20% from the Expert tier — recently consolidated, being reinforced in new contexts
- 10–15% from Apprentice and Journeyman — the active learning frontier
- 2–5% maximum genuinely unknown — one or two new things per interaction

If generated content doesn't meet these proportions, it is regenerated. This is a concrete, implementable quality check on every content generation call. It ensures that the learner's accumulated knowledge is always visible in what they encounter — the new item always stands out against a familiar background, which is the precondition for acquisition.

### Chunks and Constructions as First-Class Citizens

Individual words are only part of what needs to be learned. Natural language production depends heavily on chunks — multi-word units that are retrieved and produced as wholes rather than assembled from parts. 食べるのが好き, ありがとうございます, ~てもらえますか, なんか~みたいな — these are not assembled by grammar rules in the moment of production. They are stored and retrieved as units.

Linguist tracks chunks explicitly alongside individual vocabulary items. Once a chunk's component words are at Journeyman or above, the chunk is introduced in context — first in input (clips, mini-dramas), then in lessons, then targeted in conversation. The mastery state machine applies to chunks exactly as it does to individual items. Production of a full chunk in conversation is the highest-value evidence event in the system.

### The Agent's Long Memory

The conversation agent does not start fresh each session. It reads a compressed but semantically rich episodic memory of past conversations: topics discussed, vocabulary used successfully, situations that came up, the character's ongoing storyline, notable moments. This gets injected into every session's system prompt alongside the knowledge model.

This enables deliberate vocabulary recycling across sessions. If the learner used 締め切り for the first time two weeks ago, Yuki can bring it back in a completely different context — mentioning a submission deadline for a club she's in. The learner produces it again, in a new context, building the context breadth that cross-context production of the same item is the mechanism that cements long-term retention.

The learner experiences this as a relationship with a character who remembers them. The system benefits from this as a precision instrument for cross-context consolidation. Both are true simultaneously.

### Rising Linguistic Surface Over Time

As the learner's Master and Burned vocabulary expands, the baseline of every conversation rises. The vocabulary density contract means that a session at month six produces richer, more idiomatically dense content than a session at week one — not because the system switched modes, but because the learner's known vocabulary horizon has expanded and the generation constraint naturally produces denser content against it.

Yuki sounds more like a real person at month six than she did at week one. Not because the character changed. Because the learner can now handle a more linguistically rich version of her, and the system always generates exactly what the learner can handle plus one tier more.

This is the compounding effect. The product becomes a measurably better product for each individual learner the more they use it — better calibrated, richer content, more targeted interventions — in a way that is specific to their exact learning history and nobody else's.

---

## 6. High-Leverage AI Personalization

Interest-based surface personalization — giving a gaming fan a dungeon scenario and a cooking fan a recipe scenario for the same grammar lesson — is low leverage. The learner notices it once and then it becomes background noise. It does not change learning outcomes.

High-leverage personalization is different. It asks: what does this learner's brain need right now, given exactly what it knows and what it is currently consolidating? The answer requires the knowledge model. And the answer produces measurably faster acquisition.

### The Five High-Leverage Interventions

**1. Productive Confusion Detection**
When the learner shows high latency, false starts, or approximation while reaching for a specific item mid-conversation, that is the highest-leverage moment to intervene. Not in a lesson three days later. Right now, in the next agent turn, with a brief targeted note and an immediate second attempt. The retention from this sequence — struggling, receiving targeted input, immediately retrying — is orders of magnitude better than a scheduled review.

**2. Failure Mode Classification**
Wrong answers have structure. The ToM engine classifies each recurring error into one of four types and prescribes the matching intervention: confusion pair → disambiguation with minimal pairs; isolation-only mastery → conversation pressure drills; register lock → deliberate register-switching exercises; avoidance → scenario engineering that makes avoidance structurally impossible.

**3. Modality Gap Correction**
If listening comprehension lags reading comprehension by more than one curriculum level, the system generates a remediation sprint: conversation sessions biased toward listening-heavy formats, content pipeline prioritising clips containing current Apprentice items in audio form. The learner does not see a diagnostic — they just notice the app surfacing more listening content this week.

**4. Forgetting Curve as Real-Time Trigger**
If a set of items drops below R = 0.70 between sessions (the learner missed two days), they are inserted into the next conversation session as high-priority targets rather than piling up in the review queue. The learner does not see "47 overdue reviews." They just have a conversation where those items naturally come up.

**5. Transfer-Readiness Detection**
When an item reaches Expert mastery but its context history contains fewer than three distinct context types, it is flagged transfer-ready. The agent engineers a scenario that differs meaningfully from the item's existing context history — a higher-stakes situation, a different relationship, a different register. Successful production in the new context advances the item toward Master and prevents shallow mastery that only works in the original learning context.

---

## 7. UX Principles

### Invisible Intelligence, Human Surface
The learner should never think about the knowledge model, the FSRS schedule, the ToM engine, or the session plan. They should think: Yuki remembered what I told her last week. The conversation was hard in exactly the right way. I can't believe I just said that correctly. The intelligence runs silently; the human experience is what the learner sees.

### Progress That Is Felt, Not Just Measured
Progress in language learning is invisible until it suddenly is not. The product's job is to make the invisible visible — but in human terms, not metric terms. Not "your production rate increased 12%." Instead: "Six months ago this article would have been mostly incomprehensible. Today you know 94% of the words. Here are three sentences you can now read fully that you could not have read in October." The learner sees the delta. They feel the growth.

Specific mechanisms: the comprehension delta display (score any content against the learner's word bank at two points in time), the conversation replay feature (read a transcript from week one next to a transcript from month three), the 30-day proof report (five real sentences from native content now fully comprehensible to this learner, shown side by side with the same sentences as they would have appeared at the learner's level one month ago).

### The Reviews Feel Like Proof
Reframe the review session explicitly. Not "you have 20 items due." Instead: "These are 20 things your brain has been consolidating since last week. Let's confirm they stuck." After the session: "18 of 20 correct. Those 18 items are now scheduled further out — your brain is holding them." The learner watches their own memory being built, not completing assigned exercises.

### Mistakes Are Normal and Productive
The interface should treat errors as information rather than failures. No red X, no lost hearts, no shame mechanics. After a conversation where the learner made three errors: show them the errors in the post-session summary, explain briefly what each error reveals, name them as tomorrow's targets. An error today is a challenge tomorrow. The system is learning about the learner and responding. That framing is motivating; punishment is not.

---

## 8. Build Priorities

### V1 — The Core Loop

Goal: prove the knowledge model works. A motivated learner should want to use this daily for 30 days.

- Learner onboarding: conversational placement test that infers level from production, not multiple choice
- Word bank with FSRS scheduling, recognition and production tracks, mastery state machine
- SRS review engine: recognition, production, cloze review types. Daily queue capped at 20–25
- Text-based conversation partner with pre-session planning, visible challenge layer, post-session processing
- **Free practice mode:** unstructured conversation for learner-directed practice with corrections
- Persistent character with serialized storyline across sessions
- Basic ToM engine: avoidance detection, confusion pair detection, daily brief generation
- Vocabulary density contract enforced on all generated content
- **Flexible home screen:** conversation-centered, with review / input / lesson as optional activities
- Post-session summary with challenge completion, errors named, next day's targets
- **Basic kanji track** (recognition flashcards for kanji, or integration with external tool — decision TBD)

### V2 — Content and Input

- Native input layer: curated clip library scored against word bank, interactive transcripts
- Standalone input feed (browsable, low-commitment, logs encounters to word bank)
- Generated mini-dramas for authentic pattern exposure
- Lesson engine: curriculum dependency graph, chapter generation, staggered SRS entry
- Chunk tracking: identification, introduction, production evidence
- Advanced ToM: failure mode classification, modality gap analysis
- Multiple characters: peer, senior figure, fast speaker
- Session format rotation: drop-in scenarios, story mode, cooperative task, debate
- 30-day proof reports and comprehension delta display
- Full kanji track (if not built in V1)

### V3 — Immersion and Scale

- Voice conversation mode
- Transfer-readiness detection and context history tracking
- Productive confusion detection from real-time latency signals
- Multi-language support (Korean, Mandarin)
- Community content: shared vocabulary lists, shared clip libraries

---

## 9. Open Questions

- **Kanji track: build or integrate?** Building a full kanji learning system (radical → kanji → vocabulary) is a significant engineering effort. Integrating with WaniKani or similar via API lets Linguist focus on its differentiators. The decision affects V1 scope substantially.

- **Chunk identification:** How does the system identify which multi-word sequences to track as chunks vs. decompose into individual items? Frequency-based extraction from a native corpus is the likely answer, but the threshold requires validation.

- **Conversational placement test design:** A 10-minute generative conversation that infers JLPT level from what the learner produces. The inference model needs validation against known-level learners.

- **Production grading:** How to handle near-misses, acceptable variants, and partial credit in both typed and spoken production without binary right/wrong. Needs a rubric.

- **Curated clip sourcing and rights:** The clip library requires real content. What is the licensing strategy? NHK Web Easy (openly available), public domain content, and licensed clips via partnership are three different paths with very different build timelines.

- **Cold start experience:** New users with empty word banks get no immediate value from the knowledge model. The first-week experience needs to be compelling before the model is rich enough to feel magical. Explicit user communication: "Linguist is building a model of you. After 10 sessions it will start to feel different."

- **Context window management:** A rich learner profile for a 12-month learner can exceed 50,000 tokens. Tiered profile injection strategy (full detail on active items, summarized state for Expert/Master/Burned, aggregate statistics for inactive categories) needs validation at scale.

- **Character burnout:** Even well-designed characters may become stale after 200+ sessions. How does Yuki's storyline evolve without feeling artificial? Does the cast expand over time? Is there a natural arc and resolution?

- **Review load distribution:** The conversation agent can realistically cover 10–15 items per session naturally. For learners with 40+ due items, the split between flashcard reviews (apprentice tier) and conversation-targeted items (journeyman+) needs empirical tuning. What is the right cap and overflow strategy?

- **Free practice mode boundaries:** How much should the free practice mode update the knowledge model? If a learner produces a word correctly in free practice, should that count as production evidence for mastery advancement? Recommended default: yes, but at a lower weight than session conversation (0.5x) since the context was learner-chosen rather than system-engineered.

---

*— End of Document —*
