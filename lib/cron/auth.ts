/**
 * Centralized cron job validation helpers.
 * Provides consistent authentication and logging for all cron endpoints.
 */

import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "crypto"
import logger from "@/lib/logger"

export interface CronAuthResult {
  authorized: boolean
  reason?: string
  source: "cron-secret" | "admin" | "unknown"
}

function safeCompare(a: string, b: string): boolean {
  if (!a || !b) return false
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

/**
 * Colapsa prefijos "Bearer " anidados en tokens de cron.
 *
 * Contexto real (bug 2026-10-14): en prod el env `CRON_SECRET` está guardado
 * CON el prefijo ("Bearer X") y algunos callers internos lo anteponen otra vez
 * → header "Bearer Bearer X". La comparación anterior sacaba UN solo prefijo
 * y quedaba "Bearer X" ≠ "X" → **401**. El fire-and-forget del webhook
 * (`/api/cron-precompute` tras cada scrape) recibía 401 y predictions_cache no
 * se refrescaba nunca durante el día (la caché servía predicciones viejas).
 *
 * Ahora se normalizan ambos lados: env, header y `?secret=` — cualquier
 * combinación de prefijos colapsa al secreto real.
 */
export function normalizarCronToken(token: string): string {
  let s = token
  for (let i = 0; i < 3 && /^Bearer\s+/i.test(s); i++) {
    s = s.replace(/^Bearer\s+/i, "")
  }
  return s
}

/**
 * Validate cron job authorization.
 * Checks for:
 * 1. CRON_SECRET query parameter or Authorization header
 * 2. Admin user token (optional)
 */
export async function validateCronAuth(req: NextRequest): Promise<CronAuthResult> {
  // Never trust x-vercel-cron as authentication: callers can send that header.
  // Vercel Cron jobs must be configured to send CRON_SECRET as a bearer token.
  // 1. CRON_SECRET (timing-safe comparison)
  const secret = normalizarCronToken(req.nextUrl.searchParams.get("secret") || "")
  const authHeader = req.headers.get("authorization")?.replace("Bearer ", "") || ""
  // Normalize: strip "Bearer " prefix if user accidentally included it in env
  // var (y callers que lo anteponen → "Bearer Bearer X"; ver normalizarCronToken)
  const expected = normalizarCronToken(process.env.CRON_SECRET || "")

  if (expected) {
    if (secret && safeCompare(secret, expected)) {
      return { authorized: true, source: "cron-secret" }
    }
    if (authHeader && safeCompare(normalizarCronToken(authHeader), expected)) {
      return { authorized: true, source: "cron-secret" }
    }
  }

  // 2. Admin token (optional)
  if (authHeader) {
    try {
      const { validateJwt } = await import("@/lib/auth/jwt")
      const { ADMIN_EMAILS } = await import("@/lib/config")
      const decoded = await validateJwt(authHeader)
      if (decoded?.email && ADMIN_EMAILS.includes(decoded.email.toLowerCase())) {
        return { authorized: true, source: "admin" }
      }
    } catch {}
  }

  return { authorized: false, reason: "Unauthorized", source: "unknown" }
}

/**
 * Helper to handle unauthorized cron requests.
 */
export function unauthorizedResponse(): NextResponse {
  logger.warn("Cron request unauthorized")
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
}

/**
 * Log cron job execution.
 * Persists to cron_logs table AND logs to console.
 */
export function logCronExecution(
  endpoint: string,
  result: Record<string, unknown>,
  startTime: number,
): void {
  const elapsed = Date.now() - startTime
  // Detección de fallo real: antes solo `result.error` existente hacía que
  // corridas completamente fallidas se registraran como "success" (p.ej.
  // rutas que devuelven ok:false o totales de error sin campo `error`).
  const r = result as Record<string, unknown>
  const hasError =
    r.error != null ||
    r.ok === false ||
    r.success === false ||
    (typeof r.totalErrors === "number" && r.totalErrors > 0) ||
    (typeof r.errors === "number" && r.errors > 0)

  logger.info(`[CRON] ${endpoint} completed`, {
    elapsed,
    ...result,
  })

  // Persist to cron_logs (fire-and-forget, never block)
  import("@/lib/supabase-client")
    .then(({ getSupabaseAdmin }) => {
      const supabase = getSupabaseAdmin()
      return supabase.from("cron_logs").insert({
        cron_name: endpoint,
        status: hasError ? "error" : "success",
        duration_ms: elapsed,
        error_message: hasError ? String((result as Record<string, unknown>).error) : null,
        metadata: result,
      })
    })
    .catch(() => {})
}
