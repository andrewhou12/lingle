# Levels & Onboarding Assessment

## CEFR Levels

Linguist uses the **Common European Framework of Reference for Languages (CEFR)** scale internally. These are the standard levels used by language programs and tests worldwide:

| CEFR Level | Description | Rough Ability |
|---|---|---|
| **A1** | Beginner | Can understand and use basic phrases. Can introduce themselves and ask simple questions. |
| **A2** | Elementary | Can communicate in routine tasks. Can describe their background and immediate environment. |
| **B1** | Intermediate | Can deal with most everyday situations. Can describe experiences, events, and ambitions. |
| **B2** | Upper Intermediate | Can understand complex texts. Can interact fluently with native speakers without strain. |
| **C1** | Advanced | Can understand demanding, longer texts and recognize implicit meaning. Can express ideas fluently and spontaneously. |
| **C2** | Mastery | Can understand virtually everything heard or read. Can summarize information from different sources, reconstructing arguments coherently. |

## Mapping from JLPT Self-Report to CEFR

During onboarding, the user self-reports their level using the **JLPT (Japanese Language Proficiency Test)** scale, which is more familiar to Japanese learners. This is mapped to CEFR as follows:

| Self-Reported Level | CEFR Equivalent | Notes |
|---|---|---|
| Complete Beginner | A1 | No prior Japanese knowledge |
| JLPT N5 | A1 | Basic phrases, hiragana/katakana, ~100 kanji |
| JLPT N4 | A2 | Simple conversations, ~300 kanji, basic grammar |
| JLPT N3 | B1 | Everyday situations, ~600 kanji, intermediate grammar |
| JLPT N2 | B2 | Complex texts, ~1000 kanji, advanced grammar |
| JLPT N1 | C1 | Near-native comprehension, ~2000 kanji |

This mapping is defined in `core/onboarding/assessment-data.ts` → `getLevelCefrMapping()`.

## How Onboarding Sets the Initial Level

### Step 1: Self-Report

The user selects one of: Beginner, N5, N4, N3, N2, or N1. This is stored as `selfReportedLevel` on the `LearnerProfile` and directly sets the initial `computedLevel`, `comprehensionCeiling`, and `productionCeiling` via the JLPT→CEFR mapping above.

### Step 2: Vocabulary & Grammar Check

The user is shown assessment items from levels **around** their self-report:

- **Beginner** → shown only N5 items (15 items)
- **N5** → shown N5 + N4 items (~27 items)
- **N4** → shown N5 + N4 + N3 items (~39 items)
- **N3** → shown N4 + N3 + N2 items (~33 items)
- **N2** → shown N3 + N2 + N1 items (~27 items)
- **N1** → shown N2 + N1 items (~15 items)

For each item, the user taps "I know this" or skips it. This determines initial mastery states.

### Step 3: Item Seeding

Based on the assessment results, items are seeded into the database:

| Condition | Initial Mastery State |
|---|---|
| User marked "I know this" | `apprentice_2` (recognition FSRS pre-initialized with stability=2, 1 rep — skips the very first review) |
| User did NOT mark it | `unseen` (not in the SRS rotation) |
| Item from a JLPT level below the self-report (not shown in assessment) | `introduced` (acknowledged but not tested) |

All items get their `cefrLevel` set based on the JLPT→CEFR mapping of their source level.

## How Levels Evolve After Onboarding

After the initial setup, `computedLevel` is no longer static. It is **recalculated** by the profile calculator (`core/profile/calculator.ts`) based on actual SRS performance:

### Comprehension Ceiling

The highest CEFR level where the **average recognition retrievability** (from the FSRS scheduler) of items at that level exceeds **80%**. This measures how well the learner can *recognize* items at each level.

### Production Ceiling

The highest CEFR level where the **average production retrievability** of items at that level exceeds **60%**. This measures how well the learner can *produce* items at each level. The threshold is lower because production is harder than recognition.

### Computed Level

The overall `computedLevel` is the **higher** of the comprehension and production ceilings.

### When Recalculation Happens

- After every 10 SRS reviews (async, non-blocking)
- After every conversation session ends
- On explicit profile recalculate request

This means the computed level **drifts upward** as the learner accumulates evidence of mastery at higher levels, and can **drop** if retrievability decays from lack of practice.
