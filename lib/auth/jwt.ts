/**
 * JWT local decoding - NO network calls to Supabase Auth.
 * This is the ONLY way to validate tokens in API routes.
 */

export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const base64 = token.split(".")[1]
    if (!base64) return null
    const json = Buffer.from(base64, "base64url").toString("utf8")
    const payload = JSON.parse(json)
    if (!payload.sub) return null
    return payload
  } catch {
    return null
  }
}

export function validateJwt(token: string): { userId: string; email: string } | null {
  const payload = decodeJwtPayload(token)
  if (!payload) return null

  const exp = payload.exp as number | undefined
  if (exp && exp < Date.now() / 1000) return null

  const sub = payload.sub as string | undefined
  if (!sub) return null

  return {
    userId: sub,
    email: (payload.email as string) || "",
  }
}
