/**
 * Client-side dictionary module for the custom Japanese IME.
 * Lazy-loads the dictionary index on first use for instant kana→kanji lookup.
 *
 * Features:
 * - Exact and prefix kana→kanji lookup
 * - De-conjugation engine for verb/adjective forms
 * - Hiragana-preferred set (particles, common kana-only words)
 * - Greedy left-to-right auto-segmentation for multi-word phrases
 */

import type { DictEntry, DictionaryIndex } from '@linguist/core/ime/types'

export type { DictEntry }

let cachedIndex: DictionaryIndex | null = null
let loadPromise: Promise<DictionaryIndex> | null = null

/** Lazy singleton — loads dictionary index on first call */
async function loadIndex(): Promise<DictionaryIndex> {
  if (cachedIndex) return cachedIndex
  if (loadPromise) return loadPromise

  loadPromise = import('@linguist/core/ime/dictionary-index.json').then((mod) => {
    cachedIndex = mod.default as DictionaryIndex
    return cachedIndex
  })

  return loadPromise
}

/** Check if the dictionary has been loaded */
export function isLoaded(): boolean {
  return cachedIndex !== null
}

/** Pre-load the dictionary (call early, e.g. on IME activation) */
export async function load(): Promise<void> {
  await loadIndex()
}

// ─── HIRAGANA-PREFERRED SET ──────────────────────────────────────────
// Words that should stay in hiragana by default (user can manually
// select kanji via arrow keys if they want)

const HIRAGANA_PREFERRED = new Set([
  // Particles
  'は', 'が', 'を', 'に', 'で', 'と', 'も', 'か', 'の', 'へ', 'よ', 'ね', 'な', 'わ',
  'から', 'まで', 'より', 'ので', 'のに', 'けど', 'けれど', 'けれども',
  'だけ', 'しか', 'ばかり', 'ほど', 'くらい', 'ぐらい', 'など',
  // Common greetings / expressions
  'おはよう', 'こんにちは', 'こんばんは', 'ありがとう', 'すみません',
  'ごめん', 'ごめんなさい', 'おやすみ', 'おやすみなさい', 'さようなら',
  'いただきます', 'ごちそうさま', 'ごちそうさまでした',
  // Common adverbs / conjunctions that stay kana
  'そして', 'しかし', 'でも', 'だから', 'それから', 'ところで',
  'やはり', 'やっぱり', 'たぶん', 'もちろん', 'ちょっと',
  'とても', 'すごく', 'もう', 'まだ', 'もっと', 'ずっと',
  'いつも', 'たまに', 'ときどき',
  // Common auxiliary / copula
  'です', 'ます', 'ません', 'ました', 'でした', 'ではない',
  'だった', 'ている', 'てる', 'ておく', 'てある',
  // Common verbs often left in kana
  'する', 'いる', 'ある', 'なる', 'できる', 'いく', 'くる',
  'みる', 'おく', 'あげる', 'もらう', 'くれる',
  // Pronouns often in kana
  'わたし', 'あなた', 'かれ', 'かのじょ',
  'これ', 'それ', 'あれ', 'どれ',
  'ここ', 'そこ', 'あそこ', 'どこ',
  'この', 'その', 'あの', 'どの',
  // Demonstrative adverbs / adjectives
  'こんな', 'そんな', 'あんな', 'どんな',
  'こう', 'そう', 'ああ', 'どう',
  'こんなに', 'そんなに', 'あんなに', 'どんなに',
  // い-adjective stems are NOT here — those convert normally
])

export function isHiraganaPreferred(kana: string): boolean {
  return HIRAGANA_PREFERRED.has(kana)
}

/** Check if a kana prefix is the start of a longer hiragana-preferred word */
function hasHiraganaPreferredContinuation(prefix: string): boolean {
  for (const word of HIRAGANA_PREFERRED) {
    if (word.length > prefix.length && word.startsWith(prefix)) return true
  }
  return false
}

// ─── BASIC LOOKUPS ───────────────────────────────────────────────────

/** Exact kana match — returns candidates sorted by frequency */
export function lookup(kana: string): DictEntry[] {
  if (!cachedIndex || !kana) return []
  return cachedIndex.entries[kana] ?? []
}

/** Prefix match — returns entries whose reading starts with the given kana */
export function prefixLookup(kana: string, limit = 20): DictEntry[] {
  if (!cachedIndex || !kana) return []

  const results: DictEntry[] = []
  for (const [reading, entries] of Object.entries(cachedIndex.entries)) {
    if (reading.startsWith(kana) && reading !== kana) {
      results.push(...entries)
    }
  }

  results.sort((a, b) => a.freq - b.freq)
  return results.slice(0, limit)
}

// ─── DE-CONJUGATION ENGINE ───────────────────────────────────────────
// Strips common verb/adjective suffixes to find the dictionary form,
// then reconstructs the conjugated kanji surface.

interface DeconjResult {
  baseReading: string   // dictionary form reading (e.g., わかる)
  suffix: string        // the conjugation suffix that was stripped (e.g., ない)
  baseSuffix: string    // what the base form ends with that we stripped (e.g., る for ichidan, last char for godan)
}

/** Godan verb stem mapping: the conjugation row (a-dan) for negative form */
const GODAN_NEG_MAP: Record<string, string> = {
  // a-row kana → u-row kana (dictionary form ending)
  'わ': 'う', 'か': 'く', 'さ': 'す', 'た': 'つ', 'な': 'ぬ',
  'ま': 'む', 'ら': 'る', 'が': 'ぐ', 'ば': 'ぶ',
}

const GODAN_I_MAP: Record<string, string> = {
  // i-row kana → u-row kana (dictionary form ending)
  'い': 'う', 'き': 'く', 'し': 'す', 'ち': 'つ', 'に': 'ぬ',
  'み': 'む', 'り': 'る', 'ぎ': 'ぐ', 'び': 'ぶ',
}

const GODAN_E_MAP: Record<string, string> = {
  // e-row kana → u-row kana (dictionary form ending)
  'え': 'う', 'け': 'く', 'せ': 'す', 'て': 'つ', 'ね': 'ぬ',
  'め': 'む', 'れ': 'る', 'げ': 'ぐ', 'べ': 'ぶ',
}

const GODAN_O_MAP: Record<string, string> = {
  // o-row kana → u-row kana (dictionary form ending)
  'お': 'う', 'こ': 'く', 'そ': 'す', 'と': 'つ', 'の': 'ぬ',
  'も': 'む', 'ろ': 'る', 'ご': 'ぐ', 'ぼ': 'ぶ',
}

/**
 * Try to de-conjugate a kana string and find the dictionary base form.
 * Returns array of possible base readings with their suffixes.
 */
function deconjugate(kana: string): DeconjResult[] {
  const results: DeconjResult[] = []
  if (kana.length < 3) return results

  // ─── Negative: ~ない / ~なかった ─────────
  // Ichidan: 食べない → 食べる (stem + ない → stem + る)
  // Godan: 分からない → 分かる (stem[a-row] + ない → stem[u-row])
  // Irregular: しない → する, こない → くる

  const naiIdx = kana.lastIndexOf('ない')
  const nakattaIdx = kana.lastIndexOf('なかった')

  const negSuffix = nakattaIdx >= 0 ? 'なかった' : naiIdx >= 0 ? 'ない' : null
  const negIdx = nakattaIdx >= 0 ? nakattaIdx : naiIdx

  if (negSuffix && negIdx >= 1) {
    const stem = kana.slice(0, negIdx)

    // Irregular: しない → する
    if (stem === 'し') {
      results.push({ baseReading: 'する', suffix: negSuffix, baseSuffix: 'る' })
    }
    // Irregular: こない → くる
    if (stem === 'こ') {
      results.push({ baseReading: 'くる', suffix: negSuffix, baseSuffix: 'る' })
    }

    // Godan: the last char of stem is a-row → map to u-row
    const lastChar = stem[stem.length - 1]
    const uRow = GODAN_NEG_MAP[lastChar]
    if (uRow) {
      results.push({
        baseReading: stem.slice(0, -1) + uRow,
        suffix: negSuffix,
        baseSuffix: uRow,
      })
    }

    // ん-contraction: わかんない → わからない → わかる
    // Colloquial speech contracts ら+ない to ん+ない for godan ら-column verbs
    if (lastChar === 'ん' && stem.length >= 2) {
      results.push({
        baseReading: stem.slice(0, -1) + 'る',
        suffix: negSuffix,
        baseSuffix: 'る',
      })
    }

    // Ichidan: stem + る is the dictionary form
    if (stem.length >= 1) {
      results.push({
        baseReading: stem + 'る',
        suffix: negSuffix,
        baseSuffix: 'る',
      })
    }
  }

  // ─── Polite: ~ます / ~ました / ~ません ─────────
  const mashouIdx = kana.lastIndexOf('ましょう')
  const masenIdx = kana.lastIndexOf('ません')
  const mashitaIdx = kana.lastIndexOf('ました')
  const masuIdx = kana.lastIndexOf('ます')

  const polSuffix = mashouIdx >= 0 ? 'ましょう' : masenIdx >= 0 ? 'ません' : mashitaIdx >= 0 ? 'ました' : masuIdx >= 0 ? 'ます' : null
  const polIdx = mashouIdx >= 0 ? mashouIdx : masenIdx >= 0 ? masenIdx : mashitaIdx >= 0 ? mashitaIdx : masuIdx

  if (polSuffix && polIdx !== undefined && polIdx >= 1) {
    const stem = kana.slice(0, polIdx)

    // Irregular: します → する
    if (stem === 'し') {
      results.push({ baseReading: 'する', suffix: polSuffix, baseSuffix: 'る' })
    }
    // Irregular: きます → くる
    if (stem === 'き') {
      results.push({ baseReading: 'くる', suffix: polSuffix, baseSuffix: 'る' })
    }

    // Godan: i-row stem → u-row
    const lastChar = stem[stem.length - 1]
    const uRow = GODAN_I_MAP[lastChar]
    if (uRow) {
      results.push({
        baseReading: stem.slice(0, -1) + uRow,
        suffix: polSuffix,
        baseSuffix: uRow,
      })
    }

    // Ichidan: stem + る
    if (stem.length >= 1) {
      results.push({
        baseReading: stem + 'る',
        suffix: polSuffix,
        baseSuffix: 'る',
      })
    }
  }

  // ─── Te-form: ~て / ~で ─────────
  if (kana.endsWith('て') || kana.endsWith('で')) {
    const te = kana[kana.length - 1]
    const stem = kana.slice(0, -1)

    // Irregular: して → する
    if (stem === 'し') {
      results.push({ baseReading: 'する', suffix: te, baseSuffix: 'る' })
    }
    // Irregular: きて → くる
    if (stem === 'き' && te === 'て') {
      results.push({ baseReading: 'くる', suffix: te, baseSuffix: 'る' })
    }
    // Irregular: いって → いく (行く)
    if (stem === 'いっ' && te === 'て') {
      results.push({ baseReading: 'いく', suffix: 'って', baseSuffix: 'く' })
    }

    // Godan te-form patterns:
    // ~って → ~う/~つ/~る
    if (stem.endsWith('っ') && te === 'て') {
      const pre = stem.slice(0, -1)
      results.push({ baseReading: pre + 'う', suffix: 'って', baseSuffix: 'う' })
      results.push({ baseReading: pre + 'つ', suffix: 'って', baseSuffix: 'つ' })
      results.push({ baseReading: pre + 'る', suffix: 'って', baseSuffix: 'る' })
    }
    // ~いて → ~く, ~いで → ~ぐ
    if (stem.endsWith('い')) {
      const pre = stem.slice(0, -1)
      if (te === 'て') {
        results.push({ baseReading: pre + 'く', suffix: 'いて', baseSuffix: 'く' })
      } else {
        results.push({ baseReading: pre + 'ぐ', suffix: 'いで', baseSuffix: 'ぐ' })
      }
    }
    // ~んで → ~む/~ぬ/~ぶ
    if (stem.endsWith('ん') && te === 'で') {
      const pre = stem.slice(0, -1)
      results.push({ baseReading: pre + 'む', suffix: 'んで', baseSuffix: 'む' })
      results.push({ baseReading: pre + 'ぬ', suffix: 'んで', baseSuffix: 'ぬ' })
      results.push({ baseReading: pre + 'ぶ', suffix: 'んで', baseSuffix: 'ぶ' })
    }
    // ~して → ~す
    if (stem.endsWith('し') && te === 'て') {
      const pre = stem.slice(0, -1)
      if (pre.length >= 1) {
        results.push({ baseReading: pre + 'す', suffix: 'して', baseSuffix: 'す' })
      }
    }

    // Ichidan: stem + る + て → stem + て
    if (stem.length >= 1) {
      results.push({
        baseReading: stem + 'る',
        suffix: te,
        baseSuffix: 'る',
      })
    }
  }

  // ─── Past: ~た / ~だ ─────────
  if (kana.endsWith('た') || kana.endsWith('だ')) {
    const ta = kana[kana.length - 1]
    const stem = kana.slice(0, -1)

    // Irregular: した → する
    if (stem === 'し' && ta === 'た') {
      results.push({ baseReading: 'する', suffix: ta, baseSuffix: 'る' })
    }
    // Irregular: きた → くる
    if (stem === 'き' && ta === 'た') {
      results.push({ baseReading: 'くる', suffix: ta, baseSuffix: 'る' })
    }

    // Godan past patterns (same as te-form but with た/だ)
    if (stem.endsWith('っ') && ta === 'た') {
      const pre = stem.slice(0, -1)
      results.push({ baseReading: pre + 'う', suffix: 'った', baseSuffix: 'う' })
      results.push({ baseReading: pre + 'つ', suffix: 'った', baseSuffix: 'つ' })
      results.push({ baseReading: pre + 'る', suffix: 'った', baseSuffix: 'る' })
    }
    if (stem.endsWith('い')) {
      const pre = stem.slice(0, -1)
      if (ta === 'た') {
        results.push({ baseReading: pre + 'く', suffix: 'いた', baseSuffix: 'く' })
      } else {
        results.push({ baseReading: pre + 'ぐ', suffix: 'いだ', baseSuffix: 'ぐ' })
      }
    }
    if (stem.endsWith('ん') && ta === 'だ') {
      const pre = stem.slice(0, -1)
      results.push({ baseReading: pre + 'む', suffix: 'んだ', baseSuffix: 'む' })
      results.push({ baseReading: pre + 'ぬ', suffix: 'んだ', baseSuffix: 'ぬ' })
      results.push({ baseReading: pre + 'ぶ', suffix: 'んだ', baseSuffix: 'ぶ' })
    }
    if (stem.endsWith('し') && ta === 'た') {
      const pre = stem.slice(0, -1)
      if (pre.length >= 1) {
        results.push({ baseReading: pre + 'す', suffix: 'した', baseSuffix: 'す' })
      }
    }

    // Ichidan: stem + る + た → stem + た
    if (stem.length >= 1) {
      results.push({
        baseReading: stem + 'る',
        suffix: ta,
        baseSuffix: 'る',
      })
    }
  }

  // ─── Tai-form: ~たい / ~たかった ─────────
  const takattaIdx = kana.lastIndexOf('たかった')
  const taiIdx = kana.lastIndexOf('たい')

  const taiSuffix = takattaIdx >= 0 ? 'たかった' : taiIdx >= 0 ? 'たい' : null
  const taiStemIdx = takattaIdx >= 0 ? takattaIdx : taiIdx

  if (taiSuffix && taiStemIdx !== undefined && taiStemIdx >= 1) {
    const stem = kana.slice(0, taiStemIdx)

    // Irregular: したい → する
    if (stem === 'し') {
      results.push({ baseReading: 'する', suffix: taiSuffix, baseSuffix: 'る' })
    }
    // Irregular: きたい → くる  (来たい)
    if (stem === 'き') {
      results.push({ baseReading: 'くる', suffix: taiSuffix, baseSuffix: 'る' })
    }

    // Godan: i-row stem → u-row
    const lastChar = stem[stem.length - 1]
    const uRow = GODAN_I_MAP[lastChar]
    if (uRow) {
      results.push({
        baseReading: stem.slice(0, -1) + uRow,
        suffix: taiSuffix,
        baseSuffix: uRow,
      })
    }

    // Ichidan: stem + る
    if (stem.length >= 1) {
      results.push({
        baseReading: stem + 'る',
        suffix: taiSuffix,
        baseSuffix: 'る',
      })
    }
  }

  // ─── Potential: ~える / ~られる ─────────
  if (kana.endsWith('られる') && kana.length >= 4) {
    // Ichidan potential: 食べられる → 食べる
    const stem = kana.slice(0, -3) // remove られる
    results.push({ baseReading: stem + 'る', suffix: 'られる', baseSuffix: 'る' })
  }
  if (kana.endsWith('える') || kana.endsWith('ける') || kana.endsWith('せる') ||
      kana.endsWith('てる') || kana.endsWith('ねる') || kana.endsWith('める') ||
      kana.endsWith('れる') || kana.endsWith('げる') || kana.endsWith('べる')) {
    // Godan potential: 分かれる → 分かる (e-row + る → u-row)
    const eChar = kana[kana.length - 2]
    const uRow = GODAN_E_MAP[eChar]
    if (uRow && kana.length >= 3) {
      const stem = kana.slice(0, -2)
      results.push({ baseReading: stem + uRow, suffix: eChar + 'る', baseSuffix: uRow })
    }
  }

  // ─── Volitional: ~よう / ~おう ─────────
  if (kana.endsWith('よう') && kana.length >= 3) {
    // Ichidan: 食べよう → 食べる
    const stem = kana.slice(0, -2)
    results.push({ baseReading: stem + 'る', suffix: 'よう', baseSuffix: 'る' })
  }
  if (kana.endsWith('おう') || kana.endsWith('こう') || kana.endsWith('そう') ||
      kana.endsWith('とう') || kana.endsWith('のう') || kana.endsWith('もう') ||
      kana.endsWith('ろう') || kana.endsWith('ごう') || kana.endsWith('ぼう')) {
    const oChar = kana[kana.length - 2]
    const uRow = GODAN_O_MAP[oChar]
    if (uRow && kana.length >= 3) {
      const stem = kana.slice(0, -2)
      results.push({ baseReading: stem + uRow, suffix: oChar + 'う', baseSuffix: uRow })
    }
  }

  // ─── i-adjective: ~くない / ~かった / ~くて ─────────
  if (kana.endsWith('くない') && kana.length >= 4) {
    results.push({ baseReading: kana.slice(0, -3) + 'い', suffix: 'くない', baseSuffix: 'い' })
  }
  if (kana.endsWith('かった') && kana.length >= 4) {
    results.push({ baseReading: kana.slice(0, -3) + 'い', suffix: 'かった', baseSuffix: 'い' })
  }
  if (kana.endsWith('くて') && kana.length >= 3) {
    results.push({ baseReading: kana.slice(0, -2) + 'い', suffix: 'くて', baseSuffix: 'い' })
  }

  return results
}

/**
 * Reconstruct the kanji surface form for a conjugated word.
 * E.g., base entry 分かる (reading わかる) + suffix ない:
 *   base surface "分かる" minus baseSuffix "る" = "分か" + suffix "ない" = "分からない"
 *
 * For godan negative, we also need to map: わかる → わから + ない
 *   so the kanji stem = "分か" (surface minus "る") and we add the a-row char + suffix
 */
function reconstructKanji(entry: DictEntry, deconj: DeconjResult, originalKana: string): string {
  const { baseReading, suffix, baseSuffix } = deconj

  // Find the common prefix between reading and surface to determine the kanji stem
  // e.g., わかる → 分かる: reading "わかる" has the "る" suffix matching surface "分かる"
  const readingWithoutSuffix = baseReading.slice(0, baseReading.length - baseSuffix.length)
  const surfaceWithoutSuffix = entry.surface.slice(0, entry.surface.length - baseSuffix.length)

  // The conjugation suffix in the original kana replaces the base suffix
  // e.g., わからない: stem is わか (reading) / 分か (surface), then + らない
  const originalSuffix = originalKana.slice(readingWithoutSuffix.length)

  return surfaceWithoutSuffix + originalSuffix
}

/**
 * Look up a potentially conjugated kana string.
 * Returns entries with their surface forms reconstructed to match the conjugation.
 * E.g., わからない → [{ surface: "分からない", reading: "わからない", ... }]
 */
export function conjugatedLookup(kana: string): DictEntry[] {
  if (!cachedIndex || !kana) return []

  const deconjs = deconjugate(kana)
  const seen = new Set<string>()
  const results: DictEntry[] = []

  for (const deconj of deconjs) {
    const entries = cachedIndex.entries[deconj.baseReading]
    if (!entries) continue

    for (const entry of entries) {
      // Verify the entry's surface actually ends with the base suffix
      if (!entry.surface.endsWith(deconj.baseSuffix) && entry.surface !== entry.reading) continue

      const reconstructed = reconstructKanji(entry, deconj, kana)
      if (seen.has(reconstructed)) continue
      seen.add(reconstructed)

      results.push({
        surface: reconstructed,
        reading: kana,
        meaning: entry.meaning,
        pos: entry.pos,
        freq: entry.freq,
      })
    }
  }

  return results
}

// ─── AUTO-SEGMENTATION ──────────────────────────────────────────────
// Greedy left-to-right segmentation: at each position, find the longest
// kana substring that matches a dictionary entry, convert it, then move on.

export interface Segment {
  kana: string          // the kana for this segment
  converted: string     // the auto-converted display (kanji or kana)
  isConverted: boolean  // true if converted to kanji
}

/**
 * Best single-word conversion for a kana string.
 * Checks: exact match → conjugated lookup → hiragana preferred.
 * Returns the best surface form, or null if kana should stay as-is.
 */
function bestConversion(kana: string): string | null {
  if (!kana || kana.length < 1) return null
  // Don't convert if there's trailing romaji
  if (/[a-zA-Z]/.test(kana)) return null
  // Single char — don't auto-convert
  if (kana.length < 2) return null
  // Hiragana-preferred words stay as kana
  if (HIRAGANA_PREFERRED.has(kana)) return null

  // Try exact dictionary match
  const exact = lookup(kana)
  if (exact.length > 0 && exact[0].surface !== kana) {
    return exact[0].surface
  }

  // Try conjugated lookup
  const conjugated = conjugatedLookup(kana)
  if (conjugated.length > 0 && conjugated[0].surface !== kana) {
    return conjugated[0].surface
  }

  return null
}

/**
 * Check if a kana substring is a known word or particle (valid segment boundary).
 * Returns { match: true, surface } if found, or { match: false } if not.
 */
function checkWord(candidate: string): { match: boolean; surface: string | null } {
  if (HIRAGANA_PREFERRED.has(candidate)) {
    return { match: true, surface: null } // stays as kana
  }

  const exact = lookup(candidate)
  if (exact.length > 0 && exact[0].surface !== candidate) {
    return { match: true, surface: exact[0].surface }
  }

  const conj = conjugatedLookup(candidate)
  if (conj.length > 0 && conj[0].surface !== candidate) {
    return { match: true, surface: conj[0].surface }
  }

  // Known word that stays as kana (e.g. kana-only words in dict)
  if (exact.length > 0) {
    return { match: true, surface: null }
  }

  return { match: false, surface: null }
}

/**
 * Find the best match length at a given position using 1-step lookahead.
 * Scores each possible split by (current match length + next match length).
 * This prevents greedy errors like はた (旗) eating into は + たべる.
 */
function findBestSplit(
  kana: string,
  pos: number
): { len: number; surface: string | null } {
  const remaining = kana.length - pos
  const maxLen = Math.min(remaining, 12)

  let bestLen = 0
  let bestSurface: string | null = null
  let bestScore = -1

  for (let len = maxLen; len >= 1; len--) {
    const candidate = kana.slice(pos, pos + len)
    const result = len >= 2 ? checkWord(candidate) : { match: false, surface: null }

    // Single chars that are particles count as matches
    if (len === 1 && HIRAGANA_PREFERRED.has(candidate)) {
      // single-char particle
    } else if (!result.match && len >= 2) {
      continue
    } else if (!result.match && len === 1) {
      // Fallback: single unmatched char
      if (bestLen === 0) {
        bestLen = 1
        bestSurface = null
      }
      continue
    }

    // Calculate lookahead score: how well does the next segment match?
    let lookaheadLen = 0
    const nextPos = pos + len
    if (nextPos < kana.length) {
      const nextMaxLen = Math.min(kana.length - nextPos, 12)
      for (let len2 = nextMaxLen; len2 >= 1; len2--) {
        const nextCandidate = kana.slice(nextPos, nextPos + len2)
        const nextResult = len2 >= 2 ? checkWord(nextCandidate) : { match: false, surface: null }
        if (nextResult.match || (len2 === 1 && HIRAGANA_PREFERRED.has(nextCandidate))) {
          lookaheadLen = len2
          break
        }
      }
    }

    const score = len + lookaheadLen
    if (score > bestScore) {
      bestScore = score
      bestLen = len
      bestSurface = result.match ? result.surface : null
    }
  }

  return { len: bestLen || 1, surface: bestSurface }
}

/**
 * Auto-segment a kana string into words and convert each to kanji where possible.
 * Uses lookahead-scored segmentation to avoid greedy errors at particle boundaries.
 *
 * Example: いまからおれは → [今, から, 俺, は]
 *         わたしはたべる → [わたし, は, 食べる]
 *
 * Returns the full converted string and the segment breakdown.
 */
export function autoSegment(kana: string): { text: string; segments: Segment[] } {
  if (!cachedIndex || !kana) return { text: kana || '', segments: [] }
  // Don't segment if there's trailing romaji (still typing)
  if (/[a-zA-Z]/.test(kana)) {
    const clean = kana.replace(/[a-zA-Z]+$/, '')
    if (!clean) return { text: kana, segments: [] }
    // Segment the clean part, append the romaji tail
    const romajiTail = kana.slice(clean.length)
    const result = autoSegment(clean)
    result.text += romajiTail
    result.segments.push({ kana: romajiTail, converted: romajiTail, isConverted: false })
    return result
  }

  const segments: Segment[] = []
  let pos = 0

  while (pos < kana.length) {
    const { len, surface } = findBestSplit(kana, pos)
    const segKana = kana.slice(pos, pos + len)
    segments.push({
      kana: segKana,
      converted: surface ?? segKana,
      isConverted: surface !== null,
    })
    pos += len
  }

  // Prefix-aware suppression: if the last segment's kana is a strict prefix
  // of a hiragana-preferred word, suppress its conversion — the user is likely
  // still typing (e.g., そん → そんな). Only the last segment is affected
  // because middle segments are already "committed" by the user moving past them.
  if (segments.length > 0) {
    const last = segments[segments.length - 1]
    if (last.isConverted && hasHiraganaPreferredContinuation(last.kana)) {
      last.converted = last.kana
      last.isConverted = false
    }
  }

  return {
    text: segments.map((s) => s.converted).join(''),
    segments,
  }
}

// ─── COMPOSING LOOKUP (for candidate panel) ──────────────────────────

/**
 * Smart lookup for candidate display during composition.
 * Includes exact matches, conjugated matches, and prefix matches.
 */
export function composingLookup(kana: string, limit = 9): DictEntry[] {
  if (!cachedIndex || !kana) return []

  const exact = cachedIndex.entries[kana] ?? []
  const conjugated = conjugatedLookup(kana)

  const prefix: DictEntry[] = []
  for (const [reading, entries] of Object.entries(cachedIndex.entries)) {
    if (reading.startsWith(kana) && reading !== kana) {
      prefix.push(...entries)
    }
  }
  prefix.sort((a, b) => a.freq - b.freq)

  // Merge: exact first, then conjugated, then prefix
  if (exact.length > 0 || conjugated.length > 0 || prefix.length > 0) {
    const seen = new Set<string>()
    const results: DictEntry[] = []
    for (const entry of [...exact, ...conjugated, ...prefix]) {
      if (!seen.has(entry.surface)) {
        seen.add(entry.surface)
        results.push(entry)
      }
      if (results.length >= limit) break
    }
    return results
  }

  // No direct matches — try shorter prefixes of the input
  if (kana.length >= 3) {
    for (let len = kana.length - 1; len >= 2; len--) {
      const shorter = kana.slice(0, len)
      const fallback: DictEntry[] = []
      for (const [reading, entries] of Object.entries(cachedIndex.entries)) {
        if (reading.startsWith(shorter)) {
          fallback.push(...entries)
        }
      }
      if (fallback.length > 0) {
        fallback.sort((a, b) => a.freq - b.freq)
        const seen = new Set<string>()
        const results: DictEntry[] = []
        for (const entry of fallback) {
          if (!seen.has(entry.surface)) {
            seen.add(entry.surface)
            results.push(entry)
          }
          if (results.length >= limit) break
        }
        return results
      }
    }
  }

  return []
}
