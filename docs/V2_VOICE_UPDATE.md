# Lingle V2 — Voice Conversations, New Modes & What's Next

*March 2026*

---

## What Changed

The text conversation engine shipped in V1 worked. People could type in Japanese, get corrections, see vocabulary cards, follow session plans. But the core thesis — that Lingle should feel like talking to a real person — was capped by the text-only interface. You don't "talk to" a chat box.

This update ships the voice conversation system. The learner speaks. The AI speaks back. The conversation flows in real time with sub-second latency. Everything the text engine could do — corrections, vocabulary cards, grammar notes, session planning — still works, layered as visual overlays on top of the spoken conversation.

This is also a product direction shift. The original four modes (conversation, tutor, immersion, reference) have been unified under a single voice-first experience with mode-specific session plans and tool availability.

---

## What We Built

### Real-Time Voice Pipeline

The voice system follows the modular STT → LLM → TTS architecture outlined in the original V2 plan, but with a key change: **Soniox replaced the original STT plan**.

```
User holds mic → Soniox realtime streaming (stt-rt-v4, Japanese)
    → endpoint detection (1500ms silence)
    → final utterance text
    → Claude Sonnet 4 (streaming, with voice mode constraints)
    → SentenceBoundaryTracker extracts complete sentences
    → each sentence → /api/tts → audio blob → sequential playback
```

**Why Soniox over gpt-4o-mini-transcribe for realtime?** Soniox provides true streaming transcription — tokens arrive as the user speaks, with automatic endpoint detection when they stop. The OpenAI transcription model requires a complete audio recording to be uploaded. For push-to-talk voice conversations, the streaming approach means we can show partial transcription as the user speaks and begin processing the moment they stop, shaving hundreds of milliseconds off the loop. The OpenAI model is kept as a fallback via browser MediaRecorder for environments where Soniox isn't available.

**Sentence boundary detection** is critical for natural TTS. Japanese doesn't have the same punctuation conventions as English, and the LLM streams tokens one at a time. The `SentenceBoundaryTracker` buffers streaming text and emits complete sentences at `。`, `！`, `？`, `」` boundaries, with a 120-character fallback flush and secondary breaks at `、` for long runs. Each sentence is sent to TTS independently while the LLM continues streaming — so the user hears the first sentence before the full response is generated.

**Voice mode system prompt injection** keeps responses short and natural for speech:

```
═══ VOICE MODE ═══
1. Keep responses SHORT. 1-3 sentences max. No monologues.
2. Do NOT use displayChoices or suggestActions. Present options conversationally.
3. End sentences cleanly with 。！？ — the TTS needs clear boundaries.
4. No markdown, no bullet points, no lists. Just natural speech.
5. Corrections, vocabulary cards, and grammar notes still work as visual overlays.
6. If the learner's speech was unclear, ask them to repeat naturally.
```

### State Machine

The voice conversation runs on a 5-state FSM:

```
IDLE → LISTENING → THINKING → SPEAKING → (back to LISTENING)
                                    ↓
                              INTERRUPTED (user starts talking mid-AI-response)
                                    ↓
                               LISTENING
```

This prevents race conditions in the push-to-talk flow. The user can interrupt the AI mid-sentence — the TTS queue clears, playback stops, and the system returns to listening.

### Push-to-Talk Interface

The voice UI is a full-screen overlay with three regions:

- **Top bar**: Session plan toggle, transcript counter, duration timer, end button
- **Center**: Animated canvas orb + exchange view (last user/AI messages)
- **Bottom**: Push-to-talk button with ring fill animation

The orb is a canvas-rendered morphing shape with state-dependent animations — frequency bars when the user speaks, ripple waves when the AI speaks, rotating arcs when thinking. It provides ambient visual feedback without requiring audio visualization.

### Tool Output Routing (Voice-Specific)

In text mode, tool outputs render inline in chat. In voice mode, they need different treatment — you can't read a vocabulary card while listening. The voice UI routes tool outputs to zones:

| Tool | Voice Zone | Behavior |
|------|-----------|----------|
| `showCorrection` | Exchange view (inline) | Appears below the user's message with wavy underline |
| `showVocabularyCard` | Toast → vocab panel | Auto-dismiss toast, accumulates in side panel |
| `showGrammarNote` | Toast | Auto-dismiss after 8 seconds, pin to keep |
| `updateSessionPlan` | Hidden | Updates plan silently |
| `suggestActions` | Suppressed | Options presented conversationally instead |
| `displayChoices` | Suppressed | Options presented conversationally instead |

This means corrections feel natural (you see what you said wrong right where you said it), vocabulary cards collect in a reviewable list, and the conversation never stops for UI chrome.

### Session Plans by Mode

Session plans were restructured from a single generic schema to mode-specific types:

**Conversation mode** generates a scene card:
```typescript
{
  mode: 'conversation',
  topic: string,
  persona: { name?, relationship, personality },
  register: string, tone: string,
  setting?: string, culturalContext?: string,
  dynamic?: string, tension?: string
}
```

**Tutor mode** generates a lesson plan:
```typescript
{
  mode: 'tutor',
  topic: string, objective: string,
  steps: Array<{ title, type, status, notes? }>,
  concepts: Array<{ label, type }>,
  exerciseTypes?: string[]
}
```

**Immersion and reference modes** retain the milestone-based structure with focus/goals.

The begin overlay presents this plan visually before the session starts — showing the character, setting, and learning targets. The learner can add **steering messages** to adjust the plan before (or during) the session.

### Pre-Session Steering

Before the conversation begins, the learner sees the generated plan and can adjust it:

```
Plan: Ordering at a ramen shop with a friendly shop owner
Steering: "Make it a bit harder, I want to practice counter words"
Steering: "Use Kansai dialect"
```

These steering messages are injected as context when the session starts, and the mid-session sidebar allows adding more during the conversation.

---

## Infrastructure Changes

### New API Routes

| Route | Purpose |
|-------|---------|
| `/api/voice/soniox-key` | Returns Soniox API key for browser realtime client |

### Modified API Routes

| Route | Change |
|-------|--------|
| `/api/conversation/send` | Added `voiceMode` flag, injects voice constraints into system prompt |
| `/api/conversation/plan` | Returns mode-specific plan structures |
| `/api/conversation/plan/update` | Handles mode-specific plan updates |
| `/api/conversation/end` | Stores mode field on session close |
| `/api/conversation/list` | Returns mode in session list |
| `/api/tts` | Unchanged core, still accepts voice/speed params |

### Database Schema

One field added to `ConversationSession`:

```prisma
mode String @default("conversation")  // conversation | tutor | immersion | reference
```

No breaking changes.

### New Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@soniox/client` | ^1.0.2 | Realtime speech-to-text streaming |

### New Files

```
apps/web/
├── app/(app)/conversation/voice/     # Voice session page route
├── app/api/voice/soniox-key/         # Soniox API key endpoint
├── components/voice/
│   ├── voice-conversation-view.tsx    # Master container (prompt → plan → session)
│   ├── voice-session-overlay.tsx      # Full-screen session UI
│   ├── voice-central-orb.tsx          # Canvas-based animated orb
│   ├── voice-controls.tsx             # Push-to-talk button + toolbar
│   ├── voice-nav-bar.tsx              # Top bar (plan toggle, duration, end)
│   ├── voice-begin-overlay.tsx        # Pre-session plan display + steering
│   ├── voice-session-plan-sidebar.tsx # Live plan + mid-session steering
│   ├── voice-transcript-panel.tsx     # Full transcript with filter tabs
│   ├── voice-vocab-panel.tsx          # Collected vocabulary words
│   ├── voice-exchange-view.tsx        # Last turn display + corrections
│   ├── voice-fallback-input.tsx       # Text input fallback
│   ├── tool-toast.tsx                 # Auto-dismiss toast notifications
│   ├── tool-tray.tsx                  # Archived toast collection
│   └── session-progress.tsx           # Tutor step / milestone progress
├── hooks/
│   ├── use-soniox.ts                  # Soniox realtime STT hook
│   ├── use-voice-conversation.ts      # Voice session state machine
│   └── use-voice-tts.ts              # Streaming sentence-level TTS
└── lib/voice/
    └── voice-tool-zones.ts            # Tool → zone routing for voice UI
```

### Modified Files

| File | What changed |
|------|-------------|
| `conversation-tools.ts` | Mode-specific tool availability matrix, updated descriptions |
| `session-plan.ts` | Mode-specific plan types (ConversationPlan, TutorPlan, etc.), normalization |
| `experience-prompt.ts` | Voice mode system prompt injection |
| `conversation-view.tsx` | Updated for new plan types |
| `learning-panel.tsx` | Updated for mode-specific plan display |
| `chat-input.tsx` | Updated voice controls integration |
| `layout.tsx` | Voice route navigation |
| `page.tsx` | Updated landing |
| `globals.css` | Voice animations, atmosphere effects, dark-compatible tokens |
| `api.ts` | Updated types for mode support |
| `sentence-boundary.ts` | Refinements to boundary detection |

---

## Product Direction

### The Core Idea: Generative Practice Environments

Most language learning apps are content libraries. Duolingo has pre-written exercises. Italki has human tutors. Podcasts have scripted dialogues. The content exists before the learner arrives — they consume it.

Lingle generates the content from the learner's intent. One prompt creates an entire practice environment: a character with a personality and relationship to the learner, a realistic setting, conversational tension, target vocabulary, a difficulty ceiling, and behavioral rules that make the AI stay in character and teach implicitly. The learner doesn't pick from a menu of pre-made scenarios. They describe what they want to practice, and the system builds it.

This is the product's fundamental bet: **a generative practice engine is better than a content library** because it's infinitely flexible, always novel, and shaped by exactly what the learner needs right now.

### How It Works Today

The generative pipeline has three stages:

**1. The prompt.** The learner describes what they want in natural language. This can be specific ("I need to practice declining a coworker's invitation to drinks politely") or vague ("Let's just chat"). The system handles both.

**2. The plan.** A fast planning model (Claude Haiku) takes the prompt, the learner's difficulty level, native language, and the selected mode, and generates a structured session plan. This isn't a generic outline — it's a mode-specific blueprint:

- **Conversation mode** → a **scene card**: who the AI is playing (name, relationship to learner, personality traits), the register (casual, polite, keigo), the tone (lighthearted, serious, playful debate), the setting (izakaya after work, LINE messages), cultural context (end-of-year party season), and a tension point (politely decline without offending). The AI becomes that person and stays in character.

- **Tutor mode** → a **lesson plan**: a clear objective ("conjugate and use te-form in 3 sentence patterns"), 3-8 pedagogical steps using a typed vocabulary (activate prior knowledge → explain → comprehension check → guided practice → free production → review), specific concepts tagged as grammar/vocabulary/usage, and exercise types. The AI follows this structure while keeping the interaction conversational.

- **Immersion mode** → a **content plan**: what type of native content to generate (dialogue between speakers, reading passage, simplified news article, JLPT-style questions), a content spec, target vocabulary the content will feature, and comprehension questions. The AI generates the content, then walks through it analytically.

- **Reference mode** → a **Q&A plan**: the topic, related topics to explore next, and milestones focused on definition → examples → common mistakes → practice.

**3. The session.** The plan is injected into the system prompt on every turn. The AI reads it, follows it, and updates it as the session evolves. If the learner redirects ("actually, can we practice something else?"), the AI calls `updateSessionPlan` to record the shift, and the next turn reads the updated plan. The plan is a living document, not a script.

### What Makes This Generative, Not Just "AI Chat"

The difference between Lingle and "talk to ChatGPT in Japanese" is structure. ChatGPT will happily chat in Japanese, but it has no plan, no character consistency, no difficulty ceiling, no implicit teaching strategy, and no tools to render corrections, vocabulary cards, or grammar notes as structured UI. It's a blank canvas.

Lingle's generative engine constrains the AI into being a specific kind of conversation partner:

**Character consistency.** When the plan says "Yuki, a close friend who's cheerful and talkative, casual register," the AI stays Yuki for the entire session. It doesn't break character to explain grammar (unless asked). It doesn't suddenly become formal. It doesn't narrate actions. It texts like a friend would.

**Invisible difficulty control.** The difficulty level gates everything: vocabulary ceiling, grammar complexity, kanji density, furigana annotations, how much English support to provide. At level 2 (N4), the AI won't use N2 grammar even if the scenario would naturally call for it. The learner practices at their level without thinking about their level.

**Implicit teaching through scenario design.** The plan can include tension points that force specific language use. "Politely decline an invitation" requires keigo and indirect refusal patterns. "Order food with dietary restrictions" requires counter words and the ～てもいいですか pattern. "Comfort a friend who failed an exam" requires empathetic language and casual register. The scenario *is* the curriculum.

**Structured corrections without breaking flow.** When the learner makes an error, the AI recasts it naturally in its next message (using the correct form as if it were normal conversation), then fires a `showCorrection` tool that renders as a visual overlay — original, corrected, brief explanation. In voice mode, you hear the recast before you see the card. The conversation never stops for a grammar lecture.

**Live plan evolution.** The AI tracks progress against its plan. In tutor mode, it marks lesson steps as completed and advances to the next. In conversation mode, it can shift the scene — introduce a new topic, escalate the tension, change register. The learner sees this happening in the plan sidebar. The AI isn't just reacting turn by turn; it's following a trajectory.

### Why This Matters

**Every session is novel.** "Practice ordering food" generates a different restaurant, a different server personality, different menu items, different conversational wrinkles every time. The learner can run the same prompt 10 times and get 10 genuinely different practice sessions.

**The learner controls the curriculum.** They don't follow a prescribed path through textbook chapters. They practice what they need *today* — a job interview, a doctor's appointment, small talk with a neighbor, reading a manga panel. The generative engine meets them where they are.

**The difficulty scales without the learner choosing.** A beginner typing "let's practice at a restaurant" gets simple vocabulary, furigana everywhere, English hints, and a patient server who speaks slowly. An advanced learner typing the same prompt gets a gruff Osaka ramen shop owner who speaks in dialect with slang. Same prompt. Completely different experience.

**Sessions have arc.** A good tutor session isn't "here are some grammar rules." It has a warm-up, an explanation, a check, guided practice, free production, and a review. The generative plan creates this structure automatically, and the AI follows it while keeping the interaction feeling natural, not robotic.

### The Prompt → Plan → Session Loop

```
"I want to practice apologizing to my boss for being late"
    │
    ▼
Plan Generation (Claude Haiku, ~300ms)
    │
    ├── Mode: conversation
    ├── Topic: Apologizing to your boss for tardiness
    ├── Persona: Tanaka-buchō, your direct manager — calm but expects accountability
    ├── Register: keigo (business formal)
    ├── Tone: serious but not hostile
    ├── Setting: Office, morning meeting
    ├── Cultural context: Japanese workplace hierarchy, importance of punctuality
    ├── Tension: You need to apologize sincerely without making excuses
    │
    ▼
Session starts → AI is Tanaka-buchō
    │
    ├── AI opens in character, in keigo, referencing the morning meeting
    ├── Learner responds → AI stays in character, recasts errors naturally
    ├── Correction cards appear as visual overlays
    ├── Vocabulary cards surface for new business Japanese terms
    ├── AI can shift the scene (tension escalates, or boss accepts apology)
    ├── Plan updates live as the conversation evolves
    │
    ▼
Session ends → transcript saved, vocabulary collected, corrections logged
```

### Four Modes, One Engine

| Mode | What it generates | The feeling |
|------|-----------|-------------------|
| **Conversation** | A scene with a character, setting, and tension | Like texting or talking to a real person |
| **Tutor** | A structured lesson with steps and exercises | Like a great private tutor on italki |
| **Immersion** | Native content with analysis and comprehension | Like studying with a knowledgeable friend |
| **Reference** | Structured explanations with examples and practice | Like having a language encyclopedia that talks back |

The engine underneath is the same Claude Sonnet conversation with the same tools. What changes per mode is the plan structure, the system prompt's behavioral instructions, which tools are available, and how tool outputs are routed in the UI. The generative pipeline — prompt → plan → constrained AI session — is the same.

### Steering: The Learner as Co-Director

The plan isn't handed down and locked. The learner is a co-director:

**Before the session:** After the plan generates, the learner sees it in a begin overlay — the character, setting, tone, everything. They can add steering messages: "Make it harder," "Use Kansai dialect," "I want to practice counter words specifically." These get injected as context when the session starts.

**During the session:** A sidebar shows the live plan. The learner can add more steering messages at any time: "Let's switch to casual," "Can you introduce a third person?" The AI reads these and adapts.

**The AI steers too.** The AI calls `updateSessionPlan` when the conversation naturally evolves — shifting the topic, advancing lesson steps, marking milestones complete. In tutor mode, you can watch the lesson steps tick from "upcoming" to "active" to "completed" as the AI progresses through its plan.

This makes the experience collaborative. The learner and the AI are both shaping the session in real time.

### Voice Makes the Generative Engine Real

Text-based generation is useful. Voice-based generation is transformative.

When the plan generates "Yuki, close friend, cheerful, casual register, planning a weekend trip" and you then *hear* Yuki talking to you in casual Japanese — asking where you want to go, reacting to your suggestions, laughing when you suggest something unexpected — the generated scenario stops feeling like an exercise and starts feeling like a conversation.

Voice adds rhythm, pacing, and presence that text can't replicate. The corrections appear visually while the conversation continues verbally. Vocabulary cards accumulate silently in a panel. The plan evolves in the sidebar. But the core experience is just: you're talking to someone in Japanese, and it feels real.

This is the product's trajectory. The generative engine creates practice environments. Voice makes them feel inhabited.

---

## Where We're Going

### Near-Term: Make the Engine Feel Instant and Polished

**Latency.** The voice loop needs to feel like a real conversation, not a call with lag. Targets:
- STT endpoint → LLM first token: < 300ms
- LLM first sentence → first audio chunk: < 200ms
- Total voice-to-voice: consistently under 1.5s, targeting < 1s

**ElevenLabs TTS.** The current TTS uses OpenAI's tts-1. ElevenLabs Flash v2.5 offers better Japanese voice quality and ~75ms TTFB (vs ~200ms). For a language learning app, the voice the learner listens to *is* their model for natural speech. This matters.

**Session history and replay.** Sessions save transcripts but don't surface them well yet. The vision: after a session, see the full transcript with inline corrections highlighted, vocabulary cards collected, a brief AI-generated summary of what you practiced and where you struggled. Over time, this becomes a journal of your learning.

**Plan quality.** The generative plans need to be consistently excellent. Right now, some prompts produce great scene cards and others produce generic ones. Improving the planning prompt, adding few-shot examples, and tuning the Haiku call will make every session feel crafted.

### Medium-Term: The Engine Gets Smarter

**Knowledge-aware plan generation.** Right now, the plan generator only knows the learner's prompt and difficulty level. The next leap: feed it the learner's vocabulary history, error patterns, and avoidance patterns. "Practice at a restaurant" for a learner who's been avoiding counter words should automatically generate a scenario that forces counter word usage. The generative engine becomes adaptive — it generates practice for what the learner specifically needs, not just what they asked for.

**Post-session analysis.** After each conversation, analyze the transcript:
- Which target vocabulary did the learner actually produce?
- What errors came up? Are they recurring?
- What did the learner avoid? (e.g., always using simple forms when the plan targeted て-form)
- What new vocabulary appeared naturally?

This closes the loop. The generative engine creates targeted practice → the session produces evidence → the analysis updates the learner model → the next plan adapts. Each session gets slightly better calibrated.

**Interactive exercises in voice.** Tutor mode should generate exercises mid-conversation: "Try saying that sentence yourself," "Fill in: 私は___を食べました," "Which is more natural: A or B?" Voice makes this feel like a tutor asking you to try something, not a quiz app presenting a widget.

**Pronunciation feedback.** The STT transcript already captures what the learner said. Comparing it against the intended utterance reveals pronunciation errors. Track these over time. Flag patterns ("you consistently drop the う in ～ています"). This adds a new signal to the learner model without any new UI.

**Content as prompt.** Instead of describing what you want to practice, paste a URL, upload a photo of a menu, or share a manga panel. The system extracts the content and generates a practice session around it: "Let's practice ordering from this actual restaurant menu" or "Let's discuss what's happening in this manga page." The generative engine goes from prompt-driven to content-driven.

### Long-Term: The Learner Model is the Product

**Full knowledge state.** Every item the learner has encountered — vocabulary, grammar patterns, kanji — tracked with mastery states (unseen → introduced → apprentice → journeyman → expert → master) and separate FSRS scheduling for recognition and production. The learner profile becomes a living probabilistic map of what they know.

**SRS as daily anchor.** Spaced repetition review sessions computed locally, no network dependency. The daily queue pulls items due for review. New items are introduced only after the queue is cleared. Production drills create the evidence needed for mastery advancement. This is the habit that brings learners back every day.

**The generative engine reads the profile.** When the plan generator has access to the full learner model, sessions become deeply personalized:
- "Free conversation" for a learner with 5 flagged avoidance patterns automatically creates scenarios that surface those patterns
- Tutor mode notices the learner has been stuck on conditional grammar for 2 weeks and designs a focused remediation lesson
- Immersion mode generates a reading passage that uses exactly the vocabulary the learner is about to forget (items with declining FSRS stability)

This is the endgame: the generative engine doesn't just create practice environments from prompts — it creates them from the learner's actual knowledge state. Every session is both what the learner wants *and* what they need.

**Multi-language.** The architecture is language-agnostic. Difficulty levels, session plans, tools, the voice pipeline, the plan schemas — none of it is Japanese-specific. Korean, Mandarin, and Spanish require new difficulty definitions and language-specific input methods, but no architectural changes.

**Offline-first desktop.** Return to the Electron architecture for a native experience with local FSRS scheduling, local database, and no network dependency for review sessions. The voice pipeline and generative sessions still need the network, but the daily review habit works anywhere.

---

## Technical Debt & Known Issues

- **Soniox key exposure.** The API key is served directly to the browser. Needs scoped temporary tokens per the Soniox API's intended pattern.
- **TTS cost.** Every sentence is a separate TTS API call. Batching or streaming audio would reduce cost and latency.
- **No audio caching.** Common phrases (greetings, fillers) could be cached to avoid redundant TTS calls.
- **Canvas orb performance.** The animation runs at 60fps with RequestAnimationFrame. On low-end devices, this could cause jank during voice processing. May need a reduced-motion mode.
- **Session plan backward compatibility.** The `normalizePlan()` function handles old plan formats, but the migration path should be formalized.
- **No error recovery in voice pipeline.** If Soniox disconnects mid-session or TTS fails, the UI shows an error but doesn't gracefully degrade to text input.

---

## Architecture Diagram (Current)

```
┌──────────────────────────────────────────────────────────────────────┐
│  BROWSER (React 19)                                                   │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │  Voice Session Overlay                                        │    │
│  │  ┌────────────┐  ┌──────────────┐  ┌──────────────────────┐  │    │
│  │  │  Nav Bar    │  │  Central Orb │  │  Exchange View       │  │    │
│  │  │  Plan toggle│  │  (Canvas)    │  │  Last user/AI turn   │  │    │
│  │  │  Transcript │  │  5 states    │  │  Inline corrections  │  │    │
│  │  │  Duration   │  │              │  │  Partial speech      │  │    │
│  │  └────────────┘  └──────────────┘  └──────────────────────┘  │    │
│  │  ┌────────────┐  ┌──────────────┐  ┌──────────────────────┐  │    │
│  │  │  Plan       │  │  Push-to-Talk│  │  Tool Toasts         │  │    │
│  │  │  Sidebar    │  │  Button      │  │  Vocab Panel         │  │    │
│  │  │  Steering   │  │  Ring anim   │  │  Transcript Panel    │  │    │
│  │  └────────────┘  └──────────────┘  └──────────────────────┘  │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  Hooks: useVoiceConversation (FSM), useSoniox (STT),                 │
│         useVoiceTTS (streaming TTS), useChat (LLM)                   │
└──────────────────────────┬───────────────────────────────────────────┘
                           │  HTTP / SSE
┌──────────────────────────┴───────────────────────────────────────────┐
│  SERVER (Next.js 15 API Routes)                                       │
│                                                                      │
│  /conversation/plan        → Haiku generates mode-specific plan       │
│  /conversation/plan/update → User/AI plan edits                       │
│  /conversation/send        → Sonnet streams (voiceMode flag)          │
│  /conversation/end         → Close session, save mode + transcript    │
│  /voice/soniox-key         → Soniox API key for browser client        │
│  /tts                      → TTS (voice, speed params)                │
│                                                                      │
│  Server Lib:                                                          │
│    experience-prompt.ts    → System prompt + voice mode injection      │
│    conversation-tools.ts   → Mode-specific tool matrix                │
│    session-plan.ts         → Mode-specific plan schemas               │
│    voice-tool-zones.ts     → Tool → UI zone routing                   │
└──────────────────────────┬───────────────────────────────────────────┘
                           │
┌──────────────────────────┴───────────────────────────────────────────┐
│  EXTERNAL SERVICES                                                    │
│                                                                      │
│  Claude Sonnet 4    → Conversation (streaming, 6 tools, voice mode)   │
│  Claude Haiku 4.5   → Session plan generation                         │
│  Soniox stt-rt-v4   → Realtime Japanese STT (streaming)               │
│  OpenAI gpt-4o-mini → Fallback STT (batch)                           │
│  OpenAI tts-1       → Text-to-speech (→ ElevenLabs planned)           │
│  Supabase           → Auth + Postgres                                 │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Summary

Lingle's bet is that a generative practice engine — one that creates custom, structured, realistic language practice from a single prompt — is fundamentally better than a content library. This update ships the two pieces that make that bet real: a voice pipeline that makes generated sessions feel like actual conversations, and a mode-specific plan system that gives every session structure, character, and purpose.

The generative pipeline today: prompt → mode-specific plan (scene card, lesson plan, content plan, Q&A plan) → constrained AI session with live plan tracking and steering. The generative pipeline tomorrow: learner knowledge state + prompt → adaptive plan that targets what the learner specifically needs → session that produces evidence → analysis that updates the knowledge state → smarter next session.

The text engine remains fully functional. Voice is additive. But the direction is clear: the product is the generative engine, voice is how you inhabit what it creates, and the learner model is how it gets smarter over time.
