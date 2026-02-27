#!/usr/bin/env node
/**
 * Linguist Architecture Diagram Generator (v3 — Curriculum Engine)
 * Generates a comprehensive .excalidraw file representing the full codebase architecture.
 *
 * Updated: 2026-02-26 to reflect curriculum spine system, multi-word units, and authoritative corpus.
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
  teal: "#96f2d7",       // web app (Next.js)
  tealBorder: "#0ca678",
  white: "#ffffff",
  transparent: "transparent",
};

/**
 * Auto-calculate the correct box height for a titledBox given its body lines.
 *   headerH = 36
 *   body text top padding = 10
 *   text height = lines * fontSize(13) * lineHeight(1.35) + 4
 *   bottom padding = 18
 */
function autoH(lineCount) {
  return 36 + 10 + Math.ceil(lineCount * 13 * 1.35) + 4 + 18;
}

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
  labelOffsetX = 6,
  labelOffsetY = -20,
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
    elements.push(text({ x: midX + labelOffsetX, y: midY + labelOffsetY, content: label, size: 12, family: 3, color: "#868e96" }));
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
  const bodyPadTop = 10;
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
    elements.push(text({ x: x + 12, y: y + headerH + bodyPadTop, content: bodyText, size: 13, family: 3, groupIds: allGroupIds }));
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
const ARROW_GAP = 25;   // gap between box edge and arrow start/end
const ARROW_LEN = 50;   // arrow shaft length

// ─── Build the diagram ──────────────────────────────────────────────────────

const elements = [];

// ═══════════════════════════════════════════════════════════════════════════
// ZONE 0 — Monorepo Overview (top banner)
// ═══════════════════════════════════════════════════════════════════════════

const Z0_X = 60;
const Z0_Y = 60;
const Z0_W = 1840;

elements.push(sectionLabel({ x: Z0_X, y: Z0_Y, content: "Linguist — Turborepo + pnpm Monorepo Architecture" }));
elements.push(text({ x: Z0_X, y: Z0_Y + 42, content: "Multi-platform language learning agent: Desktop (Electron) + Web (Next.js) sharing core business logic", size: 14, family: 1, color: "#868e96" }));

// Workspace layout box
const z0BodyLines = [
  'linguist/                          Turborepo root — orchestrates build, dev, typecheck across all packages',
  '├── apps/',
  '│   ├── desktop/   @linguist/desktop     Electron 34 + electron-vite + React 19   (apps/desktop/electron/ + apps/desktop/src/)',
  '│   └── web/       @linguist/web          Next.js 15 + App Router + Turbopack      (apps/web/app/ + apps/web/lib/)',
  '├── packages/',
  '│   ├── core/      @linguist/core         Pure TS business logic (FSRS, mastery, ToM, conversation, curriculum engine + spine, pragmatics, onboarding)',
  '│   ├── shared/    @linguist/shared        TypeScript types + enums only — importable everywhere',
  '│   └── db/        @linguist/db            Prisma client singleton + schema + migrations',
  '├── prisma/                                schema.prisma, migrations/, seed.ts',
  '└── supabase/                              Supabase CLI config (config.toml)',
];
const Z0_BOX_H = autoH(z0BodyLines.length);
{
  const { elements: els } = titledBox({
    x: Z0_X, y: Z0_Y + 74, w: Z0_W, h: Z0_BOX_H,
    title: "Workspace Structure  (pnpm-workspace.yaml + turbo.json)",
    titleBg: COLORS.gray, titleBorder: COLORS.grayBorder,
    bodyBg: "#f8f9fa", bodyBorder: COLORS.grayBorder,
    bodyLines: z0BodyLines,
  });
  elements.push(...els);
}

const Z0_BOTTOM = Z0_Y + 74 + Z0_BOX_H;


// ═══════════════════════════════════════════════════════════════════════════
// ZONE 1 — Platform Apps (side by side: Desktop | Web)
// ═══════════════════════════════════════════════════════════════════════════

const Z1_X = 60;
const Z1_Y = Z0_BOTTOM + ZONE_GAP;
const Z1_HALF_W = 880;
const Z1_GAP = 80;

elements.push(sectionLabel({ x: Z1_X, y: Z1_Y, content: "Zone 1: Platform Apps" }));

// --- Desktop App (left) ---
const desktopX = Z1_X;
const desktopY = Z1_Y + 50;

const desktopRendererLines = [
  "React 19  +  Radix UI  +  Tailwind CSS  +  electron-vite",
  "",
  "Pages:   Dashboard | Review | Learn | Knowledge | Chat | Settings | SignIn | Onboarding",
  "",
  "Hooks:   useReview | useConversation | useFrontier | useWordbank",
  "         All call window.linguist.xxx() (IPC bridge — never direct DB access)",
  "",
  "State:   AuthProvider (Context) — user, needsOnboarding, completeOnboarding()",
  "Routing: Auth gate -> Onboarding gate -> App Shell (sidebar nav)",
];
const desktopRendererH = autoH(desktopRendererLines.length);
{
  const { elements: els } = titledBox({
    x: desktopX, y: desktopY, w: Z1_HALF_W, h: desktopRendererH,
    title: "DESKTOP — Electron Renderer  (apps/desktop/src/)",
    titleBg: COLORS.blue, titleBorder: COLORS.blueBorder,
    bodyBg: "#f8f9fa", bodyBorder: COLORS.blueBorder,
    bodyLines: desktopRendererLines,
  });
  elements.push(...els);
}

// IPC Bridge Arrow
const desktopBridgeY = desktopY + desktopRendererH + ARROW_GAP;
elements.push(...arrow({
  startX: desktopX + Z1_HALF_W / 2, startY: desktopBridgeY,
  endX: desktopX + Z1_HALF_W / 2, endY: desktopBridgeY + ARROW_LEN,
  color: COLORS.redBorder, strokeW: 3,
  label: "window.linguist.xxx() -> ipcRenderer.invoke()", labelOffsetX: 10, labelOffsetY: -20,
}));

// Preload Bridge
const preloadLines = [
  "contextBridge.exposeInMainWorld('linguist', api)",
  "Auto-generates camelCase API from IPC_CHANNELS — 50+ methods",
];
const preloadH = autoH(preloadLines.length);
const preloadY = desktopBridgeY + ARROW_LEN + ARROW_GAP;
{
  const { elements: els } = titledBox({
    x: desktopX, y: preloadY, w: Z1_HALF_W, h: preloadH,
    title: "PRELOAD BRIDGE  (apps/desktop/electron/preload.ts)",
    titleBg: COLORS.red, titleBorder: COLORS.redBorder,
    bodyBg: "#fff5f5", bodyBorder: COLORS.redBorder,
    bodyLines: preloadLines,
  });
  elements.push(...els);
}

// IPC Arrow to Main
const mainArrowY = preloadY + preloadH + ARROW_GAP;
elements.push(...arrow({
  startX: desktopX + Z1_HALF_W / 2, startY: mainArrowY,
  endX: desktopX + Z1_HALF_W / 2, endY: mainArrowY + ARROW_LEN,
  color: COLORS.redBorder, strokeW: 3,
  label: "ipcMain.handle(channel, handler)", labelOffsetX: 10, labelOffsetY: -20,
}));

// Main Process
const mainLines = [
  "electron/main.ts         App entry, window management, registers 14 handler groups",
  "electron/db.ts           PrismaClient singleton (getDb() / disconnectDb())",
  "electron/auth-state.ts   In-memory userId singleton (set on login, cleared on logout)",
  "electron/logger.ts       Logging utility",
  "electron/ipc/            14 domain handler files -> calls @linguist/core",
  "",
  "In-memory:  activeSessions Map + currentUserId (auth-state)",
  "Pattern:    Handler -> getCurrentUserId() -> @linguist/core functions -> Prisma writes",
];
const mainH = autoH(mainLines.length);
const mainY = mainArrowY + ARROW_LEN + ARROW_GAP;
{
  const { elements: els } = titledBox({
    x: desktopX, y: mainY, w: Z1_HALF_W, h: mainH,
    title: "MAIN PROCESS  (apps/desktop/electron/)",
    titleBg: COLORS.gray, titleBorder: COLORS.grayBorder,
    bodyBg: "#f8f9fa", bodyBorder: COLORS.grayBorder,
    bodyLines: mainLines,
  });
  elements.push(...els);
}

const desktopBottom = mainY + mainH;

// --- Web App (right) ---
const webX = desktopX + Z1_HALF_W + Z1_GAP;
const webY = desktopY;

const webClientLines = [
  "React 19  +  Radix UI  +  Tailwind CSS  +  Turbopack  +  App Router",
  "",
  "MVP Surfaces:  Conversation (primary) | Knowledge Base (3 tabs) | History (annotated transcripts)",
  "Other Pages:   Settings | SignIn | Onboarding   (Dashboard/Review/Learn/Chat/Insights hidden from nav)",
  "",
  "Hooks:   useReview | useConversation | useFrontier | useWordbank | useGrammar | useChunks",
  "         All call lib/api.ts fetch wrapper (never direct DB access)",
  "",
  "Components:  VocabCard | GrammarCard | CorrectionCard | ReviewPromptCard",
  "             ChallengeCard | SessionSummaryCard | AnnotatedMessage | SessionAnalysisPanel",
  "             MessageBubble | MasteryBadge | Skeleton | Spinner",
  "",
  "State:   Supabase SSR auth (cookie-based via @supabase/ssr)",
  "Routing: middleware.ts -> / and /dashboard redirect to /conversation",
];
const webClientH = autoH(webClientLines.length);
{
  const { elements: els } = titledBox({
    x: webX, y: webY, w: Z1_HALF_W, h: webClientH,
    title: "WEB — Next.js 15 Client  (apps/web/app/)",
    titleBg: COLORS.teal, titleBorder: COLORS.tealBorder,
    bodyBg: "#f0fdf8", bodyBorder: COLORS.tealBorder,
    bodyLines: webClientLines,
  });
  elements.push(...els);
}

// HTTP Arrow
const webBridgeY = webY + webClientH + ARROW_GAP;
elements.push(...arrow({
  startX: webX + Z1_HALF_W / 2, startY: webBridgeY,
  endX: webX + Z1_HALF_W / 2, endY: webBridgeY + ARROW_LEN,
  color: COLORS.tealBorder, strokeW: 3,
  label: "fetch('/api/xxx')  ->  Next.js API route handler", labelOffsetX: 10, labelOffsetY: -20,
}));

// Auth middleware
const webMiddlewareLines = [
  "middleware.ts            Route protection, cookie refresh, default route redirect",
  "lib/supabase/client.ts   Browser-side Supabase client",
  "lib/supabase/server.ts   Server-side Supabase client (cookie-based)",
  "lib/api.ts               Typed fetch wrapper + SSE streaming consumer for all API routes",
  "lib/message-parser.ts    Regex parser for [VOCAB_CARD] [GRAMMAR_CARD] [CORRECTION] etc.",
];
const webMiddlewareH = autoH(webMiddlewareLines.length);
const webMiddlewareY = webBridgeY + ARROW_LEN + ARROW_GAP;
{
  const { elements: els } = titledBox({
    x: webX, y: webMiddlewareY, w: Z1_HALF_W, h: webMiddlewareH,
    title: "AUTH & MIDDLEWARE  (apps/web/)",
    titleBg: COLORS.red, titleBorder: COLORS.redBorder,
    bodyBg: "#fff5f5", bodyBorder: COLORS.redBorder,
    bodyLines: webMiddlewareLines,
  });
  elements.push(...els);
}

// Arrow to API routes
const webApiArrowY = webMiddlewareY + webMiddlewareH + ARROW_GAP;
elements.push(...arrow({
  startX: webX + Z1_HALF_W / 2, startY: webApiArrowY,
  endX: webX + Z1_HALF_W / 2, endY: webApiArrowY + ARROW_LEN,
  color: COLORS.tealBorder, strokeW: 3,
  label: "Next.js API Route handlers -> @linguist/core + @linguist/db", labelOffsetX: 10, labelOffsetY: -20,
}));

// API Routes
const webApiLines = [
  "/api/review/       queue, submit, summary       /api/tom/          analyze, brief, inferences",
  "/api/wordbank/     GET/POST, [id], search       /api/curriculum/   bubble, recommendations, ...",
  "/api/wordbank/[id]/promote  POST               /api/grammar/[id]/promote  POST",
  "/api/conversation/ plan, send(SSE), end, list   /api/narrative/    draft, polish",
  "/api/conversation/[id]  GET (full session)      /api/profile/      GET/PUT, recalculate",
  "/api/grammar/      GET (list + search)          /api/context-log/  POST",
  "/api/chunks/       GET (list + search)          /api/onboarding/   status, assessment, complete",
  "/api/chat/         POST (streaming)             /api/dashboard/    frontier, weekly-stats",
  "/api/pragmatic/    GET/PUT                      /api/user/         me",
  "",
  "Every route: getSupabaseUser() -> @linguist/core functions -> @linguist/db Prisma writes",
  "conversation/send: SSE streaming via anthropic.messages.stream() -> ReadableStream",
];
const webApiH = autoH(webApiLines.length);
const webApiY = webApiArrowY + ARROW_LEN + ARROW_GAP;
{
  const { elements: els } = titledBox({
    x: webX, y: webApiY, w: Z1_HALF_W, h: webApiH,
    title: "API ROUTES  (apps/web/app/api/)  — 35+ routes",
    titleBg: COLORS.teal, titleBorder: COLORS.tealBorder,
    bodyBg: "#f0fdf8", bodyBorder: COLORS.tealBorder,
    bodyLines: webApiLines,
  });
  elements.push(...els);
}

const webBottom = webApiY + webApiH;

// --- Parity callout between Desktop and Web ---
const parityLines = [
  "Desktop IPC handlers and Web API routes",
  "call identical @linguist/core logic",
];
const parityH = autoH(parityLines.length);
const parityY = Math.max(desktopBottom, webBottom) + 30;
const parityW = Z1_GAP + 240;
const parityX = desktopX + Z1_HALF_W - 120;
{
  const { elements: els } = titledBox({
    x: parityX, y: parityY, w: parityW, h: parityH,
    title: "FEATURE PARITY",
    titleBg: COLORS.yellow, titleBorder: COLORS.yellowBorder,
    bodyBg: "#fffbeb", bodyBorder: COLORS.yellowBorder,
    bodyLines: parityLines,
  });
  elements.push(...els);
}

// Dashed lines from parity box to both sides (no arrowheads — use line not arrow)
elements.push(line({ startX: parityX - 10, startY: parityY + parityH / 2, endX: parityX - 70, endY: parityY + parityH / 2, color: COLORS.yellowBorder }));
elements.push(line({ startX: parityX + parityW + 10, startY: parityY + parityH / 2, endX: parityX + parityW + 70, endY: parityY + parityH / 2, color: COLORS.yellowBorder }));

const Z1_BOTTOM = parityY + parityH;


// ═══════════════════════════════════════════════════════════════════════════
// ZONE 2 — Data Access Layers (side by side: IPC Handlers | API Routes)
// ═══════════════════════════════════════════════════════════════════════════

const Z2_X = 60;
const Z2_Y = Z1_BOTTOM + ZONE_GAP;
const Z2_W = 720;

elements.push(sectionLabel({ x: Z2_X, y: Z2_Y, content: "Zone 2: Desktop IPC Handlers", size: 24 }));
elements.push(text({ x: Z2_X, y: Z2_Y + 32, content: "apps/desktop/electron/ipc/ — 14 handlers", size: 13, family: 3, color: "#868e96" }));

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
const HANDLER_ROW_H = 76;
const HANDLER_GAP_X = 30;
const HANDLER_GAP_Y = 14;
const HANDLER_COLS = 2;

handlers.forEach((h, i) => {
  const col = i % HANDLER_COLS;
  const row = Math.floor(i / HANDLER_COLS);
  const hx = Z2_X + col * (HANDLER_COL_W + HANDLER_GAP_X);
  const hy = Z2_Y + 56 + row * (HANDLER_ROW_H + HANDLER_GAP_Y);

  elements.push(rect({ x: hx, y: hy, w: HANDLER_COL_W, h: HANDLER_ROW_H, bg: h.color, border: h.border, fill: "solid", rough: 0 }));
  elements.push(text({ x: hx + 10, y: hy + 8, content: h.name, size: 14, family: 3, bold: true, color: h.border }));
  elements.push(text({ x: hx + 10, y: hy + 30, content: h.methods, size: 11, family: 3, color: "#495057" }));
  elements.push(text({ x: hx + 10, y: hy + 54, content: h.category, size: 10, family: 1, color: "#868e96" }));
});

// Color legend
const legendY = Z2_Y + 56 + Math.ceil(handlers.length / HANDLER_COLS) * (HANDLER_ROW_H + HANDLER_GAP_Y) + 20;
const legendItems = [
  { label: "Learning Core", color: COLORS.blue, border: COLORS.blueBorder },
  { label: "Profile / Analytics", color: COLORS.green, border: COLORS.greenBorder },
  { label: "AI-Powered (Claude)", color: COLORS.orange, border: COLORS.orangeBorder },
  { label: "Infrastructure", color: COLORS.gray, border: COLORS.grayBorder },
];
elements.push(text({ x: Z2_X, y: legendY, content: "Legend:", size: 12, family: 1, color: "#868e96" }));
legendItems.forEach((li, i) => {
  const lx = Z2_X + 60 + i * 180;
  elements.push(rect({ x: lx, y: legendY - 2, w: 14, h: 14, bg: li.color, border: li.border, fill: "solid", rough: 0, radius: 3 }));
  elements.push(text({ x: lx + 22, y: legendY - 1, content: li.label, size: 11, family: 1, color: "#495057" }));
});

const Z2_BOTTOM = legendY + 30;

// --- Web API Routes Summary (right of Zone 2) ---
const WR_X = Z2_X + Z2_W + 60;
const WR_Y = Z2_Y;

elements.push(sectionLabel({ x: WR_X, y: WR_Y, content: "Zone 2b: Web API Routes", size: 24 }));
elements.push(text({ x: WR_X, y: WR_Y + 32, content: "apps/web/app/api/ — 35+ routes. 1:1 parity with desktop IPC + MVP additions. Same @linguist/core calls.", size: 13, family: 3, color: "#868e96" }));

const apiRouteGroups = [
  { route: "/api/review/", methods: "queue  submit  summary", maps: "reviews.ts" },
  { route: "/api/wordbank/", methods: "GET/POST  [id]  search  [id]/promote", maps: "wordbank.ts" },
  { route: "/api/grammar/", methods: "GET (list + search)  [id]/promote", maps: "grammar.ts" },
  { route: "/api/chunks/", methods: "GET (list + search by kind)", maps: "chunks.ts" },
  { route: "/api/conversation/", methods: "plan  send(SSE)  end  list  [id]", maps: "conversation.ts" },
  { route: "/api/chat/", methods: "POST (Vercel AI SDK streaming)", maps: "chat.ts" },
  { route: "/api/tom/", methods: "analyze  brief  inferences", maps: "tom.ts" },
  { route: "/api/curriculum/", methods: "bubble  recommendations  introduce  skip  regenerate", maps: "curriculum.ts" },
  { route: "/api/narrative/", methods: "draft  polish", maps: "narrative.ts" },
  { route: "/api/profile/", methods: "GET/PUT  recalculate", maps: "profile.ts" },
  { route: "/api/pragmatic/", methods: "GET/PUT", maps: "pragmatics.ts" },
  { route: "/api/context-log/", methods: "POST", maps: "context-log.ts" },
  { route: "/api/dashboard/", methods: "frontier  weekly-stats", maps: "dashboard.ts" },
  { route: "/api/onboarding/", methods: "status  assessment  complete (+ chunk seeding)", maps: "onboarding.ts" },
  { route: "/api/user/", methods: "me", maps: "auth.ts" },
];

const API_ROW_H = 58;
const API_COL_W = 520;
const API_GAP_Y = 10;

apiRouteGroups.forEach((r, i) => {
  const ry = WR_Y + 66 + i * (API_ROW_H + API_GAP_Y);

  elements.push(rect({ x: WR_X, y: ry, w: API_COL_W, h: API_ROW_H, bg: COLORS.teal, border: COLORS.tealBorder, fill: "solid", rough: 0 }));
  elements.push(text({ x: WR_X + 10, y: ry + 8, content: r.route, size: 13, family: 3, bold: true, color: COLORS.tealBorder }));
  elements.push(text({ x: WR_X + 10, y: ry + 30, content: r.methods, size: 11, family: 3, color: "#495057" }));
  elements.push(text({ x: WR_X + API_COL_W - 120, y: ry + 30, content: `maps: ${r.maps}`, size: 10, family: 3, color: "#868e96" }));
});

const WR_BOTTOM = WR_Y + 66 + apiRouteGroups.length * (API_ROW_H + API_GAP_Y);


// ═══════════════════════════════════════════════════════════════════════════
// ZONE 3 — Shared Packages (below Zone 2 and Zone 2b)
// ═══════════════════════════════════════════════════════════════════════════

const Z3_X = 60;
const Z3_Y = Math.max(Z2_BOTTOM, WR_BOTTOM) + ZONE_GAP;
const Z3_W = 620;

elements.push(sectionLabel({ x: Z3_X, y: Z3_Y, content: "Zone 3: @linguist/core  (packages/core/src/)" }));
elements.push(text({ x: Z3_X, y: Z3_Y + 38, content: "Pure TypeScript functions. Zero imports from Electron, React, Next.js, or Prisma. Data in -> data out.", size: 12, family: 1, color: "#868e96" }));

const coreModules = [
  {
    name: "core/fsrs/scheduler.ts",
    bg: COLORS.green, border: COLORS.greenBorder,
    lines: [
      "createInitialFsrsState() -> FsrsState",
      "scheduleReview(state, grade) -> { nextState, interval }",
      "computeReviewQueue(items) -> sorted due items[]",
      "",
      "Uses: ts-fsrs library | Target retention: 0.90",
      "Grade map: again->1 hard->2 good->3 easy->4",
    ],
  },
  {
    name: "core/mastery/state-machine.ts",
    bg: COLORS.green, border: COLORS.greenBorder,
    lines: [
      "computeNextMasteryState(context) -> nextState",
      "",
      "States: unseen -> introduced -> app_1 -> app_2",
      "  -> app_3 -> app_4 ->[GATE]-> journeyman",
      "  ->[GATE]-> expert ->[GATE]-> master -> burned",
      "",
      "Gates:",
      "  app_4 -> journeyman:  productionWeight >= 1.0",
      "  journeyman -> expert: contextCount >= 3",
      "  expert -> master:     novelContextCount >= 2",
      "Demotion: grade=again -> back one state",
    ],
  },
  {
    name: "core/conversation/  (planner.ts + analyzer.ts)",
    bg: COLORS.orange, border: COLORS.orangeBorder,
    lines: [
      "buildPlanningPrompt(summary, brief) -> prompt",
      "parseSessionPlan(response) -> ExpandedSessionPlan (incl. cardBudget)",
      "buildConversationSystemPrompt(plan) -> system prompt",
      "  Includes structured card instructions:",
      "  [VOCAB_CARD] [GRAMMAR_CARD] [CORRECTION] [REVIEW_PROMPT]",
      "  [TARGETS_HIT: item1, item2] metadata per response",
      "  Card budget: <20 items->5, 20-80->3, 80+->1",
      "  Turn 20 wind-down (no new items after)",
      "buildAnalysisPrompt(transcript, plan) -> prompt",
      "parseAnalysis(response) -> PostSessionAnalysis",
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
      "  -> journeyman 3+ sessions, 0 conversation production",
      "detectConfusionPairs(errors)",
      "  -> item pairs co-occurring in errors >=2x",
      "detectRegression(items, reviews)",
      "  -> expert/master with again/hard in last 3 reviews",
      "detectModalityGap(items)",
      "  -> retrievability gap between modalities",
      "generateExpandedDailyBrief() -> ExpandedTomBrief",
    ],
  },
  {
    name: "core/profile/calculator.ts",
    bg: COLORS.green, border: COLORS.greenBorder,
    lines: [
      "recalculateProfile(items) -> ProfileUpdate",
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
    name: "core/curriculum/  (planner + spine-loader + recommender + bubble + reference-data)",
    bg: COLORS.green, border: COLORS.greenBorder,
    lines: [
      "planner.ts — generateCurriculumPlan(input) -> CurriculumPlan",
      "  computePacing() | filterByPrerequisites() | balanceVariety()",
      "  applyGrammarCap() | identifyReviewFocus() | checkLevelProgression()",
      "  generateSpineAwarePlan() OR generateFrequencyRecommendations()",
      "",
      "spine-loader.ts — loadCurriculumSpine() (cached JSON)",
      "  getNextUnit() | getUnitProgress() | evaluateChunkTriggers()",
      "  getSpineBoosts() -> score boosts for current unit items",
      "",
      "recommender.ts — generateRecommendations(gaps, tom, items, spineBoosts?)",
      "  -> CurriculumRecommendation[] (freq + gap + ToM + spine boost)",
      "",
      "bubble.ts — computeKnowledgeBubble(items, corpus)",
      "  -> levelBreakdowns[] (5 item types), currentLevel, frontierLevel, gaps",
      "  Level-up: 80% coverage -> seed frontier level items",
      "",
      "reference-data.ts — Unified corpus loader (JMDict + JLPT grammar)",
      "  5 item types: vocabulary, grammar, collocations, chunks, pragmatic formulas",
      "  data/vocabulary.json (117K lines, JMDict-sourced)",
      "  data/grammar.json (10K lines, jlptsensei-sourced)",
      "  data/collocations.json | chunks.json | pragmatic-formulas.json",
      "  data/curriculum-spine.json (unit-based pedagogical ordering)",
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
    name: "core/onboarding/  (assessment-data.ts + index.ts)",
    bg: COLORS.blue, border: COLORS.blueBorder,
    lines: [
      "Assessment candidates sourced from reference corpus",
      "getAssessmentCandidates(jlptLevel?) -> curated items by level",
      "getLevelCefrMapping() -> JLPT<->CEFR map",
      "",
      "Three-tier seeding strategy:",
      "  Below level -> introduced (known = apprentice_2)",
      "  At level    -> unseen (known = apprentice_2)",
      "  Above level -> NOT seeded (curriculum engine introduces)",
      "Wipes stale CurriculumItem queue on complete",
    ],
  },
];

let coreY = Z3_Y + 66;
coreModules.forEach((mod) => {
  const modH = autoH(mod.lines.length);
  const { elements: els } = titledBox({
    x: Z3_X, y: coreY, w: Z3_W, h: modH,
    title: mod.name,
    titleBg: mod.bg, titleBorder: mod.border,
    bodyBg: "#f8f9fa", bodyBorder: mod.border,
    bodyLines: mod.lines,
  });
  elements.push(...els);
  coreY += modH + 16;
});

const Z3_BOTTOM = coreY;

// --- @linguist/shared and @linguist/db (right of Zone 3) ---
const PKG_X = Z3_X + Z3_W + 60;
const PKG_Y = Z3_Y;

// @linguist/shared
const sharedLines = [
  "ONLY package importable from ALL layers",
  "Types and enums ONLY — no logic",
  "",
  "State Machine:",
  "  MasteryState, ReviewGrade, ReviewModality",
  "  ItemType (lexical|grammar|collocation|chunk|pragmatic_formula)",
  "  LearningModality, ContextType",
  "",
  "FSRS:",
  "  FsrsState { due, stability, difficulty, ... }",
  "",
  "Curriculum Spine:",
  "  SpineUnit, SpineItemRef, ChunkTrigger",
  "  UnitProgress, ChunkTriggerResult",
  "  CurriculumPlan, CurriculumRecommendation",
  "  KnowledgeBubble, LevelBreakdown",
  "",
  "IPC (desktop):",
  "  IPC_CHANNELS (50+ method constants)",
  "  IpcChannel (union type)",
  "",
  "Auth & Onboarding:",
  "  AuthUser, SelfReportedLevel, OnboardingResult",
  "",
  "Payloads:",
  "  ReviewSubmission, ReviewQueueItem",
  "  ConversationMessage, SessionPlan",
  "  PostSessionAnalysis, ExpandedTomBrief",
];
const sharedH = autoH(sharedLines.length);
{
  const { elements: els } = titledBox({
    x: PKG_X, y: PKG_Y + 60, w: 440, h: sharedH,
    title: "@linguist/shared  (packages/shared/src/types.ts)",
    titleBg: COLORS.yellow, titleBorder: COLORS.yellowBorder,
    bodyBg: "#fffbeb", bodyBorder: COLORS.yellowBorder,
    bodyLines: sharedLines,
  });
  elements.push(...els);
}

// @linguist/db
const dbLines = [
  "Prisma client singleton package",
  "Exports: getDb(), PrismaClient type",
  "",
  "Consumed by:",
  "  apps/desktop/electron/ipc/ (IPC handlers)",
  "  apps/web/app/api/          (API routes)",
  "",
  "prisma/schema.prisma — 12 models, ~270 lines",
  "prisma/seed.ts — user-scoped seeding",
];
const dbH = autoH(dbLines.length);
const dbY = PKG_Y + 60 + sharedH + 30;
{
  const { elements: els } = titledBox({
    x: PKG_X, y: dbY, w: 440, h: dbH,
    title: "@linguist/db  (packages/db/)",
    titleBg: COLORS.purple, titleBorder: COLORS.purpleBorder,
    bodyBg: "#f8f0ff", bodyBorder: COLORS.purpleBorder,
    bodyLines: dbLines,
  });
  elements.push(...els);
}

// Dependency arrow between packages (core -> shared)
const pkgCoreRight = Z3_X + Z3_W;
const pkgSharedLeft = PKG_X;
const arrowConnectY = PKG_Y + 60 + sharedH / 2;
elements.push(...arrow({
  startX: pkgCoreRight + 10, startY: arrowConnectY,
  endX: pkgSharedLeft - 10, endY: arrowConnectY,
  color: COLORS.yellowBorder, strokeW: 1, dashed: true,
  label: "imports types", labelOffsetX: 4, labelOffsetY: -22,
}));

const PKG_BOTTOM = dbY + dbH;


// ═══════════════════════════════════════════════════════════════════════════
// ZONE 4 — Database Schema (below Zone 3)
// ═══════════════════════════════════════════════════════════════════════════

const Z4_X = 60;
const Z4_Y = Math.max(Z3_BOTTOM, PKG_BOTTOM) + ZONE_GAP;
const Z4_W = 1840;

elements.push(sectionLabel({ x: Z4_X, y: Z4_Y, content: "Zone 4: Database Schema  (@linguist/db — Prisma + Hosted Supabase Postgres)" }));
elements.push(text({ x: Z4_X, y: Z4_Y + 38, content: "Multi-tenant: every model has userId field + @@index([userId]) — all queries scoped by authenticated user", size: 12, family: 3, color: COLORS.redBorder }));

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
      "-> owns ALL other models via userId",
    ],
  },
  {
    name: "LearnerProfile",
    note: "one per user",
    fields: [
      "userId (unique FK -> User)",
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
      "userId (FK -> User)",
      "surfaceForm, reading, meaning",
      "partOfSpeech, tags[]",
      "masteryState (unseen->burned)",
      "recognitionFsrs (JSON)",
      "productionFsrs (JSON)",
      "productionWeight (float)",
      "exposureCount, productionCount",
      "contextTypes[], contextCount",
      "cefrLevel, frequencyRank",
      "-> reviewEvents[], contextLogs[]",
    ],
  },
  {
    name: "GrammarItem",
    note: "grammar patterns",
    fields: [
      "userId (FK -> User)",
      "patternId @@unique([userId, patternId])",
      "name, description",
      "masteryState (unseen->burned)",
      "recognitionFsrs (JSON)",
      "productionFsrs (JSON)",
      "productionWeight, novelContextCount",
      "contextTypes[], contextCount",
      "prerequisiteIds[] (pattern refs)",
      "-> reviewEvents[], contextLogs[]",
    ],
  },
  {
    name: "ReviewEvent",
    note: "every review logged",
    fields: [
      "userId (FK -> User)",
      "itemType (lexical|grammar)",
      "grade (again|hard|good|easy)",
      "modality (recognition|production|cloze)",
      "contextType, productionWeight",
      "timestamp, sessionId",
      "-> lexicalItemId (FK, nullable)",
      "-> grammarItemId (FK, nullable)",
    ],
  },
  {
    name: "ConversationSession",
    note: "full session record",
    fields: [
      "userId (FK -> User)",
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
      "userId (FK -> User)",
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
      "userId (FK -> User)",
      "contextType, modality",
      "wasProduction (bool)",
      "wasSuccessful (bool|null)",
      "contextQuote, sessionId",
      "-> lexicalItemId (FK)",
      "-> grammarItemId (FK)",
    ],
  },
  {
    name: "PragmaticProfile",
    note: "one per user",
    fields: [
      "userId (unique FK -> User)",
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
    name: "ChunkItem",
    note: "multi-word units",
    fields: [
      "userId (FK -> User)",
      "itemKind: collocation|chunk|pragmatic_formula",
      "referenceId @@unique([userId, referenceId])",
      "phrase, reading, meaning",
      "componentItemIds[] (LexicalItem refs)",
      "grammarDependencies[], register, domain",
      "cefrLevel, masteryState (unseen->burned)",
      "recognitionFsrs, productionFsrs (JSON)",
      "-> reviewEvents[], contextLogs[]",
    ],
  },
  {
    name: "CurriculumItem",
    note: "recommendation queue",
    fields: [
      "userId (FK -> User)",
      "itemType (5 types), referenceItemId",
      "surfaceForm, reading, meaning, patternId",
      "cefrLevel, frequencyRank",
      "priority (float), reason",
      "status: queued|introduced|skipped",
      "@@index([userId, status, priority])",
    ],
  },
];

const MODEL_W = 300;
const MODEL_GAP = 20;
const MODEL_COLS = 5;

const modelStartY = Z4_Y + 70;

// Compute per-row max heights
const row0Models = models.slice(0, MODEL_COLS);
const row1Models = models.slice(MODEL_COLS);
const computeModelH = (m) => autoH(m.fields.length);
const row0MaxH = Math.max(...row0Models.map(computeModelH));
const row1MaxH = row1Models.length > 0 ? Math.max(...row1Models.map(computeModelH)) : 0;

models.forEach((m, i) => {
  const col = i % MODEL_COLS;
  const row = Math.floor(i / MODEL_COLS);
  const mx = Z4_X + col * (MODEL_W + MODEL_GAP);
  const my = row === 0 ? modelStartY : modelStartY + row0MaxH + 30;
  const modelH = computeModelH(m);

  const { elements: els } = titledBox({
    x: mx, y: my, w: MODEL_W, h: modelH,
    title: m.name,
    titleBg: COLORS.purple, titleBorder: COLORS.purpleBorder,
    bodyBg: "#f8f0ff", bodyBorder: COLORS.purpleBorder,
    bodyLines: m.fields,
  });
  elements.push(...els);
  // Note label
  elements.push(text({ x: mx + MODEL_W - m.note.length * 7 - 10, y: my + 9, content: m.note, size: 10, family: 1, color: "#9775b7" }));
});

const Z4_BOTTOM = modelStartY + row0MaxH + 30 + row1MaxH + 20;

// DB Relationships
const userRightX = Z4_X + 0 * (MODEL_W + MODEL_GAP) + MODEL_W;
const learnerProfileX = Z4_X + 1 * (MODEL_W + MODEL_GAP);
elements.push(...arrow({
  startX: userRightX + 4, startY: modelStartY + 80,
  endX: learnerProfileX - 4, endY: modelStartY + 80,
  color: COLORS.purpleBorder, strokeW: 1,
  label: "1:1", labelOffsetX: -10, labelOffsetY: -22,
}));

const lexItemCenterX = Z4_X + 2 * (MODEL_W + MODEL_GAP) + MODEL_W;
const reviewEventX = Z4_X + 4 * (MODEL_W + MODEL_GAP);
elements.push(...arrow({
  startX: lexItemCenterX + 4, startY: modelStartY + 100,
  endX: reviewEventX - 4, endY: modelStartY + 100,
  color: COLORS.purpleBorder, strokeW: 1,
  label: "1:N", labelOffsetX: -12, labelOffsetY: -22,
}));

const grammarCenterX = Z4_X + 3 * (MODEL_W + MODEL_GAP) + MODEL_W;
elements.push(...arrow({
  startX: grammarCenterX + 4, startY: modelStartY + 130,
  endX: reviewEventX - 4, endY: modelStartY + 130,
  color: COLORS.purpleBorder, strokeW: 1,
  label: "1:N", labelOffsetX: -12, labelOffsetY: -22,
}));


// ═══════════════════════════════════════════════════════════════════════════
// ZONE 5 — Data Flow Sequences (below Zone 4)
// ═══════════════════════════════════════════════════════════════════════════

const Z5_X = 60;
const Z5_Y = Z4_BOTTOM + ZONE_GAP;

elements.push(sectionLabel({ x: Z5_X, y: Z5_Y, content: "Zone 5: Key Data Flows" }));
elements.push(text({ x: Z5_X, y: Z5_Y + 38, content: "Both platforms follow identical flows — Desktop via IPC, Web via HTTP API routes. Core logic is shared.", size: 12, family: 1, color: "#868e96" }));

// --- Flow A: Review Submission ---
const flowAX = Z5_X;
const flowAY = Z5_Y + 70;
const flowALines = [
  " 1. User grades card (e.g. 'Good')",
  " 2. -> useReview.submitReview(submission)",
  "",
  " Desktop path:                          Web path:",
  "  3a. window.linguist.reviewSubmit()     3b. fetch('/api/review/submit')",
  "  4a. IPC -> electron/ipc/reviews.ts     4b. API route handler",
  "",
  " 5. -> @linguist/core/fsrs:    scheduleReview(currentFsrs, 'good')",
  " 6. -> @linguist/core/mastery:  computeNextMasteryState(context)",
  " 7. -> @linguist/db:  UPDATE LexicalItem SET fsrs, masteryState",
  " 8. -> @linguist/db:  CREATE ReviewEvent row",
  " 9. -> @linguist/db:  CREATE ItemContextLog row",
  "10. -> (every 10th review) @linguist/core/profile: recalculateProfile()",
  "11. -> Return { newMasteryState, newFsrsState }",
  "",
  "Total latency: ~5-15ms (all local, no network for scheduling)",
  "",
  "Key detail: Recognition and production FSRS states",
  "are tracked SEPARATELY per item.",
];
const flowAH = autoH(flowALines.length);
{
  const { elements: els } = titledBox({
    x: flowAX, y: flowAY, w: 740, h: flowAH,
    title: "Flow A: Review Submission",
    titleBg: COLORS.blue, titleBorder: COLORS.blueBorder,
    bodyBg: "#f8f9fa", bodyBorder: COLORS.blueBorder,
    bodyLines: flowALines,
  });
  elements.push(...els);
}

// --- Flow B: Full Conversation Session ---
const flowBX = flowAX + 740 + 50;
const flowBY = flowAY;
const flowBLines = [
  "PLAN PHASE -- Claude API Call #1",
  "  1. User clicks 'Start Session' -> conversationPlan()",
  "  2. Build learner summary (active items, stable count, pragmatics)",
  "  3. Build ToM brief (avoidance, confusion, modality gaps)",
  "  4. -> Claude API: 'You are a session planner...'",
  "  5. Parse JSON: targetVocab, targetGrammar, register, focus, cardBudget",
  "  6. CREATE ConversationSession in DB",
  "  7. Return ExpandedSessionPlan + ChallengeCard targets to client",
  "",
  "CONVERSATION PHASE -- Claude API (SSE streaming per turn)",
  "  8. User types message -> conversationSendStream(sessionId, text)",
  "  9. Retrieve session state, build system prompt w/ card instructions",
  " 10. -> Claude API (streaming): system prompt + last 30 turns",
  " 11. SSE stream: delta events -> client renders incrementally",
  " 12. Client parses [VOCAB_CARD] [GRAMMAR_CARD] etc. -> renders cards inline",
  " 13. Client parses [TARGETS_HIT] -> updates ChallengeCard checklist",
  " 14. Server accumulates full response -> UPDATE transcript in DB",
  "",
  "END PHASE -- Claude API Calls #3 + #4 + FSRS + Mastery",
  " 15. User clicks 'End Session' -> conversationEnd(sessionId)",
  " 16. -> Claude API #3: 'Analyze this transcript...'",
  " 17. Parse: targets hit, errors, avoidance, new items",
  " 18. CREATE ItemContextLog per item (with existence validation)",
  " 19. UPDATE items: productionCount, contextTypes, modalities",
  " 20. INSERT new items as 'introduced' mastery state",
  " 21. FSRS LOOP: for each production event:",
  "     -> scheduleReview(fsrs, grade) -> UPDATE item FSRS state",
  "     -> computeNextMasteryState() -> UPDATE mastery if changed",
  "     -> CREATE ReviewEvent (contextType: 'conversation')",
  " 22. -> Claude API #4: pragmatic analysis (register accuracy)",
  " 23. UPDATE PragmaticProfile in DB",
  " 24. TRIGGER async profile recalculation",
  " 25. Return PostSessionAnalysis -> client shows SessionSummaryCard",
];
const flowBH = autoH(flowBLines.length);
{
  const { elements: els } = titledBox({
    x: flowBX, y: flowBY, w: 780, h: flowBH,
    title: "Flow B: Full Conversation Session (4 Claude API Calls)",
    titleBg: COLORS.orange, titleBorder: COLORS.orangeBorder,
    bodyBg: "#fff9f5", bodyBorder: COLORS.orangeBorder,
    bodyLines: flowBLines,
  });
  elements.push(...els);
}

// --- Flow C: ToM Analysis ---
const flowCX = flowAX;
const flowCY = flowAY + flowAH + 30;
const flowCLines = [
  "Triggered: after each conversation session or on daily app open",
  "",
  " 1. tom.runAnalysis() -> IPC handler or API route",
  " 2. Fetch all items (journeyman+), recent sessions, recent reviews",
  " 3. -> @linguist/core/tom: detectAvoidance(items, sessions)",
  " 4. -> @linguist/core/tom: detectConfusionPairs(errors across sessions)",
  " 5. -> @linguist/core/tom: detectRegression(items, recentReviews)",
  " 6. -> @linguist/core/tom: detectModalityGap(items)",
  " 7. UPSERT TomInference rows (create new / update existing)",
  " 8. Mark resolved inferences as resolved=true",
  " 9. generateExpandedDailyBrief(allInferences)",
  "10. Return ExpandedTomBrief (consumed by conversation planner)",
  "",
  "Output feeds directly into Flow B, step 3.",
];
const flowCH = autoH(flowCLines.length);
{
  const { elements: els } = titledBox({
    x: flowCX, y: flowCY, w: 740, h: flowCH,
    title: "Flow C: Theory of Mind Daily Analysis",
    titleBg: COLORS.orange, titleBorder: COLORS.orangeBorder,
    bodyBg: "#fff9f5", bodyBorder: COLORS.orangeBorder,
    bodyLines: flowCLines,
  });
  elements.push(...els);
}

// --- Flow D: Onboarding ---
const flowDX = flowAX;
const flowDY = flowCY + flowCH + 30;
const flowDLines = [
  "Steps: welcome -> language -> level -> assessment -> preferences -> complete",
  "Available on both Desktop and Web (identical flow, different transport)",
  "",
  " 1. User signs in (Google OAuth) -> ensureDbUser() upserts User row",
  " 2. Auth check: user.onboardingCompleted — gates app if false",
  " 3. WelcomeStep: greet by name (from auth)",
  " 4. LanguageStep: select native language (target = Japanese fixed)",
  " 5. LevelStep: self-report JLPT (Beginner/N5/N4/N3/N2/N1)",
  " 6. AssessmentStep:",
  "    -> getAssessmentCandidates(level) from reference corpus",
  "    -> Curated items per JLPT level (tap to mark known)",
  " 7. PreferencesStep: daily new item limit slider (3-30, default 10)",
  " 8. CompleteStep -> onboardingComplete(result):",
  "    -> CREATE LearnerProfile + PragmaticProfile",
  "    -> Three-tier seeding from authoritative corpus:",
  "       Below level: introduced (known = apprentice_2)",
  "       At level:    unseen (known = apprentice_2)",
  "       Above level: NOT seeded (curriculum engine introduces later)",
  "    -> Wipe stale CurriculumItem queue",
  "    -> User.onboardingCompleted = true -> main app loads",
];
const flowDH = autoH(flowDLines.length);
{
  const { elements: els } = titledBox({
    x: flowDX, y: flowDY, w: 740, h: flowDH,
    title: "Flow D: New User Onboarding (6-step wizard)",
    titleBg: COLORS.blue, titleBorder: COLORS.blueBorder,
    bodyBg: "#f8f9fa", bodyBorder: COLORS.blueBorder,
    bodyLines: flowDLines,
  });
  elements.push(...els);
}

// --- Flow E: Curriculum Recommendation Pipeline ---
const flowEX = flowBX;
const flowEY = flowBY + flowBH + 30;
const flowELines = [
  "Triggered: user requests recommendations or opens Learn page",
  "",
  " 1. CURRICULUM_GET_RECOMMENDATIONS handler",
  " 2. Check CurriculumItem queue — return cached if queued items exist",
  " 3. gatherBubbleItems() -> fetch all learner items from DB",
  " 4. computeKnowledgeBubble(items) -> {",
  "      currentLevel (highest with >=80% coverage),",
  "      frontierLevel, levelBreakdowns (5 item types), gaps }",
  " 5. Compute: dueReviewCount + recentAccuracy (last 50 reviews)",
  " 6. generateCurriculumPlan({bubble, items, knownForms, dailyLimit, ...})",
  "    |-- computePacing() -> adjust daily target by debt/accuracy",
  "    |-- generateSpineAwarePlan():",
  "    |     Load curriculum-spine.json (cached)",
  "    |     Identify next uncompleted unit",
  "    |     getSpineBoosts() -> +0.5 supporting, +1.0 core items",
  "    |     generateRecommendations(with spineBoosts)",
  "    |-- filterByPrerequisites() -> remove gated grammar",
  "    |-- applyGrammarCap() -> max 2 grammar per day",
  "    |-- balanceVariety() -> interleave item types",
  "    |-- identifyReviewFocus() -> flag stuck items",
  "    |-- checkLevelProgression() -> levelUpReady?",
  " 7. If levelUpReady: seedNextLevelItems(userId, frontierLevel)",
  "    -> INSERT unseen items from frontier level in reference corpus",
  " 8. Persist plan.newItems to CurriculumItem table (status=queued)",
  " 9. Return CurriculumPlan to client",
  "",
  "USER INTRODUCES ITEM:",
  "10. CURRICULUM_INTRODUCE_ITEM -> create LexicalItem/GrammarItem/ChunkItem",
  "    with mastery=introduced, mark CurriculumItem status=introduced",
  "",
  "Item types: lexical | grammar | collocation | chunk | pragmatic_formula",
];
const flowEH = autoH(flowELines.length);
{
  const { elements: els } = titledBox({
    x: flowEX, y: flowEY, w: 780, h: flowEH,
    title: "Flow E: Curriculum Recommendation Pipeline (Spine-Aware)",
    titleBg: COLORS.green, titleBorder: COLORS.greenBorder,
    bodyBg: "#f0faf0", bodyBorder: COLORS.greenBorder,
    bodyLines: flowELines,
  });
  elements.push(...els);
}


// ═══════════════════════════════════════════════════════════════════════════
// ZONE 6 — External Dependencies (right side of flows)
// ═══════════════════════════════════════════════════════════════════════════

const Z6_X = flowBX + 780 + 50;
const Z6_Y = flowAY;
const Z6_W = 340;

elements.push(sectionLabel({ x: Z6_X, y: Z6_Y - 50, content: "Zone 6: External Systems" }));

// Claude API
const claudeLines = [
  "Desktop: @anthropic-ai/sdk",
  "Web:     @ai-sdk/anthropic + ai (Vercel)",
  "",
  "4 call types per session:",
  "  1. Session planning (JSON out)",
  "  2. Conversation turns (streaming)",
  "  3. Post-session analysis (JSON out)",
  "  4. Pragmatic analysis (JSON out)",
  "",
  "+ General chat (streaming)",
];
const claudeH = autoH(claudeLines.length);
{
  const { elements: els } = titledBox({
    x: Z6_X, y: Z6_Y, w: Z6_W, h: claudeH,
    title: "Claude API  (Anthropic SDK)",
    titleBg: COLORS.orange, titleBorder: COLORS.orangeBorder,
    bodyBg: "#fff9f5", bodyBorder: COLORS.orangeBorder,
    bodyLines: claudeLines,
  });
  elements.push(...els);
}

// Supabase
const supabaseLines = [
  "Hosted Supabase instance",
  "@linguist/db Prisma ORM for all DB access",
  "",
  "Auth Service (Google OAuth):",
  "  Desktop: PKCE flow via @supabase/supabase-js",
  "  Web:     SSR cookies via @supabase/ssr",
  "",
  "Desktop auth persisted to disk:",
  "  {userData}/auth/session.json",
  "Web auth persisted in cookies:",
  "  middleware.ts refreshes on each request",
];
const supabaseH = autoH(supabaseLines.length);
{
  const { elements: els } = titledBox({
    x: Z6_X, y: Z6_Y + claudeH + 30, w: Z6_W, h: supabaseH,
    title: "Supabase  (Hosted Postgres + Auth)",
    titleBg: COLORS.purple, titleBorder: COLORS.purpleBorder,
    bodyBg: "#f8f0ff", bodyBorder: COLORS.purpleBorder,
    bodyLines: supabaseLines,
  });
  elements.push(...els);
}

// ts-fsrs
const fsrsLines = [
  "Open-source FSRS implementation",
  "Runs 100% locally, no network",
  "Pre-trained on 700M reviews",
  "Per-user tuning after ~50 reviews",
];
const fsrsH = autoH(fsrsLines.length);
const fsrsY = Z6_Y + claudeH + 30 + supabaseH + 30;
{
  const { elements: els } = titledBox({
    x: Z6_X, y: fsrsY, w: Z6_W, h: fsrsH,
    title: "ts-fsrs  (Local Scheduling)",
    titleBg: COLORS.green, titleBorder: COLORS.greenBorder,
    bodyBg: "#f0faf0", bodyBorder: COLORS.greenBorder,
    bodyLines: fsrsLines,
  });
  elements.push(...els);
}

// Build Tooling
const buildLines = [
  "Turborepo        Build orchestration",
  "pnpm             Package manager (workspaces)",
  "electron-vite    Desktop build tooling",
  "Next.js 15       Web framework (App Router)",
  "Turbopack        Web dev server",
  "Prisma           ORM + migrations",
];
const buildH = autoH(buildLines.length);
const buildY = fsrsY + fsrsH + 30;
{
  const { elements: els } = titledBox({
    x: Z6_X, y: buildY, w: Z6_W, h: buildH,
    title: "Build & Dev Tooling",
    titleBg: COLORS.gray, titleBorder: COLORS.grayBorder,
    bodyBg: "#f8f9fa", bodyBorder: COLORS.grayBorder,
    bodyLines: buildLines,
  });
  elements.push(...els);
}


// ═══════════════════════════════════════════════════════════════════════════
// MASTERY STATE MACHINE — detailed inline diagram
// ═══════════════════════════════════════════════════════════════════════════

// Place state machine below the left-column flows (A/C/D) to avoid colliding with Zone 6 on the right
const SMX = flowAX;
const SMY = flowDY + flowDH + 50;

elements.push(sectionLabel({ x: SMX, y: SMY, content: "Mastery State Machine (Detail)" }));

const states = [
  { name: "unseen", x: 0 },
  { name: "introduced", x: 140 },
  { name: "app_1", x: 280 },
  { name: "app_2", x: 380 },
  { name: "app_3", x: 480 },
  { name: "app_4", x: 580 },
  { name: "journeyman", x: 720 },
  { name: "expert", x: 870 },
  { name: "master", x: 990 },
  { name: "burned", x: 1110 },
];

const stateY = SMY + 60;
const stateH = 34;

states.forEach((s) => {
  const sw = s.name.length * 10 + 20;
  elements.push(rect({
    x: SMX + s.x, y: stateY, w: sw, h: stateH,
    bg: s.name === "burned" ? "#f0faf0" : s.name.startsWith("app_") ? COLORS.blue : s.name === "unseen" ? COLORS.gray : COLORS.green,
    border: s.name === "burned" ? COLORS.greenBorder : s.name.startsWith("app_") ? COLORS.blueBorder : s.name === "unseen" ? COLORS.grayBorder : COLORS.greenBorder,
    fill: "solid", rough: 0, radius: 6,
  }));
  elements.push(text({ x: SMX + s.x + 10, y: stateY + 8, content: s.name, size: 12, family: 3 }));
});

// Arrows between states
for (let i = 0; i < states.length - 1; i++) {
  const from = states[i];
  const to = states[i + 1];
  const fromW = from.name.length * 10 + 20;
  elements.push(...arrow({
    startX: SMX + from.x + fromW + 4, startY: stateY + stateH / 2,
    endX: SMX + to.x - 4, endY: stateY + stateH / 2,
    color: "#495057", strokeW: 1,
  }));
}

// Gate labels — positioned well above the state boxes
const gateLabels = [
  { x: states[5].x + 40, label: "GATE: productionWeight >= 1.0" },
  { x: states[6].x + 60, label: "GATE: contextCount >= 3" },
  { x: states[7].x + 50, label: "GATE: novelContextCount >= 2 (grammar)" },
];
gateLabels.forEach((g) => {
  elements.push(text({ x: SMX + g.x - 30, y: stateY - 28, content: g.label, size: 10, family: 3, color: COLORS.orangeBorder }));
});

// Demotion notes — positioned well below the state boxes
elements.push(text({ x: SMX + 450, y: stateY + stateH + 16, content: "grade=again -> back one state (demotion)", size: 11, family: 1, color: COLORS.redBorder }));
elements.push(text({ x: SMX + 450, y: stateY + stateH + 36, content: "grade=hard -> no change (stays in current state)", size: 11, family: 1, color: "#868e96" }));


// ═══════════════════════════════════════════════════════════════════════════
// ARCHITECTURE RULES — callout box (below Zone 5)
// ═══════════════════════════════════════════════════════════════════════════

// Place below the mastery state machine
const ARX = flowAX;
const ARY = stateY + stateH + 70;

const rulesLines = [
  "1. apps/ NEVER import from each other",
  "   (desktop and web are independent)",
  "",
  "2. @linguist/core has ZERO deps on",
  "   Electron, React, Next.js, or Prisma",
  "   (pure functions only)",
  "",
  "3. Only IPC handlers (desktop) and",
  "   API routes (web) touch @linguist/db",
  "",
  "4. @linguist/shared is the ONLY",
  "   package importable everywhere",
  "",
  "5. All DB queries scoped by userId",
  "   (no data leakage between users)",
];
const rulesH = autoH(rulesLines.length);
{
  const { elements: els } = titledBox({
    x: ARX, y: ARY, w: 380, h: rulesH,
    title: "Structural Rules (Enforced)",
    titleBg: COLORS.red, titleBorder: COLORS.redBorder,
    bodyBg: "#fff5f5", bodyBorder: COLORS.redBorder,
    bodyLines: rulesLines,
  });
  elements.push(...els);
}


// ═══════════════════════════════════════════════════════════════════════════
// NEXT UP — callout box
// ═══════════════════════════════════════════════════════════════════════════

const NUX = ARX + 420;
const NUY = ARY;

const nextLines = [
  "Completed:",
  "  [x] Supabase Auth (Google OAuth)",
  "  [x] Monorepo migration (Turborepo)",
  "  [x] Next.js web app (feature parity)",
  "  [x] Onboarding / placement wizard",
  "  [x] Curriculum spine + planner engine",
  "  [x] Authoritative corpus (JMDict + JLPT)",
  "  [x] Multi-word units (collocation/chunk/pragmatic)",
  "  [x] Three-tier onboarding seeding",
  "  [x] MVP v0: Conversation (streaming + cards)",
  "  [x] MVP v0: Knowledge Base (3 tabs)",
  "  [x] MVP v0: Session History (annotated)",
  "  [x] FSRS + mastery transitions at session end",
  "  [x] Structured card protocol ([TAG]...[/TAG])",
  "",
  "Next priorities:",
  "  [ ] End-to-end testing (conversation loop)",
  "  [ ] Error handling UX (toasts, boundaries)",
  "  [ ] Card rendering reliability (fallbacks)",
  "  [ ] Desktop parity (port MVP surfaces)",
  "  [ ] Session quality metrics tracking",
  "  [ ] Voice layer V2 (STT -> LLM -> TTS)",
];
const nextH = autoH(nextLines.length);
{
  const { elements: els } = titledBox({
    x: NUX, y: NUY, w: 360, h: nextH,
    title: "Progress (Post-MVP v0)",
    titleBg: "#f8f9fa", titleBorder: "#adb5bd",
    bodyBg: "#f8f9fa", bodyBorder: "#adb5bd",
    bodyLines: nextLines,
  });
  elements.push(...els);
}


// ═══════════════════════════════════════════════════════════════════════════
// V2 EXPANSION — placeholder
// ═══════════════════════════════════════════════════════════════════════════

const V2X = NUX + 400;
const V2Y = ARY;

const v2Lines = [
  "Voice pipeline (STT -> LLM -> TTS):",
  "  STT: gpt-4o-mini-transcribe",
  "  TTS: ElevenLabs Flash v2.5",
  "  Target: <1s time-to-first-audio",
  "",
  "Future:",
  "  [ ] Reading assist / hover-lookup",
  "  [ ] Cloud sync (Supabase realtime)",
  "  [ ] Multi-language corpus support",
  "  [ ] Local model inference",
  "  [ ] Community vocabulary lists",
  "",
  "Expand each into its own zone",
  "as implementation begins.",
];
const v2H = autoH(v2Lines.length);
{
  const { elements: els } = titledBox({
    x: V2X, y: V2Y, w: 340, h: v2H,
    title: "V2 Expansion Points",
    titleBg: "#f8f9fa", titleBorder: "#adb5bd",
    bodyBg: "#f8f9fa", bodyBorder: "#adb5bd",
    bodyLines: v2Lines,
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
    zoom: { value: 0.5 },
    scrollX: 0,
    scrollY: 0,
  },
  files: {},
};

// ═══════════════════════════════════════════════════════════════════════════
// COLLISION VALIDATOR — detect overlapping titled boxes and section labels
// ═══════════════════════════════════════════════════════════════════════════

function validateNoOverlaps(elements) {
  // Collect bounding boxes of all rectangles (titled box headers/bodies) and text labels
  const boxes = [];
  for (const el of elements) {
    if (el.type === "rectangle" && el.width > 200 && el.height > 50) {
      boxes.push({
        label: `rect@(${Math.round(el.x)},${Math.round(el.y)})`,
        x1: el.x, y1: el.y,
        x2: el.x + el.width, y2: el.y + el.height,
      });
    }
    // Check section labels (large text elements)
    if (el.type === "text" && el.fontSize >= 20) {
      boxes.push({
        label: `"${el.text.substring(0, 40)}"`,
        x1: el.x, y1: el.y,
        x2: el.x + el.width, y2: el.y + el.height,
      });
    }
  }

  let collisions = 0;
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      // Check if bounding boxes overlap (with 4px tolerance for shared borders)
      const hOverlap = a.x2 - 4 > b.x1 && a.x1 + 4 < b.x2;
      const vOverlap = a.y2 - 4 > b.y1 && a.y1 + 4 < b.y2;
      if (hOverlap && vOverlap) {
        // Skip: overlaps within the same titled box (header + body share a border)
        const verticalGap = Math.abs(a.y2 - b.y1);
        const verticalGap2 = Math.abs(b.y2 - a.y1);
        if (verticalGap < 5 || verticalGap2 < 5) continue;
        // Skip: one is fully inside the other (grouped elements)
        const aInB = a.x1 >= b.x1 && a.x2 <= b.x2 && a.y1 >= b.y1 && a.y2 <= b.y2;
        const bInA = b.x1 >= a.x1 && b.x2 <= a.x2 && b.y1 >= a.y1 && b.y2 <= a.y2;
        if (aInB || bInA) continue;

        collisions++;
        if (collisions <= 5) {
          console.warn(`  COLLISION: ${a.label} overlaps ${b.label}`);
        }
      }
    }
  }
  if (collisions > 0) {
    console.warn(`WARNING: ${collisions} element collision(s) detected! Review coordinates above.`);
  } else {
    console.log("  Collision check: PASS (no overlapping boxes or section labels)");
  }
}

const outPath = new URL("../docs/architecture.excalidraw", import.meta.url).pathname;
writeFileSync(outPath, JSON.stringify(excalidrawFile, null, 2));
console.log(`Wrote ${elements.length} elements to ${outPath}`);
console.log("  Open in https://excalidraw.com or the VS Code Excalidraw extension.");
validateNoOverlaps(elements);
