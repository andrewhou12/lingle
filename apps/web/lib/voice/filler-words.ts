/**
 * Filler/hesitation words by language (ISO 639-1 code).
 * Used to detect disfluency signals in learner speech.
 */
export const FILLER_WORDS: Record<string, string[]> = {
  ja: ['えーと', 'えっと', 'あの', 'あのー', 'うーん', 'まあ', 'その', 'なんか', 'ええ', 'ああ', 'えー', 'うん', 'ほら', 'やっぱり'],
  en: ['um', 'uh', 'like', 'you know', 'well', 'so', 'basically', 'actually', 'i mean', 'right', 'okay'],
  ko: ['음', '어', '그', '그러니까', '뭐', '있잖아', '저기', '아니'],
  zh: ['嗯', '那个', '就是', '然后', '这个', '怎么说', '额'],
  es: ['pues', 'bueno', 'este', 'o sea', 'digamos', 'eh', 'a ver'],
  fr: ['euh', 'ben', 'bah', 'genre', 'en fait', 'donc', 'voilà', 'quoi'],
  de: ['ähm', 'äh', 'also', 'halt', 'na ja', 'sozusagen', 'quasi'],
  it: ['ehm', 'cioè', 'allora', 'tipo', 'praticamente', 'insomma', 'dunque'],
  pt: ['é', 'tipo', 'né', 'então', 'assim', 'bom', 'quer dizer'],
}

/** Get the filler word list for a language code. Returns empty array for unknown codes. */
export function getFillerWords(code: string): string[] {
  return FILLER_WORDS[code] ?? []
}

/** Reaction/backchannel words by language (ISO 639-1 code). */
export const REACTION_WORDS: Record<string, string[]> = {
  ja: ['\u3042\u30FC\uFF01', '\u3078\u30FC', '\u3046\u3093\u3046\u3093', '\u3042\u3042', '\u306A\u308B\u307B\u3069', '\u305D\u3063\u304B'],
  en: ['oh!', 'wow', 'right', 'I see', 'really?', 'huh'],
  ko: ['\uC544\uFF5E', '\uC624\uFF5E', '\uC815\uB9D0?', '\uADF8\uB807\uAD6C\uB098', '\uB124', '\uC640'],
  zh: ['\u54E6\uFF01', '\u771F\u7684\u5417', '\u539F\u6765\u5982\u6B64', '\u662F\u554A', '\u54C7'],
  es: ['\u00A1ah!', '\u00A1no me digas!', 'ya veo', 'claro', '\u00BFen serio?'],
  fr: ['ah !', 'oh !', 'vraiment ?', 'ah bon', 'd\'accord'],
  de: ['ach!', 'wirklich?', 'aha', 'na ja', 'stimmt'],
  it: ['ah!', 'davvero?', 'capisco', 'mamma mia', 'ma dai'],
  pt: ['ah!', '\u00e9 mesmo?', 'nossa', 'entendi', 'que legal'],
}

/** Get the reaction word list for a language code. Returns empty array for unknown codes. */
export function getReactionWords(code: string): string[] {
  return REACTION_WORDS[code] ?? []
}

/** Check if a text token (lowercased, trimmed) matches a filler word for the given language. */
export function isFillerWord(text: string, code: string): boolean {
  const normalized = text.toLowerCase().trim()
  if (!normalized) return false
  const fillers = getFillerWords(code)
  return fillers.some((f) => normalized === f || normalized === f.toLowerCase())
}
