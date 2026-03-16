// Re-export from shared package — single source of truth
export {
  SUPPORTED_LANGUAGES,
  getLanguageById,
  getTargetFontClass,
  getTargetFontCleanClass,
  hasTargetLanguageText,
  getGreetingForLanguage,
  getSttCode,
  getNativeSttCode,
} from '@lingle/shared/languages'
export type { SupportedLanguage } from '@lingle/shared/languages'
