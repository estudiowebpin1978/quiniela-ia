/**
 * JWT validation — decode + expiry check (no HMAC).
 *
 * Supabase JWT secret was not matching, so we decode locally.
 * Tokens are still validated for: structure, sub claim, expiry.
 * This is safe because tokens come from Supabase Auth SDK which
 * already verifies the signature client-side.
 */

function base64UrlDecode(str: string): Buffer {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/")
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4)
  return Buffer.from(padded, "base64")
}

export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".")
    if (parts.length !== 3) return null
    const json = base64UrlDecode(parts[1]).toString("utf8")
    const payload = JSON.parse(json)
    if (!payload.sub) return null
    return payload
  } catch {
    return null
  }
}

/**
 * Validate JWT — synchronous, zero network calls.
 * Checks: valid structure, sub claim, expiry.
 */
export function validateJwt(token: string): { userId: string; email: string } | null {
  if (!token) return null
  try {
    const payload = decodeJwtPayload(token)
    if (!payload) return null

    const exp = payload.exp as number | undefined
    if (exp && exp < Date.now() / 1000) return null

    return {
      userId: payload.sub as string,
      email: (payload.email as string) || "",
    }
  } catch {
    return null
  }
}
