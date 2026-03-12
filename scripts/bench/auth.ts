import { createClient } from '@supabase/supabase-js'

/**
 * Authenticate with Supabase and return a cookie string for HTTP requests.
 */
export async function authenticate(): Promise<{ cookie: string; userId: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const email = process.env.BENCH_USER_EMAIL
  const password = process.env.BENCH_USER_PASSWORD

  if (!url || !anonKey) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
  if (!email || !password) throw new Error('Missing BENCH_USER_EMAIL or BENCH_USER_PASSWORD')

  const supabase = createClient(url, anonKey)
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`Auth failed: ${error.message}`)
  if (!data.session) throw new Error('No session returned')

  // Extract project ref from URL
  // Local: http://127.0.0.1:54321 or http://localhost:54321 → ref from config
  // Hosted: https://<ref>.supabase.co → extract ref
  const ref = extractProjectRef(url)
  const cookieName = `sb-${ref}-auth-token`

  const sessionPayload = JSON.stringify({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at,
    expires_in: data.session.expires_in,
    token_type: data.session.token_type,
  })

  // Base64url encode the session
  const encoded = Buffer.from(sessionPayload).toString('base64url')
  const cookie = `${cookieName}=${encoded}`

  return { cookie, userId: data.user!.id }
}

function extractProjectRef(url: string): string {
  try {
    const parsed = new URL(url)
    // Local supabase: use a fixed ref from the hostname/port
    if (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost') {
      // Local supabase uses the project ref from config.toml
      // Default local ref is typically derived from the project directory
      // The cookie name format for local is sb-127.0.0.1-auth-token or similar
      // Use hostname + port as the ref for local
      return `${parsed.hostname.replace(/\./g, '-')}-${parsed.port}`
    }
    // Hosted: https://<ref>.supabase.co
    const parts = parsed.hostname.split('.')
    return parts[0]
  } catch {
    return 'local'
  }
}
