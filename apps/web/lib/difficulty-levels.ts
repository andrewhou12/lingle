export interface DifficultyLevel {
  level: number
  label: string
  shortDescription: string
  behaviorBlock: string
}

export const DIFFICULTY_LEVELS: DifficultyLevel[] = [
  {
    level: 1,
    label: 'Beginner (A1)',
    shortDescription: 'Basic greetings, core vocabulary, full native-language support',
    behaviorBlock: `VOCABULARY: Use only the most basic ~800 words (N5 level). Greetings, numbers, colors, family, food, daily objects.
GRAMMAR: Present tense です/ます forms only. Basic particles は、が、を、に、で、へ. Simple adjectives. No compound sentences.
KANJI: Annotate ALL kanji with {kanji|reading} ruby. Prefer hiragana/katakana over kanji where possible.
ENGLISH: Provide English translations for all key phrases. Narration can be mostly in English with target language highlighted. After NPC dialogue, include a natural English equivalent.
RUBY DENSITY: Maximum — every kanji compound gets ruby annotation.
REGISTER: Polite (です/ます) only. No casual forms.
COMPLEXITY: Short sentences (5-10 words). One idea per sentence. Avoid subordinate clauses.`,
  },
  {
    level: 2,
    label: 'Elementary (A2)',
    shortDescription: 'Simple sentences, everyday topics, native-language hints',
    behaviorBlock: `VOCABULARY: N5 + N4 vocabulary (~1,500 words). て-form verbs, たい-form, basic counters, time expressions, common adverbs.
GRAMMAR: て-form, たい-form, ている (progressive), past tense, から/ので (because), が/けど (but), ないでください, potential form basics.
KANJI: Annotate N4+ kanji with {kanji|reading} ruby. Common N5 kanji (食べる、飲む、見る、行く) can appear without ruby.
ENGLISH: Provide English hints for key phrases and new vocabulary. Narration can mix English and target language. Brief English gloss after complex sentences.
RUBY DENSITY: High — ruby for anything above basic N5 kanji.
REGISTER: Primarily polite (です/ます). Introduce casual forms in quoted speech with explanation.
COMPLEXITY: Medium sentences. Two clauses connected with basic conjunctions. Simple compound sentences OK.`,
  },
  {
    level: 3,
    label: 'Intermediate (B1)',
    shortDescription: 'Mixed target/native language, varied register, selective annotations',
    behaviorBlock: `VOCABULARY: N5-N3 vocabulary (~3,500 words). Abstract concepts, opinions, descriptions, workplace basics.
GRAMMAR: Passive, causative, conditional (たら、ば、なら), relative clauses, ようにする/なる, てしまう, そうだ/ようだ/らしい, のに/ために.
KANJI: Ruby only for N3+ kanji. Common N4 kanji appear without annotation. Use {kanji|reading} selectively for words the learner likely hasn't encountered.
ENGLISH: Minimal English. Use for cultural context notes or grammar explanations only. All conversation and narration in target language.
RUBY DENSITY: Moderate — only unfamiliar or above-level kanji.
REGISTER: Full polite + some casual. Characters can speak casually. Introduce register switching.
COMPLEXITY: Natural sentence length. Subordinate clauses, relative clauses, quoted speech. Multiple ideas per turn.`,
  },
  {
    level: 4,
    label: 'Upper-Intermediate (B2)',
    shortDescription: 'Mostly target language, natural forms, idiomatic speech',
    behaviorBlock: `VOCABULARY: N5-N2 vocabulary (~6,000 words). Idiomatic expressions, set phrases, onomatopoeia, humble/honorific vocabulary.
GRAMMAR: N2 grammar patterns. Complex conditionals, formal expressions, ～にとって、～に対して、～をはじめ、～つつ. Contracted spoken forms (ちゃう、てる、んだ).
KANJI: Ruby only for N2+ kanji or rare readings. Most standard kanji appear without annotation.
ENGLISH: No English in conversation or narration. English only for very brief metalinguistic asides when the learner explicitly asks.
RUBY DENSITY: Low — only genuinely difficult or rare kanji.
REGISTER: Full register range. Casual, polite, formal. Characters should have distinct speech styles. Include contracted spoken forms naturally.
COMPLEXITY: Native-like sentence structure. Complex nested clauses, ellipsis, topic drops. Natural conversation flow with interruptions and backchanneling.`,
  },
  {
    level: 5,
    label: 'Advanced (C1)',
    shortDescription: 'Full target language, complex topics, minimal annotations',
    behaviorBlock: `VOCABULARY: Unrestricted active vocabulary including literary, academic, and specialized terms. N1 grammar patterns, classical references, proverbs.
GRAMMAR: All grammar patterns including N1. ～ざるを得ない、～に他ならない、～ものを、～とはいえ. Literary forms where appropriate.
KANJI: Ruby only for rare kanji (outside standard 2,136 jouyou set) or unusual readings of common kanji.
ENGLISH: Never use English. All explanations, asides, and cultural notes in the target language.
RUBY DENSITY: Minimal — rare kanji only.
REGISTER: Full register variation including keigo (honorific/humble), academic, literary. Characters should demonstrate natural register shifts based on context.
COMPLEXITY: Full native complexity. Long compound sentences, literary devices, implicit meaning, cultural allusions.`,
  },
  {
    level: 6,
    label: 'Near-Native (C2)',
    shortDescription: 'Unrestricted, literary, full native complexity',
    behaviorBlock: `VOCABULARY: Completely unrestricted. Use any word that fits the context, including archaic, dialectal, slang, jargon, and literary vocabulary.
GRAMMAR: Unrestricted. Classical grammar forms, literary constructions, dialect-specific patterns all fair game.
KANJI: No ruby annotations. The learner reads at native level.
ENGLISH: Never. Under no circumstances.
RUBY DENSITY: None.
REGISTER: Complete native range. Shift fluidly between registers as context demands. Use dialect, role language, gendered speech, age-appropriate speech as characterization tools.
COMPLEXITY: No ceiling. Write as you would for a native reader. Literary narration, stream of consciousness, dense prose — whatever serves the experience.`,
  },
]

export function getDifficultyLevel(level: number): DifficultyLevel {
  return DIFFICULTY_LEVELS.find((d) => d.level === level) ?? DIFFICULTY_LEVELS[1]
}
