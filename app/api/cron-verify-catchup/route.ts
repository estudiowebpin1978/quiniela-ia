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
import logger from "@/lib/logger"

const SB = () => (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/"/g, "").trim()
const SK = () => (process.env.SUPABASE_SERVICE_ROLE_KEY || "").replace(/"/g, "").trim()

export const maxDuration = 300

export async function GET(req: NextRequest) {
  const start = Date.now()

  const authResult = await validateCronAuth(req)
  if (!authResult.authorized) {
    return unauthorizedResponse()
  }

  logger.info("cron-verify-catchup: authorized", { source: authResult.source })

  // Sweep expired predictions
  let swept = 0
  try {
    const sweepRes = await fetch(
      `${SB()}/rest/v1/rpc/sweep_expired_predictions`,
      {
        method: "POST",
        headers: { "apikey": SK(), "Authorization": `Bearer ${SK()}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(15000),
      }
    )
    if (sweepRes.ok) {
      swept = await sweepRes.json()
    } else {
      logger.error("cron-verify-catchup: sweep HTTP error", { status: sweepRes.status })
    }
  } catch (e) {
    logger.error("cron-verify-catchup: sweep failed", { error: String(e) })
  }

  const duration = Date.now() - start
  logCronExecution("cron-verify-catchup", { swept }, start)

  return NextResponse.json({
    ok: true,
    fecha: new Date().toISOString().split("T")[0],
    swept,
    duration,
    message: swept > 0 ? `${swept} predicciones procesadas` : "Sin predicciones pendientes"
  })
}
