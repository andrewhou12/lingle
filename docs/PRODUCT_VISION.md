# Lingle — Product Vision

## The One-Line Pitch

Lingle is a conversation practice engine for language learners. The AI plays the other person — you practice speaking.

---

## What We're Building

The product's job is to get users to **speak and use language**. Not to generate stories or immersive scenes. The AI plays the other person in a conversation — like a tutor saying "I'll be the waiter, you need to order. Go."

Three explicit modes:

1. **Contextual Conversation** — AI plays the other person. Context = situation + who + user's goal + how the AI character behaves. Then just talk.
2. **Interactive Lesson** — Structured teaching (grammar, vocab, patterns) with practice built in.
3. **Listening Practice** — AI generates an example conversation. User listens (TTS), asks questions about why things were said that way, what alternatives exist, then optionally jumps into a similar conversation themselves.

One prompt. Three formats. The learner describes what they want and the engine builds it.

The core experience: after a 15-minute session, the learner should feel like they just had a real conversation in their target language. Not a quiz. Not a lesson. A conversation they'd actually tell someone about.

---

## The Core Product

Lingle is a **conversation practice engine**. The AI is the other person in the conversation. The difficulty system, tools, and correction style all serve one purpose: making that conversation feel real and productive.

### What makes the engine work

**Realistic conversation partners.** The AI stays in character. A waiter takes orders. A coworker chats about work. A friend makes plans. It doesn't break character to narrate or describe — it just responds naturally.

**Difficulty that's invisible.** Six calibrated levels control everything the AI does — vocabulary ceiling, grammar complexity, kanji density, English support, ruby annotations, register. The learner sets it once. Every interaction adapts without them thinking about it again.

**Corrections that don't break flow.** When the learner makes a mistake, the AI recasts it naturally in its next response. An italic aside appears only when the error is instructive. The conversation never stops for a grammar lecture.

**Three modes, fluid transitions:**

| What the learner says | What happens |
|---|---|
| "Let's just chat in Japanese" | Casual conversation partner — friendly, natural |
| "I need to practice ordering food" | AI plays the waiter, learner orders |
| "Teach me how to use te-form" | Structured lesson with examples and practice |
| "I want to practice keigo for a job interview" | AI plays the interviewer, formal register |
| "Show me what a conversation at a restaurant sounds like" | AI generates example dialogue, then analyzes it |

---

## The Feeling

**Met where they are.** A beginner sees furigana on every kanji, English hints woven in, and simple responses. An advanced learner gets raw Japanese with dialect, slang, and register shifts. Same app, same scenario — completely different experience.

**Gently stretched.** The AI speaks at the learner's level + 10%. Not so easy it's boring. Not so hard it's paralyzing. The 70-85% comprehension sweet spot where acquisition happens naturally.

**Never punished.** When you make a mistake, the AI recasts it naturally. "I went to store" becomes "Oh, you went to the store? Which one?" You're never stopped. You're never told "that's wrong."

**Natural.** The AI responds like a real person would. It asks follow-up questions. It reacts to what you say. It doesn't over-teach during conversation or under-explain during lessons.

---

## What Exists Today

### Conversation Engine
- **AI partner** powered by Claude Sonnet 4, staying in character as the other person in the conversation
- **21 curated scenarios** across 3 modes: conversation practice, structured lessons, and listening exercises
- **Free prompt input** — describe any situation and the AI sets it up
- **Streaming responses** with real-time rendering
- **Contextual suggestions** — after each response, the AI proposes 2-3 natural next actions
- **Branching choices** — the AI can offer dialogue options with Japanese text and English hints
- **Session persistence** — every conversation is stored with full transcript

### Difficulty System
Six calibrated levels that control everything the AI does:

| Level | Label | What it means |
|---|---|---|
| 1 | Beginner (N5) | Hiragana/katakana primary, English translations, annotate all kanji |
| 2 | Elementary (N4) | Basic kanji with furigana, polite form, English hints for key phrases |
| 3 | Intermediate (N3) | Mixed Japanese/English, casual + polite, furigana for N3+ kanji |
| 4 | Upper-Intermediate (N2) | Mostly Japanese, natural contractions, dialect hints |
| 5 | Advanced (N1) | Full natural Japanese, furigana only for rare kanji |
| 6 | Near-Native | Unrestricted complexity, no furigana |

### Japanese Input
A full Japanese IME built into the chat:
- Type romaji, see it convert to kana in real-time
- Space bar brings up kanji candidates
- Hiragana/katakana toggle
- Composition highlighting that feels native

### Reading Support
- **Furigana** — the AI annotates kanji with `{kanji|reading}` syntax, rendered as proper ruby annotations
- **Romaji toggle** — for absolute beginners, overlay romaji on all Japanese text

### Voice
- **Text-to-speech** on every AI message — hear how it sounds with natural Japanese pronunciation
- Play/stop controls on each message

### AI Tools
The conversation partner has structured tools it can call mid-conversation:
- **Suggest actions** — contextual next moves for the learner
- **Display choices** — dialogue options with hints
- **Show vocabulary cards** — word, reading, meaning, example sentence, notes
- **Show grammar notes** — pattern, formation, examples, JLPT level
- **Show corrections** — original vs. corrected with explanation

### Infrastructure
- **Auth** — Google OAuth via Supabase
- **Database** — PostgreSQL with Prisma ORM
- **Stack** — Next.js 15, React 19, TypeScript, Tailwind CSS, Vercel AI SDK

---

## What Makes This Different

**1. The AI is the other person.** Not a narrator, not a game master, not a chatbot with a language learning wrapper. The AI plays the waiter, the coworker, the friend. It stays in character and responds naturally. This is how real conversation practice works.

**2. Three modes, one engine.** Conversation practice, structured lessons, and listening exercises all flow from the same AI engine. A conversation can become a mini-lesson when you ask "why did you say that?" A lesson can become practice when you're ready to try it yourself.

**3. Invisible difficulty.** No "N3 mode" label. No "select your level" before every session. You set it once, and everything calibrates: vocabulary, grammar, kanji, English support, register. The learner doesn't think about difficulty. They just talk.

**4. Corrections that don't break flow.** In real conversation, nobody stops you mid-sentence to correct your grammar. A good conversation partner uses the right form in their response, and you absorb it. Lingle does the same.

**5. Voice is the endgame.** Text is the stepping stone. The real product is voice conversations — speaking and being spoken to. Every architectural decision supports this trajectory.

**6. One prompt, instant start.** No onboarding wizard. No loading screen. Type or tap, and you're talking.

---

## Architecture: Tools as Capabilities

The engine's power comes from its tools. Each new modality — exercises, audio, documents — is just another tool the model can call. The model decides when to use each tool based on context.

```
┌──────────────────────────────────────────────────────────────┐
│                   CONVERSATION ENGINE                          │
│                                                              │
│  System prompt + learner difficulty + session context         │
│                                                              │
│  Tools:                                                      │
│    Text output (streaming markdown)                          │
│    suggestActions     → suggestion chips                     │
│    displayChoices     → dialogue option buttons               │
│    showVocabularyCard → vocabulary teaching card              │
│    showGrammarNote    → grammar explanation card              │
│    showCorrection     → error correction card                │
│    generateExercise   → interactive exercise (fill-blank,    │
│                         MCQ, matching, ordering, listening)  │
│    playAudio          → TTS for specific text                │
│                                                              │
│  The model decides what to use based on what the learner     │
│  needs. No hard-coded sequences. No mode switching.          │
└──────────────────────────────────────────────────────────────┘
```

---

## Roadmap

### Interactive Exercises (next)
The AI generates exercises on-the-fly during conversation. Fill-in-the-blank, multiple choice, matching, sentence ordering. Exercises render as interactive React components inline in the chat.

### Content-Based Learning
The learner shares a URL, uploads a file, or pastes text. The system extracts it, and the AI builds a learning experience around it — walking through an article paragraph by paragraph, glossing vocabulary, explaining grammar, generating comprehension exercises.

### Voice Conversations
Full speech pipeline: the learner speaks, their speech is transcribed, fed to the same engine, and the response is spoken aloud with native-quality pronunciation. Modular (STT → LLM → TTS) so we keep the text transcript for corrections and logging. Target: under 1 second voice-to-voice. **This is the endgame — the product becomes a real conversation partner you talk to.**

### Multi-Language Support
The architecture is language-agnostic. Expanding to Korean, Mandarin, Spanish, and others requires new difficulty definitions and language-specific input methods — but no architectural changes.

---

## Target User

**The motivated self-studier who wants to use their Japanese, not just study it.**

They've done the textbook thing. They know some grammar, recognize some kanji, can read simple sentences. But they don't have opportunities to practice real conversation. They might live somewhere Japanese isn't spoken. They might be too anxious to practice with real people. They want a low-pressure space to try things out.

They don't want flashcards. They don't want grammar drills in isolation. They want to feel what it's like to actually use the language — to order food, to chat with someone, to handle a phone call.

They are:
- Intermediate learners (N4-N3) who have grammar knowledge but lack production confidence
- Self-studiers who supplement textbooks with conversation practice
- Busy professionals who want 15-minute daily sessions that feel meaningful
- People who've tried conversation apps and found them either too rigid or too unstructured

---

## Success Metrics

### Engagement
- **Session frequency** — learners return at least 4 days/week
- **Session duration** — average session is 10-20 minutes
- **Mode variety** — learners use conversation, lesson, and listening modes
- **Free prompt usage** — learners create their own scenarios, not just pick from curated ones

### Experience
- **"I had a real conversation"** — the core qualitative measure. After a session, the learner feels like they practiced the language, not like they used an app
- **Difficulty calibration** — the learner doesn't feel lost or bored
- **Error correction acceptance** — learners absorb recasts without feeling corrected

### Technical
- **Time to first token** — under 1 second from send to first streamed response
- **Session startup** — instant, no loading screen
- **IME responsiveness** — kana conversion and kanji candidate display feel native

---

## Design Philosophy

**The conversation is the product.** The quality of the AI as a conversation partner is what matters. Everything else supports that.

**Meet people where they are.** If they want to chat, chat. If they want a lesson, teach. If they speak English, gently redirect but never punish. The app adapts to the learner.

**Earn every return visit.** Language learning is a years-long commitment. The app has to be a place people want to come back to — natural, useful, never frustrating.

**Simple surface, deep engine.** The UI is a text box and a grid of scenarios. Behind it: a system prompt engine, difficulty calibration, multi-tool AI partner, streaming architecture, and three distinct modes. The complexity serves the learner without burdening them.

**Corrections through compassion.** The hardest part of language learning isn't grammar — it's the courage to try. Every design decision protects that courage.
