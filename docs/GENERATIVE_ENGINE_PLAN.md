# Lingle — Generative Engine Technical Plan

## The Product Core

Lovable generates web apps from a prompt. Suno generates songs from a prompt. Lingle generates language immersion experiences from a prompt.

"Teach me to order ramen" becomes a full scene with a illustrated restaurant, a cook with personality, dialogue at your level, vocabulary cards for new words, a quick fill-in-the-blank exercise, and a voice you can talk to. "Walk me through this NHK article" becomes a guided reading lesson with glossed vocabulary, grammar breakdowns, comprehension checks, and a conversation about what you just read.

The product is the generation. How rich, how responsive, how varied, how alive. The learner types or speaks a prompt and the AI generates a complete, multimodal, interactive language experience — text, voice, visuals, exercises, branching choices — as naturally as a human tutor would walk them through it.

This is not a flashcard app with a chat feature. This is not an SRS scheduler with conversation bolted on. The generation engine IS the product.

---

## Lessons from the Best AI Products

Every breakthrough AI product shares architectural patterns that make them feel magical. These patterns directly inform how we build the generative engine.

### 1. The model is the CEO

Claude Code's orchestration is ~50 lines. The runtime is dumb; the model makes all decisions. Cursor's agent decides which files to read, tools to call, and when to stop. Lovable rejected complex agentic pipelines in favor of letting the model do one big generation.

**For Lingle:** The AI should never follow a script. Give it a rich set of tools (text, exercises, images, audio, vocabulary cards, grammar notes) and let it compose the experience. The prompt and difficulty level are the constraints. The AI decides what combination of modalities to use based on what the learner asked for.

### 2. Constrain the output space

Lovable constrains to React + TypeScript + Supabase and gets dramatically better code generation. Perplexity constrains to "never say anything you didn't retrieve." Suno constrains to musical structures.

**For Lingle:** The difficulty level is our constraint. At level 2 (N4), the AI's vocabulary is bounded, grammar stays in polite form, all kanji get furigana, and English hints appear naturally. The AI doesn't have to decide how hard to be — the difficulty block handles that. This constraint makes the generation more reliable, not less creative.

### 3. Speed creates magic

Lovable treats speed as the #1 UX factor. Cursor completions are under 1 second. Suno delivers initial audio in ~20 seconds. Perplexity answers in seconds.

**For Lingle:** The gap between the prompt and the experience must be as small as possible. Session startup is instant (no planning LLM call — the meta-prompt handles everything). Text streams token-by-token. Images show a styled placeholder while generating. Voice targets <1s to first audio. The lesson materializes around you.

### 4. The ratio of input to output quality

Suno's magic: type a sentence, get a full song with vocals and instruments. The gap between effort and result is what creates delight. Each generation is different — variable rewards drive the "one more" loop.

**For Lingle:** Type "I'm lost in Kyoto" and get an illustrated street scene, a helpful stranger with Kansai-ben dialect, branching choices, vocabulary cards for direction words, and a listening exercise. The learner's input is trivial. The generated experience is rich. That ratio is the product.

### 5. Context management is invisible but critical

Claude Code's auto-compaction and sub-agents. Cursor's semantic indexing. Perplexity's 5-stage retrieval pipeline. Lovable's "hydration" pattern — small model selects relevant context before the big model acts.

**For Lingle:** The learner's difficulty level, native language, and loaded content need to be in context without them thinking about it. Prompt caching keeps this fast and cheap. Long conversations get summarized automatically. Loaded documents get chunked and retrieved via RAG. The learner never sees the infrastructure — they just notice that the AI always seems to know their level.

### 6. Separate planning from execution

Cursor separates expensive planning from cheap execution. Windsurf runs a planning agent in the background while the action agent handles immediate tasks.

**For Lingle:** The meta-prompt (expensive, rich, carefully engineered) is the plan. The streaming conversation (fast, reactive) is the execution. For content-based lessons, a fast preprocessing step (extract article, identify key vocabulary, estimate difficulty) runs before the conversation starts, so the AI has everything it needs to generate a great lesson on the first turn.

---

## What Exists Today

A working generative conversation engine:

- **23 curated scenarios** across 8 categories (conversation, situations, work, social, learning, culture, creative)
- **Free-form prompt input** — type anything and the AI generates the right experience
- **5 AI tools** that render as rich UI: vocabulary cards, grammar notes, corrections, branching choices, suggestion chips
- **6 difficulty levels** with detailed behavioral instructions controlling vocabulary, grammar, kanji, furigana, English support
- **Adaptive meta-prompt** that handles conversation, immersive scenes, tutoring, creative, and reading modes — all from one prompt template
- **Japanese IME** with romaji-to-kana conversion and kanji candidates
- **TTS** on every AI message
- **Furigana rendering** via `{kanji|reading}` → `<ruby>` HTML
- **Streaming** responses with real-time rendering

**What makes this a generation engine, not a chatbot:** The AI doesn't just respond to messages. It composes experiences using its tools — a vocabulary card appears when a new word matters, a grammar note surfaces when a pattern is confusing, choices branch the narrative, corrections recast errors gently. The quality of this composition is what we're optimizing.

---

## The Generation Architecture

### Core Principle: Tools as Generation Primitives

The AI's tools are its creative palette. Each tool generates a different type of content. The model composes them freely based on what the learner needs. New capabilities = new tools. The rendering layer (PartRenderer) maps each tool to a React component.

```
┌──────────────────────────────────────────────────────────────┐
│                    THE GENERATION ENGINE                      │
│                                                              │
│  Input: prompt + difficulty level + loaded content (if any)  │
│                                                              │
│  Generation primitives (tools):                              │
│    Streaming text     → narration, dialogue, explanations    │
│    suggestActions     → contextual next moves                │
│    displayChoices     → branching narrative / dialogue        │
│    showVocabularyCard → word with reading, meaning, example  │
│    showGrammarNote    → pattern with formation and examples  │
│    showCorrection     → gentle error recast with explanation │
│    generateExercise   → interactive exercise (6 types)       │
│    generateImage      → scene illustration (async)           │
│    playAudio          → TTS for specific text                │
│                                                              │
│  The model composes these freely. A lesson about ordering    │
│  ramen might use: text narration + illustrated scene +       │
│  character dialogue + vocabulary cards + a fill-in-the-      │
│  blank exercise + branching choices + suggestion chips.      │
│  A casual chat might just use text + suggestions.            │
│  The model reads the room.                                   │
└──────────────────────────────────────────────────────────────┘
```

This is the same pattern as Claude Code (small set of powerful primitives → infinite behaviors) and Lovable (constrained output space → higher quality generation).

### Streaming Architecture

Three tiers of streaming, each for different generation needs:

**Tier 1: `streamText` + tool parts (what we have)**
The main conversation stream. Text arrives token-by-token. Tool calls render as typed React components. This handles narration, dialogue, vocabulary cards, grammar notes, corrections, choices, and suggestions.

**Tier 2: Custom data parts (for async generation)**
For content that generates in the background — scene images, document parsing, audio preparation. The server writes a loading state with an ID, continues streaming text, then updates the data part when ready:

```tsx
// Text is still streaming while the image generates
writer.write({ type: 'data-image', id: 'scene-1', data: { status: 'generating' } });
// ... text continues ...
writer.write({ type: 'data-image', id: 'scene-1', data: { status: 'ready', url } });
```

The learner sees text flowing and an image materializing — like a tutor who sketches on a whiteboard while talking.

**Tier 3: `streamObject` (for structured lesson generation)**
When generating a batch of exercises or a structured lesson plan, the AI streams a Zod-validated JSON object field-by-field. Each exercise renders as soon as it arrives. The learner sees exercises appearing one by one, not a loading spinner followed by a wall of content.

### Generative UI: The PartRenderer Pattern

The PartRenderer is the rendering layer for the generation engine. Each tool type maps to a React component. This is the **controlled generative UI pattern** — the AI selects from predefined components and fills them with structured data. Not open-ended code generation. Type-safe, design-system consistent, and exactly what the Vercel AI SDK supports.

```tsx
switch (part.type) {
  case 'text':
    return <Markdown>{rubyToHtml(text)}</Markdown>;
  case 'tool-showVocabularyCard':
    return <VocabularyCard {...part.output} />;
  case 'tool-generateExercise':
    return <ExerciseRenderer exercise={part.output} onAnswer={handleAnswer} />;
  case 'tool-generateImage':
    return <SceneImage {...part.output} />;
  // Each new tool = one new case = one new component
}
```

Adding a new generation capability is: (1) define a Zod schema, (2) add a tool to `conversation-tools.ts`, (3) build a React component, (4) add a case to PartRenderer. That's it.

### Context Management

| Content | Size | Strategy |
|---|---|---|
| Tools + system prompt + difficulty block | ~2K tokens | Prompt cached (breakpoint 1) |
| Loaded content chunks (if any) | ~2-5K tokens | RAG-selected, prompt cached (breakpoint 2) |
| Conversation history | Grows | Auto-cached; summarize after ~20 turns |
| Latest user message | ~100 tokens | Uncached |

**Prompt caching** provides 90% cost reduction and 85% latency reduction on cached prefixes. For a session with a 5K-token system prompt across 20 turns, caching reduces cost from ~$0.30 to ~$0.04.

**Conversation summarization** triggers when history exceeds ~20-30 turns. Haiku summarizes older turns, preserving the lesson's thread and any errors/corrections. The last 15-20 turns stay at full fidelity.

### Model Routing

| Task | Model | Why |
|---|---|---|
| Conversation / lesson generation | Claude Sonnet 4 | Quality is everything — this IS the product |
| Content preprocessing (extract, chunk, embed) | Claude Haiku 4.5 | Fast extraction, doesn't need creativity |
| Conversation summarization | Claude Haiku 4.5 | Compression task |
| Image → text (OCR, manga) | Claude Sonnet 4 Vision | Multimodal capability needed |

---

## Feature: Interactive Exercises

The AI generates exercises on-the-fly as part of the lesson — exactly when they're useful, not on a schedule.

### Exercise types

```typescript
type Exercise =
  | FillBlankExercise    // "私は毎日___を食べます。" → type the answer
  | MCQExercise          // Multiple choice with 3-5 options
  | MatchingExercise     // Match Japanese ↔ English pairs
  | OrderingExercise     // Arrange sentence fragments in correct order
  | ListeningExercise    // Hear audio, answer comprehension question
  | ReadingExercise      // Read a passage, answer questions
```

Each type is a Zod schema shared between the AI generation layer and the React rendering layer. Type safety end-to-end.

### When exercises appear

The AI decides, like a tutor would. The system prompt guides it:

- After teaching a new grammar point → offer a quick fill-in-the-blank to check understanding
- When the learner seems confused between two words → present a matching exercise
- During a reading comprehension lesson → generate passage questions
- When energy is low → offer an easier MCQ to rebuild momentum
- After an immersive scene → test whether the learner absorbed the key vocabulary

Exercises should never interrupt flow. They emerge naturally — "Let's see if you got that" — the way a good tutor does it.

### Grading

Each exercise component manages its own interaction state (selected answer, attempts, timing) in React. On completion, it reports back:

```typescript
interface ExerciseResult {
  correct: boolean;
  userAnswer: string;
  correctAnswer: string;
  timeSpentMs: number;
}
```

The result is displayed inline (correct/incorrect feedback with explanation), and the conversation continues. The AI can see the result and adapt — if the learner got it wrong, it might reteach or offer a simpler follow-up.

---

## Feature: Content-Based Learning (Load Anything)

The learner shares a URL, uploads an image, or pastes text. The AI turns it into a lesson.

### Ingestion pipeline

```
User provides content
        │
        ▼
Content Type Router (server action)
        │
        ├── URL → fetch + Mozilla Readability → clean text
        ├── PDF → pdf2json → text (fallback: Claude Vision for scans)
        ├── Image → Claude Vision → extracted Japanese text
        ├── YouTube → youtube-transcript → captions
        └── Pasted text → direct
        │
        ▼
Chunk into ~500-token sections
        │
        ▼
Store with embeddings (Supabase pgvector)
        │
        ▼
Retrieve relevant chunks per turn via vector similarity
Inject into prompt context (cached after first injection)
```

### What the AI generates from loaded content

The AI doesn't need a special "content mode." The meta-prompt already supports reading/listening assistance. Loading content just gives the generation engine richer material:

- **An NHK article** becomes a guided reading lesson: walk through paragraph by paragraph, gloss vocabulary with cards, explain grammar patterns, generate comprehension exercises, then discuss the content in Japanese.
- **A YouTube video** becomes a listening lesson: work through the transcript, focus on colloquial speech and slang, generate exercises around key phrases.
- **A manga page or photo** becomes a visual lesson: the AI describes what it sees, teaches vocabulary in context, generates exercises around the visual content.
- **A restaurant menu** becomes an ordering scenario: the AI uses the actual menu items as the vocabulary, then drops you into a roleplay at that restaurant.

The key insight: content ingestion is not a separate feature. It's an input to the same generation engine. The AI generates the same types of rich experiences — it just has better material to work with.

### Libraries

| Content type | Library | Notes |
|---|---|---|
| URL → text | `@mozilla/readability` + `jsdom` | Powers Firefox Reader View |
| PDF → text | `pdf2json` | Server-side; fallback to Claude Vision |
| Image → text | Claude Vision API | `type: "image"` content block |
| YouTube → text | `youtube-transcript` | YouTube's Innertube API |
| Embeddings | `text-embedding-3-large` | For RAG retrieval |
| Vector search | Supabase pgvector | Already using Supabase |

---

## Feature: Voice

### Pipeline: STT → LLM → TTS

Modular pipeline, not speech-to-speech. We keep the text layer because: (1) the generation engine's tools need text to render UI components, (2) the learner's transcript shows in the chat for review, (3) corrections and vocabulary cards work the same in voice and text mode.

```
User speaks → mic
        │
        ▼
STT: gpt-4o-mini-transcribe (best Japanese accuracy, <400ms)
        │
        ▼
Text → same generation engine (Claude Sonnet + tools)
        │                    │
        │                    ▼
        │              Streaming response
        │                    │
        │                    ▼ (sentence boundary detection)
        │              TTS: ElevenLabs Flash v2.5 (<100ms TTFB)
        │                    │
        ▼                    ▼
Text in chat             Audio → speaker
(with tool cards)        (sentence-by-sentence)
```

### Sentence-level streaming

Don't wait for the full response before speaking. Buffer LLM output until a sentence-ending punctuation mark (。for Japanese), then immediately send that sentence to TTS while the next sentence generates. The learner hears the first sentence within ~1 second.

### Latency budget

| Stage | Target | Best available |
|---|---|---|
| STT | <400ms | Deepgram Nova-3: ~150ms |
| LLM first token | <500ms | Claude Sonnet streaming: ~300-500ms |
| TTS first audio | <100ms | ElevenLabs Flash: ~75ms |
| **Total voice-to-voice** | **<1s** | **~525-725ms achievable** |

### What voice changes about the experience

Voice doesn't add a new mode — it changes the texture of every existing mode. An immersive scenario becomes a spoken conversation. A tutoring session becomes verbal explanation. A reading lesson has the text read aloud. The generation engine produces the same content; the I/O layer changes from text to speech.

The tools still render visually — vocabulary cards, grammar notes, exercises, images appear in the chat alongside the spoken dialogue. Voice + visual together is closer to how a real tutor works: they talk AND draw on the whiteboard.

### Development path

1. **VOICEVOX** (free, offline Japanese TTS) for development
2. **ElevenLabs Flash** for production quality
3. **gpt-4o-mini-transcribe** for STT from day one
4. **WebSockets** for MVP voice transport; **WebRTC via LiveKit** for production

---

## Feature: Scene Illustration

When the AI describes a new scene, it generates an illustration. The image renders inline while text continues streaming.

```tsx
generateImage: tool({
  description: 'Generate an illustration for the current scene',
  inputSchema: z.object({
    sceneDescription: z.string(),
    style: z.enum(['anime', 'watercolor', 'illustration', 'photo-realistic']),
  }),
  execute: async ({ sceneDescription, style }) => {
    const result = await generateImage({
      model: replicate.image('black-forest-labs/flux-schnell'),
      prompt: `${sceneDescription}, ${style} style, Japanese cultural context`,
    });
    return { url: result.image.url, alt: sceneDescription };
  },
})
```

FLUX.1 Schnell: ~1.8 seconds, ~$0.003/image. The PartRenderer shows a styled placeholder, then swaps in the image.

Guidelines for the AI:
- Generate when entering a new setting, not every turn
- Generate for scenes the learner can't easily visualize (cultural settings, specific locations)
- Skip for abstract conversations or grammar discussions
- 2-5 images per immersive session

---

## The Full Tool Set

### Shipping today

| Tool | What it generates | Renders as |
|---|---|---|
| `suggestActions` | 2-3 contextual next moves | Chips below messages |
| `displayChoices` | Branching dialogue options with hints | Numbered buttons |
| `showVocabularyCard` | Word + reading + meaning + example + notes | Teaching card |
| `showGrammarNote` | Pattern + formation + examples + level | Explanation card |
| `showCorrection` | Original → corrected + explanation | Correction card |

### Next to build

| Tool | What it generates | Renders as |
|---|---|---|
| `generateExercise` | Fill-blank, MCQ, matching, ordering, listening, reading | Interactive component |
| `generateImage` | Scene illustration | Inline image with placeholder |

### Future

| Tool | What it generates | Renders as |
|---|---|---|
| `loadContent` | Parsed external content | Content preview panel |
| `kanjiPractice` | Stroke order walkthrough | Interactive canvas |
| `conjugationDrill` | Verb form quick-fire | Drill component |
| `pronunciationCheck` | Audio comparison | Waveform display |
| `miniGame` | Word search, crossword, matching game | Game component |
| `culturalDeepDive` | Extended cultural context | Expandable aside |

### Tool design principles

From Anthropic's engineering team (they spent more time optimizing tools than prompts):

1. **Poka-yoke design** — Structure arguments so mistakes are impossible. Use enums, not free strings. Typed schemas.
2. **Descriptions over parameter names** — Tell the model exactly when and why to use each tool. This is more important than clever naming.
3. **Self-contained** — Each tool does one thing completely. No chaining required for basic operations.
4. **Progressive rendering** — Every tool has a loading state. Show a skeleton immediately, swap in the real content.
5. **Small set** — 5-10 tools. The model gets less reliable as tools multiply. Start small, add only what earns its place.

---

## How a Generated Experience Feels

### Example: "Teach me to order ramen"

```
Turn 1 — AI generates:
  [Image: Warm illustrated ramen shop interior, steam rising, wooden counter]
  Narrated text: "You slide open the curtain of a small ramen shop in Shinjuku..."
  > **店主:** 「いらっしゃいませ！お一人ですか？」
  [Vocabulary card: いらっしゃいませ — Welcome (to a shop)]
  [Choices: 1. はい、一人です  2. 二人です  3. カウンターに座ってもいいですか？]

Turn 2 — Learner picks choice 1

Turn 3 — AI generates:
  Narration: "The owner gestures to a stool at the counter..."
  > **店主:** 「何にしますか？うちは{味噌|みそ}ラーメンが人気ですよ。」
  [Grammar note: 〜が人気です — "X is popular" (が marks the subject)]
  [Suggestions: "味噌ラーメンをください", "メニューを見せてください", "おすすめは何ですか？"]

Turn 4 — Learner types "味噌ラーメンお願います" (error: お願いします)

Turn 5 — AI generates:
  [Correction: お願います → お願いします (the い is part of the stem)]
  > **店主:** 「味噌ラーメン、お願いします！ニンニク入れますか？」
  [Vocabulary card: ニンニク — garlic]
  Narration: *He reaches for a garlic press with an expectant grin.*

... session continues organically ...

Turn 12 — AI generates:
  Narration: "Your bowl arrives, steaming. The 店主 watches expectantly..."
  [Exercise: Fill in the blank — 「このラーメンは本当に___ですね！」
   Hint: How would you say it's delicious?
   Answer: おいしい]
```

This is what "generative" means. The AI composed: narration, character dialogue with personality, an illustrated scene, vocabulary cards timed to new words, a grammar note when a pattern was useful, a gentle correction that didn't break flow, suggestion chips to reduce friction, and an exercise that felt like part of the conversation.

No script. No predetermined lesson plan. The AI read the situation and generated the right thing at the right moment.

### Example: "Help me with this article"

```
Turn 1 — Learner pastes NHK Easy article URL

  [Content preview: Article loaded — "東京の新しいカフェが話題に"]
  AI: Let's read through this together! The headline says...
  [Vocabulary card: 話題 (わだい) — topic of conversation, buzz]
  Here's the first paragraph. I'll help with anything tricky:
  「東京の渋谷に新しいカフェができました。このカフェは...」

Turn 3 — After the first paragraph:
  [Exercise: Reading comprehension MCQ —
   "Where did the new cafe open?"
   A. 新宿  B. 渋谷  C. 池袋  D. 原宿]

Turn 5 — After the article:
  AI: Now that we've read it, let's talk about it in Japanese.
  あなたはこのカフェに行きたいですか？
  [Suggestions: "行ってみたいです！", "あまり興味がないです", "東京に住んでいないので..."]
```

Content-based learning flows naturally into conversation. The generation engine doesn't distinguish between "lesson" and "conversation" — it's all composition.

---

## Implementation Phases

### Phase A: Interactive Exercises

**Add exercise generation to the existing conversation flow. No new infrastructure.**

1. Define exercise Zod schemas (fill-blank, MCQ, matching, ordering, listening, reading)
2. Build `<ExerciseRenderer>` with sub-components per type
3. Add `generateExercise` tool to `conversation-tools.ts`
4. Add case to PartRenderer for `tool-generateExercise`
5. Wire up inline grading feedback (correct/incorrect + explanation)

**Impact:** Transforms passive conversation into active learning. The generation engine can now test, not just teach.

### Phase B: Scene Illustration

**Add visual generation. Minimal infrastructure.**

1. Add `@ai-sdk/replicate` provider
2. Create `generateImage` tool with FLUX.1 Schnell
3. Build `<SceneImage>` with placeholder/loading/ready states
4. Add case to PartRenderer

**Impact:** Immersive scenarios become visual. The gap between prompt and experience widens — which is the product.

### Phase C: Content Ingestion

**Let users load anything into the generation engine.**

1. Build `/api/content/extract` route with content type router
2. Add Readability, pdf2json, youtube-transcript
3. Set up pgvector for chunk embeddings and retrieval
4. Add URL/file input to the idle phase UI
5. Inject retrieved chunks into conversation context

**Impact:** Infinite content library. Any article, video, image, or document becomes a lesson.

### Phase D: Voice

**Full speech input/output.**

1. Mic input component with Web Audio API
2. `/api/voice/stt` route with gpt-4o-mini-transcribe
3. Upgrade TTS to ElevenLabs Flash
4. Sentence-boundary streaming (buffer → TTS per sentence)
5. Transcript display in chat alongside audio

**Impact:** The generation engine speaks. Every scenario, lesson, and conversation becomes verbal.

### Phase E: Prompt Caching + Cost

**Make it sustainable.**

1. Anthropic prompt caching with 2-3 breakpoints
2. Conversation summarization for long sessions
3. Route preprocessing and summarization to Haiku

**Impact:** ~87% cost reduction per session. Fast enough to feel instant.

---

## Technical Decisions

### SSE vs WebSockets vs WebRTC

- **SSE** for all text/exercise/image streaming (now and future). The AI SDK uses this. It's the right choice for unidirectional content generation.
- **WebSockets** for voice MVP. Bidirectional audio.
- **WebRTC** (via LiveKit) for production voice. 300ms less latency than WebSockets, native echo cancellation.

### Generative UI: Controlled Pattern

The AI selects from predefined React components and fills them with typed data via tool calls. Not open-ended code generation. This keeps the design system consistent while giving the AI creative freedom in composition.

Adding a new generation capability is always the same pattern:
1. Zod schema for the tool input
2. Tool definition in `conversation-tools.ts`
3. React component
4. Case in PartRenderer

### State in Interactive Components

Exercises, choices, and other interactive elements manage their own state in React (selected answer, submission status, score). The message stream contains the exercise definition. The component handles interaction. Results display inline and the AI can see them in conversation history.

### Database for Content

| Table | Purpose |
|---|---|
| `ContentSource` | URLs, files, and metadata for loaded content |
| `ContentChunk` | Individual chunks with pgvector embeddings |
| `GeneratedImage` | Scene illustrations for session replay |

---

## What We're Optimizing For

**Generation quality.** Does the AI compose the right mix of modalities for what the learner asked? Does the ramen shop feel alive? Does the grammar explanation land? Does the exercise test the right thing at the right moment?

**Generation variety.** Does each session feel different? Does the same scenario play out differently depending on what the learner says? Does the AI surprise?

**Generation speed.** How fast does the experience materialize? Can the learner feel the scene forming around them in real-time?

**The input/output ratio.** How much does the learner type vs. how rich is the experience they get? The wider this gap, the more magical it feels.

These are the metrics that matter. Not items reviewed, not mastery states, not retention curves. The question is: did the generation engine produce an experience that made the learner feel like they just had a real interaction in Japanese?

---

## What This Adds Up To

A learner opens Lingle. They paste a link to an NHK article about a new ramen shop in Shinjuku. The AI reads the article, generates a guided walkthrough at their level — glossing vocabulary, explaining grammar, checking comprehension with quick exercises. Then it asks: "Want to visit?" The learner says yes. An illustrated scene appears. They're standing at the counter of that ramen shop, ordering from the menu described in the article, using the words they just learned, hearing the cook's voice.

They didn't study. They read something interesting, then lived in it.

That's the generative engine.
