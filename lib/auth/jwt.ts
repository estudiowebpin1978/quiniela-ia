/**
 * JWT validation — HMAC signature verification (synchronous, zero network).
 *
 * Strategy: try raw secret first (most common), then base64-decoded.
 * Supabase JWT secrets are typically used as-is string keys.
 */

import { createHmac, timingSafeEqual } from "crypto"

const JWT_SECRET_RAW = (process.env.SUPABASE_JWT_SECRET || "").trim()

function base64UrlDecode(str: string): Buffer {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/")
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4)
  return Buffer.from(padded, "base64")
}

function verifyHmac(headerB64: string, payloadB64: string, signatureB64: string, key: string | Buffer): boolean {
  const data = `${headerB64}.${payloadB64}`
  const expectedSig = createHmac("sha256", key).update(data).digest()
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
 * Tries raw secret, then base64-decoded secret for HMAC verification.
 */
export function validateJwt(token: string): { userId: string; email: string } | null {
  if (!token) return null
  try {
    const parts = token.split(".")
    if (parts.length !== 3) return null

    // Verify HMAC signature
    if (JWT_SECRET_RAW) {
      // Try 1: raw string as key
      const rawOk = verifyHmac(parts[0], parts[1], parts[2], JWT_SECRET_RAW)
      if (!rawOk) {
        // Try 2: base64-decoded key
        const padded = JWT_SECRET_RAW + "=".repeat((4 - (JWT_SECRET_RAW.length % 4)) % 4)
        const decodedKey = Buffer.from(padded, "base64")
        const decodedOk = verifyHmac(parts[0], parts[1], parts[2], decodedKey)
        if (!decodedOk) return null
      }
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
