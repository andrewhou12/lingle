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
  ja: ['あー！', 'へー', 'うんうん', 'ああ', 'なるほど', 'そっか'],
  en: ['oh!', 'wow', 'right', 'I see', 'really?', 'huh'],
  ko: ['아～', '오～', '정말?', '그렇구나', '네', '와'],
  zh: ['哦！', '真的吗', '原来如此', '是啊', '哇'],
  es: ['¡ah!', '¡no me digas!', 'ya veo', 'claro', '¿en serio?'],
  fr: ['ah !', 'oh !', 'vraiment ?', 'ah bon', "d'accord"],
  de: ['ach!', 'wirklich?', 'aha', 'na ja', 'stimmt'],
  it: ['ah!', 'davvero?', 'capisco', 'mamma mia', 'ma dai'],
  pt: ['ah!', 'é mesmo?', 'nossa', 'entendi', 'que legal'],
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
