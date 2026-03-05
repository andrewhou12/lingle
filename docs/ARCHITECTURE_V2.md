# Lingle Architecture — V2 (March 2026)

This document describes the current architecture after the Session Plans + Side Panel + Voice + Difficulty Validation update. For the original V1 architecture, see `CLAUDE.md`.

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  BROWSER (React 19 Client)                                  │
│                                                             │
│  ┌──────────────────────┐  ┌─────────────────────────────┐  │
│  │   Conversation View  │  │    Learning Panel (340px)    │  │
│  │   ┌────────────────┐ │  │  ┌─────────────────────────┐│  │
│  │   │ MessageBlock   │ │  │  │  Session Plan            ││  │
│  │   │ + PartRenderer │ │  │  │  Goals · Milestones      ││  │
│  │   │ + ReferencePill│←│──│──│  Vocab/Grammar targets   ││  │
│  │   └────────────────┘ │  │  ├─────────────────────────┤│  │
│  │   ┌────────────────┐ │  │  │  Tool Cards             ││  │
│  │   │ ChatInput      │ │  │  │  VocabularyCard          ││  │
│  │   │ + VoiceControls│ │  │  │  GrammarNote             ││  │
│  │   │ + Japanese IME │ │  │  │  CorrectionCard          ││  │
│  │   └────────────────┘ │  │  └─────────────────────────┘│  │
│  │   Difficulty badges  │  └─────────────────────────────┘  │
│  └──────────────────────┘                                   │
│                                                             │
│  Hooks: useChat, useVoice, useStreamingTTS, usePanel,       │
│         useTTS, useJapaneseIME, useRomaji                   │
└──────────────────────────┬──────────────────────────────────┘
                           │  HTTP / SSE / FormData
┌──────────────────────────┴──────────────────────────────────┐
│  SERVER (Next.js 15 API Routes)                             │
│                                                             │
│  /conversation/plan      → Haiku generates SessionPlan      │
│  /conversation/plan/update → User edits plan from panel     │
│  /conversation/send      → Sonnet streams with plan context │
│  /conversation/end       → Close session                    │
│  /conversation/xray      → Sentence analysis                │
│  /voice/stt              → gpt-4o-mini-transcribe           │
│  /tts                    → OpenAI TTS (voice, speed params) │
│  /profile                → Learner profile CRUD             │
│                                                             │
│  Server Lib:                                                │
│    experience-prompt.ts  → System prompt + plan injection    │
│    conversation-tools.ts → 6 tools (+ updateSessionPlan)    │
│    session-plan.ts       → Schema + formatPlanForPrompt()   │
│    difficulty-validator   → Post-response JLPT checking     │
│    tool-zones.ts         → Route tools to panel/inline/etc  │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────┴──────────────────────────────────┐
│  EXTERNAL SERVICES                                          │
│                                                             │
│  Claude Sonnet 4  → Conversation (streaming, 6 tools)       │
│  Claude Haiku 4.5 → Session plan generation + xray          │
│  OpenAI gpt-4o-mini-transcribe → STT (Japanese)             │
│  OpenAI tts-1     → Text-to-speech (shimmer voice)          │
│  Supabase         → Auth + Postgres                         │
└─────────────────────────────────────────────────────────────┘
```

---

## Session Plan System

The session plan is the backbone of every conversation. It's generated at session start, re-read on every turn, and modifiable by both AI and user.

### Lifecycle

```
Session Start
    │
    ├─ User provides: prompt + mode + difficulty
    │
    ▼
Plan Generation (Claude Haiku, ~300ms)
    │
    ├─ generateObject() with Zod schema
    ├─ Returns: SessionPlan { focus, goals, approach,
    │     milestones, targetVocabulary, targetGrammar, scenario }
    │
    ▼
Stored in DB: conversationSession.sessionPlan (JSON)
    │
    ▼
Every Turn (/api/conversation/send):
    ├─ Re-read sessionPlan from DB
    ├─ formatPlanForPrompt() → text block appended to system prompt
    ├─ AI follows plan, tracks milestones
    ├─ AI calls updateSessionPlan tool when direction shifts
    └─ User can edit plan in side panel → POST /plan/update
```

### SessionPlan Schema

```typescript
interface SessionPlan {
  focus: string                    // One-line session summary
  goals: string[]                  // 2-4 learning objectives
  approach: string                 // Teaching strategy
  milestones: Array<{
    description: string
    completed: boolean
  }>
  targetVocabulary?: string[]      // Key words to practice
  targetGrammar?: string[]         // Patterns to cover
  scenario?: {                     // Conversation mode only
    setting: string
    aiRole: string
    learnerGoal: string
    register: string
  }
}
```

### Plan Injection

On every turn, the send route reads the latest plan from the DB and appends it to the static system prompt:

```
═══ SESSION PLAN ═══
Focus: Ordering at a ramen shop
Goals:
  - Practice food ordering vocabulary
  - Use ～てもいいですか pattern naturally
Milestones:
  [x] 1. Greet and establish the ramen shop context
  [ ] 2. Practice ordering with counter words
  [ ] 3. Ask about menu items using question patterns
Target vocabulary: ラーメン, 味噌, 醤油, 替え玉, 大盛り
Target grammar: ～てもいいですか, ～にします

Follow this plan. Track milestones. Adapt if the learner's needs
shift — call updateSessionPlan to record changes.
```

---

## Tool Zone Routing

Tools are routed to different UI zones based on their type:

| Tool | Zone | Behavior |
|------|------|----------|
| `suggestActions` | `chips` | Extracted to bottom chips, hidden inline |
| `displayChoices` | `inline` | Always rendered inline in chat |
| `showCorrection` | `panel` | Panel card + inline reference pill |
| `showVocabularyCard` | `panel` | Panel card + inline reference pill |
| `showGrammarNote` | `panel` | Panel card + inline reference pill |
| `updateSessionPlan` | `hidden` | Updates plan state silently |

When the panel is **open**, panel-zone tools render as compact reference pills in chat (e.g., "📘 食べる") and full cards in the side panel. When the panel is **closed**, they render as full cards inline (original behavior).

The panel auto-opens when the first panel-zone tool is dispatched.

---

## Side Panel

A 340px collapsible panel on the right side of the chat. Two sections:

### Plan Section (top, collapsible)
- Session focus
- Goals list
- Milestones with interactive checkboxes (user can toggle)
- Target vocabulary tags (blue)
- Target grammar tags (purple)
- Scenario details (if conversation mode)

User edits → `POST /api/conversation/plan/update` → next AI turn sees the updated plan.

### Cards Section (scrollable)
- Vocabulary cards, grammar notes, correction cards
- Populated from streaming tool outputs
- Uses the same card components as the inline chat rendering

---

## Voice Pipeline

### Input: Speech-to-Text

```
Mic button (VoiceControls) → MediaRecorder (webm/opus)
    → POST /api/voice/stt (FormData)
    → OpenAI gpt-4o-mini-transcribe (language: 'ja')
    → transcript text → sendMessage()
```

Three states: idle (mic icon) → recording (pulsing red) → transcribing (spinner).

### Output: Streaming TTS

When voice mode is enabled (toggle in session bar):

```
Streaming assistant text
    → SentenceBoundaryTracker (detects 。！？\n boundaries)
    → Each complete sentence → POST /api/tts
    → Audio blob → queue → sequential playback with prefetch
```

The sentence boundary tracker handles Japanese punctuation (`。！？`) and quote endings (`」`), with a 120-char fallback flush for long runs without boundaries.

The TTS route now accepts optional `voice` and `speed` parameters for future customization.

---

## Difficulty Validation

After each assistant message finishes streaming, an async validator runs:

```
Assistant text → kuromoji tokenizer → content words
    → JLPT lookup (2000-word dictionary, N5–N1)
    → Compare against learner's difficulty level
    → Violations rendered as warm-colored badges: [食べる N2]
```

Mapping: difficulty 1 (Beginner) allows only N5 words, difficulty 2 allows N5+N4, etc. Near-native (6) has no restrictions.

This is informational — it doesn't block the response, just annotates above-level vocabulary with subtle badges showing the JLPT level.

---

## Conversation Tools (6 total)

| # | Tool | Purpose | Zone |
|---|------|---------|------|
| 1 | `updateSessionPlan` | Mark milestones, adjust goals/vocab/grammar | hidden |
| 2 | `suggestActions` | 2-3 contextual next actions | chips |
| 3 | `displayChoices` | 2-4 numbered choice buttons | inline |
| 4 | `showCorrection` | Error correction card | panel |
| 5 | `showVocabularyCard` | Vocabulary teaching card | panel |
| 6 | `showGrammarNote` | Grammar explanation card | panel |

---

## System Prompt Assembly

The system prompt is constructed in layers:

```
1. Static base (experience-prompt.ts)
   ├── Mode block (conversation/tutor/immersion/reference)
   ├── Formatting rules ({kanji|reading} ruby)
   ├── Tool descriptions (6 tools)
   ├── Tool rules (text before tools, no duplication)
   ├── Difficulty behavior block (N5–Near-Native)
   ├── Learner context (native lang, target lang, prompt)
   └── Rules (7 rules including "FOLLOW THE PLAN")

2. Dynamic plan injection (re-read from DB each turn)
   └── formatPlanForPrompt(sessionPlan)
       ├── Focus, Goals, Approach
       ├── Milestones with completion status
       ├── Target vocabulary and grammar
       └── Scenario details
```

---

## File Map

### New Files (V2)

| File | Purpose |
|------|---------|
| `lib/session-plan.ts` | SessionPlan interface + formatPlanForPrompt() |
| `lib/tool-zones.ts` | Tool → zone routing map |
| `lib/jlpt-vocabulary.ts` | ~2000-word JLPT level lookup |
| `lib/difficulty-validator.ts` | Post-response JLPT validation |
| `lib/voice/sentence-boundary.ts` | Japanese sentence boundary detection |
| `hooks/use-panel.tsx` | Panel open/close context |
| `hooks/use-voice.ts` | MediaRecorder + STT transcription |
| `hooks/use-streaming-tts.ts` | Streaming sentence-level TTS |
| `components/panels/learning-panel.tsx` | Side panel (plan + cards) |
| `components/chat/voice-controls.tsx` | Mic button (3 states) |
| `app/api/conversation/plan/update/route.ts` | User plan edits |
| `app/api/voice/stt/route.ts` | Speech-to-text via OpenAI |

### Modified Files (V2)

| File | Changes |
|------|---------|
| `app/api/conversation/plan/route.ts` | Haiku plan generation via generateObject |
| `app/api/conversation/send/route.ts` | Re-reads plan from DB, appends to system prompt |
| `app/api/tts/route.ts` | Added voice + speed params |
| `lib/conversation-tools.ts` | Added updateSessionPlan tool |
| `lib/experience-prompt.ts` | Added tool docs + rule 7 (FOLLOW THE PLAN) |
| `lib/api.ts` | Updated return types, added conversationPlanUpdate |
| `components/conversation-view.tsx` | Panel layout, voice, plan state, difficulty badges |
| `components/chat/chat-input.tsx` | Replaced stub mic with VoiceControls |

---

## Data Flow Summary

```
User types/speaks message
    ↓
POST /send with sessionId
    ↓
Server reads sessionPlan from DB
    ↓
System prompt = static prompt + plan block
    ↓
Claude Sonnet streams response (text + tools)
    ↓
Tool outputs routed by zone:
    ├── chips → bottom suggestion chips
    ├── inline → rendered in chat
    ├── panel → side panel cards (+ reference pills in chat)
    └── hidden → state updates only
    ↓
If voice mode enabled:
    sentence boundary tracker → TTS queue → audio playback
    ↓
After streaming completes:
    difficulty validator → annotate above-level vocabulary
    ↓
AI updates plan via updateSessionPlan tool
    ↓
Next turn reads updated plan from DB
```
