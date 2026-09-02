import { createClient } from "@supabase/supabase-js"

// Lazy getters — evaluated at call time, not module load
function getSBUrl(): string {
  return (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim()
}

function getSBAnon(): string {
  return (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim()
}

function createBrowserClient() {
  const url = getSBUrl()
  const anon = getSBAnon()
  if (!url || !anon) {
    // Don't throw during render — return null, caller handles it
    return null
  }
  return createClient(url, anon, {
    auth: { persistSession: true, autoRefreshToken: true },
    global: { fetch: (u, o) => fetch(u, { ...o, signal: AbortSignal.timeout(15000) }) }
  })
}

let _client: ReturnType<typeof createBrowserClient> | null = null
let _initError: Error | null = null

export function getSupabaseBrowser() {
  if (!_client && !_initError) {
    try {
      _client = createBrowserClient()
    } catch (e) {
      _initError = e as Error
      _client = null
    }
  }
  if (_initError) throw _initError
  return _client
}

// Export a safe checker for components
export function isSupabaseConfigured(): boolean {
  return !!getSBUrl() && !!getSBAnon()
}
