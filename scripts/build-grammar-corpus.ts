#!/usr/bin/env npx tsx
/**
 * build-grammar-corpus.ts — Generate a comprehensive JLPT grammar corpus
 * using jlptsensei.com grammar lists (from PDFs) as the authoritative source,
 * then calling the Claude API to generate structured JSON (patternId,
 * description, prerequisites) for each pattern.
 *
 * Usage:
 *   npx tsx scripts/build-grammar-corpus.ts [--cache] [--level N5]
 *
 * Options:
 *   --cache    Cache per-level results in .cache/grammar-corpus/ for incremental rebuilds
 *   --level    Only regenerate a specific level (e.g. --level N3)
 *
 * Requires:
 *   - ANTHROPIC_API_KEY environment variable
 *   - pdftotext (from poppler) on PATH
 *   - PDF files in ~/Downloads/ from jlptsensei.com:
 *       "JLPT N5 Grammar List V2.pdf"
 *       "JLPT N4 Grammar List.pdf"
 *       "N3 Grammar List PDF.pdf"
 *       "JLPT N2 Grammar List.pdf"
 *       "JLPT N1 Grammar List.pdf"
 *
 * Output:
 *   packages/core/src/curriculum/data/grammar.json
 */

import Anthropic from "@anthropic-ai/sdk";
import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";

// ─── Configuration ──────────────────────────────────────────────────────────

const MODEL = "claude-sonnet-4-20250514";
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 2000;

const OUTPUT_PATH = path.resolve(
  __dirname,
  "../packages/core/src/curriculum/data/grammar.json"
);

const CACHE_DIR = path.resolve(__dirname, "../.cache/grammar-corpus");

const JLPT_TO_CEFR: Record<string, string> = {
  N5: "A1",
  N4: "A2",
  N3: "B1",
  N2: "B2",
  N1: "C1",
};

const LEVELS = ["N5", "N4", "N3", "N2", "N1"] as const;

/** PDF file paths — jlptsensei grammar lists */
const PDF_PATHS: Record<string, string> = {
  N5: path.join(
    process.env.HOME || "~",
    "Downloads/JLPT N5 Grammar List V2.pdf"
  ),
  N4: path.join(process.env.HOME || "~", "Downloads/JLPT N4 Grammar List.pdf"),
  N3: path.join(process.env.HOME || "~", "Downloads/N3 Grammar List PDF.pdf"),
  N2: path.join(process.env.HOME || "~", "Downloads/JLPT N2 Grammar List.pdf"),
  N1: path.join(process.env.HOME || "~", "Downloads/JLPT N1 Grammar List.pdf"),
};

/** How many assessment candidates per level (scaled to jlptsensei counts) */
const ASSESSMENT_CANDIDATES: Record<string, number> = {
  N5: 10,
  N4: 15,
  N3: 20,
  N2: 20,
  N1: 25,
};

/** Existing patternIds that must be preserved */
const EXISTING_IDS: Record<string, string[]> = {
  N5: [
    "n5_desu",
    "n5_masu",
    "n5_particle_wa",
    "n5_particle_ga",
    "n5_particle_wo",
    "n5_particle_ni",
    "n5_te_form",
    "n5_nai_form",
    "n5_past_ta",
    "n5_adjective_i",
  ],
  N4: [
    "n4_te_iru",
    "n4_tai",
    "n4_te_kudasai",
    "n4_potential",
    "n4_conditional_ba",
    "n4_conditional_tara",
    "n4_passive",
    "n4_causative",
    "n4_te_shimau",
    "n4_noni",
  ],
  N3: [
    "n3_you_ni_naru",
    "n3_you_ni_suru",
    "n3_te_oku",
    "n3_baai",
    "n3_tame_ni",
    "n3_to_iu",
    "n3_rashii",
    "n3_you_da",
    "n3_nagara",
    "n3_causative_passive",
  ],
  N2: [
    "n2_toshite",
    "n2_ni_totte",
    "n2_ni_oite",
    "n2_ni_taisuru",
    "n2_tsutsumu",
    "n2_ni_kagirazu",
    "n2_koto_wa_nai",
    "n2_mono_da",
    "n2_wake_da",
    "n2_zaru_wo_enai",
  ],
  N1: [
    "n1_ni_hoka_naranai",
    "n1_wo_motte",
    "n1_ni_kakawaru",
    "n1_towa_ie",
    "n1_made_mo_nai",
    "n1_taru",
    "n1_wo_yogi_nakusareru",
    "n1_koso_are",
    "n1_ni_taeru",
    "n1_izure_ni_seyo",
  ],
};

// ─── Output type ────────────────────────────────────────────────────────────

interface GrammarItem {
  patternId: string;
  name: string;
  description: string;
  cefrLevel: string;
  jlptLevel: string;
  frequencyRank: number;
  prerequisiteIds: string[];
  assessmentCandidate: boolean;
}

interface SourcePattern {
  japanese: string;
  meaning: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function log(msg: string): void {
  console.log(`[build-grammar] ${msg}`);
}

function logError(msg: string): void {
  console.error(`[build-grammar] ERROR: ${msg}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs(): { useCache: boolean; singleLevel: string | null } {
  const args = process.argv.slice(2);
  let useCache = false;
  let singleLevel: string | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--cache") {
      useCache = true;
    } else if (args[i] === "--level" && i + 1 < args.length) {
      singleLevel = args[i + 1].toUpperCase();
      i++;
    }
  }

  return { useCache, singleLevel };
}

// ─── PDF Parsing ────────────────────────────────────────────────────────────

function extractTextFromPdf(pdfPath: string): string {
  try {
    return execSync(`pdftotext "${pdfPath}" -`, { encoding: "utf-8" });
  } catch {
    throw new Error(
      `Failed to extract text from ${pdfPath}. Ensure pdftotext (poppler) is installed: brew install poppler`
    );
  }
}

function parsePdfText(text: string, level: string): SourcePattern[] {
  const patterns: SourcePattern[] = [];

  // Clean up lines: remove headers/footers/noise
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .filter((l) => !l.startsWith("JLPT SENSEI"))
    .filter((l) => !l.startsWith("See full grammar"))
    .filter((l) => !l.startsWith("Copyright"))
    .filter((l) => !l.startsWith("Study more"))
    .filter((l) => !l.startsWith("\u25cf ")) // bullet points
    .filter((l) => !l.startsWith("*NOTE*"))
    .filter((l) => !l.match(/^JLPT N\d Grammar List/))
    .filter((l) => !l.match(/^JLPTsensei\.com/))
    .filter((l) => !l.match(/^#$/))
    .filter((l) => !l.match(/^Grammar$/))
    .filter((l) => !l.match(/^(\u3076\u3093\u307d\u3046|\u6587\u6cd5)$/)) // ぶんぽう or 文法
    .filter((l) => !l.match(/^Meaning$/))
    .filter((l) => !l.match(/^Check$/));

  if (level === "N1") {
    // N1 format: number on its own line, then Japanese, then meaning
    // But some entries combine "number name" on one line
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      const numMatch = line.match(/^(\d+)$/);
      const combinedMatch = line.match(/^(\d+)\s+(.+)$/);

      if (numMatch) {
        const num = parseInt(numMatch[1]);
        i++;
        if (i < lines.length) {
          const japanese = lines[i];
          i++;
          if (i < lines.length) {
            const meaning = lines[i];
            i++;
            // Skip stray parenthetical continuation lines
            while (i < lines.length && lines[i].match(/^\uFF08.*\uFF09$/)) {
              i++;
            }
            if (num > 0 && japanese && meaning) {
              patterns.push({ japanese, meaning });
            }
          }
        }
      } else if (combinedMatch) {
        const japanese = combinedMatch[2];
        i++;
        if (i < lines.length) {
          const meaning = lines[i];
          i++;
          while (i < lines.length && lines[i].match(/^\u FF08.*\uFF09$/)) {
            i++;
          }
          if (japanese && meaning) {
            patterns.push({ japanese, meaning });
          }
        }
      } else {
        i++;
      }
    }
  } else {
    // N5-N2 format: number, japanese, romaji, meaning (4 lines per entry)
    let i = 0;
    while (i < lines.length) {
      const numMatch = lines[i].match(/^(\d+)$/);
      if (numMatch && i + 3 < lines.length) {
        const japanese = lines[i + 1];
        const romaji = lines[i + 2];
        const meaning = lines[i + 3];

        // Validate: romaji should be ASCII-ish
        const isRomaji =
          /^[a-zA-Z\s\-~\/\[\]\.;,?!'0-9&\uFF08\uFF09()+]+$/.test(romaji) ||
          /^[a-z]/.test(romaji);

        if (isRomaji) {
          patterns.push({ japanese, meaning });
          i += 4;
          continue;
        }
      }
      i++;
    }
  }

  return patterns;
}

function loadPatternsFromPdfs(): Record<string, SourcePattern[]> {
  const result: Record<string, SourcePattern[]> = {};

  for (const level of LEVELS) {
    const pdfPath = PDF_PATHS[level];
    if (!fs.existsSync(pdfPath)) {
      throw new Error(`PDF not found: ${pdfPath}`);
    }

    log(`Parsing ${level} PDF: ${path.basename(pdfPath)}`);
    const text = extractTextFromPdf(pdfPath);
    const patterns = parsePdfText(text, level);
    result[level] = patterns;
    log(`  ${level}: ${patterns.length} patterns parsed`);
  }

  return result;
}

// ─── Claude API ─────────────────────────────────────────────────────────────

async function callClaude(
  client: Anthropic,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 8192
): Promise<string> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: maxTokens,
        temperature: 0,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      });

      const textBlock = response.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new Error("No text block in response");
      }

      if (response.stop_reason === "max_tokens") {
        log(
          `  Warning: Response truncated (attempt ${attempt}), retrying with more tokens...`
        );
        if (attempt < MAX_RETRIES) {
          maxTokens = Math.min(maxTokens * 2, 16384);
          continue;
        }
        throw new Error("Response truncated after all retries");
      }

      return textBlock.text;
    } catch (err: unknown) {
      const isRateLimit =
        err instanceof Error &&
        (err.message.includes("rate_limit") ||
          err.message.includes("429") ||
          err.message.includes("overloaded"));

      if (attempt < MAX_RETRIES) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
        if (isRateLimit) {
          log(
            `  Rate limited, waiting ${delay / 1000}s before retry ${attempt + 1}...`
          );
        } else {
          log(
            `  API error (attempt ${attempt}): ${err instanceof Error ? err.message : err}. Retrying in ${delay / 1000}s...`
          );
        }
        await sleep(delay);
        continue;
      }

      throw err;
    }
  }

  throw new Error("Exhausted all retries");
}

function extractJson(text: string): string {
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) return fenceMatch[1].trim();
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (arrayMatch) return arrayMatch[0];
  return text.trim();
}

// ─── Detail Generation ──────────────────────────────────────────────────────

const BATCH_SIZE = 40;

function buildDetailPrompt(
  level: string,
  patterns: SourcePattern[],
  existingIds: string[],
  priorLevelIds: string[],
  sameLevelPriorIds: string[],
  batchIndex: number,
  totalBatches: number
): { system: string; user: string } {
  const levelNum = level.replace("N", "");
  const cefrLevel = JLPT_TO_CEFR[level];
  const totalAssessment = ASSESSMENT_CANDIDATES[level];
  const assessPerBatch = Math.ceil(totalAssessment / totalBatches);

  const allValidPrereqIds = [...priorLevelIds, ...sameLevelPriorIds];

  // Determine which existing IDs correspond to patterns in this batch
  const existingIdsForBatch = existingIds.filter((id) =>
    id.startsWith(`n${levelNum}_`)
  );

  const system = `You are a Japanese linguistics expert producing structured data for a language learning app.

Generate a JSON array for the JLPT ${level} grammar patterns listed below. Each entry in the array must correspond EXACTLY to one pattern in the input list, in the SAME ORDER. Do not skip, merge, or reorder entries.

FIELD RULES:
1. patternId: format n${levelNum}_descriptive_name (lowercase a-z0-9_ only). Must be unique.
2. name: The Japanese grammar pattern form from the input. Must contain Japanese characters.
3. description: Clear English explanation (>10 characters) of what the pattern means and when it's used.
4. cefrLevel: "${cefrLevel}"
5. jlptLevel: "${level}"
6. prerequisiteIds: 0–3 IDs from LOWER or SAME level. ONLY use IDs from this list:
${allValidPrereqIds.length > 0 ? allValidPrereqIds.map((id) => `   ${id}`).join("\n") : "   (none — first level, use empty array)"}
7. assessmentCandidate: Mark ~${assessPerBatch} items true in this batch. Pick the most representative, testable patterns.

PREREQUISITE GUIDELINES:
- て-form derivatives → prereq n5_te_form (if it exists in valid list)
- ない-form derivatives → prereq n5_nai_form
- Passive derivatives → prereq n4_passive
- Conditional derivatives → reference the base conditional
- Foundational patterns with no true prerequisite → empty array
- ONLY use IDs from the valid list. Do NOT invent IDs.

EXISTING IDS TO PRESERVE (use these exact IDs for the matching patterns):
${existingIdsForBatch.map((id) => `- ${id}`).join("\n") || "(none in this batch)"}`;

  const patternList = patterns
    .map((p, i) => `${i + 1}. ${p.japanese} — ${p.meaning}`)
    .join("\n");

  const user = `Generate JSON for these ${patterns.length} ${level} grammar patterns (batch ${batchIndex + 1}/${totalBatches}):

${patternList}

Output ONLY a valid JSON array with exactly ${patterns.length} objects. No commentary.`;

  return { system, user };
}

async function generateDetailBatch(
  client: Anthropic,
  level: string,
  patterns: SourcePattern[],
  existingIds: string[],
  priorLevelIds: string[],
  sameLevelPriorIds: string[],
  batchIndex: number,
  totalBatches: number
): Promise<GrammarItem[]> {
  const { system, user } = buildDetailPrompt(
    level,
    patterns,
    existingIds,
    priorLevelIds,
    sameLevelPriorIds,
    batchIndex,
    totalBatches
  );

  log(
    `  Generating details for ${level} batch ${batchIndex + 1}/${totalBatches} (${patterns.length} items)...`
  );
  const response = await callClaude(client, system, user, 16384);

  const jsonStr = extractJson(response);
  let items: GrammarItem[];
  try {
    items = JSON.parse(jsonStr);
  } catch (err) {
    logError(`Failed to parse JSON for ${level} batch ${batchIndex + 1}`);
    logError(`Raw response (first 500 chars): ${response.substring(0, 500)}`);
    throw new Error(
      `JSON parse error for ${level} batch ${batchIndex + 1}: ${err}`
    );
  }

  if (!Array.isArray(items)) {
    throw new Error(
      `Expected array for ${level} batch ${batchIndex + 1}, got ${typeof items}`
    );
  }

  log(`  Got ${items.length} items for ${level} batch ${batchIndex + 1}`);
  return items;
}

// ─── Per-Level Pipeline ─────────────────────────────────────────────────────

async function generateLevel(
  client: Anthropic,
  level: string,
  sourcePatterns: SourcePattern[],
  priorLevelIds: string[],
  useCache: boolean
): Promise<GrammarItem[]> {
  const cacheFile = path.join(CACHE_DIR, `${level}.json`);

  if (useCache && fs.existsSync(cacheFile)) {
    log(`  Loading ${level} from cache...`);
    const cached = JSON.parse(
      fs.readFileSync(cacheFile, "utf-8")
    ) as GrammarItem[];
    log(`  Loaded ${cached.length} cached items for ${level}`);
    return cached;
  }

  const existingIds = EXISTING_IDS[level] || [];
  const totalBatches = Math.ceil(sourcePatterns.length / BATCH_SIZE);
  const allItems: GrammarItem[] = [];
  const sameLevelPriorIds: string[] = [];

  for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
    const batchStart = batchIdx * BATCH_SIZE;
    const batchEnd = Math.min(batchStart + BATCH_SIZE, sourcePatterns.length);
    const batchPatterns = sourcePatterns.slice(batchStart, batchEnd);

    const batchItems = await generateDetailBatch(
      client,
      level,
      batchPatterns,
      existingIds,
      priorLevelIds,
      sameLevelPriorIds,
      batchIdx,
      totalBatches
    );

    for (const item of batchItems) {
      if (item.patternId) {
        sameLevelPriorIds.push(item.patternId);
      }
    }

    allItems.push(...batchItems);

    if (batchIdx < totalBatches - 1) {
      await sleep(1000);
    }
  }

  // Assign frequency ranks sequentially
  const cefrLevel = JLPT_TO_CEFR[level];
  for (let i = 0; i < allItems.length; i++) {
    allItems[i].frequencyRank = i + 1;
    allItems[i].cefrLevel = cefrLevel;
    allItems[i].jlptLevel = level;
  }

  // Per-level validation
  validateLevel(level, allItems, existingIds);

  if (useCache) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(cacheFile, JSON.stringify(allItems, null, 2));
    log(`  Cached ${level} results to ${cacheFile}`);
  }

  return allItems;
}

// ─── Validation ─────────────────────────────────────────────────────────────

function validateLevel(
  level: string,
  items: GrammarItem[],
  existingIds: string[]
): void {
  const levelNum = level.replace("N", "");
  const errors: string[] = [];

  const itemIds = new Set(items.map((i) => i.patternId));
  for (const id of existingIds) {
    if (!itemIds.has(id)) {
      errors.push(`Missing existing ID: ${id}`);
    }
  }

  for (const item of items) {
    if (!item.patternId.match(new RegExp(`^n${levelNum}_[a-z0-9_]+$`))) {
      errors.push(`Invalid patternId format: ${item.patternId}`);
    }
  }

  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.patternId)) {
      errors.push(`Duplicate patternId: ${item.patternId}`);
    }
    seen.add(item.patternId);
  }

  for (const item of items) {
    if (!item.description || item.description.length <= 10) {
      errors.push(
        `Description too short for ${item.patternId}: "${item.description}"`
      );
    }
  }

  const japaneseRegex =
    /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\u3000-\u303F\u3005\u301C\uFF5E\u2026\u30FB\u300C\u300D\u3001\u3002〜～]/;
  for (const item of items) {
    if (!japaneseRegex.test(item.name)) {
      errors.push(
        `Name missing Japanese characters: ${item.patternId} -> "${item.name}"`
      );
    }
  }

  const assessCount = items.filter((i) => i.assessmentCandidate).length;
  const expected = ASSESSMENT_CANDIDATES[level];
  if (assessCount !== expected) {
    log(
      `  Warning: ${level} has ${assessCount} assessment candidates (expected ${expected}). Will fix.`
    );
    fixAssessmentCandidates(items, expected);
  }

  if (errors.length > 0) {
    log(`  ${level} validation issues (${errors.length}):`);
    for (const err of errors) {
      log(`    - ${err}`);
    }
  } else {
    log(`  ${level} validation passed`);
  }
}

function fixAssessmentCandidates(
  items: GrammarItem[],
  targetCount: number
): void {
  const currentCount = items.filter((i) => i.assessmentCandidate).length;

  if (currentCount > targetCount) {
    const candidates = items
      .filter((item) => item.assessmentCandidate)
      .sort((a, b) => a.frequencyRank - b.frequencyRank);

    for (let i = targetCount; i < candidates.length; i++) {
      candidates[i].assessmentCandidate = false;
    }
  } else if (currentCount < targetCount) {
    const nonCandidates = items
      .filter((item) => !item.assessmentCandidate)
      .sort((a, b) => a.frequencyRank - b.frequencyRank);

    const toAdd = targetCount - currentCount;
    for (let i = 0; i < Math.min(toAdd, nonCandidates.length); i++) {
      nonCandidates[i].assessmentCandidate = true;
    }
  }
}

function validateFullCorpus(allItems: GrammarItem[]): boolean {
  log("");
  log("=== Full Corpus Validation ===");
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Uniqueness
  const idSet = new Set<string>();
  for (const item of allItems) {
    if (idSet.has(item.patternId)) {
      errors.push(`Duplicate patternId: ${item.patternId}`);
    }
    idSet.add(item.patternId);
  }

  // 2. Prerequisite validity
  for (const item of allItems) {
    for (const prereqId of item.prerequisiteIds) {
      if (!idSet.has(prereqId)) {
        errors.push(
          `Invalid prerequisite: ${item.patternId} references non-existent ${prereqId}`
        );
      }
    }
  }

  // 3. Prerequisite level ordering
  const levelOrder: Record<string, number> = {
    N5: 0,
    N4: 1,
    N3: 2,
    N2: 3,
    N1: 4,
  };
  const idToLevel = new Map(
    allItems.map((i) => [i.patternId, i.jlptLevel])
  );
  for (const item of allItems) {
    const itemLevel = levelOrder[item.jlptLevel];
    for (const prereqId of item.prerequisiteIds) {
      const prereqLevel = idToLevel.get(prereqId);
      if (prereqLevel && levelOrder[prereqLevel] > itemLevel) {
        errors.push(
          `Prerequisite level violation: ${item.patternId} (${item.jlptLevel}) depends on ${prereqId} (${prereqLevel})`
        );
      }
    }
  }

  // 4. Circular dependency check
  const adjacency = new Map<string, string[]>();
  for (const item of allItems) {
    adjacency.set(item.patternId, item.prerequisiteIds);
  }

  function hasCycle(): string | null {
    const visited = new Set<string>();
    const recStack = new Set<string>();

    function dfs(node: string, nodePath: string[]): string | null {
      visited.add(node);
      recStack.add(node);
      const deps = adjacency.get(node) || [];
      for (const dep of deps) {
        if (!visited.has(dep)) {
          const cycle = dfs(dep, [...nodePath, dep]);
          if (cycle) return cycle;
        } else if (recStack.has(dep)) {
          return `Cycle detected: ${[...nodePath, dep].join(" -> ")}`;
        }
      }
      recStack.delete(node);
      return null;
    }

    for (const id of adjacency.keys()) {
      if (!visited.has(id)) {
        const cycle = dfs(id, [id]);
        if (cycle) return cycle;
      }
    }
    return null;
  }

  const cycleResult = hasCycle();
  if (cycleResult) errors.push(cycleResult);

  // 5. Field validation
  const patternIdRegex = /^n[1-5]_[a-z0-9_]+$/;
  const japaneseRegex =
    /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\u3000-\u303F\u3005\u301C\uFF5E〜～]/;
  for (const item of allItems) {
    if (!patternIdRegex.test(item.patternId)) {
      errors.push(`Invalid patternId format: ${item.patternId}`);
    }
    if (!japaneseRegex.test(item.name)) {
      errors.push(
        `Name missing Japanese characters: ${item.patternId} = "${item.name}"`
      );
    }
    if (!item.description || item.description.length <= 10) {
      errors.push(`Description too short: ${item.patternId}`);
    }
    if (item.cefrLevel !== JLPT_TO_CEFR[item.jlptLevel]) {
      errors.push(
        `CEFR mismatch: ${item.patternId} has ${item.cefrLevel}, expected ${JLPT_TO_CEFR[item.jlptLevel]}`
      );
    }
    if (item.prerequisiteIds.length > 3) {
      warnings.push(
        `Too many prerequisites (${item.prerequisiteIds.length}): ${item.patternId}`
      );
    }
  }

  // 6. Assessment candidate count per level
  for (const level of LEVELS) {
    const levelItems = allItems.filter((i) => i.jlptLevel === level);
    const assessCount = levelItems.filter(
      (i) => i.assessmentCandidate
    ).length;
    const expected = ASSESSMENT_CANDIDATES[level];
    if (assessCount !== expected) {
      warnings.push(
        `${level} assessment candidates: ${assessCount} (expected ${expected})`
      );
    }
  }

  // 7. Frequency rank continuity
  for (const level of LEVELS) {
    const levelItems = allItems
      .filter((i) => i.jlptLevel === level)
      .sort((a, b) => a.frequencyRank - b.frequencyRank);
    for (let i = 0; i < levelItems.length; i++) {
      if (levelItems[i].frequencyRank !== i + 1) {
        warnings.push(
          `${level} frequency rank gap at position ${i + 1}: got ${levelItems[i].frequencyRank}`
        );
        break;
      }
    }
  }

  // 8. Existing IDs preserved (warning only — jlptsensei may categorize patterns
  //    at different levels than the original hand-curated corpus)
  for (const level of LEVELS) {
    for (const id of EXISTING_IDS[level]) {
      if (!idSet.has(id)) {
        warnings.push(`Missing existing ID: ${id} (jlptsensei may place this pattern at a different level)`);
      }
    }
  }

  if (warnings.length > 0) {
    log(`Warnings (${warnings.length}):`);
    for (const w of warnings) {
      log(`  - ${w}`);
    }
  }

  if (errors.length > 0) {
    log(`ERRORS (${errors.length}):`);
    for (const e of errors) {
      log(`  x ${e}`);
    }
    return false;
  }

  log("All validation checks passed!");
  return true;
}

// ─── Post-processing ────────────────────────────────────────────────────────

/**
 * Rename verbose/inconsistent IDs to cleaner forms where the concept
 * is at the same level. Also updates prerequisite references.
 */
const ID_RENAMES: Record<string, string> = {
  n4_rareru_potential: "n4_potential",
  n4_saseru: "n4_causative",
  n4_saserareru: "n4_causative_passive",
  n2_mono_da_feeling: "n2_mono_da",
  n1_to_wa_ie: "n1_towa_ie",
  n1_taru_mono_taru: "n1_taru",
};

function applyIdRenames(items: GrammarItem[]): number {
  let renameCount = 0;

  // Build a set of existing IDs to avoid collisions
  const existingIds = new Set(items.map((i) => i.patternId));

  // Only apply renames that won't collide
  const safeRenames = new Map<string, string>();
  for (const [oldId, newId] of Object.entries(ID_RENAMES)) {
    if (existingIds.has(oldId) && !existingIds.has(newId)) {
      safeRenames.set(oldId, newId);
    }
  }

  // Rename patternIds
  for (const item of items) {
    const newId = safeRenames.get(item.patternId);
    if (newId) {
      item.patternId = newId;
      renameCount++;
    }
  }

  // Update prerequisite references
  for (const item of items) {
    item.prerequisiteIds = item.prerequisiteIds.map(
      (prereqId) => safeRenames.get(prereqId) || prereqId
    );
  }

  return renameCount;
}

function fixPrerequisites(allItems: GrammarItem[]): number {
  const validIds = new Set(allItems.map((i) => i.patternId));
  const levelOrder: Record<string, number> = {
    N5: 0,
    N4: 1,
    N3: 2,
    N2: 3,
    N1: 4,
  };
  const idToLevel = new Map(
    allItems.map((i) => [i.patternId, i.jlptLevel])
  );

  let fixCount = 0;
  for (const item of allItems) {
    item.prerequisiteIds = item.prerequisiteIds.filter((prereqId) => {
      if (!validIds.has(prereqId)) {
        fixCount++;
        return false;
      }
      const prereqLevel = idToLevel.get(prereqId);
      if (
        prereqLevel &&
        levelOrder[prereqLevel] > levelOrder[item.jlptLevel]
      ) {
        fixCount++;
        return false;
      }
      if (prereqId === item.patternId) {
        fixCount++;
        return false;
      }
      return true;
    });

    if (item.prerequisiteIds.length > 3) {
      fixCount += item.prerequisiteIds.length - 3;
      item.prerequisiteIds = item.prerequisiteIds.slice(0, 3);
    }
  }

  return fixCount;
}

function deduplicateItems(items: GrammarItem[]): GrammarItem[] {
  const seen = new Map<string, number>();
  const result: GrammarItem[] = [];

  for (const item of items) {
    if (seen.has(item.patternId)) {
      const existingIdx = seen.get(item.patternId)!;
      log(`  Removing duplicate: ${item.patternId} (keeping first occurrence)`);
      const existing = result[existingIdx];
      if (item.description.length > existing.description.length) {
        result[existingIdx] = item;
      }
    } else {
      seen.set(item.patternId, result.length);
      result.push(item);
    }
  }

  return result;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  log("=== Linguist Grammar Corpus Builder (jlptsensei source) ===");
  log("");

  const { useCache, singleLevel } = parseArgs();
  if (useCache) log("Cache mode enabled");
  if (singleLevel) log(`Single level mode: ${singleLevel}`);

  // Step 1: Parse PDFs
  log("Step 1: Parsing jlptsensei grammar PDFs...");
  const sourcePatterns = loadPatternsFromPdfs();

  const totalSource = Object.values(sourcePatterns).reduce(
    (sum, arr) => sum + arr.length,
    0
  );
  log(`Total source patterns: ${totalSource}`);
  log("");

  // Step 2: Init Anthropic SDK
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    logError("ANTHROPIC_API_KEY environment variable is required");
    process.exit(1);
  }
  const client = new Anthropic({ apiKey });
  log("Anthropic client initialized");

  // Step 3: Generate level by level
  const allItems: GrammarItem[] = [];
  const priorLevelIds: string[] = [];

  const levelsToGenerate = singleLevel
    ? LEVELS.filter((l) => l === singleLevel)
    : LEVELS;

  // For single level mode, load prior levels from cache
  if (singleLevel) {
    const levelIdx = LEVELS.indexOf(singleLevel as (typeof LEVELS)[number]);
    for (let i = 0; i < levelIdx; i++) {
      const priorLevel = LEVELS[i];
      const cacheFile = path.join(CACHE_DIR, `${priorLevel}.json`);
      if (useCache && fs.existsSync(cacheFile)) {
        const cached = JSON.parse(
          fs.readFileSync(cacheFile, "utf-8")
        ) as GrammarItem[];
        allItems.push(...cached);
        priorLevelIds.push(...cached.map((item) => item.patternId));
        log(`Loaded ${priorLevel} from cache (${cached.length} items)`);
      } else {
        logError(
          `No cache for ${priorLevel}. Run full build first or provide --cache with cached data.`
        );
        process.exit(1);
      }
    }
  }

  for (const level of levelsToGenerate) {
    log("");
    log(`=== Generating ${level} (${sourcePatterns[level].length} patterns from jlptsensei) ===`);

    const items = await generateLevel(
      client,
      level,
      sourcePatterns[level],
      priorLevelIds,
      useCache
    );
    allItems.push(...items);
    priorLevelIds.push(...items.map((item) => item.patternId));

    log(`${level}: ${items.length} items generated`);

    if (level !== levelsToGenerate[levelsToGenerate.length - 1]) {
      await sleep(2000);
    }
  }

  // Step 4: Post-processing
  log("");
  log("=== Post-processing ===");

  const deduplicated = deduplicateItems(allItems);
  if (deduplicated.length !== allItems.length) {
    log(`Removed ${allItems.length - deduplicated.length} duplicates`);
  }

  const renameCount = applyIdRenames(deduplicated);
  if (renameCount > 0) {
    log(`Renamed ${renameCount} IDs to cleaner forms`);
  }

  const fixCount = fixPrerequisites(deduplicated);
  if (fixCount > 0) {
    log(`Fixed ${fixCount} invalid prerequisite references`);
  }

  for (const level of LEVELS) {
    const levelItems = deduplicated.filter((i) => i.jlptLevel === level);
    fixAssessmentCandidates(levelItems, ASSESSMENT_CANDIDATES[level]);
  }

  // Reassign frequency ranks
  for (const level of LEVELS) {
    const levelItems = deduplicated.filter((i) => i.jlptLevel === level);
    levelItems.sort((a, b) => a.frequencyRank - b.frequencyRank);
    for (let i = 0; i < levelItems.length; i++) {
      levelItems[i].frequencyRank = i + 1;
    }
  }

  // Step 5: Validate
  const valid = validateFullCorpus(deduplicated);

  if (!valid) {
    logError("Validation failed! Aborting — grammar.json NOT overwritten.");
    process.exit(1);
  }

  // Sort: N5 first, then by frequencyRank
  const levelOrder: Record<string, number> = {
    N5: 0,
    N4: 1,
    N3: 2,
    N2: 3,
    N1: 4,
  };
  deduplicated.sort((a, b) => {
    const levelDiff = levelOrder[a.jlptLevel] - levelOrder[b.jlptLevel];
    if (levelDiff !== 0) return levelDiff;
    return a.frequencyRank - b.frequencyRank;
  });

  // Step 6: Write output
  log("");
  log("=== Writing output ===");
  const output = JSON.stringify(deduplicated, null, 2);
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, output, "utf-8");

  const fileSizeKB = (Buffer.byteLength(output) / 1024).toFixed(0);
  log(`Wrote ${OUTPUT_PATH} (${fileSizeKB} KB)`);

  // Summary
  log("");
  log("=== Build Complete ===");
  log(`Total items: ${deduplicated.length}`);
  log(
    `Assessment candidates: ${deduplicated.filter((i) => i.assessmentCandidate).length}`
  );
  log(`File size: ${fileSizeKB} KB`);
  log("");
  log("Level distribution:");
  for (const level of LEVELS) {
    const levelItems = deduplicated.filter((i) => i.jlptLevel === level);
    const assessCount = levelItems.filter(
      (i) => i.assessmentCandidate
    ).length;
    log(
      `  ${level} (${JLPT_TO_CEFR[level]}): ${levelItems.length} items, ${assessCount} assessment candidates`
    );
  }

  log("");
  log("Existing ID preservation:");
  const idSet = new Set(deduplicated.map((i) => i.patternId));
  for (const level of LEVELS) {
    const missing = EXISTING_IDS[level].filter((id) => !idSet.has(id));
    if (missing.length > 0) {
      log(`  ${level}: MISSING ${missing.join(", ")}`);
    } else {
      log(`  ${level}: all ${EXISTING_IDS[level].length} IDs preserved`);
    }
  }
}

// ─── Entry point ────────────────────────────────────────────────────────────

main().catch((err) => {
  logError(err instanceof Error ? err.message : String(err));
  if (err instanceof Error && err.stack) {
    console.error(err.stack);
  }
  console.error("");
  console.error(
    "Usage: npx tsx scripts/build-grammar-corpus.ts [--cache] [--level N5]"
  );
  console.error("");
  console.error("Requires jlptsensei grammar PDF files in ~/Downloads/");
  console.error("  - JLPT N5 Grammar List V2.pdf");
  console.error("  - JLPT N4 Grammar List.pdf");
  console.error("  - N3 Grammar List PDF.pdf");
  console.error("  - JLPT N2 Grammar List.pdf");
  console.error("  - JLPT N1 Grammar List.pdf");
  process.exit(1);
});
