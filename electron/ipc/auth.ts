import { BrowserWindow, ipcMain, app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs'
import { randomBytes, createHash } from 'crypto'
import { IPC_CHANNELS } from '@shared/types'
import type { AuthUser } from '@shared/types'
import { getDb } from '../db'
import { setCurrentUserId } from '../auth-state'
import { createLogger } from '../logger'

const log = createLogger('auth')

const getSupabaseUrl = () => process.env.SUPABASE_URL || 'http://127.0.0.1:54321'
const getAnonKey = () => process.env.SUPABASE_ANON_KEY || ''
const SITE_URL = process.env.SUPABASE_SITE_URL || 'http://127.0.0.1:3000'

// ── Session storage (persisted to disk in app userData) ──

interface StoredSession {
  access_token: string
  refresh_token: string
  expires_at: number
  user: AuthUser
}

function sessionPath(): string {
  const dir = join(app.getPath('userData'), 'auth')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, 'session.json')
}

function loadSession(): StoredSession | null {
  try {
    const p = sessionPath()
    if (!existsSync(p)) return null
    return JSON.parse(readFileSync(p, 'utf-8')) as StoredSession
  } catch {
    return null
  }
}

function saveSession(s: StoredSession): void {
  writeFileSync(sessionPath(), JSON.stringify(s, null, 2))
}

function clearSession(): void {
  try {
    const p = sessionPath()
    if (existsSync(p)) unlinkSync(p)
  } catch {
    /* best-effort */
  }
}

function extractUser(raw: Record<string, unknown>): Omit<AuthUser, 'onboardingCompleted'> {
  const meta = (raw.user_metadata ?? {}) as Record<string, unknown>
  return {
    id: raw.id as string,
    email: (raw.email as string) ?? null,
    name: (meta.full_name as string) ?? (meta.name as string) ?? null,
    avatarUrl: (meta.avatar_url as string) ?? null,
  }
}

async function ensureDbUser(authUser: Omit<AuthUser, 'onboardingCompleted'>): Promise<AuthUser> {
  const db = getDb()
  const dbUser = await db.user.upsert({
    where: { id: authUser.id },
    create: {
      id: authUser.id,
      email: authUser.email,
      name: authUser.name,
      avatarUrl: authUser.avatarUrl,
    },
    update: {
      email: authUser.email,
      name: authUser.name,
      avatarUrl: authUser.avatarUrl,
    },
  })

  setCurrentUserId(dbUser.id)

  return {
    id: dbUser.id,
    email: dbUser.email,
    name: dbUser.name,
    avatarUrl: dbUser.avatarUrl,
    onboardingCompleted: dbUser.onboardingCompleted,
  }
}

// ── PKCE helpers ──

function generateCodeVerifier(): string {
  return randomBytes(32).toString('base64url')
}

function generateCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url')
}

// ── Supabase HTTP helpers (Node.js fetch — no CORS restrictions) ──

async function exchangeCode(
  code: string,
  codeVerifier: string,
): Promise<StoredSession> {
  const res = await fetch(`${getSupabaseUrl()}/auth/v1/token?grant_type=pkce`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: getAnonKey(),
    },
    body: JSON.stringify({ auth_code: code, code_verifier: codeVerifier }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Token exchange failed (${res.status}): ${body}`)
  }

  const data = (await res.json()) as Record<string, unknown>
  const rawUser = extractUser(data.user as Record<string, unknown>)
  return {
    access_token: data.access_token as string,
    refresh_token: data.refresh_token as string,
    expires_at: data.expires_at as number,
    user: { ...rawUser, onboardingCompleted: false },
  }
}

async function refreshTokens(refreshToken: string): Promise<StoredSession | null> {
  try {
    const res = await fetch(
      `${getSupabaseUrl()}/auth/v1/token?grant_type=refresh_token`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: getAnonKey(),
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
      },
    )
    if (!res.ok) return null

    const data = (await res.json()) as Record<string, unknown>
    const rawUser = extractUser(data.user as Record<string, unknown>)
    return {
      access_token: data.access_token as string,
      refresh_token: data.refresh_token as string,
      expires_at: data.expires_at as number,
      user: { ...rawUser, onboardingCompleted: false },
    }
  } catch {
    return null
  }
}

// ── OAuth popup ──

function openOAuthPopup(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let resolved = false

    const popup = new BrowserWindow({
      width: 500,
      height: 700,
      title: 'Sign in — Linguist',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        partition: 'persist:oauth',
      },
    })

    const checkUrl = (navUrl: string): void => {
      if (resolved) return

      let parsed: URL
      try {
        parsed = new URL(navUrl)
      } catch {
        return
      }

      const siteOrigin = new URL(SITE_URL).origin
      if (parsed.origin !== siteOrigin) return

      resolved = true
      const code = parsed.searchParams.get('code')
      popup.close()

      if (code) {
        log.info('OAuth code received')
        resolve(code)
      } else {
        reject(new Error('No authorization code in callback URL'))
      }
    }

    popup.webContents.on('will-navigate', (_e, navUrl) => checkUrl(navUrl))
    popup.webContents.on('did-navigate', (_e, navUrl) => checkUrl(navUrl))
    popup.webContents.on('will-redirect', (_e, navUrl) => checkUrl(navUrl))

    popup.on('closed', () => {
      if (!resolved) reject(new Error('Sign-in window was closed'))
    })

    popup.loadURL(url)
  })
}

// ── IPC handlers ──

export function registerAuthHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.AUTH_GET_SESSION, async () => {
    const session = loadSession()
    if (!session) return null

    const now = Math.floor(Date.now() / 1000)
    if (session.expires_at <= now) {
      log.info('Session expired, attempting refresh')
      const refreshed = await refreshTokens(session.refresh_token)
      if (refreshed) {
        const user = await ensureDbUser(refreshed.user)
        refreshed.user = user
        saveSession(refreshed)
        return { user }
      }
      clearSession()
      setCurrentUserId(null)
      return null
    }

    const user = await ensureDbUser(session.user)
    session.user = user
    saveSession(session)
    return { user }
  })

  ipcMain.handle(IPC_CHANNELS.AUTH_SIGN_IN_GOOGLE, async () => {
    log.info('Starting Google sign-in')

    const codeVerifier = generateCodeVerifier()
    const codeChallenge = generateCodeChallenge(codeVerifier)

    const params = new URLSearchParams({
      provider: 'google',
      redirect_to: SITE_URL,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      scopes: 'openid email profile',
    })
    const oauthUrl = `${getSupabaseUrl()}/auth/v1/authorize?${params}`

    const code = await openOAuthPopup(oauthUrl)
    const session = await exchangeCode(code, codeVerifier)
    const user = await ensureDbUser(session.user)
    session.user = user
    saveSession(session)

    log.info('Google sign-in successful', { userId: user.id })
    return { user }
  })

  ipcMain.handle(IPC_CHANNELS.AUTH_SIGN_OUT, async () => {
    const session = loadSession()
    if (session) {
      try {
        await fetch(`${getSupabaseUrl()}/auth/v1/logout`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            apikey: getAnonKey(),
          },
        })
      } catch {
        /* best-effort server logout */
      }
    }
    clearSession()
    setCurrentUserId(null)
    log.info('Signed out')
  })
}
