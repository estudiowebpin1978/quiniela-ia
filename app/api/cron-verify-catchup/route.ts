/**
 * Daily sweep endpoint.
 * Runs at 09:00 UTC (06:00 Argentina) via Vercel Cron.
 *
 * Primary job: sweep_expired_predictions() marks old PENDING predictions as LOST
 * when no draw exists (Sunday/holiday/Saturday-Previa-Primera).
 * Also re-verifies predictions where draw exists but trigger never fired.
 *
 * The trigger trg_verify_predictions handles real-time verification on INSERT.
 * This endpoint is the safety net for edge cases.
 */

import { NextRequest, NextResponse } from "next/server"
import { validateCronAuth, unauthorizedResponse, logCronExecution } from "@/lib/cron/auth"
import { getSupabaseAdmin } from "@/lib/supabase-client"
import logger from "@/lib/logger"

export const maxDuration = 300

export async function GET(req: NextRequest) {
  const start = Date.now()

  const authResult = await validateCronAuth(req)
  if (!authResult.authorized) {
    return unauthorizedResponse()
  }

  logger.info("cron-verify-catchup: authorized", { source: authResult.source })

  const supabase = getSupabaseAdmin()

  // Sweep expired predictions
  let swept = 0
  try {
    const { data, error } = await supabase.rpc("sweep_expired_predictions" as never)
    if (error) {
      logger.error("cron-verify-catchup: sweep failed", { error: error.message })
    } else {
      swept = data || 0
    }
  } catch (e) {
    logger.error("cron-verify-catchup: sweep exception", { error: String(e) })
  }

  const fecha = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format()

  const duration = Date.now() - start
  logCronExecution("cron-verify-catchup", { swept }, start)

  return NextResponse.json({
    ok: true,
    fecha,
    swept,
    duration,
    message: swept > 0 ? `${swept} predicciones procesadas` : "Sin predicciones pendientes"
  })
}
