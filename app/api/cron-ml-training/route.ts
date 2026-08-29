/**
 * Cron endpoint for auto-training ML models.
 * Called by cron-job.org after scraping new draws.
 * Trains Markov, Random Forest, Neural Net for all turnos.
 * Uses a time-bound loop (9s budget) to prevent Vercel timeouts.
 * Supports optional AI-enhanced predictions via Groq, Gemini, CRSR, and SK APIs.
 * Persists to Supabase ml_models table.
 */

import { NextRequest, NextResponse } from "next/server"
import { validateCronAuth, unauthorizedResponse, logCronExecution } from "@/lib/cron/auth"
import { autoTrainAll } from "@/lib/ml/auto-train"
import logger from "@/lib/logger"

export const dynamic = "force-dynamic"

const TIME_BUDGET_MS = 9_000 // 9 seconds — safe for Vercel serverless

export async function POST(req: NextRequest) {
  const t0 = Date.now()
  const authResult = await validateCronAuth(req)
  if (!authResult.authorized) {
    return unauthorizedResponse()
  }

  logger.info("[CRON ML] Starting auto-training for all turnos...")

  try {
    const url = new URL(req.url)
    const conectarIA = url.searchParams.get("conectarIA") === "true"

    const deadlineAt = t0 + TIME_BUDGET_MS
    const results = await autoTrainAll(conectarIA, deadlineAt)
    const elapsed = Date.now() - t0
    const partial = elapsed >= TIME_BUDGET_MS

    const summary = results.map(r => ({
      turno: r.turno,
      modelos: r.modelos.length,
      tiempoMs: r.tiempoMs,
      proveedorIA: r.proveedorIA,
    }))

    const totalModels = results.reduce((sum, r) => sum + r.modelos.length, 0)

    logger.info(`[CRON ML] Done: ${totalModels} models trained in ${elapsed}ms${partial ? " (partial)" : ""}`)
    if (conectarIA) {
      logger.info("[CRON ML] AI-enhanced predictions enabled")
    }

    logCronExecution("cron-ml-training", {
      totalModels,
      tiempoMs: elapsed,
      turnos: summary.map((s: { turno: string }) => s.turno).join(","),
      partial,
    }, t0)

    return NextResponse.json({
      ok: true,
      partial,
      totalModels,
      tiempoMs: elapsed,
      proveedorIA: conectarIA ? "groq+gemini+crsr+sk" : "tradicional",
      resultados: summary,
      generado: new Date().toISOString(),
    })
  } catch (e) {
    logger.error("[CRON ML] Error entrenando modelos", { error: String(e) })
    logCronExecution("cron-ml-training", { error: String(e) }, t0)
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
