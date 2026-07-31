import { createClient } from "@supabase/supabase-js"

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const SB_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""

// Guard: only create client when env vars are available and we're in browser
function createBrowserClient() {
  if (!SB_URL || !SB_ANON) {
    throw new Error("Supabase configuration missing: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY")
  }
  return createClient(SB_URL, SB_ANON)
}

// Lazy singleton — created on first access, not at module load
let _client: ReturnType<typeof createBrowserClient> | null = null

export function getSupabaseBrowser() {
  if (!_client) {
    _client = createBrowserClient()
  }
  return _client
}

// Legacy export for backward compatibility
export const supabase = typeof window !== "undefined" ? getSupabaseBrowser() : createBrowserClient()
