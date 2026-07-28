/**
 * Cron endpoint for auto-training ML models.
 * Called by cron-job.org after scraping new draws.
 * Trains Markov, Random Forest, Neural Net for all turnos.
 * Supports optional AI-enhanced predictions via Groq, Gemini, CRSR, and SK APIs.
 * Persists to Supabase ml_models table.
 */

import { NextRequest, NextResponse } from "next/server"
import { validateCronAuth, unauthorizedResponse } from "@/lib/cron/auth"
import { autoTrainAll } from "@/lib/ml/auto-train"
import logger from "@/lib/logger"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const authResult = await validateCronAuth(req)
  if (!authResult.authorized) {
    return unauthorizedResponse()
  }

  logger.info("[CRON ML] Starting auto-training for all turnos...")
  const start = Date.now()

  try {
    // Check for query parameter to enable AI-enhanced predictions
    const url = new URL(req.url)
    const conectarIA = url.searchParams.get("conectarIA") === "true"

    const results = await autoTrainAll(conectarIA)
    const elapsed = Date.now() - start

    const summary = results.map(r => ({
      turno: r.turno,
      modelos: r.modelos.length,
      tiempoMs: r.tiempoMs,
      proveedorIA: r.proveedorIA,
    }))

    const totalModels = results.reduce((sum, r) => sum + r.modelos.length, 0)

    logger.info(`[CRON ML] Done: ${totalModels} models trained in ${elapsed}ms`)
    if (conectarIA) {
      logger.info("[CRON ML] AI-enhanced predictions enabled")
    }

    return NextResponse.json({
      ok: true,
      totalModels,
      tiempoMs: elapsed,
      proveedorIA: conectarIA ? "groq+gemini+crsr+sk" : "tradicional",
      resultados: summary,
      generado: new Date().toISOString(),
    })
  } catch {
    logger.error("[CRON ML] Error entrenando modelos")
    return NextResponse.json({ error: "Error entrenando modelos" }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    mensaje: "Cron ML Training - POST only",
    uso: "POST /api/cron-ml-training?conectarIA=true con Authorization: Bearer {CRON_SECRET}",
    descripcion: "Entrena modelos ML para todos los turnos con predicciones mejoradas por IA",
  })
}
