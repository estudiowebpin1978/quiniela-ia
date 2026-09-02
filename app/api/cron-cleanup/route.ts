/**
 * /api/cron-cleanup
 *
 * Daily cleanup: prunes old logs to stay within Supabase Free 500MB limit.
 * Calls the cleanup_old_logs() RPC which deletes data older than 30 days.
 */

import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-client"
import { validateCronAuth, unauthorizedResponse, logCronExecution } from "@/lib/cron/auth"
import logger from "@/lib/logger"

export const maxDuration = 30

export async function GET(req: NextRequest) {
  const t0 = Date.now()
  const auth = await validateCronAuth(req)
  if (!auth.authorized) return unauthorizedResponse()

  const supabase = getSupabaseAdmin()

  try {
    const { error } = await supabase.rpc("cleanup_old_logs" as never)

    if (error) {
      logger.error("[cron-cleanup] RPC failed", { error: String(error) })
      return NextResponse.json({ ok: false, error: String(error) }, { status: 500 })
    }

    const elapsed = Date.now() - t0
    logger.info("[cron-cleanup] Completed", { elapsed })
    logCronExecution("cron-cleanup", { ok: true, elapsed }, t0)

    return NextResponse.json({ ok: true, elapsed })
  } catch (e) {
    const elapsed = Date.now() - t0
    logger.error("[cron-cleanup] Failed", { error: String(e), elapsed })
    logCronExecution("cron-cleanup", { ok: false, error: String(e) }, t0)
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
