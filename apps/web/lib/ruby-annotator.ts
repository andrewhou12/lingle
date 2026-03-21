const RUBY_REGEX = /\{([^}|]+)\|([^}]+)\}/g
const PAUSE_MARKER_REGEX = /<\d+>/g

/**
 * Strip {漢字|かんじ} annotations, returning plain kanji text.
 */
export function stripRubyAnnotations(text: string): string {
  return text.replace(RUBY_REGEX, '$1').replace(PAUSE_MARKER_REGEX, '')
}
