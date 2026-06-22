/**
 * Cron endpoint for auto-training ML models.
 * Called by cron-job.org after scraping new draws.
 * Trains Markov, Random Forest, Neural Net for all turnos.
 * Persists to Supabase ml_models table.
 */

import { NextRequest, NextResponse } from "next/server"
import { autoTrainAll } from "@/lib/ml/auto-train"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  // Verify cron secret
  const auth = req.headers.get("authorization")
  const secret = process.env.CRON_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  console.log("[CRON ML] Starting auto-training for all turnos...")
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

    console.log(`[CRON ML] Done: ${totalModels} models trained in ${elapsed}ms`)

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
