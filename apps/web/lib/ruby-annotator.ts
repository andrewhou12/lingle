import { toRomaji } from 'wanakana'

const RUBY_REGEX = /\{([^}|]+)\|([^}]+)\}/g
const KANA_RUN_REGEX = /([ぁ-ゖァ-ヺー]+)/g
const PAUSE_MARKER_REGEX = /<\d+>/g

function ruby(text: string, rt: string): string {
  return `<ruby>${text}<rp>(</rp><rt>${rt}</rt><rp>)</rp></ruby>`
}

/**
 * Strip {漢字|かんじ} annotations, returning plain kanji text.
 */
export function stripRubyAnnotations(text: string): string {
  return text.replace(RUBY_REGEX, '$1').replace(PAUSE_MARKER_REGEX, '')
}

/**
 * Convert all Japanese text to ruby-annotated HTML with romaji:
 * - {漢字|かんじ} annotations use the provided reading
 * - Remaining hiragana/katakana runs are converted directly via wanakana
 */
export function rubyToHtml(text: string): string {
  // Protect kanji annotations with markers so kana regex doesn't touch their readings
  const annotations: string[] = []
  let marked = text.replace(RUBY_REGEX, (_match, kanji: string, reading: string) => {
    annotations.push(ruby(kanji, toRomaji(reading)))
    return `\x00R${annotations.length - 1}\x00`
  })

  // Annotate remaining kana runs
  marked = marked.replace(KANA_RUN_REGEX, (kanaRun) => ruby(kanaRun, toRomaji(kanaRun)))

  // Restore kanji annotations
  return marked.replace(/\x00R(\d+)\x00/g, (_m, idx) => annotations[parseInt(idx)])
}

/**
 * Process text for display: apply or strip ruby annotations based on preference.
 */
export function processRubyText(text: string, showRomaji: boolean): string {
  if (showRomaji) return rubyToHtml(text)
  return stripRubyAnnotations(text)
}
