/**
 * Build script: downloads JMdict common-only + JPDB frequency data and builds
 * a compact kana→kanji lookup index for the custom Japanese IME.
 *
 * Usage: pnpm build:dict
 *
 * Data sources:
 *   1. jmdict-simplified (common-only) — ~22K entries, all common Japanese words
 *   2. JPDB frequency list — ~515K entries with real usage-based frequency ranks
 *
 * The JPDB frequency data ensures the most common kanji appears first when
 * multiple words share a reading (e.g., 今 before 居間 for いま).
 *
 * Output: dictionary-index.json (~3-4 MB, lazy-loaded by the client)
 */

import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, readdirSync } from 'fs'
import { resolve, dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { tmpdir } from 'os'
import { execSync } from 'child_process'
import type { DictEntry, DictionaryIndex } from './types'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outputPath = resolve(__dirname, 'dictionary-index.json')

const JMDICT_RELEASES_API =
  'https://api.github.com/repos/scriptin/jmdict-simplified/releases/latest'
const JPDB_FREQ_URL =
  'https://github.com/MarvNC/jpdb-freq-list/releases/download/2022-05-09/Freq.JPDB_2022-05-10T03_27_02.930Z.zip'

// ─── JMdict types ────────────────────────────────────────────────────────────

interface JMdictFile {
  version: string
  commonOnly: boolean
  words: JMdictWord[]
}

interface JMdictWord {
  id: string
  kanji: { common: boolean; text: string; tags: string[] }[]
  kana: { common: boolean; text: string; tags: string[]; appliesToKanji: string[] }[]
  sense: JMdictSense[]
}

interface JMdictSense {
  partOfSpeech: string[]
  appliesToKanji: string[]
  appliesToKana: string[]
  gloss: { lang: string; text: string }[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function log(msg: string) {
  console.log(`[build-dict] ${msg}`)
}

/** Check if a string contains katakana */
function hasKatakana(str: string): boolean {
  for (const ch of str) {
    const code = ch.codePointAt(0)!
    if (code >= 0x30A1 && code <= 0x30F6) return true
  }
  return false
}

/** Convert katakana to hiragana (U+30A1–U+30F6 → U+3041–U+3096) */
function toHiragana(str: string): string {
  let result = ''
  for (const ch of str) {
    const code = ch.codePointAt(0)!
    if (code >= 0x30A1 && code <= 0x30F6) {
      result += String.fromCodePoint(code - 0x60)
    } else {
      result += ch
    }
  }
  return result
}

function simplifyPartOfSpeech(posTags: string[]): string {
  for (const tag of posTags) {
    if (tag.startsWith('v')) return 'verb'
  }
  for (const tag of posTags) {
    if (tag === 'adj-i' || tag === 'adj-ix') return 'i-adjective'
    if (tag === 'adj-na' || tag === 'adj-no' || tag === 'adj-t' || tag === 'adj-f') return 'na-adjective'
    if (tag.startsWith('adj')) return 'adjective'
  }
  for (const tag of posTags) {
    if (tag === 'adv' || tag === 'adv-to') return 'adverb'
  }
  for (const tag of posTags) {
    if (tag === 'n' || tag === 'n-suf' || tag === 'n-pref' || tag === 'n-t' || tag === 'n-adv') return 'noun'
  }
  for (const tag of posTags) {
    if (tag === 'exp') return 'expression'
    if (tag === 'ctr') return 'counter'
    if (tag === 'pn') return 'pronoun'
    if (tag === 'conj') return 'conjunction'
    if (tag === 'int') return 'interjection'
    if (tag === 'prt') return 'particle'
    if (tag === 'pref') return 'prefix'
    if (tag === 'suf') return 'suffix'
  }
  return 'other'
}

function extractMeaning(senses: JMdictSense[]): string {
  const glosses: string[] = []
  for (const sense of senses.slice(0, 2)) {
    const engGlosses = sense.gloss.filter((g) => g.lang === 'eng' || !g.lang)
    for (const g of engGlosses.slice(0, 2)) {
      if (g.text && !glosses.includes(g.text)) glosses.push(g.text)
    }
    if (glosses.length >= 3) break
  }
  return glosses.join('; ') || 'unknown'
}

async function downloadFile(url: string, dest: string): Promise<void> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'linguist-build-dict/1.0' },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} downloading ${url}`)
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
}

// ─── Download JPDB frequency data ────────────────────────────────────────────

type FreqMap = Map<string, number>

async function downloadJPDBFreq(tmpDir: string): Promise<FreqMap> {
  log('Downloading JPDB frequency data...')

  const zipPath = join(tmpDir, 'jpdb-freq.zip')
  await downloadFile(JPDB_FREQ_URL, zipPath)

  const extractDir = join(tmpDir, 'jpdb-freq')
  mkdirSync(extractDir, { recursive: true })
  execSync(`unzip -o "${zipPath}" -d "${extractDir}"`, { stdio: 'pipe' })

  const files = readdirSync(extractDir).filter(
    (f) => f.startsWith('term_meta_bank') && f.endsWith('.json')
  )
  if (files.length === 0) throw new Error('No term_meta_bank files in JPDB zip')

  const freqMap: FreqMap = new Map()

  for (const file of files) {
    const data = JSON.parse(readFileSync(join(extractDir, file), 'utf-8')) as Array<
      [string, string, { reading?: string; frequency?: { value: number } | number; value?: number }]
    >

    for (const entry of data) {
      const term = entry[0]
      const meta = entry[2]

      let reading = ''
      let rank = 0

      if (typeof meta === 'number') {
        rank = meta
      } else if (typeof meta === 'object' && meta !== null) {
        reading = meta.reading || ''
        if (typeof meta.frequency === 'object' && meta.frequency !== null) {
          rank = meta.frequency.value
        } else if (typeof meta.frequency === 'number') {
          rank = meta.frequency
        } else if (typeof meta.value === 'number') {
          rank = meta.value
        }
      }

      if (rank <= 0) continue

      // Store by surface|reading for precise matching
      if (reading) {
        const key = `${term}|${reading}`
        if (!freqMap.has(key) || rank < freqMap.get(key)!) {
          freqMap.set(key, rank)
        }
      }
      // Also store by surface-only for fallback
      const surfaceKey = term
      if (!freqMap.has(surfaceKey) || rank < freqMap.get(surfaceKey)!) {
        freqMap.set(surfaceKey, rank)
      }
    }
  }

  log(`Loaded ${freqMap.size} frequency entries from JPDB`)
  return freqMap
}

// ─── Download JMdict ─────────────────────────────────────────────────────────

async function downloadJMdict(tmpDir: string): Promise<JMdictFile> {
  log('Fetching jmdict-simplified release info...')

  const res = await fetch(JMDICT_RELEASES_API, {
    headers: { Accept: 'application/json', 'User-Agent': 'linguist-build-dict/1.0' },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching release info`)
  const releaseInfo = (await res.json()) as {
    assets: { name: string; browser_download_url: string }[]
    tag_name: string
  }

  log(`Latest release: ${releaseInfo.tag_name}`)

  const asset =
    releaseInfo.assets.find((a) => a.name.includes('jmdict-eng-common') && a.name.endsWith('.json')) ||
    releaseInfo.assets.find((a) => a.name.includes('jmdict-eng-common') && (a.name.endsWith('.zip') || a.name.endsWith('.json.zip'))) ||
    releaseInfo.assets.find((a) => a.name.includes('jmdict-eng-common') && a.name.endsWith('.tgz'))

  if (!asset) {
    throw new Error(
      `No jmdict-eng-common asset found. Available: ${releaseInfo.assets.map((a) => a.name).join(', ')}`
    )
  }

  log(`Downloading ${asset.name}...`)
  const downloadPath = join(tmpDir, asset.name)
  await downloadFile(asset.browser_download_url, downloadPath)

  let jsonPath: string

  if (asset.name.endsWith('.json') && !asset.name.endsWith('.json.zip')) {
    jsonPath = downloadPath
  } else if (asset.name.endsWith('.zip')) {
    const extractDir = join(tmpDir, 'jmdict')
    mkdirSync(extractDir, { recursive: true })
    execSync(`unzip -o "${downloadPath}" -d "${extractDir}"`, { stdio: 'pipe' })
    const jsonFiles = readdirSync(extractDir).filter((f) => f.endsWith('.json'))
    if (jsonFiles.length === 0) throw new Error('No .json in JMdict zip')
    jsonPath = join(extractDir, jsonFiles[0])
  } else if (asset.name.endsWith('.tgz') || asset.name.endsWith('.tar.gz')) {
    const extractDir = join(tmpDir, 'jmdict')
    mkdirSync(extractDir, { recursive: true })
    execSync(`tar -xzf "${downloadPath}" -C "${extractDir}"`, { stdio: 'pipe' })
    const findJson = (dir: string): string | null => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          const found = findJson(join(dir, entry.name))
          if (found) return found
        } else if (entry.name.endsWith('.json')) return join(dir, entry.name)
      }
      return null
    }
    jsonPath = findJson(extractDir) || (() => { throw new Error('No .json in JMdict tgz') })()
  } else {
    throw new Error(`Unsupported format: ${asset.name}`)
  }

  log('Parsing JMdict JSON...')
  const data: JMdictFile = JSON.parse(readFileSync(jsonPath, 'utf-8'))
  log(`Parsed ${data.words.length} entries (commonOnly: ${data.commonOnly})`)
  return data
}

// ─── Build pipeline ──────────────────────────────────────────────────────────

/** Default frequency for words not found in JPDB (sorts to end) */
const DEFAULT_FREQ = 999999

async function main() {
  log('=== IME Dictionary Builder ===')
  log('Sources: JMdict common-only + JPDB frequency data')
  log('')

  const tmpDir = mkdtempSync(join(tmpdir(), 'linguist-dict-'))

  try {
    // Download both in parallel
    const [jmdict, freqMap] = await Promise.all([
      downloadJMdict(tmpDir),
      downloadJPDBFreq(tmpDir),
    ])

    const entries: Record<string, DictEntry[]> = {}
    let count = 0
    let skipped = 0
    let freqMatched = 0
    let freqFallback = 0
    let freqMissed = 0

    function addEntry(entry: DictEntry) {
      // Normalize reading to hiragana so IME input (always hiragana) can find
      // katakana-only loanwords like カラオケ (からおけ), テレビ (てれび), etc.
      const key = toHiragana(entry.reading)
      const normalized = { ...entry, reading: key }
      if (!entries[key]) entries[key] = []
      if (!entries[key].some((e) => e.surface === normalized.surface)) {
        entries[key].push(normalized)
        count++
      }
    }

    /** Look up frequency for a surface form + reading pair */
    function lookupFreq(surface: string, reading: string): number {
      // Try precise match first: surface|reading
      const precise = freqMap.get(`${surface}|${reading}`)
      if (precise !== undefined) {
        freqMatched++
        return precise
      }
      // Fallback: surface-only
      const fallback = freqMap.get(surface)
      if (fallback !== undefined) {
        freqFallback++
        return fallback
      }
      freqMissed++
      return DEFAULT_FREQ
    }

    for (const word of jmdict.words) {
      const firstKana = word.kana[0]
      if (!firstKana) { skipped++; continue }

      const allPos = word.sense.flatMap((s) => s.partOfSpeech)
      const pos = simplifyPartOfSpeech(allPos)
      const meaning = extractMeaning(word.sense)

      if (word.kanji.length > 0) {
        for (const kanji of word.kanji) {
          const applicableKana = word.kana.filter(
            (k) =>
              k.appliesToKanji.length === 0 ||
              k.appliesToKanji.includes(kanji.text) ||
              k.appliesToKanji.includes('*')
          )

          for (const kana of applicableKana) {
            addEntry({
              surface: kanji.text,
              reading: kana.text,
              meaning,
              pos,
              freq: lookupFreq(kanji.text, kana.text),
            })
          }
        }

        // Also add katakana readings as surface candidates for loanwords.
        // e.g., カラオケ has kanji 空オケ but the katakana form is far more common.
        for (const kana of word.kana) {
          if (hasKatakana(kana.text)) {
            addEntry({
              surface: kana.text,
              reading: kana.text,
              meaning,
              pos,
              freq: lookupFreq(kana.text, kana.text),
            })
          }
        }
      } else {
        addEntry({
          surface: firstKana.text,
          reading: firstKana.text,
          meaning,
          pos,
          freq: lookupFreq(firstKana.text, firstKana.text),
        })
      }
    }

    log('')
    log(`Frequency matching: ${freqMatched} precise, ${freqFallback} fallback, ${freqMissed} unmatched`)

    // Sort each reading's entries by frequency (lower rank = more common = first)
    for (const reading of Object.keys(entries)) {
      entries[reading].sort((a, b) => a.freq - b.freq)
    }

    const index: DictionaryIndex = { version: '2.0.0', entries }

    const json = JSON.stringify(index)
    writeFileSync(outputPath, json, 'utf-8')

    const readingCount = Object.keys(entries).length
    const sizeKB = (Buffer.byteLength(json) / 1024).toFixed(0)
    const sizeMB = (Buffer.byteLength(json) / (1024 * 1024)).toFixed(1)

    log('')
    log('=== Build complete ===')
    log(`  Entries: ${count} (skipped ${skipped})`)
    log(`  Unique readings: ${readingCount}`)
    log(`  Output: ${outputPath}`)
    log(`  Size: ${sizeKB} KB (${sizeMB} MB)`)

    // Sanity check — verify correct ordering for previously-broken words
    log('')
    log('Sanity check (first entry should be most common):')
    const checks = [
      'いま',       // 今 should be first, not 居間
      'しゅうまつ', // 週末 should be first, not 終末
      'せんせい',   // 先生 should be first, not 先制
      'きょう',     // 今日 should be first, not 京
      'にほんご',   // 日本語
      'たべる',     // 食べる
      'わかる',     // 分かる
      'とうきょう', // 東京
    ]
    for (const k of checks) {
      const e = entries[k]
      if (e) {
        log(`  ${k} → ${e.map((x) => `${x.surface}(${x.freq})`).join(', ')}`)
      } else {
        log(`  ${k} → NOT FOUND`)
      }
    }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

main().catch((err) => {
  console.error(`[build-dict] ERROR: ${err instanceof Error ? err.message : err}`)
  process.exit(1)
})
