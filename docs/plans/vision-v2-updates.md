# V2 Vision Updates: Learning Units, Input Strategy, and Curriculum Spine

This document describes three architectural additions planned for V2. Each section addresses a specific gap in V1's knowledge model and proposes a concrete design to close it.

---

## 1. The Learning Unit Hierarchy

### Why Flat Tokens Fail

V1 treats the word bank as a flat list of lexical items, each with a surface form, reading, and meaning. This works for bootstrapping, but it fundamentally misrepresents how language knowledge is structured. Languages are not a bag of isolated words. Several categories of knowledge fall through the cracks of a flat vocabulary model:

**Collocations.** Japanese verbs select for specific particles and noun pairings that cannot be predicted from the component meanings alone. A learner who knows 電話 ("telephone") and する ("to do") will naturally produce *電話をする, but the natural expression is 電話をかける ("to make a phone call," literally "to hang a telephone"). Similarly, 電車に乗る ("to ride a train") uses 乗る with に, not を. These pairings must be learned as units because the error patterns are invisible at the single-word level --- the learner produces grammatically valid but unnatural output, and a flat word bank has no way to represent or track that gap.

**Multi-word chunks.** Productive grammar patterns are often retrieved and deployed as prefabricated templates rather than assembled from rules in real time. A learner does not think "verb dictionary form + nominalizer の + subject marker が + adjective 好き" each time they say 食べるのが好き ("I like eating"). They retrieve the chunk V-るのが好き as a whole, slotting in the verb. The same applies to V-てもいいですか ("May I...?"), V-なければならない ("must..."), and dozens of other high-frequency patterns. If the system only tracks the component grammar point (の-nominalization) and the component vocabulary (好き), it misses the crucial intermediate unit that the learner actually needs to produce fluently.

**Sense disambiguation.** Polysemous lexemes create tracking problems. 開ける has at least two common senses: "to open (a door, a box)" and "to dawn (a new year)." These have different collocational profiles, different frequency distributions, and different mastery trajectories. Treating them as a single item means the system cannot distinguish a learner who knows one sense from a learner who knows both.

**Pragmatic formulas.** Expressions like よろしくお願いします ("please take care of things / nice to meet you"), いただきます ("I humbly receive [this meal]"), and お疲れ様です ("thank you for your hard work") are register-bound social formulas that function as single units. They are memorized holistically, often before the learner understands their grammatical components. A flat model that decomposes よろしくお願いします into よろしく + お + 願い + する + ます misses the point entirely.

### The 5-Level Hierarchy

V2 introduces a five-level hierarchy of learning units. Each level captures a distinct grain size of linguistic knowledge:

#### Level 1: Lexeme

A dictionary headword. This is what V1's `LexicalItem` already represents.

- Example: 食べる, 大きい, 電話
- One lexeme per dictionary entry
- Carries FSRS state for recognition and production independently

#### Level 2: Sense

A specific meaning of a polysemous lexeme. Senses are children of lexemes.

- Example: 開ける-s1 "to open (a physical object)" vs. 開ける-s2 "to dawn (of a new year)"
- Example: かける-s1 "to hang" vs. かける-s2 "to make (a phone call)" vs. かける-s3 "to put on (glasses)"
- Each sense gets its own FSRS state and mastery tracking
- For monosemous lexemes (the majority at N5), the lexeme and its single sense are effectively the same object. No overhead is created.

#### Level 3: Collocation

A verb+particle frame or noun+verb pair that must be learned as a unit because the combination is conventionalized and not predictable from components.

- Example: 電話をかける ("to make a phone call") --- not *電話をする
- Example: 電車に乗る ("to ride a train") --- not *電車を乗る
- Example: シャワーを浴びる ("to take a shower") --- not *シャワーをする
- Each collocation links to its component lexemes/senses
- Mastery requires producing the collocation as a unit, not just knowing the parts

#### Level 4: Chunk

A multi-word template retrieved as a whole, with one or more slots that accept substitution.

- Example: V-るのが好き ("I like V-ing") --- slot accepts any dictionary-form verb
- Example: V-てもいいですか ("May I V?") --- slot accepts any て-form verb
- Example: Nが欲しい ("I want N") --- slot accepts any noun
- Chunks link to both their component vocabulary and their underlying grammar pattern
- The system tracks whether a learner can produce the chunk, not just whether they know the grammar rule abstractly

#### Level 5: Pragmatic Formula

A register-bound social expression memorized and deployed as a fixed unit.

- Example: よろしくお願いします (formal self-introduction closer)
- Example: いただきます (pre-meal ritual expression)
- Example: お先に失礼します ("excuse me for leaving before you")
- Example: ごちそうさまでした ("thank you for the meal")
- These are introduced holistically, not decomposed into grammar
- Register metadata (casual/polite/formal) is a first-class property

### How the Levels Interact

The hierarchy creates a natural learning progression driven by component mastery:

**Component thresholds trigger chunk introduction.** When a learner's mastery of 食べる reaches `apprentice_3` and 好き reaches `apprentice_3`, the chunk 食べるのが好き becomes available for introduction. The curriculum planner evaluates these triggers daily and queues newly unlocked chunks. This means chunks appear at exactly the right time --- not too early (learner would be overwhelmed) and not too late (learner has been ready but the system never introduced the pattern).

**Chunks create production evidence for their components.** When a learner successfully produces 電車に乗って学校に行きます in conversation, this generates production evidence for the collocation 電車に乗る, the lexemes 電車, 乗る, 学校, and 行く, and the grammar pattern て-form sequential actions. A single utterance updates multiple items in the knowledge model.

**Pragmatic formulas bypass component thresholds.** A day-one learner needs よろしくお願いします for self-introductions, long before they understand 願う or the お...します honorific pattern. Pragmatic formulas are introduced alongside their communicative context regardless of component mastery. As the learner's grammar knowledge grows, the system can later "unpack" the formula, connecting it to its now-understood components.

**Senses are introduced on demand.** The system does not front-load all senses of a polysemous word. 開ける-s1 ("to open") is introduced at N5. 開ける-s2 ("to dawn") appears much later, when the learner encounters 年が明ける in a New Year context. Each sense has independent FSRS scheduling.

### Data Model Implications

A new `ChunkItem` Prisma model unifies collocations, chunks, and pragmatic formulas:

```prisma
model ChunkItem {
  id              Int           @id @default(autoincrement())
  chunkType       String        // "collocation" | "chunk" | "pragmatic_formula"
  template        String        // e.g., "V-るのが好き" or "電話をかける"
  meaning         String
  register        String?       // "casual" | "polite" | "formal"
  slots           Json?         // [{ position, constraint, examples }]
  componentItemIds Json         // { lexical: Int[], grammar: Int[] }
  triggerThreshold Json?        // { itemId: masteryState } -- when to introduce
  masteryState    String        @default("unseen")
  recognitionFsrs Json
  productionFsrs  Json
  firstSeen       DateTime      @default(now())
  lastReviewed    DateTime?
  reviewEvents    ReviewEvent[]
}
```

The FSRS scheduler and mastery state machine are already item-type-agnostic in V1 (they operate on `recognitionFsrs`/`productionFsrs` JSON blobs and a `masteryState` string). They work on `ChunkItem` without modification. The curriculum planner gains a chunk trigger evaluation step: after each session, check which chunks have newly satisfied component thresholds and queue them for introduction.

The `ReviewEvent` model gains a `chunkItemId` foreign key alongside the existing `lexicalItemId` and `grammarItemId`.

---

## 2. Native Input Strategy (Revised)

### AI-Generated Content as the Primary Input Layer

V1's conversation partner generates unstructured dialogue. V2 introduces structured, AI-generated content types that serve as comprehensible input calibrated precisely to the learner's knowledge state.

The key insight: curated native content (YouTube clips, NHK articles, textbook dialogues) has a fixed difficulty level that may or may not match a given learner. AI-generated content can be calibrated to exactly the right level for exactly this learner on exactly this day, based on their current word bank and mastery states. This makes it the superior primary input source, with real native content serving a supplementary role.

### Mini-Dramas

Short scripted dialogues (2-3 minutes of reading/listening time) generated against the learner's knowledge model.

**Design constraints:**
- Target 95-98% known-word coverage, following Krashen's i+1 principle. If a passage has 100 tokens, 95-98 of them should be items the learner has at `apprentice_2` or above. The remaining 2-5 tokens are the new items being introduced.
- Each mini-drama introduces 2-3 target items in natural context. These are items the curriculum planner has queued for introduction.
- Dialogue is between two named characters with consistent personalities across sessions. This provides pragmatic context (who speaks casually, who speaks formally) and makes the content more engaging than disconnected example sentences.
- Generated per-session based on the curriculum spine's current unit. If the learner is in Unit 9 (Eating and Drinking), the mini-drama takes place in a restaurant. If they are in Unit 4 (Daily Routine), it depicts a morning conversation between roommates.

**Example generation prompt structure:**
```
Generate a 2-3 minute dialogue between Yuki (casual speaker, college student)
and Tanaka-sensei (polite speaker, professor) set in [unit theme context].

The learner knows these items at 95%+ confidence: [serialized known items]
Target items to introduce naturally: [3 item IDs with surface forms]
Grammar patterns available: [list of mastered grammar]
Grammar patterns to showcase: [1-2 target grammar patterns]

Constraints:
- Do not use vocabulary outside the known list except for the target items
- Use only grammar patterns from the available list plus the target patterns
- Target items must appear at least twice each in meaningful context
- Include a moment of natural miscommunication or humor to make the scene memorable
```

### Graded Reading Passages

Short texts (100-300 characters) at controlled difficulty levels.

- Kanji display adapts to the learner: items above the learner's reading level show furigana, items at or below show bare kanji. This is computed per-character from the word bank, not set globally.
- Progressive difficulty within each curriculum unit: early passages in a unit use simpler sentence structures; later passages introduce the unit's target grammar in longer, more natural constructions.
- Text types vary: diary entries, text message exchanges, bulletin board posts, simple news summaries, recipe instructions. The variety exposes the learner to different registers and text conventions.

### Register Variation Pairs

The same scenario scripted twice: once in casual register, once in polite register.

- Example pair for Unit 1 (First Contact):
  - Casual: 「俺は田中。よろしくね。」("I'm Tanaka. Nice to meet ya.")
  - Polite: 「田中と申します。よろしくお願いいたします。」("My name is Tanaka. I humbly ask for your good favor.")
- This directly teaches pragmatic formulas by contrast. The learner sees which expressions swap out and which structural elements stay the same.
- Each pair highlights 2-3 pragmatic formula differences, explicitly annotated in the post-reading analysis.

### Content Themes Derived from Curriculum Spine Units

Content generation is not random. Each curriculum unit defines a communicative context, and all generated content for that unit draws from that context:

| Unit | Theme | Mini-drama setting | Reading type |
|---|---|---|---|
| Unit 1: First Contact | Self-introduction, greetings | Meeting at a welcome party | Self-introduction card |
| Unit 4: Daily Routine | Time, habitual actions | Morning conversation between roommates | Diary entry |
| Unit 9: Eating & Drinking | Ordering, preferences | Restaurant scene with a waiter | Simple menu + review |
| Unit 14: Getting Around | Directions, transportation | Asking for directions at a station | Train schedule notice |
| Unit 22: Explaining & Reasoning | Cause/effect, opinions | Discussing weekend plans | Short opinion post |

This alignment means every piece of content the learner encounters reinforces the current unit's vocabulary, grammar, and communicative goals. Nothing is wasted.

### Real Native Content as Supplementary Input (V2+)

Real native content enters the system scored against the learner's word bank for comprehensibility:

- The system analyzes a YouTube clip transcript, NHK Easy article, or manga page and computes: what percentage of tokens does this learner already know?
- Content in the 90-95% comprehension range is flagged as "stretch" material --- appropriate for independent reading/listening practice.
- Content below 85% is flagged as too difficult. Content above 98% is flagged as too easy (still useful for fluency building but not for acquisition).
- The system can recommend specific pieces of native content that align with the learner's current curriculum unit and difficulty level.
- Unknown items encountered in native content are automatically cross-referenced against the curriculum spine. If an unknown item appears in an upcoming unit, the system notes this: "You'll learn this word formally in Unit 12."

---

## 3. Curriculum Spine Architecture

### Hand-Curated Ordering into Communicative Units

The curriculum spine organizes all A1/N5 material into 28 communicative units. The organizing principle is functional: units are defined by what the learner can DO after completing them, not by which grammar point they cover.

This matters because grammar-organized curricula (Chapter 1: は/が, Chapter 2: を/に, Chapter 3: adjectives) produce learners who know rules but cannot perform tasks. A communicative organization (Unit 1: Introduce yourself, Unit 9: Order food) ensures that every study session ends with the learner able to do something they could not do before.

Example unit progression (first 10 of 28):

| # | Unit Name | Communicative Goal | Core Grammar | Core Vocabulary (sample) |
|---|---|---|---|---|
| 1 | First Contact | Introduce yourself, greet, say goodbye | は-topic, です-copula | 名前, 学生, 日本語, はじめまして |
| 2 | What's This? | Identify and ask about objects | これ/それ/あれ, の-possession | 本, ペン, 電話, 何 |
| 3 | People & Places | Describe where people/things are | に-location, いる/ある | 学校, 家, 友達, どこ |
| 4 | Daily Routine | Describe habitual actions, tell time | ます-form, に-time | 起きる, 食べる, 行く, 時 |
| 5 | Coming & Going | Talk about movement between places | へ-direction, から/まで | 来る, 帰る, 駅, バス |
| 6 | Describing Things | Describe qualities of things and people | い-adj, な-adj, とても | 大きい, 静かな, 新しい |
| 7 | Doing Things Together | Suggest activities, make plans | ましょう, ませんか | 一緒に, 映画, 見る, 遊ぶ |
| 8 | What I Like | Express preferences and desires | が好き, が欲しい, V-たい | 好き, 嫌い, 音楽, スポーツ |
| 9 | Eating & Drinking | Order food, express preferences | を-object, ください | 食べる, 飲む, 水, おいしい |
| 10 | Past Tense | Talk about what happened | ました/ませんでした, た-form | 昨日, 先週, 買う, もう |

### Unit Structure

Each unit is a JSON document bundling all items needed to achieve its communicative goal:

```json
{
  "unitId": "a1-u09",
  "name": "Eating & Drinking",
  "communicativeGoal": "Order food and drinks, express food preferences, describe meals",
  "prerequisites": ["a1-u04", "a1-u08"],
  "vocabulary": [
    { "itemId": 120, "surface": "食べる", "role": "core" },
    { "itemId": 121, "surface": "飲む", "role": "core" },
    { "itemId": 122, "surface": "おいしい", "role": "core" },
    { "itemId": 123, "surface": "まずい", "role": "supporting" },
    { "itemId": 124, "surface": "お腹が空く", "role": "supporting" }
  ],
  "grammar": [
    { "patternId": "n5-wo-object", "role": "core" },
    { "patternId": "n5-kudasai", "role": "core" }
  ],
  "collocations": [
    { "template": "お水をください", "components": [124, "n5-kudasai"], "role": "core" },
    { "template": "ご飯を食べる", "components": [120], "role": "core" }
  ],
  "chunks": [
    { "template": "Nをください", "slot": "noun", "role": "core" },
    { "template": "Nが好きです", "slot": "noun", "role": "core" }
  ],
  "pragmaticFormulas": [
    { "expression": "いただきます", "context": "before eating", "role": "core" },
    { "expression": "ごちそうさまでした", "context": "after eating", "role": "core" },
    { "expression": "お会計お願いします", "context": "requesting the bill", "role": "supporting" }
  ],
  "estimatedSessions": 4,
  "assessmentCriteria": "Learner can role-play ordering a meal at a restaurant using を+ください, express food preferences, and use meal-time pragmatic formulas appropriately."
}
```

Items have two roles:
- **Core**: Must be learned to complete the unit. The unit is not considered mastered until all core items reach at least `apprentice_3`.
- **Supporting**: Helpful context that enriches the unit but is not gated. Supporting items may appear in mini-dramas and reading passages but are not explicitly drilled unless the learner encounters them and adds them to SRS.

### Co-Introduction Rules

Related items are taught together within the same unit because learning them in isolation creates confusion or misses important contrasts:

- **Giving/receiving verbs**: あげる, もらう, and くれる are introduced in the same unit (Unit 16: Giving & Receiving) because their meanings are defined relative to each other. Teaching あげる alone, without the contrast to くれる, guarantees confusion later.
- **Counter words with associated nouns**: 枚 (flat objects) is introduced alongside 紙 (paper), 切符 (ticket), and シャツ (shirt) so the learner immediately practices the counter in context rather than memorizing it abstractly.
- **Antonym pairs**: 大きい/小さい, 高い/安い, 新しい/古い are introduced as pairs. This leverages contrast for memorization and ensures the learner can express both poles of a description.
- **Directional verb pairs**: 行く/来る, 上がる/下がる are paired so the learner grasps the deictic contrast from the start.

### Chunk Trigger System

Chunks become available for introduction when their component items reach a mastery threshold. The planner evaluates triggers daily.

**Trigger evaluation logic:**

```
For each chunk not yet introduced:
  For each component item in chunk.componentItemIds:
    Check: is item.masteryState >= threshold?
  If all components meet threshold:
    Add chunk to introduction queue
```

Default threshold: `apprentice_3` for vocabulary components, `apprentice_2` for grammar components. Grammar has a lower threshold because the learner needs to see grammar in chunked context to advance it --- waiting until `apprentice_3` would create a chicken-and-egg problem.

**Example trigger chain:**

1. Learner masters 食べる to `apprentice_3` (knows it well in isolation)
2. Learner masters 好き to `apprentice_3`
3. Learner has seen の-nominalization grammar at `apprentice_2`
4. Trigger fires: chunk 食べるのが好き is queued for introduction
5. The next mini-drama or conversation session naturally incorporates the chunk
6. Learner produces 食べるのが好き in conversation
7. Production evidence flows back to: the chunk itself, 食べる (production count++), 好き (production count++), and の-nominalization grammar (production evidence)

This creates a natural progression: individual items are learned first, then assembled into chunks, then deployed fluently. The system does not need to explicitly teach "now combine these" --- the trigger system handles the timing, and the conversation partner handles the elicitation.

### Prerequisites

Units can declare dependencies on earlier units:

```json
{
  "unitId": "a1-u08",
  "name": "What I Like",
  "prerequisites": ["a1-u01", "a1-u06"],
  ...
}
```

Unit 8 (What I Like) requires Unit 1 (First Contact) for basic sentence structure and Unit 6 (Describing Things) for adjective usage. The planner will not begin Unit 8 until the learner has completed (all core items at `apprentice_3`+) both prerequisite units.

Prerequisites form a directed acyclic graph. Some units can be studied in parallel (Units 2 and 3 have no dependency on each other, only on Unit 1). The planner can offer the learner a choice between available units when multiple are unlocked, or it can recommend one based on the ToM engine's assessment of what the learner most needs.

### Scalability Plan

The curriculum spine is designed to scale from hand-curated to AI-assisted to AI-generated as the level increases:

**A1 (N5): Fully hand-curated.** 28 units, each manually authored with careful attention to co-introduction rules, prerequisite chains, and communicative goals. This is the foundation that all higher levels build on, and it must be correct. Estimated authoring effort: 40-60 hours by a qualified Japanese language teacher.

**A2 (N4): AI-assisted with human review.** Claude generates draft units from a set of constraints (target grammar points, vocabulary lists, communicative functions). A language teacher reviews and adjusts: reordering items, fixing co-introduction groupings, adding missing collocations, and validating pragmatic formulas. Estimated effort: 15-20 hours of review per 30 units.

**B1+ (N3 and above): Increasingly AI-generated.** At higher levels, the combinatorial space of vocabulary and grammar is too large for full manual curation. The spine structure (unit format, trigger system, prerequisite DAG) is validated by language teachers, but individual unit contents are generated programmatically. The teacher's role shifts from authoring to quality assurance: spot-checking units, flagging unnatural collocations, and ensuring cultural appropriateness of pragmatic formulas.

The JSON format is designed to support both workflows. A teacher can author a unit by hand in a text editor. A generation script can produce the same format programmatically. The planner consumes both identically.

**Vocabulary and grammar source data** for all levels is maintained as authoritative reference files, separate from the curriculum units themselves. These reference files define the full inventory of items available at each JLPT level. The curriculum units then select from this inventory, ensuring that no unit references an item that does not exist in the reference data and that coverage across units is complete (every N5 item appears in at least one A1 unit).
