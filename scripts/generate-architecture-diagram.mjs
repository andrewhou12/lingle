#!/usr/bin/env node
/**
 * Linguist Architecture Diagram Generator
 * Generates a comprehensive .excalidraw file representing the full codebase architecture.
 *
 * Run: node scripts/generate-architecture-diagram.mjs
 * Output: architecture.excalidraw (open in https://excalidraw.com or the VS Code extension)
 */

import { writeFileSync } from "fs";
import { randomBytes } from "crypto";

// ─── Helpers ────────────────────────────────────────────────────────────────

let _idCounter = 0;
const id = () => `elem_${++_idCounter}_${randomBytes(4).toString("hex")}`;

const COLORS = {
  blue: "#a5d8ff",       // renderer / UI
  blueBorder: "#1971c2",
  green: "#b2f2bb",      // core business logic
  greenBorder: "#2f9e44",
  orange: "#ffd8a8",     // AI-powered
  orangeBorder: "#e8590c",
  purple: "#d0bfff",     // database
  purpleBorder: "#7048e8",
  red: "#ffc9c9",        // security boundary
  redBorder: "#e03131",
  gray: "#dee2e6",       // infra
  grayBorder: "#495057",
  yellow: "#fff3bf",     // shared/types
  yellowBorder: "#f08c00",
  white: "#ffffff",
  transparent: "transparent",
};

function rect({
  x, y, w, h,
  bg = COLORS.white,
  border = "#1e1e1e",
  fill = "hachure",
  strokeW = 2,
  rough = 1,
  radius = 8,
  opacity = 100,
  groupIds = [],
}) {
  return {
    id: id(),
    type: "rectangle",
    x, y,
    width: w,
    height: h,
    angle: 0,
    strokeColor: border,
    backgroundColor: bg,
    fillStyle: fill,
    strokeWidth: strokeW,
    roughness: rough,
    opacity,
    groupIds,
    roundness: { type: 3, value: radius },
    isDeleted: false,
    boundElements: [],
    updated: Date.now(),
    link: null,
    locked: false,
  };
}

function text({
  x, y, w = null, h = null,
  content,
  size = 16,
  family = 1, // 1=hand, 2=normal, 3=mono
  align = "left",
  vAlign = "top",
  color = "#1e1e1e",
  bold = false,
  groupIds = [],
  containerId = null,
}) {
  const computed_h = h ?? (content.split("\n").length * (size * 1.35) + 4);
  const computed_w = w ?? (Math.max(...content.split("\n").map(l => l.length)) * size * 0.58 + 8);
  return {
    id: id(),
    type: "text",
    x, y,
    width: computed_w,
    height: computed_h,
    angle: 0,
    strokeColor: color,
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 1,
    roughness: 0,
    opacity: 100,
    groupIds,
    isDeleted: false,
    boundElements: null,
    updated: Date.now(),
    link: null,
    locked: false,
    text: content,
    fontSize: size,
    fontFamily: family,
    textAlign: align,
    verticalAlign: vAlign,
    containerId,
    originalText: content,
    autoResize: true,
    lineHeight: 1.35,
  };
}

function arrow({
  startX, startY, endX, endY,
  color = "#1e1e1e",
  strokeW = 2,
  rough = 1,
  label = null,
  groupIds = [],
  dashed = false,
}) {
  const el = {
    id: id(),
    type: "arrow",
    x: startX,
    y: startY,
    width: endX - startX,
    height: endY - startY,
    angle: 0,
    strokeColor: color,
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: strokeW,
    roughness: rough,
    opacity: 100,
    groupIds,
    isDeleted: false,
    boundElements: [],
    updated: Date.now(),
    link: null,
    locked: false,
    points: [[0, 0], [endX - startX, endY - startY]],
    lastCommittedPoint: null,
    startBinding: null,
    endBinding: null,
    startArrowhead: null,
    endArrowhead: "arrow",
    roundness: { type: 2 },
  };
  if (dashed) el.strokeStyle = "dashed";
  const elements = [el];
  if (label) {
    const midX = (startX + endX) / 2;
    const midY = (startY + endY) / 2;
    elements.push(text({ x: midX + 6, y: midY - 12, content: label, size: 12, family: 3, color: "#868e96" }));
  }
  return elements;
}

function line({
  startX, startY, endX, endY,
  color = "#dee2e6",
  strokeW = 1,
  dashed = true,
}) {
  const el = {
    id: id(),
    type: "line",
    x: startX,
    y: startY,
    width: endX - startX,
    height: endY - startY,
    angle: 0,
    strokeColor: color,
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: strokeW,
    strokeStyle: dashed ? "dashed" : "solid",
    roughness: 0,
    opacity: 100,
    groupIds: [],
    isDeleted: false,
    boundElements: [],
    updated: Date.now(),
    link: null,
    locked: false,
    points: [[0, 0], [endX - startX, endY - startY]],
    lastCommittedPoint: null,
    startBinding: null,
    endBinding: null,
    startArrowhead: null,
    endArrowhead: null,
  };
  return el;
}

function diamond({ x, y, w, h, bg = COLORS.yellow, border = COLORS.yellowBorder, groupIds = [] }) {
  return {
    id: id(),
    type: "diamond",
    x, y,
    width: w,
    height: h,
    angle: 0,
    strokeColor: border,
    backgroundColor: bg,
    fillStyle: "hachure",
    strokeWidth: 2,
    roughness: 1,
    opacity: 100,
    groupIds,
    isDeleted: false,
    boundElements: [],
    updated: Date.now(),
    link: null,
    locked: false,
  };
}

/** Create a titled box with header bar and body content */
function titledBox({ x, y, w, h, title, titleBg, titleBorder, bodyBg, bodyBorder, bodyLines = [], groupIds = [] }) {
  const headerH = 36;
  const gid = id();
  const allGroupIds = [...groupIds, gid];
  const elements = [];
  // header
  elements.push(rect({ x, y, w, h: headerH, bg: titleBg, border: titleBorder, fill: "solid", rough: 0, radius: 8, groupIds: allGroupIds }));
  elements.push(text({ x: x + 12, y: y + 8, content: title, size: 15, family: 3, bold: true, color: titleBorder, groupIds: allGroupIds }));
  // body
  elements.push(rect({ x, y: y + headerH - 1, w, h: h - headerH + 1, bg: bodyBg, border: bodyBorder, fill: "solid", rough: 0, radius: 8, groupIds: allGroupIds }));
  // body text
  if (bodyLines.length > 0) {
    const bodyText = bodyLines.join("\n");
    elements.push(text({ x: x + 12, y: y + headerH + 8, content: bodyText, size: 13, family: 3, groupIds: allGroupIds }));
  }
  return { elements, groupId: gid };
}

/** Section title label */
function sectionLabel({ x, y, content, size = 28, color = "#1e1e1e" }) {
  return text({ x, y, content, size, family: 1, color, bold: true });
}

// ─── Layout Constants ───────────────────────────────────────────────────────

const CANVAS_PADDING = 60;
const ZONE_GAP = 80;

// ─── Build the diagram ──────────────────────────────────────────────────────

const elements = [];

// ═══════════════════════════════════════════════════════════════════════════
// ZONE 1 — Process Boundary Overview (top center)
// ═══════════════════════════════════════════════════════════════════════════

const Z1_X = 400;
const Z1_Y = 60;
const Z1_W = 1100;

elements.push(sectionLabel({ x: Z1_X, y: Z1_Y, content: "Zone 1: Process Boundaries" }));

// --- Renderer Process ---
const rendererY = Z1_Y + 50;
{
  const { elements: els } = titledBox({
    x: Z1_X, y: rendererY, w: Z1_W, h: 260,
    title: "RENDERER PROCESS  (src/)",
    titleBg: COLORS.blue, titleBorder: COLORS.blueBorder,
    bodyBg: "#f8f9fa", bodyBorder: COLORS.blueBorder,
    bodyLines: [
      "React 19  +  Radix UI  +  Tailwind CSS  +  Vite",
      "",
      "Pages:   Dashboard │ Review │ Learn │ Knowledge │ Chat │ Settings │ SignIn │ Onboarding",
      "",
      "Hooks:   useReview │ useConversation │ useFrontier │ useWordbank",
      "",
      "State:   AuthProvider (Context) — only global state",
      "         Provides: user, needsOnboarding, completeOnboarding()",
      "         Everything else is local useState + useCallback per page",
      "",
      "Routing: Auth gate → Onboarding gate → App Shell",
      "         !user → SignInPage │ !onboarded → OnboardingPage │ else → main app",
    ],
  });
  elements.push(...els);
}

// --- IPC Bridge Arrow ---
const bridgeY = rendererY + 260 + 15;
elements.push(...arrow({ startX: Z1_X + Z1_W / 2, startY: bridgeY, endX: Z1_X + Z1_W / 2, endY: bridgeY + 50, color: COLORS.redBorder, strokeW: 3, label: "window.linguist.xxx()  →  ipcRenderer.invoke()" }));
elements.push(...arrow({ startX: Z1_X + Z1_W / 2 + 30, startY: bridgeY + 50, endX: Z1_X + Z1_W / 2 + 30, endY: bridgeY, color: "#868e96", strokeW: 2, dashed: true, label: "Promise<T> response" }));

// --- Preload Bridge ---
const preloadY = bridgeY + 60;
{
  const { elements: els } = titledBox({
    x: Z1_X, y: preloadY, w: Z1_W, h: 110,
    title: "PRELOAD BRIDGE  (electron/preload.ts)",
    titleBg: COLORS.red, titleBorder: COLORS.redBorder,
    bodyBg: "#fff5f5", bodyBorder: COLORS.redBorder,
    bodyLines: [
      "contextBridge.exposeInMainWorld('linguist', api)",
      "Auto-generates camelCase API from IPC_CHANNELS constant",
      "  REVIEW_GET_QUEUE  →  reviewGetQueue()",
      "  CONVERSATION_PLAN →  conversationPlan()    ...50+ methods",
    ],
  });
  elements.push(...els);
}

// --- IPC Arrow to Main ---
const mainArrowY = preloadY + 110 + 15;
elements.push(...arrow({ startX: Z1_X + Z1_W / 2, startY: mainArrowY, endX: Z1_X + Z1_W / 2, endY: mainArrowY + 50, color: COLORS.redBorder, strokeW: 3, label: "ipcMain.handle(channel, handler)" }));

// --- Main Process ---
const mainY = mainArrowY + 60;
{
  const { elements: els } = titledBox({
    x: Z1_X, y: mainY, w: Z1_W, h: 160,
    title: "MAIN PROCESS  (electron/)",
    titleBg: COLORS.gray, titleBorder: COLORS.grayBorder,
    bodyBg: "#f8f9fa", bodyBorder: COLORS.grayBorder,
    bodyLines: [
      "electron/main.ts         App entry, window management, registers all 14 handler groups",
      "electron/db.ts           PrismaClient singleton (getDb() / disconnectDb())",
      "electron/auth-state.ts   In-memory userId singleton (set on login, cleared on logout)",
      "electron/logger.ts       Logging utility",
      "electron/ipc/            14 domain handler files (see Zone 2)",
      "",
      "In-memory:  activeSessions Map  (holds live conversation state per session)",
      "            currentUserId (auth-state) — every IPC handler scopes DB queries by userId",
      "Pattern:    Handler calls getCurrentUserId() → core/ functions → writes to DB via Prisma",
    ],
  });
  elements.push(...els);
}


// ═══════════════════════════════════════════════════════════════════════════
// ZONE 2 — IPC Handler Map (left side, below Zone 1)
// ═══════════════════════════════════════════════════════════════════════════

const Z2_X = 420;  // offset right to clear Zone 6 left sidebar
const Z2_Y = mainY + 160 + ZONE_GAP;
const Z2_W = 720;

elements.push(sectionLabel({ x: Z2_X, y: Z2_Y, content: "Zone 2: IPC Handlers  (electron/ipc/)  — 14 handlers" }));

const handlers = [
  { name: "reviews.ts", color: COLORS.blue, border: COLORS.blueBorder, methods: "getQueue  submit  getSummary", category: "Learning Core" },
  { name: "conversation.ts", color: COLORS.orange, border: COLORS.orangeBorder, methods: "plan  send  end  list", category: "AI-Powered" },
  { name: "wordbank.ts", color: COLORS.blue, border: COLORS.blueBorder, methods: "list  get  add  update  search", category: "Learning Core" },
  { name: "tom.ts", color: COLORS.orange, border: COLORS.orangeBorder, methods: "runAnalysis  getBrief  getInferences", category: "AI-Powered" },
  { name: "profile.ts", color: COLORS.green, border: COLORS.greenBorder, methods: "get  update  recalculate", category: "Profile/Analytics" },
  { name: "curriculum.ts", color: COLORS.green, border: COLORS.greenBorder, methods: "getBubble  getRecommendations  introduceItem  skipItem  regenerate", category: "Profile/Analytics" },
  { name: "pragmatics.ts", color: COLORS.orange, border: COLORS.orangeBorder, methods: "getState  update", category: "AI-Powered" },
  { name: "context-log.ts", color: COLORS.green, border: COLORS.greenBorder, methods: "list  add", category: "Profile/Analytics" },
  { name: "dashboard.ts", color: COLORS.green, border: COLORS.greenBorder, methods: "getFrontier  getWeeklyStats", category: "Profile/Analytics" },
  { name: "narrative.ts", color: COLORS.orange, border: COLORS.orangeBorder, methods: "buildDraft  polish", category: "AI-Powered" },
  { name: "chat.ts", color: COLORS.orange, border: COLORS.orangeBorder, methods: "send (stream)  stop  onChunk  onDone", category: "AI-Powered (Streaming)" },
  { name: "auth.ts", color: COLORS.gray, border: COLORS.grayBorder, methods: "getSession  signInGoogle  signOut  ensureDbUser", category: "Infrastructure (Google PKCE)" },
  { name: "onboarding.ts", color: COLORS.blue, border: COLORS.blueBorder, methods: "getStatus  getAssessment  complete", category: "Learning Core (New User)" },
];

const HANDLER_COL_W = 340;
const HANDLER_ROW_H = 72;
const HANDLER_GAP_X = 30;
const HANDLER_GAP_Y = 12;
const HANDLER_COLS = 2;

handlers.forEach((h, i) => {
  const col = i % HANDLER_COLS;
  const row = Math.floor(i / HANDLER_COLS);
  const hx = Z2_X + col * (HANDLER_COL_W + HANDLER_GAP_X);
  const hy = Z2_Y + 50 + row * (HANDLER_ROW_H + HANDLER_GAP_Y);

  elements.push(rect({ x: hx, y: hy, w: HANDLER_COL_W, h: HANDLER_ROW_H, bg: h.color, border: h.border, fill: "solid", rough: 0 }));
  elements.push(text({ x: hx + 10, y: hy + 6, content: h.name, size: 14, family: 3, bold: true, color: h.border }));
  elements.push(text({ x: hx + 10, y: hy + 26, content: h.methods, size: 11, family: 3, color: "#495057" }));
  elements.push(text({ x: hx + 10, y: hy + 50, content: h.category, size: 10, family: 1, color: "#868e96" }));
});

// Color legend for Zone 2
const legendY = Z2_Y + 50 + Math.ceil(handlers.length / HANDLER_COLS) * (HANDLER_ROW_H + HANDLER_GAP_Y) + 10;
const legendItems = [
  { label: "Learning Core", color: COLORS.blue, border: COLORS.blueBorder },
  { label: "Profile / Analytics", color: COLORS.green, border: COLORS.greenBorder },
  { label: "AI-Powered (Claude)", color: COLORS.orange, border: COLORS.orangeBorder },
  { label: "Infrastructure", color: COLORS.gray, border: COLORS.grayBorder },
];
elements.push(text({ x: Z2_X, y: legendY, content: "Legend:", size: 12, family: 1, color: "#868e96" }));
legendItems.forEach((li, i) => {
  const lx = Z2_X + 60 + i * 175;
  elements.push(rect({ x: lx, y: legendY - 2, w: 14, h: 14, bg: li.color, border: li.border, fill: "solid", rough: 0, radius: 3 }));
  elements.push(text({ x: lx + 20, y: legendY - 1, content: li.label, size: 11, family: 1, color: "#495057" }));
});


// ═══════════════════════════════════════════════════════════════════════════
// ZONE 3 — Core Business Logic (right side of Zone 2)
// ═══════════════════════════════════════════════════════════════════════════

const Z3_X = Z2_X + Z2_W + 40;  // 40px gap between Zone 2 and Zone 3
const Z3_Y = Z2_Y;
const Z3_W = 620;

elements.push(sectionLabel({ x: Z3_X, y: Z3_Y, content: "Zone 3: Core Business Logic  (core/)" }));
elements.push(text({ x: Z3_X, y: Z3_Y + 35, content: "Pure TypeScript functions. Zero imports from Electron, React, or Prisma. Data in → data out.", size: 12, family: 1, color: "#868e96" }));

const coreModules = [
  {
    name: "core/fsrs/scheduler.ts",
    bg: COLORS.green, border: COLORS.greenBorder,
    lines: [
      "createInitialFsrsState() → FsrsState",
      "scheduleReview(state, grade) → { nextState, interval }",
      "computeReviewQueue(items) → sorted due items[]",
      "",
      "Uses: ts-fsrs library | Target retention: 0.90",
      "Grade map: again→1 hard→2 good→3 easy→4",
    ],
  },
  {
    name: "core/mastery/state-machine.ts",
    bg: COLORS.green, border: COLORS.greenBorder,
    lines: [
      "computeNextMasteryState(context) → nextState",
      "",
      "States: unseen → introduced → app_1 → app_2",
      "  → app_3 → app_4 →[GATE]→ journeyman",
      "  →[GATE]→ expert →[GATE]→ master → burned",
      "",
      "Gates:",
      "  app_4 → journeyman:  productionWeight >= 1.0",
      "  journeyman → expert: contextCount >= 3",
      "  expert → master:     novelContextCount >= 2",
      "Demotion: grade=again → back one state",
    ],
  },
  {
    name: "core/conversation/  (planner.ts + analyzer.ts)",
    bg: COLORS.orange, border: COLORS.orangeBorder,
    lines: [
      "buildPlanningPrompt(summary, brief) → prompt",
      "parseSessionPlan(response) → ExpandedSessionPlan",
      "buildConversationSystemPrompt(plan) → system prompt",
      "buildAnalysisPrompt(transcript, plan) → prompt",
      "parseAnalysis(response) → PostSessionAnalysis",
      "",
      "Handles: target vocab/grammar, difficulty,",
      "  register, pragmatic targets, curriculum items",
    ],
  },
  {
    name: "core/tom/analyzer.ts",
    bg: COLORS.orange, border: COLORS.orangeBorder,
    lines: [
      "detectAvoidance(items, sessions)",
      "  → journeyman 3+ sessions, 0 conversation production",
      "detectConfusionPairs(errors)",
      "  → item pairs co-occurring in errors ≥2x",
      "detectRegression(items, reviews)",
      "  → expert/master with again/hard in last 3 reviews",
      "detectModalityGap(items)",
      "  → retrievability gap between modalities",
      "generateExpandedDailyBrief() → ExpandedTomBrief",
    ],
  },
  {
    name: "core/profile/calculator.ts",
    bg: COLORS.green, border: COLORS.greenBorder,
    lines: [
      "recalculateProfile(items) → ProfileUpdate",
      "",
      "Outputs: comprehensionCeiling, productionCeiling,",
      "  readingLevel, writingLevel (0-1 floats),",
      "  currentStreak, longestStreak",
      "",
      "R = (1 + elapsed / (9 * stability))^-1  (FSRS curve)",
      "Triggered: every 10th review + after conversation end",
    ],
  },
  {
    name: "core/curriculum/  (bubble.ts + recommender.ts)",
    bg: COLORS.green, border: COLORS.greenBorder,
    lines: [
      "computeKnowledgeBubble(items, corpus)",
      "  → levelBreakdowns[], currentLevel, frontierLevel, gaps",
      "generateRecommendations(gaps, tom, items)",
      "  → CurriculumRecommendation[] (priority scored)",
      "",
      "Scoring: frequency (log) + gap location + ToM boost",
      "Corpus: japanese-reference.json (~2000 items/level)",
    ],
  },
  {
    name: "core/pragmatics/analyzer.ts",
    bg: COLORS.orange, border: COLORS.orangeBorder,
    lines: [
      "buildPragmaticAnalysisPrompt(transcript, profile)",
      "parsePragmaticAnalysis(response)",
      "",
      "Tracks: register accuracy (casual/polite),",
      "  circumlocution, silence events, L1 fallback",
    ],
  },
  {
    name: "core/onboarding/  (assessment-data.ts)",
    bg: COLORS.blue, border: COLORS.blueBorder,
    lines: [
      "ASSESSMENT_ITEMS: 55 static items across N5→N1",
      "  N5: 10 vocab + 5 grammar = 15",
      "  N4: 8 vocab + 4 grammar = 12",
      "  N3: 8 vocab + 4 grammar = 12",
      "  N2: 6 vocab + 3 grammar = 9",
      "  N1: 4 vocab + 2 grammar = 6",
      "",
      "getAssessmentItemsForLevel(level) → items[]",
      "  Beginner → N5 only (15 items)",
      "  N3 → N4+N3+N2 (~33 items)",
      "getLevelCefrMapping() → JLPT↔CEFR map",
    ],
  },
];

let coreY = Z3_Y + 60;
coreModules.forEach((mod) => {
  const modH = 36 + mod.lines.length * 17 + 16;
  const { elements: els } = titledBox({
    x: Z3_X, y: coreY, w: Z3_W, h: modH,
    title: mod.name,
    titleBg: mod.bg, titleBorder: mod.border,
    bodyBg: "#f8f9fa", bodyBorder: mod.border,
    bodyLines: mod.lines,
  });
  elements.push(...els);
  coreY += modH + 14;
});

const Z3_BOTTOM = coreY;  // actual bottom of Zone 3's last module


// ═══════════════════════════════════════════════════════════════════════════
// ZONE 4 — Database Schema (below the tallest of Zone 2 / Zone 3)
// ═══════════════════════════════════════════════════════════════════════════

const Z4_X = 60;
const Z4_Y = Math.max(legendY + 60, Z3_BOTTOM) + ZONE_GAP;
const Z4_W = 1740;

elements.push(sectionLabel({ x: Z4_X, y: Z4_Y, content: "Zone 4: Database Schema  (Prisma + Hosted Supabase Postgres)" }));
elements.push(text({ x: Z4_X, y: Z4_Y + 35, content: "Multi-tenant: every model has userId field + @@index([userId]) — all queries scoped by getCurrentUserId()", size: 12, family: 3, color: COLORS.redBorder }));

const models = [
  {
    name: "User",
    note: "from Supabase Auth",
    fields: [
      "id (String, Supabase auth ID)",
      "email, name, avatarUrl",
      "onboardingCompleted (bool)",
      "createdAt, updatedAt",
      "",
      "Upserted by ensureDbUser() on",
      "every sign-in / session restore",
      "→ owns ALL other models via userId",
    ],
  },
  {
    name: "LearnerProfile",
    note: "one per user",
    fields: [
      "userId (unique FK → User)",
      "targetLanguage, nativeLanguage",
      "selfReportedLevel (JLPT)",
      "dailyNewItemLimit, targetRetention",
      "computedLevel (CEFR)",
      "comprehensionCeiling, productionCeiling",
      "readingLevel, writingLevel (0-1)",
      "listeningLevel, speakingLevel (0-1)",
      "totalSessions, totalReviewEvents",
      "currentStreak, longestStreak",
    ],
  },
  {
    name: "LexicalItem",
    note: "vocabulary entries",
    fields: [
      "userId (FK → User)",
      "surfaceForm, reading, meaning",
      "partOfSpeech, tags[]",
      "masteryState (unseen→burned)",
      "recognitionFsrs (JSON)",
      "productionFsrs (JSON)",
      "productionWeight (float)",
      "exposureCount, productionCount",
      "contextTypes[], contextCount",
      "cefrLevel, frequencyRank",
      "→ reviewEvents[], contextLogs[]",
    ],
  },
  {
    name: "GrammarItem",
    note: "grammar patterns",
    fields: [
      "userId (FK → User)",
      "patternId @@unique([userId, patternId])",
      "name, description",
      "masteryState (unseen→burned)",
      "recognitionFsrs (JSON)",
      "productionFsrs (JSON)",
      "productionWeight, novelContextCount",
      "contextTypes[], contextCount",
      "prerequisiteIds[] (pattern refs)",
      "→ reviewEvents[], contextLogs[]",
    ],
  },
  {
    name: "ReviewEvent",
    note: "every review logged",
    fields: [
      "userId (FK → User)",
      "itemType (lexical|grammar)",
      "grade (again|hard|good|easy)",
      "modality (recognition|production|cloze)",
      "contextType, productionWeight",
      "timestamp, sessionId",
      "→ lexicalItemId (FK, nullable)",
      "→ grammarItemId (FK, nullable)",
    ],
  },
  {
    name: "ConversationSession",
    note: "full session record",
    fields: [
      "userId (FK → User)",
      "id (UUID), timestamp",
      "durationSeconds",
      "transcript (JSON array)",
      "targetsPlanned (JSON)",
      "targetsHit (JSON)",
      "errorsLogged (JSON array)",
      "avoidanceEvents (JSON array)",
      "sessionPlan (JSON)",
    ],
  },
  {
    name: "TomInference",
    note: "ToM engine output",
    fields: [
      "userId (FK → User)",
      "type: avoidance | confusion_pair",
      "      | regression | modality_gap",
      "itemIds[] (int array)",
      "confidence (float)",
      "description",
      "resolved (bool)",
    ],
  },
  {
    name: "ItemContextLog",
    note: "per-item exposure log",
    fields: [
      "userId (FK → User)",
      "contextType, modality",
      "wasProduction (bool)",
      "wasSuccessful (bool|null)",
      "contextQuote, sessionId",
      "→ lexicalItemId (FK)",
      "→ grammarItemId (FK)",
    ],
  },
  {
    name: "PragmaticProfile",
    note: "one per user",
    fields: [
      "userId (unique FK → User)",
      "casualAccuracy, politeAccuracy (0-1)",
      "registerSlipCount",
      "preferredRegister",
      "circumlocutionCount",
      "silenceEvents, l1FallbackCount",
      "avoidedGrammarPatterns[]",
      "avoidedVocabIds[]",
    ],
  },
  {
    name: "CurriculumItem",
    note: "recommendation queue",
    fields: [
      "userId (FK → User)",
      "itemType, referenceItemId",
      "surfaceForm, reading, meaning",
      "cefrLevel, frequencyRank",
      "priority (float), reason",
      "status: queued|introduced|skipped",
    ],
  },
];

const MODEL_W = 280;
const MODEL_GAP = 20;
const MODEL_COLS = 5;

const modelStartY = Z4_Y + 65;  // extra space for multi-tenancy subtitle

models.forEach((m, i) => {
  const col = i % MODEL_COLS;
  const row = Math.floor(i / MODEL_COLS);
  const rowHeight = row === 0 ? 0 : 310; // second row starts lower
  const mx = Z4_X + col * (MODEL_W + MODEL_GAP);
  const my = modelStartY + row * rowHeight;
  const fieldH = m.fields.length * 16 + 12;
  const totalH = 50 + fieldH;

  const { elements: els } = titledBox({
    x: mx, y: my, w: MODEL_W, h: totalH,
    title: m.name,
    titleBg: COLORS.purple, titleBorder: COLORS.purpleBorder,
    bodyBg: "#f8f0ff", bodyBorder: COLORS.purpleBorder,
    bodyLines: m.fields,
  });
  elements.push(...els);
  // Note label
  elements.push(text({ x: mx + MODEL_W - m.note.length * 7 - 8, y: my + 9, content: m.note, size: 10, family: 1, color: "#9775b7" }));
});

// Compute actual Zone 4 bottom from tallest second-row model
const maxRow1Height = models.length > MODEL_COLS
  ? Math.max(...models.slice(MODEL_COLS).map(m => 50 + m.fields.length * 16 + 12))
  : 0;
const Z4_BOTTOM = modelStartY + 310 + maxRow1Height;

// DB Relationships (arrows between models)
// User(col=0) owns all — arrow to right edge
const userRightX = Z4_X + 0 * (MODEL_W + MODEL_GAP) + MODEL_W;
const learnerProfileX = Z4_X + 1 * (MODEL_W + MODEL_GAP);
elements.push(...arrow({
  startX: userRightX, startY: modelStartY + 80,
  endX: learnerProfileX, endY: modelStartY + 80,
  color: COLORS.purpleBorder, strokeW: 1, label: "1:1",
}));

// LexicalItem(col=2) → ReviewEvent(col=4)
const lexItemCenterX = Z4_X + 2 * (MODEL_W + MODEL_GAP) + MODEL_W;
const reviewEventX = Z4_X + 4 * (MODEL_W + MODEL_GAP);
elements.push(...arrow({
  startX: lexItemCenterX, startY: modelStartY + 100,
  endX: reviewEventX, endY: modelStartY + 100,
  color: COLORS.purpleBorder, strokeW: 1, label: "1:N",
}));

// GrammarItem(col=3) → ReviewEvent(col=4)
const grammarCenterX = Z4_X + 3 * (MODEL_W + MODEL_GAP) + MODEL_W;
elements.push(...arrow({
  startX: grammarCenterX, startY: modelStartY + 130,
  endX: reviewEventX, endY: modelStartY + 130,
  color: COLORS.purpleBorder, strokeW: 1, label: "1:N",
}));


// ═══════════════════════════════════════════════════════════════════════════
// ZONE 5 — Data Flow Sequences (below Zone 4)
// ═══════════════════════════════════════════════════════════════════════════

const Z5_X = 60;
const Z5_Y = Z4_BOTTOM + ZONE_GAP;

elements.push(sectionLabel({ x: Z5_X, y: Z5_Y, content: "Zone 5: Key Data Flows" }));

// --- Flow A: Review Submission ---
const flowAX = Z5_X;
const flowAY = Z5_Y + 50;
{
  const { elements: els } = titledBox({
    x: flowAX, y: flowAY, w: 700, h: 310,
    title: "Flow A: Review Submission",
    titleBg: COLORS.blue, titleBorder: COLORS.blueBorder,
    bodyBg: "#f8f9fa", bodyBorder: COLORS.blueBorder,
    bodyLines: [
      " 1. User grades card (e.g. 'Good')",
      " 2. → useReview.submitReview(submission)",
      " 3. → window.linguist.reviewSubmit(submission)",
      " 4. → IPC invoke → electron/ipc/reviews.ts handler",
      " 5. → core/fsrs:    scheduleReview(currentFsrs, 'good')",
      " 6. → core/mastery:  computeNextMasteryState(context)",
      " 7. → Prisma:  UPDATE LexicalItem SET fsrs, masteryState",
      " 8. → Prisma:  CREATE ReviewEvent row",
      " 9. → Prisma:  CREATE ItemContextLog row",
      "10. → (every 10th review) core/profile: recalculateProfile()",
      "11. → Return { newMasteryState, newFsrsState } to renderer",
      "",
      "Total latency: ~5-15ms (all local, no network)",
      "",
      "Key detail: Recognition and production FSRS states",
      "are tracked SEPARATELY per item.",
    ],
  });
  elements.push(...els);
}

// --- Flow B: Full Conversation Session ---
const flowBX = flowAX + 700 + 40;
const flowBY = flowAY;
{
  const { elements: els } = titledBox({
    x: flowBX, y: flowBY, w: 780, h: 590,
    title: "Flow B: Full Conversation Session (4 Claude API Calls)",
    titleBg: COLORS.orange, titleBorder: COLORS.orangeBorder,
    bodyBg: "#fff9f5", bodyBorder: COLORS.orangeBorder,
    bodyLines: [
      "PLAN PHASE — Claude API Call #1",
      "  1. User clicks 'Start Learning' → conversationPlan() IPC",
      "  2. Build learner summary (active items, stable count, pragmatics)",
      "  3. Build ToM brief (avoidance, confusion, modality gaps)",
      "  4. → Claude API: 'You are a session planner...'",
      "  5. Parse JSON: targetVocab, targetGrammar, register, focus",
      "  6. CREATE ConversationSession in DB, store in activeSessions Map",
      "  7. Return ExpandedSessionPlan to renderer",
      "",
      "CONVERSATION PHASE — Claude API Call #2 (per turn)",
      "  8. User types message → conversationSend(sessionId, text) IPC",
      "  9. Retrieve session from activeSessions Map",
      " 10. → Claude API: system prompt + last 30 turns of history",
      " 11. Claude responds in target language (recasting errors)",
      " 12. UPDATE ConversationSession.transcript in DB",
      " 13. Return ConversationMessage to renderer",
      "",
      "END PHASE — Claude API Calls #3 + #4",
      " 14. User clicks 'End' → conversationEnd(sessionId) IPC",
      " 15. → Claude API #3: 'Analyze this transcript...'",
      " 16. Parse: targets hit, errors, avoidance, new items",
      " 17. CREATE ItemContextLog per item interaction",
      " 18. UPDATE items: productionCount, contextTypes, modalities",
      " 19. INSERT new items as 'introduced' mastery state",
      " 20. → Claude API #4: pragmatic analysis (register accuracy)",
      " 21. UPDATE PragmaticProfile in DB",
      " 22. TRIGGER async profile recalculation",
      " 23. DELETE session from activeSessions Map",
      " 24. Return PostSessionAnalysis → renderer shows summary",
    ],
  });
  elements.push(...els);
}

// --- Flow C: ToM Analysis ---
const flowCX = flowAX;
const flowCY = flowAY + 330;
{
  const { elements: els } = titledBox({
    x: flowCX, y: flowCY, w: 700, h: 260,
    title: "Flow C: Theory of Mind Daily Analysis",
    titleBg: COLORS.orange, titleBorder: COLORS.orangeBorder,
    bodyBg: "#fff9f5", bodyBorder: COLORS.orangeBorder,
    bodyLines: [
      "Triggered: after each conversation session or on daily app open",
      "",
      " 1. tom.runAnalysis() IPC → electron/ipc/tom.ts",
      " 2. Fetch all items (journeyman+), recent sessions, recent reviews",
      " 3. → core/tom: detectAvoidance(items, sessions)",
      " 4. → core/tom: detectConfusionPairs(errors across sessions)",
      " 5. → core/tom: detectRegression(items, recentReviews)",
      " 6. → core/tom: detectModalityGap(items)",
      " 7. UPSERT TomInference rows (create new / update existing)",
      " 8. Mark resolved inferences as resolved=true",
      " 9. generateExpandedDailyBrief(allInferences)",
      "10. Return ExpandedTomBrief (consumed by conversation planner)",
      "",
      "Output feeds directly into Flow B, step 3.",
    ],
  });
  elements.push(...els);
}

// --- Flow D: Onboarding ---
const flowDX = flowAX;
const flowDY = flowCY + 280;
{
  const { elements: els } = titledBox({
    x: flowDX, y: flowDY, w: 700, h: 340,
    title: "Flow D: New User Onboarding (6-step wizard)",
    titleBg: COLORS.blue, titleBorder: COLORS.blueBorder,
    bodyBg: "#f8f9fa", bodyBorder: COLORS.blueBorder,
    bodyLines: [
      "Steps: welcome → language → level → assessment → preferences → complete",
      "",
      " 1. User signs in (Google PKCE) → ensureDbUser() upserts User row",
      " 2. AuthProvider checks user.onboardingCompleted — gates app if false",
      " 3. WelcomeStep: greet by name (from auth)",
      " 4. LanguageStep: select native language (target = Japanese fixed)",
      " 5. LevelStep: self-report JLPT (Beginner/N5/N4/N3/N2/N1)",
      " 6. AssessmentStep:",
      "    → onboardingGetAssessment(level) IPC → core/onboarding",
      "    → getAssessmentItemsForLevel(): 15-33 items (tap to mark known)",
      " 7. PreferencesStep: daily new item limit slider (3-30, default 10)",
      " 8. CompleteStep → onboardingComplete(result) IPC:",
      "    → CREATE LearnerProfile + PragmaticProfile",
      "    → Known items seeded as apprentice_2 (FSRS pre-initialized)",
      "    → Unknown items seeded as unseen",
      "    → Lower-level items (not in test) seeded as introduced",
      "    → User.onboardingCompleted = true",
      "    → AuthProvider.needsOnboarding = false → main app loads",
    ],
  });
  elements.push(...els);
}


// ═══════════════════════════════════════════════════════════════════════════
// ZONE 6 — External Dependencies & Shared Types (top-left area)
// ═══════════════════════════════════════════════════════════════════════════

const Z6_X = 60;
const Z6_Y = 60;
const Z6_W = 300;

elements.push(sectionLabel({ x: Z6_X, y: Z6_Y, content: "Zone 6: External Systems" }));

// Claude API
{
  const { elements: els } = titledBox({
    x: Z6_X, y: Z6_Y + 48, w: Z6_W, h: 200,
    title: "Claude API  (Anthropic SDK)",
    titleBg: COLORS.orange, titleBorder: COLORS.orangeBorder,
    bodyBg: "#fff9f5", bodyBorder: COLORS.orangeBorder,
    bodyLines: [
      "@anthropic-ai/sdk + @ai-sdk/anthropic",
      "",
      "4 call types per session:",
      "  1. Session planning (JSON out)",
      "  2. Conversation turns (streaming)",
      "  3. Post-session analysis (JSON out)",
      "  4. Pragmatic analysis (JSON out)",
      "",
      "+ General chat (Vercel AI SDK stream)",
    ],
  });
  elements.push(...els);
}

// Supabase (Hosted)
{
  const { elements: els } = titledBox({
    x: Z6_X, y: Z6_Y + 260, w: Z6_W, h: 200,
    title: "Supabase  (Hosted Postgres + Auth)",
    titleBg: COLORS.purple, titleBorder: COLORS.purpleBorder,
    bodyBg: "#f8f0ff", bodyBorder: COLORS.purpleBorder,
    bodyLines: [
      "Hosted Supabase instance",
      "Prisma ORM for all DB access",
      "",
      "Auth Service (Google OAuth PKCE):",
      "  /auth/v1/token (code exchange)",
      "  /auth/v1/token (refresh)",
      "  /auth/v1/logout",
      "",
      "Session persisted to disk as JSON",
      "  {userData}/auth/session.json",
    ],
  });
  elements.push(...els);
}

// ts-fsrs
{
  const { elements: els } = titledBox({
    x: Z6_X, y: Z6_Y + 472, w: Z6_W, h: 110,
    title: "ts-fsrs  (Local Scheduling)",
    titleBg: COLORS.green, titleBorder: COLORS.greenBorder,
    bodyBg: "#f0faf0", bodyBorder: COLORS.greenBorder,
    bodyLines: [
      "Open-source FSRS implementation",
      "Runs 100% locally, no network",
      "Pre-trained on 700M reviews",
      "Per-user tuning after ~50 reviews",
    ],
  });
  elements.push(...els);
}

// Electron + Vite
{
  const { elements: els } = titledBox({
    x: Z6_X, y: Z6_Y + 594, w: Z6_W, h: 110,
    title: "Electron 34 + Vite",
    titleBg: COLORS.gray, titleBorder: COLORS.grayBorder,
    bodyBg: "#f8f9fa", bodyBorder: COLORS.grayBorder,
    bodyLines: [
      "Desktop framework (cross-platform)",
      "electron-vite for build tooling",
      "Single package.json (not monorepo)",
      "Dev server for hot reload",
    ],
  });
  elements.push(...els);
}


// ═══════════════════════════════════════════════════════════════════════════
// SHARED TYPES — floating box
// ═══════════════════════════════════════════════════════════════════════════

const STX = Z1_X + Z1_W + 50;
const STY = Z1_Y + 40;
{
  const { elements: els } = titledBox({
    x: STX, y: STY, w: 400, h: 400,
    title: "shared/types.ts",
    titleBg: COLORS.yellow, titleBorder: COLORS.yellowBorder,
    bodyBg: "#fffbeb", bodyBorder: COLORS.yellowBorder,
    bodyLines: [
      "ONLY file importable from ALL layers",
      "Types and enums ONLY — no logic",
      "",
      "State Machine:",
      "  MasteryState, ReviewGrade, ReviewModality",
      "  ItemType, LearningModality, ContextType",
      "",
      "FSRS:",
      "  FsrsState { due, stability, difficulty, ... }",
      "",
      "IPC:",
      "  IPC_CHANNELS (50+ method constants)",
      "  IpcChannel (union type)",
      "",
      "Auth & Onboarding:",
      "  AuthUser { id, email, name, avatarUrl,",
      "             onboardingCompleted }",
      "  SelfReportedLevel, OnboardingResult",
      "  AssessmentItem",
      "",
      "Payloads:",
      "  ReviewSubmission, ReviewQueueItem",
      "  ConversationMessage, SessionPlan",
      "  PostSessionAnalysis, ExpandedTomBrief",
      "  KnowledgeBubble, CurriculumRecommendation",
    ],
  });
  elements.push(...els);
}

// Dashed lines from shared/types to all zones
elements.push(line({ startX: STX, startY: STY + 175, endX: Z1_X + Z1_W + 10, endY: STY + 175, color: COLORS.yellowBorder }));


// ═══════════════════════════════════════════════════════════════════════════
// MASTERY STATE MACHINE — detailed inline diagram
// ═══════════════════════════════════════════════════════════════════════════

const SMX = flowBX;
const SMY = flowBY + 610;

elements.push(sectionLabel({ x: SMX, y: SMY, content: "Mastery State Machine (Detail)" }));

const states = [
  { name: "unseen", x: 0 },
  { name: "introduced", x: 130 },
  { name: "app_1", x: 260 },
  { name: "app_2", x: 350 },
  { name: "app_3", x: 440 },
  { name: "app_4", x: 530 },
  { name: "journeyman", x: 660 },
  { name: "expert", x: 790 },
  { name: "master", x: 900 },
  { name: "burned", x: 1010 },
];

const stateY = SMY + 50;
const stateH = 32;

states.forEach((s) => {
  const sw = s.name.length * 10 + 16;
  elements.push(rect({
    x: SMX + s.x, y: stateY, w: sw, h: stateH,
    bg: s.name === "burned" ? "#f0faf0" : s.name.startsWith("app_") ? COLORS.blue : s.name === "unseen" ? COLORS.gray : COLORS.green,
    border: s.name === "burned" ? COLORS.greenBorder : s.name.startsWith("app_") ? COLORS.blueBorder : s.name === "unseen" ? COLORS.grayBorder : COLORS.greenBorder,
    fill: "solid", rough: 0, radius: 6,
  }));
  elements.push(text({ x: SMX + s.x + 8, y: stateY + 7, content: s.name, size: 12, family: 3 }));
});

// Arrows between states
for (let i = 0; i < states.length - 1; i++) {
  const from = states[i];
  const to = states[i + 1];
  const fromW = from.name.length * 10 + 16;
  elements.push(...arrow({
    startX: SMX + from.x + fromW, startY: stateY + stateH / 2,
    endX: SMX + to.x, endY: stateY + stateH / 2,
    color: "#495057", strokeW: 1,
  }));
}

// Gate labels
const gateLabels = [
  { x: states[5].x + 40, label: "GATE: productionWeight >= 1.0" },
  { x: states[6].x + 60, label: "GATE: contextCount >= 3" },
  { x: states[7].x + 50, label: "GATE: novelContextCount >= 2 (grammar)" },
];
gateLabels.forEach((g) => {
  elements.push(text({ x: SMX + g.x - 30, y: stateY - 22, content: g.label, size: 10, family: 3, color: COLORS.orangeBorder }));
});

// Demotion arrow (curving below)
elements.push(text({ x: SMX + 450, y: stateY + stateH + 10, content: "↩ grade=again → back one state (demotion)", size: 11, family: 1, color: COLORS.redBorder }));
elements.push(text({ x: SMX + 450, y: stateY + stateH + 28, content: "→ grade=hard → no change (stays in current state)", size: 11, family: 1, color: "#868e96" }));


// ═══════════════════════════════════════════════════════════════════════════
// ARCHITECTURE RULES — callout box
// ═══════════════════════════════════════════════════════════════════════════

const ARX = Z6_X;
const ARY = Z6_Y + 720;

{
  const { elements: els } = titledBox({
    x: ARX, y: ARY, w: 300, h: 230,
    title: "Structural Rules (Enforced)",
    titleBg: COLORS.red, titleBorder: COLORS.redBorder,
    bodyBg: "#fff5f5", bodyBorder: COLORS.redBorder,
    bodyLines: [
      "1. src/ NEVER imports from",
      "   electron/ or core/",
      "   (all access via IPC)",
      "",
      "2. core/ has ZERO deps on",
      "   Electron, React, or Prisma",
      "   (pure functions only)",
      "",
      "3. electron/ipc/ is the ONLY",
      "   layer that touches Prisma",
      "",
      "4. shared/types.ts is the ONLY",
      "   file importable everywhere",
    ],
  });
  elements.push(...els);
}

// ═══════════════════════════════════════════════════════════════════════════
// V2 EXPANSION — placeholder
// ═══════════════════════════════════════════════════════════════════════════

const V2X = ARX;
const V2Y = ARY + 250;  // below Structural Rules

{
  const { elements: els } = titledBox({
    x: V2X, y: V2Y, w: 300, h: 180,
    title: "V2 Expansion Points",
    titleBg: "#f8f9fa", titleBorder: "#adb5bd",
    bodyBg: "#f8f9fa", bodyBorder: "#adb5bd",
    bodyLines: [
      "□ Voice pipeline (STT → LLM → TTS)",
      "□ Reading assist / hover-lookup",
      "□ Supabase Auth integration",
      "□ Cloud sync (Supabase realtime)",
      "□ Multi-language corpus support",
      "□ Local model inference",
      "□ Community vocabulary lists",
      "",
      "Expand each into its own zone",
      "as implementation begins.",
    ],
  });
  elements.push(...els);
}


// ═══════════════════════════════════════════════════════════════════════════
// ASSEMBLE & WRITE
// ═══════════════════════════════════════════════════════════════════════════

const excalidrawFile = {
  type: "excalidraw",
  version: 2,
  source: "linguist-architecture-generator",
  elements,
  appState: {
    gridSize: 20,
    gridStep: 5,
    gridModeEnabled: false,
    viewBackgroundColor: "#ffffff",
    zoom: { value: 0.6 },
    scrollX: 0,
    scrollY: 0,
  },
  files: {},
};

const outPath = new URL("../architecture.excalidraw", import.meta.url).pathname;
writeFileSync(outPath, JSON.stringify(excalidrawFile, null, 2));
console.log(`✓ Wrote ${elements.length} elements to ${outPath}`);
console.log("  Open in https://excalidraw.com or the VS Code Excalidraw extension.");
