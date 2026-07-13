/**
 * Cron endpoint for auto-training ML models.
 * Called by cron-job.org after scraping new draws.
 * Trains Markov, Random Forest, Neural Net for all turnos.
 * Persists to Supabase ml_models table.
 */

import { NextRequest, NextResponse } from "next/server"
import { autoTrainAll } from "@/lib/ml/auto-train"
import logger from "@/lib/logger"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  // Verify cron secret
  const auth = req.headers.get("authorization")
  const secret = process.env.CRON_SECRET || ""
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 })
  }
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  logger.info("[CRON ML] Starting auto-training for all turnos...")
  const start = Date.now()

  try {
    const results = await autoTrainAll()
    const elapsed = Date.now() - start

    const summary = results.map(r => ({
      turno: r.turno,
      modelos: r.modelos.length,
      tiempoMs: r.tiempoMs,
    }))

    const totalModels = results.reduce((sum, r) => sum + r.modelos.length, 0)

    logger.info(`[CRON ML] Done: ${totalModels} models trained in ${elapsed}ms`)

    return NextResponse.json({
      ok: true,
      totalModels,
      tiempoMs: elapsed,
      resultados: summary,
      generado: new Date().toISOString(),
    })
  } catch (e: any) {
    console.error("[CRON ML] Error:", e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    mensaje: "Cron ML Training - POST only",
    uso: "POST /api/cron-ml-training con Authorization: Bearer {CRON_SECRET}",
  })
}
