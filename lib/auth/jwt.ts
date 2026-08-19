/**
 * JWT validation — HMAC signature verification (synchronous, zero network).
 * If SUPABASE_JWT_SECRET is set: verifies HMAC signature + expiry.
 * Otherwise: decode only (fallback, not recommended for production).
 */

import { createHmac, timingSafeEqual } from "crypto"

const JWT_SECRET = (process.env.SUPABASE_JWT_SECRET || "").trim()

function base64UrlDecode(str: string): Buffer {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/")
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4)
  return Buffer.from(padded, "base64")
}

function verifyHmac(headerB64: string, payloadB64: string, signatureB64: string, secret: string): boolean {
  const data = `${headerB64}.${payloadB64}`
  const expectedSig = createHmac("sha256", secret).update(data).digest()
  const actualSig = base64UrlDecode(signatureB64)
  if (expectedSig.length !== actualSig.length) return false
  return timingSafeEqual(expectedSig, actualSig)
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
 * Verifies HMAC signature if SUPABASE_JWT_SECRET is set, otherwise decode-only.
 */
export function validateJwt(token: string): { userId: string; email: string } | null {
  if (!token) return null
  try {
    const parts = token.split(".")
    if (parts.length !== 3) return null

    // Verify HMAC signature if secret available
    if (JWT_SECRET) {
      if (!verifyHmac(parts[0], parts[1], parts[2], JWT_SECRET)) return null
    }

    const payload = JSON.parse(base64UrlDecode(parts[1]).toString("utf8"))
    if (!payload.sub) return null

    // Check expiry
    const exp = payload.exp as number | undefined
    if (exp && exp < Date.now() / 1000) return null

    return { userId: payload.sub as string, email: (payload.email as string) || "" }
  } catch {
    return null
  }
}
