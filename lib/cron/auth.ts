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
  source: "vercel-cron" | "cron-secret" | "admin" | "unknown"
}

function safeCompare(a: string, b: string): boolean {
  if (!a || !b) return false
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

/**
 * Validate cron job authorization.
 * Checks for:
 * 1. Vercel Cron header (x-vercel-cron)
 * 2. CRON_SECRET query parameter or Authorization header
 * 3. Admin user token (optional)
 */
export async function validateCronAuth(req: NextRequest): Promise<CronAuthResult> {
  // 1. Vercel Cron
  if (req.headers.get("x-vercel-cron") === "1") {
    return { authorized: true, source: "vercel-cron" }
  }

  // 2. CRON_SECRET (timing-safe comparison)
  const secret = req.nextUrl.searchParams.get("secret") || ""
  const authHeader = req.headers.get("authorization")?.replace("Bearer ", "") || ""
  // Normalize: strip "Bearer " prefix if user accidentally included it in env var
  const expected = (process.env.CRON_SECRET || "").replace(/^Bearer\s+/i, "")

  if (expected) {
    if (secret && safeCompare(secret, expected)) {
      return { authorized: true, source: "cron-secret" }
    }
    if (authHeader && safeCompare(authHeader, expected)) {
      return { authorized: true, source: "cron-secret" }
    }
  }

  // 3. Admin token (optional)
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
  const hasError = !!(result as Record<string, unknown>).error

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
