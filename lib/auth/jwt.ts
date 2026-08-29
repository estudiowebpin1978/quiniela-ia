/**
 * JWT validation — server-side verification via Supabase Auth API.
 * Uses supabase.auth.getUser() which verifies HMAC signature against JWT secret.
 */

import { getSupabase } from "@/lib/supabase-client"

/**
 * Decode JWT payload without verification (for inspection only).
 * NOT for authentication — use validateJwt() instead.
 */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const base64 = token.split(".")[1]?.replace(/-/g, "+").replace(/_/g, "/") || ""
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4)
    const json = Buffer.from(padded, "base64").toString("utf8")
    return JSON.parse(json)
  } catch {
    return null
  }
}

/**
 * Validate JWT — server-side verification via Supabase Auth API.
 * Verifies: HMAC signature, expiry, structure, sub claim.
 * Returns userId and email if valid, null otherwise.
 */
export async function validateJwt(token: string): Promise<{ userId: string; email: string } | null> {
  if (!token) return null
  try {
    const supabase = getSupabase()
    const { data: { user }, error } = await supabase.auth.getUser(token)
    if (error || !user) return null
    return { userId: user.id, email: user.email || "" }
  } catch {
    return null
  }
}

/**
 * Synchronous JWT decode — for backwards compatibility only.
 * WARNING: Does NOT verify HMAC signature. Use validateJwt() for auth.
 */
export function decodeJwtPayloadUnsafe(token: string): Record<string, unknown> | null {
  return decodeJwtPayload(token)
}
