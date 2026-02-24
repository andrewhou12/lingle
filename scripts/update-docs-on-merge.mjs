#!/usr/bin/env node
/**
 * Linguist — Auto-update architecture diagram and progress notes on merge.
 *
 * Triggered by GitHub Actions when a PR is merged to main. Reads the merged PR diff,
 * current architecture diagram, and recent progress notes, then asks Claude
 * to update the Excalidraw diagram (if architecturally relevant) and generate
 * a new progress entry.
 *
 * Run: node scripts/update-docs-on-merge.mjs
 * Requires: ANTHROPIC_API_KEY in environment
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import Anthropic from "@anthropic-ai/sdk";

// ─── Paths ──────────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const EXCALIDRAW_PATH = join(ROOT, "architecture.excalidraw");
const PROGRESS_DIR = join(ROOT, "markdown", "progress");

// ─── Helpers ────────────────────────────────────────────────────────────────

function git(cmd) {
  return execSync(`git ${cmd}`, { cwd: ROOT, encoding: "utf-8" }).trim();
}

function truncate(str, maxLen) {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + "\n\n... [truncated at " + maxLen + " chars]";
}

function todayString() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// ─── 1. Gather context ─────────────────────────────────────────────────────

// Full diff (all files) for relevance filtering
const fullDiffStat = git("diff HEAD~1..HEAD --stat");
const fullDiffFiles = git("diff HEAD~1..HEAD --name-only");

// ─── 1a. Relevance filter — skip trivial or non-code changes ────────────────

const changedFiles = fullDiffFiles.split("\n").filter(Boolean);

// Check if all changed files are non-code (docs, config, env, non-src yml)
const NON_CODE_PATTERNS = [
  /\.md$/,
  /^\.env/,
  /package-lock\.json$/,
  /pnpm-lock\.yaml$/,
  // Config JSON files (package.json, tsconfig, turbo, etc.)
  /(?:^|\/)(?:package|tsconfig|turbo|\.prettierrc|\.eslintrc).*\.json$/,
  // YML files outside of src/ directories
  /^(?!.*(?:src|apps|packages)\/).*\.ya?ml$/,
];

function isNonCodeFile(filePath) {
  return NON_CODE_PATTERNS.some((pattern) => pattern.test(filePath));
}

const allNonCode = changedFiles.length > 0 && changedFiles.every(isNonCodeFile);
if (allNonCode) {
  console.log("Change too small to document, skipping. (only non-code files changed)");
  process.exit(0);
}

// Check line count — skip if fewer than 15 lines changed
const diffStatSummary = git("diff HEAD~1..HEAD --shortstat");
// e.g. " 3 files changed, 10 insertions(+), 2 deletions(-)"
const insertions = parseInt((diffStatSummary.match(/(\d+) insertion/) || [, "0"])[1], 10);
const deletions = parseInt((diffStatSummary.match(/(\d+) deletion/) || [, "0"])[1], 10);
const totalLinesChanged = insertions + deletions;

if (totalLinesChanged < 15) {
  console.log(`Change too small to document, skipping. (${totalLinesChanged} lines changed, threshold is 15)`);
  process.exit(0);
}

console.log(`${changedFiles.length} files changed, ${totalLinesChanged} lines — proceeding with docs update.`);

// Git diff from the merged PR, filtered to code files, capped at 8000 chars
const rawDiff = git(
  "diff HEAD~1..HEAD -- '*.ts' '*.tsx' '*.js' '*.mjs'"
);
const diff = truncate(rawDiff, 8000);

// PR title and commit message
const commitInfo = git("log -1 --format='%s%n%n%b'");

// Current architecture diagram
let currentExcalidraw = "";
if (existsSync(EXCALIDRAW_PATH)) {
  currentExcalidraw = readFileSync(EXCALIDRAW_PATH, "utf-8");
}

// Most recent progress file
let recentProgress = "";
if (existsSync(PROGRESS_DIR)) {
  const progressFiles = readdirSync(PROGRESS_DIR)
    .filter((f) => f.endsWith(".md"))
    .sort();
  if (progressFiles.length > 0) {
    const latest = progressFiles[progressFiles.length - 1];
    recentProgress = readFileSync(join(PROGRESS_DIR, latest), "utf-8");
  }
}

// ─── 2. Build the prompt ────────────────────────────────────────────────────

const systemPrompt = `You are a documentation updater for Linguist, a Japanese language learning application built as a Turborepo monorepo.

About Linguist:
- AI-powered Japanese learning agent that builds a probabilistic knowledge model of each learner
- Architecture: Next.js 15 web app (apps/web/) + Electron desktop app (apps/desktop/) sharing business logic
- Shared packages: @linguist/core (pure TS business logic — FSRS scheduler, mastery state machine, ToM engine, conversation planner, curriculum recommender, pragmatic analyzer, onboarding), @linguist/shared (TypeScript types/enums), @linguist/db (Prisma client singleton)
- Database: Supabase Postgres via Prisma ORM, multi-tenant (all queries scoped by userId)
- AI layer: Claude API for conversation partner, session planning, post-session analysis, ToM daily briefs, pragmatic analysis
- SRS engine: FSRS (ts-fsrs) running fully locally
- Auth: Supabase Auth with Google OAuth (PKCE on desktop, SSR cookies on web)
- Build: Turborepo + pnpm workspaces, electron-vite for desktop, Next.js App Router + Turbopack for web

Your job is to analyze a git diff from a merged PR and produce two outputs:

1. **Excalidraw diagram update**: You will receive the current architecture.excalidraw JSON. Only modify it if the diff reflects a genuine architectural change — for example: a new package added, a new service/integration, a new data flow, a changed API contract, a new database model, or a removed major component. Cosmetic code changes, bug fixes, refactors within existing modules, or minor feature additions within existing architecture do NOT warrant diagram changes. When in doubt, return the existing JSON unchanged. If you do modify it, preserve the existing structure and style conventions (titled boxes, color scheme, zone layout).

2. **Progress note**: Write a concise, specific progress entry for a technical founder audience. No fluff — focus on what actually moved, why it matters for the product, and what the current system state is.

Respond with a JSON object (and nothing else — no markdown fences, no commentary outside the JSON) with exactly two keys:
- "excalidraw": the full Excalidraw JSON (either updated or the original unchanged)
- "progressEntry": a markdown string for the progress note

The progress note must follow this template (omit sections that don't apply):

# Progress Update — YYYY-MM-DD

## What Changed

## Why It Matters for Linguist

## Current State of the System

## API / Schema Changes

## Bug Fixes

## Next Up`;

const userPrompt = `Here is the context for this merged PR:

--- COMMIT INFO ---
${commitInfo}

--- GIT DIFF (code files only, capped at 8000 chars) ---
${diff}

--- CURRENT architecture.excalidraw ---
${currentExcalidraw ? truncate(currentExcalidraw, 30000) : "(no existing diagram found)"}

--- MOST RECENT PROGRESS NOTE ---
${recentProgress ? truncate(recentProgress, 4000) : "(no previous progress notes found)"}

--- TODAY'S DATE ---
${todayString()}

Analyze the diff and return the JSON object with "excalidraw" and "progressEntry" keys.`;

// ─── 3. Call the Anthropic API ──────────────────────────────────────────────

const client = new Anthropic();

console.log("Calling Claude API to analyze merged PR...");

const response = await client.messages.create({
  model: "claude-opus-4-6",
  max_tokens: 16000,
  system: systemPrompt,
  messages: [{ role: "user", content: userPrompt }],
});

const responseText = response.content
  .filter((block) => block.type === "text")
  .map((block) => block.text)
  .join("");

// ─── 4. Parse the response ──────────────────────────────────────────────────

let parsed;
try {
  parsed = JSON.parse(responseText);
} catch (e) {
  // Try to extract JSON from the response if it has markdown fences
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    parsed = JSON.parse(jsonMatch[0]);
  } else {
    console.error("Failed to parse Claude response as JSON:");
    console.error(responseText.slice(0, 500));
    process.exit(1);
  }
}

if (!parsed.excalidraw || !parsed.progressEntry) {
  console.error("Response missing required keys (excalidraw, progressEntry):");
  console.error(Object.keys(parsed));
  process.exit(1);
}

// ─── 5. Write outputs ──────────────────────────────────────────────────────

// Write updated Excalidraw diagram
const excalidrawContent =
  typeof parsed.excalidraw === "string"
    ? parsed.excalidraw
    : JSON.stringify(parsed.excalidraw, null, 2);

writeFileSync(EXCALIDRAW_PATH, excalidrawContent);
console.log(`Updated: ${EXCALIDRAW_PATH}`);

// Write progress entry
if (!existsSync(PROGRESS_DIR)) {
  mkdirSync(PROGRESS_DIR, { recursive: true });
}

const progressFileName = `${todayString()}-auto-update.md`;
const progressPath = join(PROGRESS_DIR, progressFileName);
writeFileSync(progressPath, parsed.progressEntry);
console.log(`Created: ${progressPath}`);

console.log("Done.");
