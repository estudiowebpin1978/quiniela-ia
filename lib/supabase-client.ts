/**
 * Supabase Client Singleton
 * Provides a single shared client instance across the application.
 * Prevents connection exhaustion in serverless environments.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js"
import { getSupabaseUrl, getSupabaseKey } from "@/lib/config"

let supabaseClient: SupabaseClient | null = null
let supabaseAdminClient: SupabaseClient | null = null

function getSupabaseAnonKey(): string {
  return (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").replace(/"/g, "").trim()
}

/**
 * Get the public (anon) Supabase client for user-facing operations.
 * Uses the anon key - suitable for client-side and server-side with user JWT.
 */
export function getSupabase(): SupabaseClient {
  if (!supabaseClient) {
    const url = getSupabaseUrl()
    const key = getSupabaseAnonKey()
    if (!url || !key) {
      throw new Error("Supabase configuration missing: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY")
    }
    supabaseClient = createClient(url, key, {
      auth: { persistSession: false },
      global: { fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(10000) }) }
    })
  }
  return supabaseClient
}

/**
 * Get the admin (service role) Supabase client for server-side operations.
 * Uses the service role key - NEVER expose this to client-side code.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (!supabaseAdminClient) {
    const url = getSupabaseUrl()
    const key = getSupabaseKey()
    if (!url || !key) {
      throw new Error("Supabase configuration missing: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
    }
    supabaseAdminClient = createClient(url, key, {
      auth: { persistSession: false },
      global: { fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(10000) }) }
    })
  }
  return supabaseAdminClient
}

/**
 * Reset clients (useful for testing or if credentials change at runtime).
 */
export function resetSupabaseClients(): void {
  supabaseClient = null
  supabaseAdminClient = null
}

/**
 * Helper to get headers for direct REST API calls.
 * Use getSupabaseAdmin().from() instead when possible for type safety.
 */
export function getSbHeaders(): Record<string, string> {
  const key = getSupabaseKey()
  return { "apikey": key, "Authorization": `Bearer ${key}` }
}

/**
 * Get base URL for REST API calls.
 */
export function getSbUrl(): string {
  return getSupabaseUrl()
}

/**
 * Create a browser Supabase client for client components.
 * Uses the anon key - safe for client-side usage.
 */
export function createBrowserClient(): SupabaseClient {
  const url = getSupabaseUrl()
  const key = getSupabaseAnonKey()
  if (!url || !key) {
    throw new Error("Supabase configuration missing: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY")
  }
  return createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true },
    global: { fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(10000) }) }
  })
}

/**
 * Alias for createBrowserClient - client-side Supabase client
 */
export const supabaseBrowser = createBrowserClient()