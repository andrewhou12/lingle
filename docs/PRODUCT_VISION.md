# Lingle — Product Vision

## The One-Line Pitch

Lingle is a generative language immersion engine. You describe where you want to be, and it takes you there.

---

## What We're Building

Most language apps make you feel like you're studying. Lingle makes you feel like you're living.

Type "I'm at a ramen shop in Osaka" and you're standing at the counter. A cook greets you. The menu is on the wall. You have to order — in Japanese, at your level, with just enough support to stretch without breaking. Type "let's just talk" and you have a warm, curious conversation partner who notices your mistakes without stopping you. Type "teach me keigo" and you get a patient tutor who meets you exactly where you are.

One prompt. Infinite formats.

The core experience: after a 15-minute session, the learner should feel like they just had a real interaction in their target language. Not a quiz. Not a lesson. An experience they'd actually tell someone about.

---

## The Core Product

Lingle is a **generation engine for language learning experiences**. The same way Lovable generates full applications from a prompt, Lingle generates full immersive language sessions from a prompt. The model is the engine. Everything else — difficulty calibration, tool selection, correction style, exercise generation — is decided by the model in real time based on who the learner is and what they asked for.

There is no curriculum. There are no modules. There is no predetermined path. The learner describes what they want, and the engine builds it — adapting continuously as the session unfolds.

### What makes the engine work

**A rich set of tools the model can compose freely.** The AI doesn't just talk — it can show vocabulary cards, explain grammar, generate interactive exercises, offer branching dialogue choices, illustrate scenes, and play audio. Each capability is a tool. The model decides which tools to use and when, based on what the learner needs in that moment. No hard-coded sequences. No mode switching.

**Difficulty that's invisible.** Six calibrated levels control everything the AI does — vocabulary ceiling, grammar complexity, kanji density, English support, ruby annotations, register. The learner sets it once. Every interaction adapts without them thinking about it again.

**Corrections that don't break flow.** When the learner makes a mistake, the AI recasts it naturally in its next response. An italic aside appears only when the error is instructive. The conversation never stops for a grammar lecture. The learner absorbs the right form by hearing it right, not by being told they're wrong.

**Generative flexibility as the core feature.** The AI reads the learner's intent and adapts:

| What the learner says | What happens |
|---|---|
| "Let's just chat in Japanese" | Casual conversation partner — warm, curious, responsive |
| "I'm at a ramen shop in Osaka" | Narrated immersion with characters, setting, branching choices |
| "Teach me how to use te-form" | Guided tutoring with examples, practice, corrections |
| "I want to practice keigo for a job interview" | Targeted scenario with specific register focus |
| "Tell me a ghost story in Japanese" | Creative/narrative mode — engaging AND educational |
| "Help me read this NHK article" | Reading comprehension guide with glossing and grammar notes |

The AI doesn't announce which mode it's in. It just does it. And it shifts fluidly mid-session: a casual chat becomes a mini-lesson when the learner asks "wait, why did you use that grammar?", and a structured scenario loosens into free conversation when the learner goes off-script.

---

## The Feeling

**Teleported, not tutored.** The learner forgets they're using an app. They're in the scene, making choices, reacting to characters, improvising responses. The language is the vehicle, not the destination.

**Met where they are.** A beginner sees furigana on every kanji, English hints woven into narration, and simple choices. An advanced learner sees raw Japanese with dialect, slang, and register shifts. Same app, same scenario — completely different experience.

**Gently stretched.** The AI speaks at the learner's level + 10%. Not so easy it's boring. Not so hard it's paralyzing. The 70-85% comprehension sweet spot where acquisition happens naturally — Krashen's i+1, but felt rather than calculated.

**Never punished.** When you make a mistake, the AI recasts it naturally. "I went to store" becomes "Oh, you went to the store? Which one?" in the AI's next line. You're never stopped. You're never told "that's wrong." You learn by hearing it right.

**Surprised.** The cook at the ramen shop has a personality. She's from Hokkaido and has opinions about your order. The ghost story takes a turn you didn't expect. The tutoring session uses an example that makes you laugh. Language learning is a daily habit — the app has to earn every return visit.

---

## What Exists Today

### Conversation Engine
- **AI partner** powered by Claude Sonnet 4, with a rich system prompt that adapts to any situation
- **26 curated scenarios** across 8 categories: featured, casual conversation, real-world situations, work & formal, social, structured learning, culture, and creative
- **Free prompt input** — type anything and the AI builds the right experience around it
- **Streaming responses** with real-time rendering as the AI generates
- **Contextual suggestions** — after each response, the AI proposes 2-3 natural next actions
- **Branching choices** — the AI can offer numbered dialogue options with Japanese text and English hints
- **Session persistence** — every conversation is stored with full transcript

### Difficulty System
Six calibrated levels that control everything the AI does:

| Level | Label | What it means |
|---|---|---|
| 1 | Beginner (N5) | Hiragana/katakana primary, English translations for all dialogue, annotate all kanji |
| 2 | Elementary (N4) | Basic kanji with furigana, polite form, English hints for key phrases |
| 3 | Intermediate (N3) | Mixed Japanese/English narration, casual + polite, furigana for N3+ kanji |
| 4 | Upper-Intermediate (N2) | Mostly Japanese, natural contractions, dialect hints |
| 5 | Advanced (N1) | Full natural Japanese, furigana only for rare kanji, full register variation |
| 6 | Near-Native | Unrestricted complexity, no furigana, literary narration |

### Japanese Input
A full Japanese IME built into the chat:
- Type romaji, see it convert to kana in real-time
- Space bar brings up kanji candidates with intelligent segmentation
- Hiragana/katakana toggle
- Composition highlighting that feels native

### Reading Support
- **Furigana** — the AI annotates kanji with `{kanji|reading}` syntax, rendered as proper ruby annotations
- **Romaji toggle** — for absolute beginners, overlay romaji on all Japanese text
- **Styled character dialogue** — NPC speech renders as visually distinct blockquotes with character names

### Voice
- **Text-to-speech** on every AI message — hear how it sounds with natural Japanese pronunciation
- Play/stop controls on each message

### AI Tools
The conversation partner has structured tools it can call mid-conversation:
- **Suggest actions** — contextual next moves for the learner
- **Display choices** — branching dialogue with hints
- **Show vocabulary cards** — word, reading, meaning, example sentence, notes
- **Show grammar notes** — pattern, formation, examples, JLPT level
- **Show corrections** — original vs. corrected with explanation

### Infrastructure
- **Auth** — Google OAuth via Supabase
- **Database** — PostgreSQL with Prisma ORM
- **Stack** — Next.js 15, React 19, TypeScript, Tailwind CSS, Vercel AI SDK

---

## What Makes This Different

**1. Truly generative.** Every other language app is a content library with a fixed format. Duolingo has lessons. Italki has tutors. ChatGPT has a chat box. Lingle generates the entire experience from a single prompt. The same app handles casual conversation, immersive roleplay, structured grammar drills, creative storytelling, and reading comprehension. No mode switching. No menus. Just describe what you want.

**2. Fluid mode-switching.** A casual chat becomes a mini-lesson when you ask "why did you say that?" A structured scenario loosens into free conversation when you go off-script. The AI follows your energy, not a script. This is how real language immersion works — you don't switch between "conversation mode" and "learning mode" in real life.

**3. Invisible difficulty.** No "N3 mode" label in the conversation. No "select your level" before every session. You set it once, and everything calibrates: vocabulary ceiling, grammar complexity, kanji density, English support, ruby annotations, register. The learner doesn't think about difficulty. They just talk.

**4. Corrections that don't break flow.** In real immersion, nobody stops you mid-sentence to correct your grammar. A good conversation partner uses the right form in their response, and you absorb it. Lingle does the same — errors are recast naturally with brief italic asides only when instructive.

**5. Immersive on demand.** Scenes have characters with personality, atmosphere, branching choices. The ramen shop cook has opinions. The train station attendant is patient. But immersion is only one mode — simple conversation is equally first-class. The product is whatever you need it to be.

**6. One prompt, instant start.** No onboarding wizard. No loading screen while the AI "plans your lesson." Type or tap, and you're in.

---

## Architecture: Tools as Capabilities

The engine's power comes from its tools. Each new modality — exercises, images, audio, documents — is just another tool the model can call. The model decides when to use each tool based on context. This is the same pattern that makes Claude Code, Cursor, and Lovable work: a small set of powerful primitives that compose into infinite behaviors.

```
┌──────────────────────────────────────────────────────────────┐
│                     GENERATION ENGINE                         │
│                                                              │
│  System prompt + learner difficulty + session context         │
│                                                              │
│  Tools:                                                      │
│    Text output (streaming markdown)                          │
│    suggestActions     → suggestion chips                     │
│    displayChoices     → branching dialogue buttons            │
│    showVocabularyCard → vocabulary teaching card              │
│    showGrammarNote    → grammar explanation card              │
│    showCorrection     → error correction card                │
│    generateExercise   → interactive exercise (fill-blank,    │
│                         MCQ, matching, ordering, listening)  │
│    generateSceneImage → illustrated scene (async)            │
│    playAudio          → TTS for specific text                │
│    loadContent        → fetch/parse external URL or document │
│                                                              │
│  The model decides what to use based on what the learner     │
│  needs. No hard-coded sequences. No mode switching.          │
└──────────────────────────────────────────────────────────────┘
```

Each new tool type maps to a React component via the PartRenderer. Adding a capability to the engine means: define a Zod schema, write a tool, build a component. The model figures out when to use it.

---

## Roadmap

### Interactive Exercises (next)
The AI generates exercises on-the-fly during conversation. When the learner struggles with a concept, the AI calls `generateExercise` — fill-in-the-blank, multiple choice, matching, sentence ordering. Exercises render as interactive React components inline in the chat. The AI decides when to use them, like a tutor who says "let me check if you got that" at the right moment.

### Content-Based Learning
The learner shares a URL, uploads a file, or pastes text. The system extracts it, and the AI builds a learning experience around it — walking through an NHK article paragraph by paragraph, glossing vocabulary, explaining grammar, generating comprehension exercises, then offering to roleplay the scenario described in the article. Any article, video, or image becomes a lesson.

### Scene Illustration
When the AI describes a new scene, it generates an illustration. The ramen shop interior. The Kyoto street. The office meeting room. Images render inline while text continues streaming. Scenes become visual, not just textual.

### Voice Conversations
Full speech pipeline: the learner speaks, their speech is transcribed, fed to the same engine, and the response is spoken aloud with native-quality pronunciation. Modular (STT → LLM → TTS) so we keep the text transcript for corrections and logging. Target: under 1 second voice-to-voice.

### Multi-Language Support
The architecture is language-agnostic. The difficulty levels, system prompt, scenario system, and tool set all parameterize on target and native language. Expanding to Korean, Mandarin, Spanish, and others requires new difficulty definitions and language-specific input methods — but no architectural changes.

---

## Target User

**The motivated self-studier who wants to use their Japanese, not just study it.**

They've done the textbook thing. They know some grammar, recognize some kanji, can read simple sentences. But they don't have access to immersive environments. They might live in a country where Japanese isn't spoken. They might be too anxious to practice with real people. They might just want a low-pressure space to try things out.

They don't want flashcards. They don't want grammar drills. They want to feel what it's like to actually use the language — to order food, to chat with someone, to read a sign, to tell a story.

They are:
- Intermediate learners (N4-N3) who have grammar knowledge but lack production confidence
- Self-studiers who supplement textbooks with immersive practice
- Busy professionals who want 15-minute daily sessions that feel meaningful
- Language enthusiasts who are drawn to the cultural experience, not just the mechanics
- People who've tried conversation apps and found them either too rigid or too unstructured

Lingle is for anyone who wants language learning to feel less like homework and more like travel.

---

## Success Metrics

### Engagement
- **Session frequency** — learners return at least 4 days/week
- **Session duration** — average session is 10-20 minutes
- **Session variety** — learners use multiple scenario types, not just one format
- **Free prompt usage** — learners create their own scenarios, not just pick from curated ones

### Experience
- **"I had a real conversation"** — the core qualitative measure. After a session, the learner feels like they practiced the language, not like they used an app
- **Difficulty calibration** — the learner doesn't feel lost or bored. The 70-85% comprehension target is felt intuitively
- **Error correction acceptance** — learners absorb recasts without feeling corrected

### Technical
- **Time to first token** — under 1 second from send to first streamed response
- **Session startup** — instant, no loading screen
- **IME responsiveness** — kana conversion and kanji candidate display feel native

---

## Design Philosophy

**The generation engine is the product.** One prompt in, a full language experience out. The engine's quality is measured by how real the experience feels — not by how many items are tracked or how many reviews are completed.

**Meet people where they are.** If they want to chat, chat. If they want a scene, build one. If they want a grammar lesson, teach. If they speak English, gently redirect but never punish. The app adapts to the learner, not the other way around.

**Earn every return visit.** Language learning is a years-long commitment. The app has to be a place people want to come back to. That means personality, surprise, variety, and the feeling of progress. Not just effectiveness — delight.

**Simple surface, deep engine.** The UI is a text box and a grid of scenarios. That's it. Behind it: a system prompt engine, difficulty calibration, multi-tool AI partner, streaming architecture, and generative flexibility. The complexity serves the learner without burdening them.

**Corrections through compassion.** The hardest part of language learning isn't grammar — it's the courage to try. Every design decision protects that courage. Recasting over correction. Encouragement over judgment. Progress over perfection.
