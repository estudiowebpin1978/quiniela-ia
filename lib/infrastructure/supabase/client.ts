/**
 * Infrastructure: Supabase client factory (server-side, service role)
 */
import { createClient, SupabaseClient } from "@supabase/supabase-js"
import { getSupabaseUrl, getSupabaseKey } from "@/lib/config"

let _client: SupabaseClient | null = null

/**
 * Returns a singleton Supabase client with service_role key.
 * Only use server-side (API routes, cron jobs, RPCs).
 */
export function getSupabaseClient(): SupabaseClient {
  if (_client) return _client

  const url = getSupabaseUrl()
  const key = getSupabaseKey()
  if (!url || !key) {
    throw new Error("Supabase URL and service key are required")
  }

  _client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  return _client
}

/**
 * Create a client with user's JWT (for RLS)
 */
export function getSupabaseUserClient(accessToken: string): SupabaseClient {
  const url = getSupabaseUrl()
  const key = getSupabaseKey()
  if (!url || !key) throw new Error("Supabase URL and service key are required")

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })
}

/**
 * Supabase REST API helper (for direct fetch calls)
 */
export function sbHeaders(): Record<string, string> {
  const key = getSupabaseKey()
  return { apikey: key, Authorization: `Bearer ${key}` }
}

export function sbUrl(): string {
  return getSupabaseUrl()
}
