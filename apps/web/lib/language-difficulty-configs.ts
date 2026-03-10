/**
 * Language-specific difficulty inserts appended to the universal behavior block.
 * Keyed by language ID → difficulty level (1-6) → language-specific guidance text.
 */
export const LANGUAGE_DIFFICULTY_INSERTS: Record<string, Record<number, string>> = {
  Japanese: {
    1: `KANJI: Annotate ALL kanji with {kanji|reading} ruby. Prefer hiragana/katakana over kanji where possible.
GRAMMAR: \u3067\u3059/\u307E\u3059 forms only. Basic particles \u306F\u3001\u304C\u3001\u3092\u3001\u306B\u3001\u3067\u3001\u3078.
REGISTER: Polite (\u3067\u3059/\u307E\u3059) only. No casual forms.`,
    2: `KANJI: Annotate N4+ kanji with {kanji|reading} ruby. Common N5 kanji can appear without ruby.
GRAMMAR: \u3066-form, \u305F\u3044-form, \u3066\u3044\u308B (progressive), past tense, \u304B\u3089/\u306E\u3067, potential form basics.
REGISTER: Primarily polite (\u3067\u3059/\u307E\u3059). Introduce casual forms in quoted speech.`,
    3: `KANJI: Ruby only for N3+ kanji. Common N4 kanji appear without annotation.
GRAMMAR: Passive, causative, conditional (\u305F\u3089\u3001\u3070\u3001\u306A\u3089), relative clauses, \u3088\u3046\u306B\u3059\u308B/\u306A\u308B, \u3066\u3057\u307E\u3046.
REGISTER: Full polite + some casual. Introduce register switching.`,
    4: `KANJI: Ruby only for N2+ kanji or rare readings.
GRAMMAR: N2 grammar patterns. Complex conditionals, formal expressions, contracted spoken forms (\u3061\u3083\u3046\u3001\u3066\u308B\u3001\u3093\u3060).
REGISTER: Full register range. Casual, polite, formal. Include contracted spoken forms naturally.`,
    5: `KANJI: Ruby only for rare kanji (outside standard 2,136 jouyou set) or unusual readings.
GRAMMAR: All grammar patterns including N1. Literary forms where appropriate.
REGISTER: Full register variation including keigo (honorific/humble), academic, literary.`,
    6: `KANJI: No ruby annotations. The learner reads at native level.
GRAMMAR: Unrestricted. Classical grammar forms, literary constructions, dialect-specific patterns all fair game.
REGISTER: Complete native range. Shift fluidly between registers as context demands.`,
  },
  Korean: {
    1: `SCRIPT: Hangul only, no hanja. Space between all words clearly.
GRAMMAR: \uD569\uB2C8\uB2E4\uCCB4 only. Basic particles \uC740/\uB294, \uC774/\uAC00, \uC744/\uB97C, \uC5D0, \uC5D0\uC11C.
REGISTER: Formal polite (\uD569\uB2C8\uB2E4) only.`,
    2: `SCRIPT: Hangul only. Common words can appear without spacing hints.
GRAMMAR: \uD574\uC694\uCCB4, past tense, \uACE0 \uC2F6\uB2E4, basic connectors (\uADF8\uB9AC\uACE0, \uADF8\uB798\uC11C, \uD558\uC9C0\uB9CC).
REGISTER: Polite (\uD574\uC694\uCCB4) primarily. Introduce \uD569\uB2C8\uB2E4\uCCB4 for contrast.`,
    3: `SCRIPT: Hangul. Occasional hanja in parentheses for vocabulary building.
GRAMMAR: Honorifics (\uC2DC-), indirect speech, \uB294 \uAC83 \uAC19\uB2E4, conditional \uBA74.
REGISTER: Mix of polite and casual. Register switching between social contexts.`,
    4: `GRAMMAR: Complex grammar patterns, \uB294 \uBC14\uB78C\uC5D0, \uB294 \uCC99\uD558\uB2E4, advanced connectors. Contracted spoken forms.
REGISTER: Full range including \uBC18\uB9D0, \uC874\uB313\uB9D0, \uACA9\uC2DD\uCCB4.`,
    5: `GRAMMAR: Advanced patterns, idiomatic expressions, proverbs. Literary Korean where appropriate.
REGISTER: Full native variation including age/status-appropriate speech levels.`,
    6: `GRAMMAR: Unrestricted. Archaic, dialectal, literary forms all fair game.
REGISTER: Complete native range. Use \uC0AC\uD22C\uB9AC, regional dialects as characterization.`,
  },
  'Mandarin Chinese': {
    1: `CHARACTERS: Annotate ALL characters with {hanzi|pinyin}. Use simplified characters.
GRAMMAR: Subject-verb-object basics. \u7684, \u4E86, \u5728, \u6709. Simple \u662F...\u7684 structures.
REGISTER: Standard/neutral only.`,
    2: `CHARACTERS: Annotate HSK 3+ characters with {hanzi|pinyin}. HSK 1-2 characters appear without pinyin.
GRAMMAR: \u8FC7 (experience), \u7740 (progressive), \u628A structure basics, comparison with \u6BD4.
REGISTER: Standard with some casual (\u554A, \u5462, \u5427 particles).`,
    3: `CHARACTERS: Pinyin only for HSK 4+ characters.
GRAMMAR: Complement structures (\u5F97, \u4E0D\u4E86, \u4E0B\u53BB), \u8981\u662F...\u5C31, \u867D\u7136...\u4F46\u662F, passive with \u88AB.
REGISTER: Mix of formal and casual. Internet slang awareness.`,
    4: `CHARACTERS: Pinyin only for HSK 5+ or rare characters.
GRAMMAR: Complex complement structures, formal written patterns, chengyu (idioms).
REGISTER: Full range. Formal/written vs casual/spoken distinction.`,
    5: `CHARACTERS: Pinyin only for rare characters outside HSK 6.
GRAMMAR: Literary patterns, classical Chinese references, advanced rhetoric.
REGISTER: Full native variation including academic, literary, colloquial.`,
    6: `CHARACTERS: No pinyin. The learner reads at native level.
GRAMMAR: Unrestricted. Classical Chinese references, literary constructions, dialect expressions.
REGISTER: Complete native range.`,
  },
  Spanish: {
    1: `ACCENTS: Always include accents (\u00e1, \u00e9, \u00ed, \u00f3, \u00fa, \u00f1). Mark \u00bf and \u00a1.
GRAMMAR: Present tense only, regular verbs. ser/estar basics. Articles and gender.
REGISTER: Informal t\u00fa only.`,
    2: `GRAMMAR: Preterite vs present, ir a + infinitive, reflexive verbs, gustar-type verbs.
REGISTER: Primarily t\u00fa. Introduce usted for context.`,
    3: `GRAMMAR: Imperfect vs preterite, subjunctive basics (quiero que...), object pronouns, por vs para.
REGISTER: T\u00fa and usted naturally. Regional awareness (vosotros mention).`,
    4: `GRAMMAR: Subjunctive in all contexts, conditional, compound tenses, relative clauses with prepositions.
REGISTER: Full range. Colloquial contractions and slang where natural.`,
    5: `GRAMMAR: Advanced subjunctive (pluperfect, future), literary tenses, idiomatic expressions.
REGISTER: Full native range including regional variation.`,
    6: `GRAMMAR: Unrestricted. Literary, archaic, dialectal forms.
REGISTER: Complete native range. Regional dialects as characterization.`,
  },
  French: {
    1: `GRAMMAR: Present tense only, regular -er/-ir/-re verbs. Articles, gender, basic adjectives.
REGISTER: Informal tu only. Liaison rules simplified.`,
    2: `GRAMMAR: Pass\u00e9 compos\u00e9, futur proche (aller + inf), negation, basic pronouns.
REGISTER: Primarily tu. Introduce vous for context.`,
    3: `GRAMMAR: Imparfait vs pass\u00e9 compos\u00e9, subjonctif basics, pronoms relatifs, conditionnel.
REGISTER: Tu and vous naturally. Spoken vs written distinction.`,
    4: `GRAMMAR: Subjonctif in all contexts, plus-que-parfait, discours indirect, all pronoun combinations.
REGISTER: Full range. Spoken French contractions (j'sais pas, t'as).`,
    5: `GRAMMAR: Literary tenses (pass\u00e9 simple, subjonctif imparfait), advanced rhetoric.
REGISTER: Full native range including soutenu, courant, familier.`,
    6: `GRAMMAR: Unrestricted. Literary, archaic, argot.
REGISTER: Complete native range.`,
  },
  German: {
    1: `GRAMMAR: Present tense, regular verbs, basic word order. Nominative and accusative cases only.
REGISTER: Informal du only.`,
    2: `GRAMMAR: Perfect tense, modal verbs, dative case, basic subordinate clauses (weil, dass).
REGISTER: Primarily du. Introduce Sie for context.`,
    3: `GRAMMAR: All four cases, passive voice, Konjunktiv II basics, relative clauses.
REGISTER: Du and Sie naturally. Regional awareness.`,
    4: `GRAMMAR: Konjunktiv I (reported speech), extended adjective constructions, nominalized verbs.
REGISTER: Full range. Colloquial contractions where natural.`,
    5: `GRAMMAR: Complex sentence structures, Konjunktiv in all forms, academic and literary style.
REGISTER: Full native range including regional variation.`,
    6: `GRAMMAR: Unrestricted. Archaic, dialectal, literary forms.
REGISTER: Complete native range.`,
  },
  Italian: {
    1: `GRAMMAR: Present tense, regular -are/-ere/-ire verbs. Articles, gender, basic adjectives.
REGISTER: Informal tu only.`,
    2: `GRAMMAR: Passato prossimo, future, reflexive verbs, basic object pronouns.
REGISTER: Primarily tu. Introduce Lei for context.`,
    3: `GRAMMAR: Imperfetto vs passato prossimo, congiuntivo basics, pronomi combinati.
REGISTER: Tu and Lei naturally. Regional awareness.`,
    4: `GRAMMAR: Congiuntivo in all contexts, condizionale composto, periodo ipotetico, passato remoto.
REGISTER: Full range. Colloquial speech patterns.`,
    5: `GRAMMAR: Advanced congiuntivo, literary tenses, idiomatic expressions and proverbs.
REGISTER: Full native range including regional variation.`,
    6: `GRAMMAR: Unrestricted. Literary, archaic, dialectal forms.
REGISTER: Complete native range.`,
  },
  Portuguese: {
    1: `GRAMMAR: Present tense, regular -ar/-er/-ir verbs. Articles, gender. ser/estar basics.
REGISTER: Informal voc\u00ea only (Brazilian Portuguese default).`,
    2: `GRAMMAR: Preterite, ir + infinitive, reflexive verbs, basic object pronouns.
REGISTER: Primarily voc\u00ea. Introduce o senhor/a senhora for context.`,
    3: `GRAMMAR: Imperfect vs preterite, subjunctive basics, por vs para, compound tenses.
REGISTER: Voc\u00ea and formal naturally. tu usage awareness.`,
    4: `GRAMMAR: Subjunctive in all contexts, personal infinitive, future subjunctive, compound tenses.
REGISTER: Full range. Colloquial Brazilian speech patterns.`,
    5: `GRAMMAR: Advanced subjunctive, literary tenses, idiomatic expressions. European Portuguese awareness.
REGISTER: Full native range including regional variation.`,
    6: `GRAMMAR: Unrestricted. Literary, archaic forms.
REGISTER: Complete native range. Brazilian/European variation.`,
  },
}
