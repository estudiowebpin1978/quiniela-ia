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
  const bufA = Buffer.from(a.padEnd(64, "\0"))
  const bufB = Buffer.from(b.padEnd(64, "\0"))
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
  const expected = process.env.CRON_SECRET

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
      const SB_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/"/g, "").trim()
      const SB_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").replace(/"/g, "").trim()
      
      if (SB_URL && SB_KEY) {
        const adminEmail = (process.env.ADMIN_EMAILS || "estudiowebpin@gmail.com").split(",")[0].toLowerCase()
        const r = await fetch(`${SB_URL}/auth/v1/user`, {
          headers: { "apikey": SB_KEY, "Authorization": `Bearer ${authHeader}` },
          signal: AbortSignal.timeout(3000)
        })
        if (r.ok) {
          const user = await r.json()
          if (user.email?.toLowerCase() === adminEmail) {
            return { authorized: true, source: "admin" }
          }
        }
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
 */
export function logCronExecution(
  endpoint: string,
  result: any,
  startTime: number
): void {
  const elapsed = Date.now() - startTime
  logger.info(`[CRON] ${endpoint} completed`, {
    elapsed,
    ...result
  })
}
