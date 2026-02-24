export interface AssessmentItemDef {
  surfaceForm: string
  reading: string
  meaning: string
  partOfSpeech: string
  level: string
  type: 'vocabulary' | 'grammar'
  patternId?: string
}

export const ASSESSMENT_ITEMS: AssessmentItemDef[] = [
  // ── N5 Vocabulary ──
  { surfaceForm: '食べる', reading: 'たべる', meaning: 'to eat', partOfSpeech: 'verb', level: 'N5', type: 'vocabulary' },
  { surfaceForm: '飲む', reading: 'のむ', meaning: 'to drink', partOfSpeech: 'verb', level: 'N5', type: 'vocabulary' },
  { surfaceForm: '行く', reading: 'いく', meaning: 'to go', partOfSpeech: 'verb', level: 'N5', type: 'vocabulary' },
  { surfaceForm: '見る', reading: 'みる', meaning: 'to see; to look', partOfSpeech: 'verb', level: 'N5', type: 'vocabulary' },
  { surfaceForm: '水', reading: 'みず', meaning: 'water', partOfSpeech: 'noun', level: 'N5', type: 'vocabulary' },
  { surfaceForm: '友達', reading: 'ともだち', meaning: 'friend', partOfSpeech: 'noun', level: 'N5', type: 'vocabulary' },
  { surfaceForm: '学校', reading: 'がっこう', meaning: 'school', partOfSpeech: 'noun', level: 'N5', type: 'vocabulary' },
  { surfaceForm: '大きい', reading: 'おおきい', meaning: 'big; large', partOfSpeech: 'i-adjective', level: 'N5', type: 'vocabulary' },
  { surfaceForm: '新しい', reading: 'あたらしい', meaning: 'new', partOfSpeech: 'i-adjective', level: 'N5', type: 'vocabulary' },
  { surfaceForm: '先生', reading: 'せんせい', meaning: 'teacher; doctor', partOfSpeech: 'noun', level: 'N5', type: 'vocabulary' },

  // ── N5 Grammar ──
  { surfaceForm: 'です / だ', reading: 'です / だ', meaning: 'copula (is/am/are)', partOfSpeech: 'grammar', level: 'N5', type: 'grammar', patternId: 'n5-desu' },
  { surfaceForm: 'は (topic)', reading: 'は', meaning: 'topic marker particle', partOfSpeech: 'grammar', level: 'N5', type: 'grammar', patternId: 'n5-particle-wa' },
  { surfaceForm: 'て-form', reading: 'て-form', meaning: 'connecting verb form for requests, sequences', partOfSpeech: 'grammar', level: 'N5', type: 'grammar', patternId: 'n5-te-form' },
  { surfaceForm: 'ない-form', reading: 'ない-form', meaning: 'negative verb conjugation', partOfSpeech: 'grammar', level: 'N5', type: 'grammar', patternId: 'n5-nai' },
  { surfaceForm: 'たい-form', reading: 'たい-form', meaning: 'want to do (~たい)', partOfSpeech: 'grammar', level: 'N5', type: 'grammar', patternId: 'n5-tai' },

  // ── N4 Vocabulary ──
  { surfaceForm: '経験', reading: 'けいけん', meaning: 'experience', partOfSpeech: 'noun', level: 'N4', type: 'vocabulary' },
  { surfaceForm: '届ける', reading: 'とどける', meaning: 'to deliver', partOfSpeech: 'verb', level: 'N4', type: 'vocabulary' },
  { surfaceForm: '趣味', reading: 'しゅみ', meaning: 'hobby; interest', partOfSpeech: 'noun', level: 'N4', type: 'vocabulary' },
  { surfaceForm: '予約', reading: 'よやく', meaning: 'reservation; appointment', partOfSpeech: 'noun', level: 'N4', type: 'vocabulary' },
  { surfaceForm: '変わる', reading: 'かわる', meaning: 'to change', partOfSpeech: 'verb', level: 'N4', type: 'vocabulary' },
  { surfaceForm: '将来', reading: 'しょうらい', meaning: 'future', partOfSpeech: 'noun', level: 'N4', type: 'vocabulary' },
  { surfaceForm: '比べる', reading: 'くらべる', meaning: 'to compare', partOfSpeech: 'verb', level: 'N4', type: 'vocabulary' },
  { surfaceForm: '習慣', reading: 'しゅうかん', meaning: 'habit; custom', partOfSpeech: 'noun', level: 'N4', type: 'vocabulary' },

  // ── N4 Grammar ──
  { surfaceForm: 'ことがある', reading: 'ことがある', meaning: 'have the experience of', partOfSpeech: 'grammar', level: 'N4', type: 'grammar', patternId: 'n4-koto-ga-aru' },
  { surfaceForm: 'ようにする', reading: 'ようにする', meaning: 'try to; make sure to', partOfSpeech: 'grammar', level: 'N4', type: 'grammar', patternId: 'n4-you-ni-suru' },
  { surfaceForm: 'ば conditional', reading: 'ば', meaning: 'if (conditional form)', partOfSpeech: 'grammar', level: 'N4', type: 'grammar', patternId: 'n4-ba' },
  { surfaceForm: 'ても', reading: 'ても', meaning: 'even if; even though', partOfSpeech: 'grammar', level: 'N4', type: 'grammar', patternId: 'n4-temo' },

  // ── N3 Vocabulary ──
  { surfaceForm: '影響', reading: 'えいきょう', meaning: 'influence; effect', partOfSpeech: 'noun', level: 'N3', type: 'vocabulary' },
  { surfaceForm: '状況', reading: 'じょうきょう', meaning: 'situation; circumstances', partOfSpeech: 'noun', level: 'N3', type: 'vocabulary' },
  { surfaceForm: '環境', reading: 'かんきょう', meaning: 'environment', partOfSpeech: 'noun', level: 'N3', type: 'vocabulary' },
  { surfaceForm: '適切', reading: 'てきせつ', meaning: 'appropriate; suitable', partOfSpeech: 'na-adjective', level: 'N3', type: 'vocabulary' },
  { surfaceForm: '評価', reading: 'ひょうか', meaning: 'evaluation; assessment', partOfSpeech: 'noun', level: 'N3', type: 'vocabulary' },
  { surfaceForm: '発展', reading: 'はってん', meaning: 'development; growth', partOfSpeech: 'noun', level: 'N3', type: 'vocabulary' },
  { surfaceForm: '管理', reading: 'かんり', meaning: 'management; control', partOfSpeech: 'noun', level: 'N3', type: 'vocabulary' },
  { surfaceForm: '貢献', reading: 'こうけん', meaning: 'contribution', partOfSpeech: 'noun', level: 'N3', type: 'vocabulary' },

  // ── N3 Grammar ──
  { surfaceForm: 'ことにする', reading: 'ことにする', meaning: 'decide to', partOfSpeech: 'grammar', level: 'N3', type: 'grammar', patternId: 'n3-koto-ni-suru' },
  { surfaceForm: 'につれて', reading: 'につれて', meaning: 'as; in proportion to', partOfSpeech: 'grammar', level: 'N3', type: 'grammar', patternId: 'n3-ni-tsurete' },
  { surfaceForm: 'ばかり', reading: 'ばかり', meaning: 'only; just; nothing but', partOfSpeech: 'grammar', level: 'N3', type: 'grammar', patternId: 'n3-bakari' },
  { surfaceForm: 'わけではない', reading: 'わけではない', meaning: 'it doesn\'t mean that', partOfSpeech: 'grammar', level: 'N3', type: 'grammar', patternId: 'n3-wake-dewa-nai' },

  // ── N2 Vocabulary ──
  { surfaceForm: '概念', reading: 'がいねん', meaning: 'concept; notion', partOfSpeech: 'noun', level: 'N2', type: 'vocabulary' },
  { surfaceForm: '把握', reading: 'はあく', meaning: 'grasp; understanding', partOfSpeech: 'noun', level: 'N2', type: 'vocabulary' },
  { surfaceForm: '促進', reading: 'そくしん', meaning: 'promotion; furtherance', partOfSpeech: 'noun', level: 'N2', type: 'vocabulary' },
  { surfaceForm: '維持', reading: 'いじ', meaning: 'maintenance; preservation', partOfSpeech: 'noun', level: 'N2', type: 'vocabulary' },
  { surfaceForm: '妥協', reading: 'だきょう', meaning: 'compromise', partOfSpeech: 'noun', level: 'N2', type: 'vocabulary' },
  { surfaceForm: '抽象的', reading: 'ちゅうしょうてき', meaning: 'abstract', partOfSpeech: 'na-adjective', level: 'N2', type: 'vocabulary' },

  // ── N2 Grammar ──
  { surfaceForm: 'ものの', reading: 'ものの', meaning: 'although; but', partOfSpeech: 'grammar', level: 'N2', type: 'grammar', patternId: 'n2-monono' },
  { surfaceForm: 'に対して', reading: 'にたいして', meaning: 'towards; regarding; in contrast to', partOfSpeech: 'grammar', level: 'N2', type: 'grammar', patternId: 'n2-ni-taishite' },
  { surfaceForm: 'にもかかわらず', reading: 'にもかかわらず', meaning: 'despite; in spite of', partOfSpeech: 'grammar', level: 'N2', type: 'grammar', patternId: 'n2-nimo-kakawarazu' },

  // ── N1 Vocabulary ──
  { surfaceForm: '顕著', reading: 'けんちょ', meaning: 'remarkable; conspicuous', partOfSpeech: 'na-adjective', level: 'N1', type: 'vocabulary' },
  { surfaceForm: '齟齬', reading: 'そご', meaning: 'discrepancy; conflict', partOfSpeech: 'noun', level: 'N1', type: 'vocabulary' },
  { surfaceForm: '蓋然性', reading: 'がいぜんせい', meaning: 'probability; likelihood', partOfSpeech: 'noun', level: 'N1', type: 'vocabulary' },
  { surfaceForm: '踏襲', reading: 'とうしゅう', meaning: 'to follow (precedent)', partOfSpeech: 'noun', level: 'N1', type: 'vocabulary' },

  // ── N1 Grammar ──
  { surfaceForm: 'であれ', reading: 'であれ', meaning: 'whether ... or; even if', partOfSpeech: 'grammar', level: 'N1', type: 'grammar', patternId: 'n1-de-are' },
  { surfaceForm: 'をもって', reading: 'をもって', meaning: 'with; by means of', partOfSpeech: 'grammar', level: 'N1', type: 'grammar', patternId: 'n1-wo-motte' },
]

const LEVEL_ORDER = ['N5', 'N4', 'N3', 'N2', 'N1']

export function getAssessmentItemsForLevel(selfReportedLevel: string): AssessmentItemDef[] {
  if (selfReportedLevel === 'beginner') {
    return ASSESSMENT_ITEMS.filter((item) => item.level === 'N5')
  }

  const levelIdx = LEVEL_ORDER.indexOf(selfReportedLevel)
  if (levelIdx === -1) {
    return ASSESSMENT_ITEMS.filter((item) => item.level === 'N5')
  }

  // Show items from one level below through one level above the reported level
  const minIdx = Math.max(0, levelIdx - 1)
  const maxIdx = Math.min(LEVEL_ORDER.length - 1, levelIdx + 1)
  const targetLevels = LEVEL_ORDER.slice(minIdx, maxIdx + 1)

  return ASSESSMENT_ITEMS.filter((item) => targetLevels.includes(item.level))
}

export function getLevelCefrMapping(level: string): string {
  switch (level) {
    case 'beginner': return 'A1'
    case 'N5': return 'A1'
    case 'N4': return 'A2'
    case 'N3': return 'B1'
    case 'N2': return 'B2'
    case 'N1': return 'C1'
    default: return 'A1'
  }
}
