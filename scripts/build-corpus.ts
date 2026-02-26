#!/usr/bin/env npx tsx
/**
 * build-corpus.ts — Download JMdict data and JLPT level mappings, then
 * generate the vocabulary.json corpus used by Linguist's curriculum engine.
 *
 * Usage:
 *   npx tsx scripts/build-corpus.ts
 *
 * Data sources:
 *   1. jmdict-simplified  — https://github.com/scriptin/jmdict-simplified/releases
 *      Provides JMdict entries in JSON with common/priority metadata.
 *   2. yomitan-jlpt-vocab — https://github.com/stephenmk/yomitan-jlpt-vocab
 *      Maps surface forms + readings to JLPT levels (N5–N1).
 *
 * Output:
 *   packages/core/src/curriculum/data/vocabulary.json
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// ─── Configuration ──────────────────────────────────────────────────────────

/** GitHub release tag pattern — we fetch the latest release dynamically. */
const JMDICT_RELEASES_API =
  "https://api.github.com/repos/scriptin/jmdict-simplified/releases/latest";

/** The yomitan-jlpt-vocab latest release API. */
const JLPT_RELEASES_API =
  "https://api.github.com/repos/stephenmk/yomitan-jlpt-vocab/releases/latest";

const OUTPUT_PATH = path.resolve(
  __dirname,
  "../packages/core/src/curriculum/data/vocabulary.json"
);

/** JLPT → CEFR mapping */
const JLPT_TO_CEFR: Record<string, string> = {
  N5: "A1",
  N4: "A2",
  N3: "B1",
  N2: "B2",
  N1: "C1",
};

/** JLPT level sort order (N5 first = lowest level) */
const JLPT_ORDER: Record<string, number> = {
  N5: 0,
  N4: 1,
  N3: 2,
  N2: 3,
  N1: 4,
};

/** How many assessment candidates to tag per JLPT level */
const ASSESSMENT_CANDIDATES_PER_LEVEL = 8;

// ─── JMdict-simplified types ────────────────────────────────────────────────

interface JMdictFile {
  version: string;
  languages: string[];
  commonOnly: boolean;
  dictDate: string;
  dictRevisions: string[];
  tags: Record<string, string>;
  words: JMdictWord[];
}

interface JMdictWord {
  id: string;
  kanji: JMdictKanji[];
  kana: JMdictKana[];
  sense: JMdictSense[];
}

interface JMdictKanji {
  common: boolean;
  text: string;
  tags: string[];
}

interface JMdictKana {
  common: boolean;
  text: string;
  tags: string[];
  appliesToKanji: string[];
}

interface JMdictSense {
  partOfSpeech: string[];
  appliesToKanji: string[];
  appliesToKana: string[];
  related: unknown[];
  antonym: unknown[];
  field: string[];
  dialect: string[];
  misc: string[];
  info: string[];
  languageSource: unknown[];
  gloss: JMdictGloss[];
}

interface JMdictGloss {
  lang: string;
  gender?: string;
  type?: string | null;
  text: string;
}

// ─── Output type ────────────────────────────────────────────────────────────

interface VocabularyItem {
  id: string;
  surfaceForm: string;
  reading: string;
  meaning: string;
  partOfSpeech: string;
  cefrLevel: string;
  jlptLevel: string;
  frequencyRank: number;
  tags: string[];
  assessmentCandidate: boolean;
}

// ─── JLPT data types ────────────────────────────────────────────────────────

/**
 * yomitan-jlpt-vocab stores data in term_meta_bank JSON files.
 * Each entry is a tuple:
 *   [headword: string, "freq", { reading?: string, frequency: { value: number, displayValue: string } }]
 *
 * The `displayValue` contains the JLPT level as a string like "N1", "N2", etc.
 * The `value` field is always -1 and should be ignored.
 */
type JlptMetaEntry = [
  headword: string,
  type: string,
  data:
    | number
    | {
        reading?: string;
        frequency: number | { value: number; displayValue?: string };
      }
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function log(msg: string): void {
  console.log(`[build-corpus] ${msg}`);
}

function logError(msg: string): void {
  console.error(`[build-corpus] ERROR: ${msg}`);
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "linguist-build-corpus/1.0",
    },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${url}: ${res.statusText}`);
  }
  return (await res.json()) as T;
}

async function downloadFile(url: string, dest: string): Promise<void> {
  const res = await fetch(url, {
    headers: { "User-Agent": "linguist-build-corpus/1.0" },
  });
  if (!res.ok) {
    throw new Error(
      `HTTP ${res.status} downloading ${url}: ${res.statusText}`
    );
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buffer);
}

/**
 * Frequency ranking is no longer available from jmdict-simplified v3.6.2+
 * (nf tags and priorities fields were removed).
 *
 * Instead, we assign frequency ranks after cross-referencing with JLPT data:
 * items are ranked sequentially within each level based on their order in JMdict
 * (which roughly correlates with frequency for common entries).
 */

/**
 * Map JMdict part-of-speech tags to simplified categories.
 * JMdict uses detailed tags like "v1" (ichidan verb), "vs" (suru verb),
 * "adj-i" (i-adjective), "n" (noun), etc.
 */
function simplifyPartOfSpeech(posTags: string[]): string {
  // Check in order of specificity
  for (const tag of posTags) {
    // Verbs
    if (
      tag.startsWith("v1") ||
      tag.startsWith("v5") ||
      tag.startsWith("vk") ||
      tag.startsWith("vs") ||
      tag === "vi" ||
      tag === "vt" ||
      tag.startsWith("v")
    ) {
      return "verb";
    }
  }
  for (const tag of posTags) {
    // i-adjectives
    if (tag === "adj-i" || tag === "adj-ix") {
      return "i-adjective";
    }
    // na-adjectives
    if (tag === "adj-na" || tag === "adj-no" || tag === "adj-t" || tag === "adj-f") {
      return "na-adjective";
    }
    // Other adjective types
    if (tag.startsWith("adj")) {
      return "adjective";
    }
  }
  for (const tag of posTags) {
    // Adverbs
    if (tag === "adv" || tag === "adv-to") {
      return "adverb";
    }
  }
  for (const tag of posTags) {
    // Nouns (checked after verbs since many suru-verbs are also nouns)
    if (tag === "n" || tag === "n-suf" || tag === "n-pref" || tag === "n-t" || tag === "n-adv") {
      return "noun";
    }
  }
  for (const tag of posTags) {
    // Expressions
    if (tag === "exp") {
      return "expression";
    }
    // Counters
    if (tag === "ctr") {
      return "counter";
    }
    // Pronouns
    if (tag === "pn") {
      return "pronoun";
    }
    // Conjunctions
    if (tag === "conj") {
      return "conjunction";
    }
    // Interjections
    if (tag === "int") {
      return "interjection";
    }
    // Particles
    if (tag === "prt") {
      return "particle";
    }
    // Prefixes
    if (tag === "pref") {
      return "prefix";
    }
    // Suffixes
    if (tag === "suf") {
      return "suffix";
    }
  }

  return "other";
}

/**
 * Extract the first English gloss from a word's senses, combining the primary
 * sense meanings into a concise definition.
 */
function extractMeaning(senses: JMdictSense[]): string {
  const glosses: string[] = [];
  // Take glosses from the first 2 senses max, to keep meanings concise
  for (const sense of senses.slice(0, 2)) {
    const engGlosses = sense.gloss.filter(
      (g) => g.lang === "eng" || !g.lang
    );
    for (const g of engGlosses.slice(0, 2)) {
      if (g.text && !glosses.includes(g.text)) {
        glosses.push(g.text);
      }
    }
    if (glosses.length >= 3) break;
  }
  return glosses.join("; ") || "unknown";
}

// ─── JLPT data loading ─────────────────────────────────────────────────────

/**
 * Download and parse JLPT level data from yomitan-jlpt-vocab.
 *
 * Returns a Map from "surfaceForm|reading" to JLPT level string ("N5", "N4", etc.).
 * Also returns a Map from surfaceForm alone for fallback matching.
 */
async function loadJlptData(
  tmpDir: string
): Promise<{
  byFormAndReading: Map<string, string>;
  byForm: Map<string, string>;
}> {
  log("Fetching yomitan-jlpt-vocab release info...");

  let zipUrl: string;
  try {
    const releaseInfo = await fetchJson<{
      assets: Array<{ name: string; browser_download_url: string }>;
    }>(JLPT_RELEASES_API);

    const jlptAsset = releaseInfo.assets.find(
      (a) => a.name.endsWith(".zip") && a.name.toLowerCase().includes("jlpt")
    );

    if (!jlptAsset) {
      // Fallback: try first zip asset
      const anyZip = releaseInfo.assets.find((a) => a.name.endsWith(".zip"));
      if (!anyZip) {
        throw new Error(
          "No .zip asset found in yomitan-jlpt-vocab release. " +
            `Available assets: ${releaseInfo.assets.map((a) => a.name).join(", ")}`
        );
      }
      zipUrl = anyZip.browser_download_url;
      log(`Using asset: ${anyZip.name}`);
    } else {
      zipUrl = jlptAsset.browser_download_url;
      log(`Using asset: ${jlptAsset.name}`);
    }
  } catch (err) {
    logError(
      `Failed to fetch JLPT release info: ${err instanceof Error ? err.message : err}`
    );
    throw err;
  }

  const zipPath = path.join(tmpDir, "jlpt-vocab.zip");
  log(`Downloading JLPT data to ${zipPath}...`);
  await downloadFile(zipUrl, zipPath);
  log(`Downloaded JLPT zip (${(fs.statSync(zipPath).size / 1024).toFixed(0)} KB)`);

  // Extract the zip using the unzip command
  const extractDir = path.join(tmpDir, "jlpt-vocab");
  fs.mkdirSync(extractDir, { recursive: true });

  const { execSync } = await import("node:child_process");
  try {
    execSync(`unzip -o "${zipPath}" -d "${extractDir}"`, { stdio: "pipe" });
  } catch {
    logError("Failed to unzip JLPT data. Make sure 'unzip' is available on your system.");
    throw new Error("unzip command failed");
  }

  // Find all term_meta_bank*.json files
  const files = fs.readdirSync(extractDir).filter(
    (f) => f.startsWith("term_meta_bank") && f.endsWith(".json")
  );

  if (files.length === 0) {
    logError(
      `No term_meta_bank*.json files found in JLPT zip. Contents: ${fs
        .readdirSync(extractDir)
        .join(", ")}`
    );
    throw new Error("No term_meta_bank files found in JLPT data");
  }

  log(`Found ${files.length} term_meta_bank file(s) in JLPT data`);

  const byFormAndReading = new Map<string, string>();
  const byForm = new Map<string, string>();

  for (const file of files) {
    const filePath = path.join(extractDir, file);
    const entries: JlptMetaEntry[] = JSON.parse(
      fs.readFileSync(filePath, "utf-8")
    );

    for (const entry of entries) {
      const [headword, type, data] = entry;
      if (type !== "freq") continue;

      let jlptLevel: string | undefined;
      let reading: string | undefined;

      if (typeof data === "number") {
        // Numeric format: 5 → N5, 4 → N4, etc.
        if (data >= 1 && data <= 5) {
          jlptLevel = `N${data}`;
        } else {
          continue;
        }
      } else if (typeof data === "object" && data !== null) {
        reading = data.reading;
        if (typeof data.frequency === "number") {
          if (data.frequency >= 1 && data.frequency <= 5) {
            jlptLevel = `N${data.frequency}`;
          } else {
            continue;
          }
        } else if (
          typeof data.frequency === "object" &&
          data.frequency !== null
        ) {
          // The actual format: { value: -1, displayValue: "N1" }
          // Extract JLPT level from displayValue
          const display = data.frequency.displayValue;
          if (display && /^N[1-5]$/.test(display)) {
            jlptLevel = display;
          } else if (data.frequency.value >= 1 && data.frequency.value <= 5) {
            jlptLevel = `N${data.frequency.value}`;
          } else {
            continue;
          }
        } else {
          continue;
        }
      } else {
        continue;
      }

      if (!jlptLevel) continue;

      if (reading) {
        const key = `${headword}|${reading}`;
        // Keep the lowest (easiest) JLPT level if duplicates
        const existing = byFormAndReading.get(key);
        if (
          !existing ||
          JLPT_ORDER[jlptLevel] < JLPT_ORDER[existing]
        ) {
          byFormAndReading.set(key, jlptLevel);
        }
      }

      // Also store by form alone for fallback
      const existingForm = byForm.get(headword);
      if (
        !existingForm ||
        JLPT_ORDER[jlptLevel] < JLPT_ORDER[existingForm]
      ) {
        byForm.set(headword, jlptLevel);
      }
    }
  }

  log(
    `Loaded JLPT data: ${byFormAndReading.size} form+reading pairs, ${byForm.size} unique forms`
  );
  return { byFormAndReading, byForm };
}

// ─── JMdict loading ─────────────────────────────────────────────────────────

async function loadJMdict(tmpDir: string): Promise<JMdictFile> {
  log("Fetching jmdict-simplified release info...");

  let downloadUrl: string;
  let assetName: string;
  try {
    const releaseInfo = await fetchJson<{
      assets: Array<{ name: string; browser_download_url: string }>;
      tag_name: string;
    }>(JMDICT_RELEASES_API);

    log(`Latest release: ${releaseInfo.tag_name}`);

    // Look for the jmdict-eng-common JSON file (might be .json or in a .tgz/.zip)
    const jsonAsset = releaseInfo.assets.find(
      (a) =>
        a.name.includes("jmdict-eng-common") && a.name.endsWith(".json")
    );
    const tgzAsset = releaseInfo.assets.find(
      (a) =>
        a.name.includes("jmdict-eng-common") && a.name.endsWith(".tgz")
    );
    const zipAsset = releaseInfo.assets.find(
      (a) =>
        a.name.includes("jmdict-eng-common") && a.name.endsWith(".zip")
    );

    if (jsonAsset) {
      downloadUrl = jsonAsset.browser_download_url;
      assetName = jsonAsset.name;
    } else if (zipAsset) {
      downloadUrl = zipAsset.browser_download_url;
      assetName = zipAsset.name;
    } else if (tgzAsset) {
      downloadUrl = tgzAsset.browser_download_url;
      assetName = tgzAsset.name;
    } else {
      logError(
        `Could not find jmdict-eng-common asset. Available: ${releaseInfo.assets
          .map((a) => a.name)
          .join(", ")}`
      );
      throw new Error("jmdict-eng-common asset not found in release");
    }
  } catch (err) {
    logError(
      `Failed to fetch JMdict release info: ${err instanceof Error ? err.message : err}`
    );
    throw err;
  }

  const downloadPath = path.join(tmpDir, assetName);
  log(`Downloading ${assetName}...`);
  await downloadFile(downloadUrl, downloadPath);
  log(
    `Downloaded JMdict (${(fs.statSync(downloadPath).size / (1024 * 1024)).toFixed(1)} MB)`
  );

  let jsonPath: string;

  if (assetName.endsWith(".json")) {
    jsonPath = downloadPath;
  } else if (assetName.endsWith(".zip")) {
    const extractDir = path.join(tmpDir, "jmdict-extracted");
    fs.mkdirSync(extractDir, { recursive: true });
    const { execSync } = await import("node:child_process");
    execSync(`unzip -o "${downloadPath}" -d "${extractDir}"`, {
      stdio: "pipe",
    });
    const jsonFiles = fs
      .readdirSync(extractDir)
      .filter((f) => f.endsWith(".json"));
    if (jsonFiles.length === 0) {
      throw new Error("No .json file found inside JMdict zip");
    }
    jsonPath = path.join(extractDir, jsonFiles[0]);
  } else if (assetName.endsWith(".tgz") || assetName.endsWith(".tar.gz")) {
    const extractDir = path.join(tmpDir, "jmdict-extracted");
    fs.mkdirSync(extractDir, { recursive: true });
    const { execSync } = await import("node:child_process");
    execSync(`tar -xzf "${downloadPath}" -C "${extractDir}"`, {
      stdio: "pipe",
    });
    // Find the JSON file recursively
    const findJson = (dir: string): string | null => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          const found = findJson(path.join(dir, entry.name));
          if (found) return found;
        } else if (entry.name.endsWith(".json")) {
          return path.join(dir, entry.name);
        }
      }
      return null;
    };
    const found = findJson(extractDir);
    if (!found) {
      throw new Error("No .json file found inside JMdict tgz");
    }
    jsonPath = found;
  } else {
    throw new Error(`Unsupported file format: ${assetName}`);
  }

  log("Parsing JMdict JSON...");
  const raw = fs.readFileSync(jsonPath, "utf-8");
  const data: JMdictFile = JSON.parse(raw);
  log(`Parsed ${data.words.length} JMdict entries`);
  return data;
}

// ─── Main build pipeline ────────────────────────────────────────────────────

async function main() {
  log("=== Linguist Vocabulary Corpus Builder ===");
  log("");

  // Create temp directory for downloads
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "linguist-corpus-"));
  log(`Working directory: ${tmpDir}`);

  try {
    // Step 1: Download JLPT data and JMdict in parallel
    log("");
    log("Step 1: Downloading source data...");

    const [jlptData, jmdict] = await Promise.all([
      loadJlptData(tmpDir),
      loadJMdict(tmpDir),
    ]);

    // Diagnostic: inspect the structure of the first few JMdict entries
    if (jmdict.words.length > 0) {
      const sample = jmdict.words[0];
      const kanjiFields = sample.kanji[0] ? Object.keys(sample.kanji[0]) : [];
      const kanaFields = sample.kana[0] ? Object.keys(sample.kana[0]) : [];
      log(`JMdict sample entry fields — kanji: [${kanjiFields.join(", ")}], kana: [${kanaFields.join(", ")}]`);
      log(`Note: jmdict-simplified v3.6+ no longer includes nf frequency tags.`);
      log(`Frequency ranks will be assigned sequentially within each JLPT level.`);
    }

    // Step 2: Cross-reference JMdict entries against JLPT levels
    log("");
    log("Step 2: Cross-referencing JMdict entries with JLPT levels...");

    const items: VocabularyItem[] = [];
    let matchedByFormReading = 0;
    let matchedByFormOnly = 0;
    let skippedNoJlpt = 0;
    let skippedNoCommon = 0;

    for (const word of jmdict.words) {
      // Get the best surface form (prefer common kanji, fall back to kana)
      let surfaceForm: string;
      let reading: string;

      const commonKanji = word.kanji.find((k) => k.common);
      const firstKanji = word.kanji[0];
      const commonKana = word.kana.find((k) => k.common);
      const firstKana = word.kana[0];

      if (!firstKana) continue; // Every word should have at least one kana

      if (commonKanji) {
        surfaceForm = commonKanji.text;
        reading = (commonKana || firstKana).text;
      } else if (firstKanji) {
        surfaceForm = firstKanji.text;
        reading = (commonKana || firstKana).text;
      } else {
        // Kana-only word
        surfaceForm = (commonKana || firstKana).text;
        reading = surfaceForm;
      }

      // Check if the word is common (at least one common kanji or kana form)
      const isCommon =
        word.kanji.some((k) => k.common) ||
        word.kana.some((k) => k.common);

      if (!isCommon) {
        skippedNoCommon++;
        continue;
      }

      // Look up JLPT level
      let jlptLevel: string | undefined;

      // Try form+reading match first (most precise)
      const formReadingKey = `${surfaceForm}|${reading}`;
      jlptLevel = jlptData.byFormAndReading.get(formReadingKey);
      if (jlptLevel) {
        matchedByFormReading++;
      } else {
        // Try surface form only
        jlptLevel = jlptData.byForm.get(surfaceForm);
        if (jlptLevel) {
          matchedByFormOnly++;
        } else {
          // Try reading as surface form (for kana-only words matched differently)
          if (reading !== surfaceForm) {
            jlptLevel = jlptData.byForm.get(reading);
          }
          if (jlptLevel) {
            matchedByFormOnly++;
          } else {
            skippedNoJlpt++;
            continue;
          }
        }
      }

      // Get part of speech from the first sense
      const allPos = word.sense.flatMap((s) => s.partOfSpeech);
      const partOfSpeech = simplifyPartOfSpeech(allPos);

      // Extract meaning
      const meaning = extractMeaning(word.sense);

      items.push({
        id: `jmdict-${word.id}`,
        surfaceForm,
        reading,
        meaning,
        partOfSpeech,
        cefrLevel: JLPT_TO_CEFR[jlptLevel] || "A1",
        jlptLevel,
        frequencyRank: 0, // Will be assigned sequentially in step 3
        tags: [],
        assessmentCandidate: false, // Will be set in step 4
      });
    }

    log(`Matched ${matchedByFormReading} by form+reading, ${matchedByFormOnly} by form only`);
    log(`Skipped: ${skippedNoJlpt} no JLPT level, ${skippedNoCommon} not common`);
    log(`Total items before filtering: ${items.length}`);

    // Step 3: Sort, assign frequency ranks, and filter
    log("");
    log("Step 3: Sorting, ranking, and filtering...");

    // Sort by JLPT level (N5 first), then by JMdict entry order within each level
    // (JMdict ordering roughly correlates with frequency for common entries)
    items.sort((a, b) => {
      const levelDiff = JLPT_ORDER[a.jlptLevel] - JLPT_ORDER[b.jlptLevel];
      return levelDiff;
    });

    // Assign sequential frequency ranks within each JLPT level
    let currentLevel = "";
    let rankWithinLevel = 0;
    for (const item of items) {
      if (item.jlptLevel !== currentLevel) {
        currentLevel = item.jlptLevel;
        rankWithinLevel = 0;
      }
      rankWithinLevel++;
      item.frequencyRank = rankWithinLevel;
    }

    // Include all JLPT-matched items (N5–N1)
    const filtered = [...items];
    const countsByLevel: Record<string, number> = {};
    for (const item of filtered) {
      countsByLevel[item.jlptLevel] = (countsByLevel[item.jlptLevel] || 0) + 1;
    }

    log("Items by JLPT level:");
    for (const level of ["N5", "N4", "N3", "N2", "N1"]) {
      log(`  ${level}: ${countsByLevel[level] || 0}`);
    }
    log(`Total after filtering: ${filtered.length}`);

    // Step 4: Tag assessment candidates
    log("");
    log("Step 4: Tagging assessment candidates...");

    // For each level, pick the top N highest-frequency items with diverse
    // parts of speech as assessment candidates
    for (const level of ["N5", "N4", "N3", "N2", "N1"]) {
      const levelItems = filtered.filter((i) => i.jlptLevel === level);

      // Sort by frequency (most common first — they're already sorted, but be explicit)
      levelItems.sort((a, b) => a.frequencyRank - b.frequencyRank);

      // Try to pick diverse parts of speech
      const selected = new Set<number>();
      const seenPos = new Set<string>();

      // First pass: pick one of each POS from the top items
      for (let i = 0; i < levelItems.length && selected.size < ASSESSMENT_CANDIDATES_PER_LEVEL; i++) {
        const item = levelItems[i];
        if (!seenPos.has(item.partOfSpeech)) {
          seenPos.add(item.partOfSpeech);
          const idx = filtered.indexOf(item);
          if (idx >= 0) selected.add(idx);
        }
      }

      // Second pass: fill remaining slots with highest-frequency items
      for (let i = 0; i < levelItems.length && selected.size < ASSESSMENT_CANDIDATES_PER_LEVEL; i++) {
        const idx = filtered.indexOf(levelItems[i]);
        if (idx >= 0) selected.add(idx);
      }

      for (const idx of selected) {
        filtered[idx].assessmentCandidate = true;
      }

      log(`  ${level}: ${selected.size} assessment candidates tagged`);
    }

    // Step 5: Deduplicate by surface form (keep the one with better frequency)
    log("");
    log("Step 5: Deduplicating...");

    const seen = new Map<string, number>();
    const deduplicated: VocabularyItem[] = [];

    for (const item of filtered) {
      const key = `${item.surfaceForm}|${item.reading}`;
      if (seen.has(key)) {
        // Keep the one with better (lower) frequency rank
        const existingIdx = seen.get(key)!;
        if (item.frequencyRank < deduplicated[existingIdx].frequencyRank) {
          deduplicated[existingIdx] = item;
        }
      } else {
        seen.set(key, deduplicated.length);
        deduplicated.push(item);
      }
    }

    log(`Removed ${filtered.length - deduplicated.length} duplicates`);
    log(`Final corpus size: ${deduplicated.length} items`);

    // Step 6: Write output
    log("");
    log("Step 6: Writing output...");

    // Ensure output directory exists
    const outputDir = path.dirname(OUTPUT_PATH);
    fs.mkdirSync(outputDir, { recursive: true });

    const output = JSON.stringify(deduplicated, null, 2);
    fs.writeFileSync(OUTPUT_PATH, output, "utf-8");

    const fileSizeKB = (Buffer.byteLength(output) / 1024).toFixed(0);
    log(`Wrote ${OUTPUT_PATH} (${fileSizeKB} KB)`);

    // Summary
    log("");
    log("=== Build complete ===");
    log(`  Total items: ${deduplicated.length}`);
    log(
      `  Assessment candidates: ${deduplicated.filter((i) => i.assessmentCandidate).length}`
    );
    log(`  File size: ${fileSizeKB} KB`);
    log("");
    log("Level distribution:");
    for (const level of ["N5", "N4", "N3", "N2", "N1"]) {
      const count = deduplicated.filter((i) => i.jlptLevel === level).length;
      const cefr = JLPT_TO_CEFR[level];
      log(`  ${level} (${cefr}): ${count} items`);
    }
  } finally {
    // Clean up temp directory
    log("");
    log("Cleaning up temporary files...");
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ─── Entry point ────────────────────────────────────────────────────────────

main().catch((err) => {
  logError(err instanceof Error ? err.message : String(err));
  console.error("");
  console.error("Usage: npx tsx scripts/build-corpus.ts");
  console.error("");
  console.error("This script downloads JMdict and JLPT data from GitHub,");
  console.error("cross-references them, and generates vocabulary.json for");
  console.error("the Linguist curriculum engine.");
  console.error("");
  console.error("Requirements:");
  console.error("  - Node.js 18+ (for native fetch)");
  console.error("  - unzip command available on PATH");
  console.error("  - Internet connection to download data from GitHub");
  process.exit(1);
});
