# Lingle — Conversation Engine Technical Plan

## The Product Core

Lingle is a conversation practice engine. The AI plays the other person in a conversation — a waiter, a coworker, a friend, a teacher. The learner practices speaking.

Three modes:
1. **Conversation** — AI plays the other person in a realistic situation
2. **Lesson** — AI teaches a specific topic with examples and practice
3. **Listening** — AI generates an example conversation, then helps analyze and practice it

The product is the quality of these interactions. How natural, how responsive, how well-calibrated to the learner's level. Voice is the endgame — text is the stepping stone.

---

## Lessons from the Best AI Products

### 1. The model is the CEO
Claude Code's orchestration is ~50 lines. The runtime is dumb; the model makes all decisions. Cursor's agent decides which files to read, tools to call, and when to stop.

**For Lingle:** The AI should never follow a script. Give it a rich set of tools (text, exercises, audio, vocabulary cards, grammar notes) and let it compose the interaction. The prompt and difficulty level are the constraints. The AI decides what combination to use.

### 2. Constrain the output space
Lovable constrains to React + TypeScript + Supabase and gets dramatically better code generation.

**For Lingle:** The difficulty level is our constraint. At level 2 (N4), the AI's vocabulary is bounded, grammar stays in polite form, all kanji get furigana. This makes the output more reliable, not less natural.

### 3. Speed creates magic
Lovable treats speed as the #1 UX factor. Cursor completions are under 1 second.

**For Lingle:** The gap between the prompt and the conversation starting must be minimal. Session startup is instant. Text streams token-by-token. Voice targets <1s to first audio.

### 4. Context management is invisible but critical
Claude Code's auto-compaction and sub-agents. Cursor's semantic indexing.

**For Lingle:** The learner's difficulty level, native language, and session context need to be in context without them thinking about it. Prompt caching keeps this fast and cheap. Long conversations get summarized automatically.

---

## What Exists Today

A working conversation engine:

- **21 curated scenarios** across 3 modes (conversation, lesson, listening)
- **Free-form prompt input** — describe any situation and the AI sets it up
- **5 AI tools** that render as rich UI: vocabulary cards, grammar notes, corrections, branching choices, suggestion chips
- **6 difficulty levels** with detailed behavioral instructions controlling vocabulary, grammar, kanji, furigana, English support
- **System prompt** that handles conversation, lesson, and listening modes from one template
- **Japanese IME** with romaji-to-kana conversion and kanji candidates
- **TTS** on every AI message
- **Furigana rendering** via `{kanji|reading}` → `<ruby>` HTML
- **Streaming** responses with real-time rendering

---

## The Engine Architecture

### Core Principle: Tools as Primitives

The AI's tools are its capabilities. Each tool generates a different type of content. The model composes them freely based on what the learner needs. New capabilities = new tools.

```
┌──────────────────────────────────────────────────────────────┐
│                    THE CONVERSATION ENGINE                     │
│                                                              │
│  Input: prompt + difficulty level + loaded content (if any)  │
│                                                              │
│  Primitives (tools):                                         │
│    Streaming text     → dialogue, explanations, responses    │
│    suggestActions     → contextual next moves                │
│    displayChoices     → dialogue options for the learner      │
│    showVocabularyCard → word with reading, meaning, example  │
│    showGrammarNote    → pattern with formation and examples  │
│    showCorrection     → gentle error recast with explanation │
│    generateExercise   → interactive exercise (6 types)       │
│    playAudio          → TTS for specific text                │
│                                                              │
│  The model composes these freely. A conversation at a        │
│  restaurant might use: text dialogue + vocabulary cards +    │
│  a correction + suggestion chips. A lesson might use text +  │
│  grammar notes + exercises. The model reads the room.        │
└──────────────────────────────────────────────────────────────┘
```

### Streaming Architecture

**Tier 1: `streamText` + tool parts (what we have)**
The main conversation stream. Text arrives token-by-token. Tool calls render as typed React components.

**Tier 2: Custom data parts (for async generation)**
For content that generates in the background — audio preparation, document parsing. The server writes a loading state, continues streaming text, then updates when ready.

**Tier 3: `streamObject` (for structured generation)**
When generating a batch of exercises or a structured lesson, the AI streams a Zod-validated JSON object field-by-field. Each exercise renders as soon as it arrives.

### Generative UI: The PartRenderer Pattern

Each tool type maps to a React component. Adding a new capability: (1) define a Zod schema, (2) add a tool, (3) build a React component, (4) add a case to PartRenderer.

### Context Management

| Content | Size | Strategy |
|---|---|---|
| Tools + system prompt + difficulty block | ~2K tokens | Prompt cached (breakpoint 1) |
| Loaded content chunks (if any) | ~2-5K tokens | RAG-selected, prompt cached (breakpoint 2) |
| Conversation history | Grows | Auto-cached; summarize after ~20 turns |
| Latest user message | ~100 tokens | Uncached |

### Model Routing

| Task | Model | Why |
|---|---|---|
| Conversation / lesson | Claude Sonnet 4 | Quality is everything — this IS the product |
| Content preprocessing | Claude Haiku 4.5 | Fast extraction |
| Conversation summarization | Claude Haiku 4.5 | Compression task |

---

## Feature: Interactive Exercises

The AI generates exercises on-the-fly as part of lessons and conversations — exactly when they're useful, not on a schedule.

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

### When exercises appear

The AI decides, like a tutor would:
- After teaching a new grammar point → quick fill-in-the-blank
- When the learner seems confused between two words → matching exercise
- During a listening analysis → comprehension questions
- After a conversation → test whether the learner absorbed key vocabulary

### Grading

Each exercise component manages its own interaction state. On completion, it reports back with correct/incorrect feedback. The AI can see the result and adapt.

---

## Feature: Content-Based Learning (Load Anything)

The learner shares a URL, uploads an image, or pastes text. The AI turns it into a lesson or conversation.

### Ingestion pipeline

```
User provides content
        │
        ▼
Content Type Router (server action)
        │
        ├── URL → fetch + Mozilla Readability → clean text
        ├── PDF → pdf2json → text
        ├── Image → Claude Vision → extracted text
        ├── YouTube → youtube-transcript → captions
        └── Pasted text → direct
        │
        ▼
Chunk into ~500-token sections → store with embeddings
        │
        ▼
Retrieve relevant chunks per turn → inject into prompt context
```

---

## Feature: Voice (The Endgame)

### Pipeline: STT → LLM → TTS

Modular pipeline, not speech-to-speech. We keep the text layer because: (1) the engine's tools need text to render UI components, (2) the learner's transcript shows in the chat, (3) corrections and vocabulary cards work the same in voice and text mode.

```
User speaks → mic
        │
        ▼
STT: gpt-4o-mini-transcribe (best Japanese accuracy, <400ms)
        │
        ▼
Text → same conversation engine (Claude Sonnet + tools)
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

### Latency budget

| Stage | Target | Best available |
|---|---|---|
| STT | <400ms | Deepgram Nova-3: ~150ms |
| LLM first token | <500ms | Claude Sonnet streaming: ~300-500ms |
| TTS first audio | <100ms | ElevenLabs Flash: ~75ms |
| **Total voice-to-voice** | **<1s** | **~525-725ms achievable** |

### What voice changes

Voice doesn't add a new mode — it changes the texture of every existing mode. A conversation becomes spoken. A lesson has verbal explanation. A listening exercise has the dialogue read aloud. The engine produces the same content; the I/O layer changes from text to speech.

### Development path

1. **VOICEVOX** (free, offline Japanese TTS) for development
2. **ElevenLabs Flash** for production quality
3. **gpt-4o-mini-transcribe** for STT from day one
4. **WebSockets** for MVP voice transport; **WebRTC via LiveKit** for production

---

## The Full Tool Set

### Shipping today

| Tool | What it does | Renders as |
|---|---|---|
| `suggestActions` | 2-3 contextual next moves | Chips below messages |
| `displayChoices` | Dialogue options with hints | Numbered buttons |
| `showVocabularyCard` | Word + reading + meaning + example + notes | Teaching card |
| `showGrammarNote` | Pattern + formation + examples + level | Explanation card |
| `showCorrection` | Original → corrected + explanation | Correction card |

### Next to build

| Tool | What it does | Renders as |
|---|---|---|
| `generateExercise` | Fill-blank, MCQ, matching, ordering, listening, reading | Interactive component |

### Future

| Tool | What it does | Renders as |
|---|---|---|
| `loadContent` | Parsed external content | Content preview panel |
| `kanjiPractice` | Stroke order walkthrough | Interactive canvas |
| `conjugationDrill` | Verb form quick-fire | Drill component |
| `pronunciationCheck` | Audio comparison | Waveform display |

---

## Implementation Phases

### Phase A: Voice (Priority)

**Full speech input/output — this is the endgame.**

1. Mic input component with Web Audio API
2. `/api/voice/stt` route with gpt-4o-mini-transcribe
3. Upgrade TTS to ElevenLabs Flash
4. Sentence-boundary streaming (buffer → TTS per sentence)
5. Transcript display in chat alongside audio

**Impact:** The conversation engine speaks. Every scenario, lesson, and conversation becomes verbal.

### Phase B: Interactive Exercises

**Add exercise generation to the existing conversation flow.**

1. Define exercise Zod schemas (fill-blank, MCQ, matching, ordering, listening, reading)
2. Build `<ExerciseRenderer>` with sub-components per type
3. Add `generateExercise` tool to `conversation-tools.ts`
4. Add case to PartRenderer
5. Wire up inline grading feedback

**Impact:** Transforms passive conversation into active learning.

### Phase C: Content Ingestion

**Let users load anything into the engine.**

1. Build `/api/content/extract` route with content type router
2. Add Readability, pdf2json, youtube-transcript
3. Set up pgvector for chunk embeddings and retrieval
4. Add URL/file input to the idle phase UI
5. Inject retrieved chunks into conversation context

**Impact:** Any article, video, image, or document becomes conversation practice material.

### Phase D: Prompt Caching + Cost

**Make it sustainable.**

1. Anthropic prompt caching with 2-3 breakpoints
2. Conversation summarization for long sessions
3. Route preprocessing and summarization to Haiku

**Impact:** ~87% cost reduction per session.

---

## Technical Decisions

### SSE vs WebSockets vs WebRTC

- **SSE** for all text/exercise streaming. The AI SDK uses this.
- **WebSockets** for voice MVP. Bidirectional audio.
- **WebRTC** (via LiveKit) for production voice. 300ms less latency.

### State in Interactive Components

Exercises, choices, and other interactive elements manage their own state in React. The message stream contains the definition. The component handles interaction. Results display inline.

---

## What We're Optimizing For

**Conversation quality.** Does the AI feel like a real person? Does it stay in character? Does it respond naturally?

**Teaching effectiveness.** Do lessons land? Do exercises test the right thing at the right moment?

**Speed.** How fast does the response come? Can the conversation feel real-time?

**The path to voice.** Every decision should make voice easier, not harder. Text is the stepping stone.

The question is: did the learner feel like they just had a real conversation in Japanese?
