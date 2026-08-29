/**
 * Cron endpoint for pre-calculating turn analytics.
 * 
 * Called by cron-job.org after scraping completes.
 * Runs Shannon Entropy, Survival Analysis, Inter-Turno Markov,
 * and Genetic Weight Optimization for all turnos.
 * 
 * Results are stored in the `turn_analytics` table for instant UI delivery.
 */

import { NextRequest, NextResponse } from "next/server"
import { validateCronAuth, unauthorizedResponse, logCronExecution } from "@/lib/cron/auth"
import { computeAllTurnAnalytics } from "@/lib/analisis/turn-analytics"
import { revalidateTag } from "next/cache"
import logger from "@/lib/logger"

export const maxDuration = 120

export async function POST(req: NextRequest) {
  const auth = await validateCronAuth(req)
  if (!auth.authorized) return unauthorizedResponse()

  const t0 = Date.now()
  let status = "ok"
  let error: string | undefined

  try {
    logger.info("[cron-analytics] Starting turn analytics pre-calculation")

    // Run the complete analytics pipeline
    await computeAllTurnAnalytics()

    // Invalidate prediction cache so next requests use fresh analytics
    try {
      revalidateTag('predictions', "max")
      revalidateTag('predictions-Matutina', "max")
      revalidateTag('predictions-Vespertina', "max")
      revalidateTag('predictions-Nocturna', "max")
    } catch {}

    const elapsed = Date.now() - t0
    logger.info(`[cron-analytics] Analytics pre-calculation complete in ${elapsed}ms`)

    logCronExecution("cron-analytics", { elapsed, status: "ok" }, t0)
    return NextResponse.json({ ok: true, elapsed_ms: elapsed })
  } catch (e: unknown) {
    status = "error"
    error = (e as Error).message || String(e)
    logger.error("[cron-analytics] Error:", { error })
    logCronExecution("cron-analytics", { status: "error", error }, t0)
    return NextResponse.json({ ok: false, error }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  // Allow GET for manual triggering (with auth)
  return POST(req)
}
