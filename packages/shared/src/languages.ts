export interface SupportedLanguage {
  id: string
  label: string
  nativeLabel: string
  flag: string
  /** ISO 639-1 language code for STT APIs (Soniox, OpenAI Whisper) */
  sttCode: string
  /** Cartesia TTS language code */
  ttsLanguageCode: string
  /** Whether this is a CJK language (affects font, segmentation, IME, annotation behavior) */
  isCJK: boolean
  /** Whether this language uses {text|reading} annotations (furigana, pinyin, etc.) */
  hasAnnotations: boolean
  /** Prompt instruction for Claude about annotation format, or empty string */
  annotationInstruction: string
  /** CSS class for target-language text (serif/display variant) */
  fontClass: string
  /** CSS class for target-language text (sans/clean variant, used in voice/conversation) */
  fontCleanClass: string
  /** Proficiency framework name (JLPT, TOPIK, HSK, CEFR) */
  proficiencyFramework: string
  /** Ordered proficiency levels for this language */
  proficiencyLevels: string[]
  /** Regex for detecting target-language text in mixed content */
  scriptRegex: RegExp
  /** Prompt-friendly register options */
  registerOptions: string
  /** Sentence boundary characters */
  sentenceBoundaryChars: string
  greeting: {
    morning: string
    afternoon: string
    evening: string
  }
}

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  {
    id: 'Japanese',
    label: 'Japanese',
    nativeLabel: '\u65E5\u672C\u8A9E',
    flag: '\uD83C\uDDEF\uD83C\uDDF5',
    sttCode: 'ja',
    ttsLanguageCode: 'ja',
    isCJK: true,
    hasAnnotations: true,
    annotationInstruction: '{kanji|reading} for vocabulary above the learner\'s level (rendered as furigana)',
    fontClass: 'font-jp',
    fontCleanClass: 'font-jp-clean',
    proficiencyFramework: 'JLPT',
    proficiencyLevels: ['N5', 'N4', 'N3', 'N2', 'N1'],
    scriptRegex: /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf\u3400-\u4dbf]/,
    registerOptions: '"casual", "polite", "keigo", or "mixed"',
    sentenceBoundaryChars: '\u3002\uFF01\uFF1F',
    greeting: {
      morning: '\u304A\u306F\u3088\u3046\uFF01',
      afternoon: '\u3053\u3093\u306B\u3061\u306F\uFF01',
      evening: '\u3053\u3093\u3070\u3093\u306F\uFF01',
    },
  },
  {
    id: 'Korean',
    label: 'Korean',
    nativeLabel: '\uD55C\uAD6D\uC5B4',
    flag: '\uD83C\uDDF0\uD83C\uDDF7',
    sttCode: 'ko',
    ttsLanguageCode: 'ko',
    isCJK: true,
    hasAnnotations: false,
    annotationInstruction: '',
    fontClass: 'font-ko',
    fontCleanClass: 'font-ko',
    proficiencyFramework: 'TOPIK',
    proficiencyLevels: ['TOPIK I-1', 'TOPIK I-2', 'TOPIK II-3', 'TOPIK II-4', 'TOPIK II-5', 'TOPIK II-6'],
    scriptRegex: /[\uac00-\ud7af\u1100-\u11ff\u3130-\u318f]/,
    registerOptions: '"\uBC18\uB9D0 (casual)", "\uC874\uB313\uB9D0 (polite)", "\uACA9\uC2DD\uCCB4 (formal)", or "mixed"',
    sentenceBoundaryChars: '.!?',
    greeting: {
      morning: '\uC88B\uC740 \uC544\uCE68\uC774\uC5D0\uC694!',
      afternoon: '\uC548\uB155\uD558\uC138\uC694!',
      evening: '\uC88B\uC740 \uC800\uB141\uC774\uC5D0\uC694!',
    },
  },
  {
    id: 'Mandarin Chinese',
    label: 'Mandarin Chinese',
    nativeLabel: '\u4E2D\u6587',
    flag: '\uD83C\uDDE8\uD83C\uDDF3',
    sttCode: 'zh',
    ttsLanguageCode: 'zh',
    isCJK: true,
    hasAnnotations: true,
    annotationInstruction: '{hanzi|pinyin} for characters above the learner\'s level',
    fontClass: 'font-zh',
    fontCleanClass: 'font-zh',
    proficiencyFramework: 'HSK',
    proficiencyLevels: ['HSK 1', 'HSK 2', 'HSK 3', 'HSK 4', 'HSK 5', 'HSK 6'],
    scriptRegex: /[\u4e00-\u9fff\u3400-\u4dbf]/,
    registerOptions: '"casual", "formal", or "mixed"',
    sentenceBoundaryChars: '\u3002\uFF01\uFF1F',
    greeting: {
      morning: '\u65E9\u4E0A\u597D\uFF01',
      afternoon: '\u4F60\u597D\uFF01',
      evening: '\u665A\u4E0A\u597D\uFF01',
    },
  },
  {
    id: 'Spanish',
    label: 'Spanish',
    nativeLabel: 'Espa\u00F1ol',
    flag: '\uD83C\uDDEA\uD83C\uDDF8',
    sttCode: 'es',
    ttsLanguageCode: 'es',
    isCJK: false,
    hasAnnotations: false,
    annotationInstruction: '',
    fontClass: '',
    fontCleanClass: '',
    proficiencyFramework: 'CEFR',
    proficiencyLevels: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
    scriptRegex: /[a-z\u00e1\u00e9\u00ed\u00f3\u00fa\u00f1\u00fc\u00bf\u00a1]/i,
    registerOptions: '"informal (t\u00fa)", "formal (usted)", or "mixed"',
    sentenceBoundaryChars: '.!?',
    greeting: {
      morning: '\u00A1Buenos d\u00EDas!',
      afternoon: '\u00A1Buenas tardes!',
      evening: '\u00A1Buenas noches!',
    },
  },
  {
    id: 'French',
    label: 'French',
    nativeLabel: 'Fran\u00E7ais',
    flag: '\uD83C\uDDEB\uD83C\uDDF7',
    sttCode: 'fr',
    ttsLanguageCode: 'fr',
    isCJK: false,
    hasAnnotations: false,
    annotationInstruction: '',
    fontClass: '',
    fontCleanClass: '',
    proficiencyFramework: 'CEFR',
    proficiencyLevels: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
    scriptRegex: /[a-z\u00e0\u00e2\u00e6\u00e7\u00e9\u00e8\u00ea\u00eb\u00ef\u00ee\u00f4\u0153\u00f9\u00fb\u00fc\u00ff]/i,
    registerOptions: '"informal (tu)", "formal (vous)", or "mixed"',
    sentenceBoundaryChars: '.!?',
    greeting: {
      morning: 'Bonjour !',
      afternoon: 'Bonjour !',
      evening: 'Bonsoir !',
    },
  },
  {
    id: 'German',
    label: 'German',
    nativeLabel: 'Deutsch',
    flag: '\uD83C\uDDE9\uD83C\uDDEA',
    sttCode: 'de',
    ttsLanguageCode: 'de',
    isCJK: false,
    hasAnnotations: false,
    annotationInstruction: '',
    fontClass: '',
    fontCleanClass: '',
    proficiencyFramework: 'CEFR',
    proficiencyLevels: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
    scriptRegex: /[a-z\u00e4\u00f6\u00fc\u00df]/i,
    registerOptions: '"informal (du)", "formal (Sie)", or "mixed"',
    sentenceBoundaryChars: '.!?',
    greeting: {
      morning: 'Guten Morgen!',
      afternoon: 'Guten Tag!',
      evening: 'Guten Abend!',
    },
  },
  {
    id: 'Italian',
    label: 'Italian',
    nativeLabel: 'Italiano',
    flag: '\uD83C\uDDEE\uD83C\uDDF9',
    sttCode: 'it',
    ttsLanguageCode: 'it',
    isCJK: false,
    hasAnnotations: false,
    annotationInstruction: '',
    fontClass: '',
    fontCleanClass: '',
    proficiencyFramework: 'CEFR',
    proficiencyLevels: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
    scriptRegex: /[a-z\u00e0\u00e8\u00e9\u00ec\u00ed\u00ee\u00f2\u00f3\u00f9\u00fa]/i,
    registerOptions: '"informal (tu)", "formal (Lei)", or "mixed"',
    sentenceBoundaryChars: '.!?',
    greeting: {
      morning: 'Buongiorno!',
      afternoon: 'Buon pomeriggio!',
      evening: 'Buonasera!',
    },
  },
  {
    id: 'Portuguese',
    label: 'Portuguese',
    nativeLabel: 'Portugu\u00EAs',
    flag: '\uD83C\uDDE7\uD83C\uDDF7',
    sttCode: 'pt',
    ttsLanguageCode: 'pt',
    isCJK: false,
    hasAnnotations: false,
    annotationInstruction: '',
    fontClass: '',
    fontCleanClass: '',
    proficiencyFramework: 'CEFR',
    proficiencyLevels: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
    scriptRegex: /[a-z\u00e1\u00e2\u00e3\u00e0\u00e7\u00e9\u00ea\u00ed\u00f3\u00f4\u00f5\u00fa]/i,
    registerOptions: '"informal (voc\u00ea/tu)", "formal (o senhor/a senhora)", or "mixed"',
    sentenceBoundaryChars: '.!?',
    greeting: {
      morning: 'Bom dia!',
      afternoon: 'Boa tarde!',
      evening: 'Boa noite!',
    },
  },
]

export function getLanguageById(id: string): SupportedLanguage | undefined {
  return SUPPORTED_LANGUAGES.find((l) => l.id === id)
}

/** Get the CSS font class for a target language (serif/display variant) */
export function getTargetFontClass(languageId: string): string {
  return getLanguageById(languageId)?.fontClass ?? ''
}

/** Get the CSS font class for a target language (sans/clean variant for voice/conversation) */
export function getTargetFontCleanClass(languageId: string): string {
  return getLanguageById(languageId)?.fontCleanClass ?? ''
}

/** Check if text contains characters from the target language's script */
export function hasTargetLanguageText(text: string, languageId: string): boolean {
  const lang = getLanguageById(languageId)
  if (!lang) return false
  return lang.scriptRegex.test(text)
}

export function getGreetingForLanguage(languageId: string): { native: string; english: string } {
  const lang = getLanguageById(languageId)
  const hour = new Date().getHours()

  if (!lang) {
    return { native: 'Hello!', english: 'What would you like to practice today?' }
  }

  let native: string
  if (hour < 11) {
    native = lang.greeting.morning
  } else if (hour < 17) {
    native = lang.greeting.afternoon
  } else {
    native = lang.greeting.evening
  }

  return { native, english: 'What would you like to practice today?' }
}

/** Get the ISO 639-1 STT language code for a given language ID. Falls back to 'en'. */
export function getSttCode(languageId: string): string {
  return getLanguageById(languageId)?.sttCode ?? 'en'
}

/**
 * Map a native language name (e.g. "English", "Thai", "Vietnamese") to an ISO 639-1 code.
 * Checks SUPPORTED_LANGUAGES first, then falls back to a broader lookup. Defaults to 'en'.
 */
const NATIVE_LANGUAGE_CODES: Record<string, string> = {
  english: 'en',
  japanese: 'ja',
  korean: 'ko',
  'mandarin chinese': 'zh',
  chinese: 'zh',
  spanish: 'es',
  french: 'fr',
  german: 'de',
  italian: 'it',
  portuguese: 'pt',
  thai: 'th',
  vietnamese: 'vi',
  hindi: 'hi',
  arabic: 'ar',
  russian: 'ru',
  turkish: 'tr',
  polish: 'pl',
  dutch: 'nl',
  indonesian: 'id',
  malay: 'ms',
  tagalog: 'tl',
  swedish: 'sv',
  norwegian: 'no',
  danish: 'da',
  finnish: 'fi',
  czech: 'cs',
  romanian: 'ro',
  hungarian: 'hu',
  greek: 'el',
  hebrew: 'he',
  persian: 'fa',
  ukrainian: 'uk',
  bengali: 'bn',
  tamil: 'ta',
  telugu: 'te',
  cantonese: 'yue',
}

export function getNativeSttCode(nativeLanguage: string): string {
  // Try supported languages first (exact id match)
  const supported = getLanguageById(nativeLanguage)
  if (supported) return supported.sttCode

  // Broader lookup
  return NATIVE_LANGUAGE_CODES[nativeLanguage.toLowerCase()] ?? 'en'
}
