export interface SupportedLanguage {
  id: string
  label: string
  nativeLabel: string
  flag: string
  /** ISO 639-1 language code for STT APIs (Soniox, OpenAI Whisper) */
  sttCode: string
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
