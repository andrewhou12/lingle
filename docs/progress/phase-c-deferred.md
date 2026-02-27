# Phase C Deferred Features — What's Needed

These features from the chat mockup require backend capabilities that don't exist yet. Documenting what needs to be built.

---

## 1. Living Text (Mastery-Coded Words in AI Messages)

**What it is:** Every Japanese word in AI messages is automatically highlighted with a mastery-tier-coded underline (orange for new, blue for apprentice, purple for journeyman, etc.) — without the AI explicitly marking them up.

**What's blocking:** No Japanese tokenizer. We need to segment raw Japanese text into individual morphemes to look each one up in the word bank.

**What to build:**
- Add `kuromoji.js` (or `budoux` for lighter-weight) as a dependency for client-side Japanese tokenization
- Create a `tokenizeJapanese(text: string) → Token[]` utility that returns `{ surface, reading, baseForm, pos }`
- Create a `useAnnotatedText(text: string)` hook that:
  1. Tokenizes the text
  2. Batch-lookups each token against `/api/wordbank/search`
  3. Returns annotated tokens with mastery state
- Render annotated tokens using `VocabToken` components inline

**Data already available:** vocabulary.json (8000+ entries), wordbank search API, mastery state in DB

---

## 2. Comprehension Score Bar ("91% known · 1 new")

**What it is:** A small bar below each AI message showing what percentage of words the learner already knows.

**What's blocking:** Same as #1 — needs Japanese tokenizer to break messages into words, then cross-reference against learner's word bank.

**What to build:**
- Depends on the tokenizer from #1
- After tokenizing, count: `knownWords` (mastery ≥ apprentice_2) / `totalWords`
- Component already designed: `ComprehensionScore` in Phase C plan

**Data already available:** Mastery states per word in DB, search API exists

---

## 3. Naturalness Score ("Natural" Badge on User Messages)

**What it is:** A pill badge below user messages rating how natural their Japanese sounds.

**What's blocking:** No evaluation mechanism. Need the AI to rate user messages.

**What to build (two options):**
- **Option A (simpler):** Extend the AI system prompt to include a naturalness rating in its response metadata. Add a new message parser segment type like `[NATURALNESS: great|good|needs_work]` that the AI appends after responding.
- **Option B (more accurate):** Separate lightweight API call after each user message: `POST /api/conversation/evaluate` with the user's message + conversation context → returns `{ naturalness: 'great'|'good'|'needs_work', note?: string }`.

**Recommendation:** Option A for MVP — almost no backend work, just prompt engineering.

---

## 4. Sentence X-Ray (Word-by-Word Breakdown)

**What it is:** An expandable panel that breaks a Japanese sentence into individual words with romaji, POS tags, and English glosses.

**What's blocking:** Needs morphological analysis with POS tagging — more detailed than basic tokenization.

**What to build (two options):**
- **Option A:** Use `kuromoji.js` which provides POS tags natively (it's a full MeCab-based analyzer). Each token comes back with `{ surface, reading, pos, baseForm }`. Map POS codes to friendly labels (noun, verb, particle, etc.).
- **Option B:** Have the AI generate the breakdown in a structured format when requested. Add a `[SENTENCE_XRAY]` block type to the message parser.

**Recommendation:** Option B for MVP — the AI already knows the sentence and can generate accurate breakdowns. No dependency needed. Option A for production quality later.

---

## 5. Auto-Generated Suggestion Chips

**What it is:** Context-aware response suggestions that appear after each AI message.

**What's blocking:** Currently hardcoded. Need the AI to generate contextual suggestions.

**What to build:**
- Extend AI system prompt to include 2-3 suggested responses at the end of each message in a structured format: `[SUGGESTIONS: suggestion1 | suggestion2 | suggestion3]`
- Extend `message-parser.ts` to extract suggestions as a new segment type
- Wire into `SuggestionChips` component

**Effort:** Low — just prompt engineering + parser extension.

---

## Priority Order for Implementation

1. **Naturalness score** (Option A) — Almost free, just prompt engineering
2. **Suggestion chips** — Same, just prompt engineering + parser
3. **Sentence X-ray** (Option B) — AI-generated, parser extension
4. **Japanese tokenizer** — Enables #1 (living text) and #2 (comprehension score)
5. **Living text + comprehension score** — Depends on tokenizer
