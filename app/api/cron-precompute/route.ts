/**
 * /api/cron-precompute
 *
 * Pre-computes predictions for all turnos and stores in predictions_cache.
 * Called by cron-job.org after each scrape, or manually.
 *
 * Flow:
 * 1. For each turno, run the full V6+V7+ML pipeline
 * 2. Store blended result in predictions_cache table
 * 3. Next GET /api/predictions reads from cache (< 200ms)
 *
 * Orquestador: auth, loop de turnos, llamadas a los motores y respuesta.
 * La matemática/lógica pura vive en lib/pipeline/precompute/:
 *   - blend.ts        → blend V6+V7+ML, MMR, candidatos 3/4C, confianza
 *   - simulacion.ts   → Monte Carlo sembrado del top-10
 *   - persistencia.ts → histórico, RPCs de scores, log por motor, predictions_cache
 *   - omega-audit.ts  → regla Omega + auditoría de promoción idempotente
 */

import { NextRequest, NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { getSupabaseAdmin } from "@/lib/supabase-client"
import { validateCronAuth, unauthorizedResponse, logCronExecution } from "@/lib/cron/auth"
import { predictEnsembleV7, predictV7ForCandidates } from "@/lib/analisis/engine-v7"
import { loadV7Weights, v7WeightsToFactorBreakdown } from "@/lib/analisis/v7-weights"
import { getMLPredictions, getMLPredictionsForCandidates } from "@/lib/ml/integration"
import { loadEngineWeights } from "@/lib/ensemble/meta-ensemble"
import { invalidateAllPredictionCaches } from "@/lib/cache/prediction-cache-invalidation"
import { hashSeed } from "@/lib/math/seeded-rng"
import logger from "@/lib/logger"

import {
  blendCandidatos,
  blendEngines,
  calcularConfianza,
  construirRedoblona,
  diversifyMMR,
  formatCifras,
  LAMBDA_MMR,
  mapearCandidatosV6,
  mlToBlended,
  numerosTop,
  redondear,
  v7ToBlended,
} from "@/lib/pipeline/precompute/blend"
import type { BlendedPrediction } from "@/lib/pipeline/precompute/blend"
import { simularTop10 } from "@/lib/pipeline/precompute/simulacion"
import {
  cargarHistorico,
  ejecutarV6,
  registrarPrediccionesMotor,
  scoreCifrasV6,
  upsertPredictionsCache,
} from "@/lib/pipeline/precompute/persistencia"
import { auditarReglaOmega } from "@/lib/pipeline/precompute/omega-audit"

export const maxDuration = 300

const TURNOS = ["Previa", "Primera", "Matutina", "Vespertina", "Nocturna", "Poceada"]

export async function GET(req: NextRequest) {
  const t0 = Date.now()
  const auth = await validateCronAuth(req)
  if (!auth.authorized) return unauthorizedResponse()

  const turnoFilter = req.nextUrl.searchParams.get("turno")
  const turnos = turnoFilter ? [turnoFilter] : TURNOS

  const supabase = getSupabaseAdmin()
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format()

  const results: Array<{ turno: string; ok: boolean; confidence?: number; error?: string }> = []

  for (const turno of turnos) {
    const GAME_ID = turno === "Poceada" ? "d0e1f2a3-b4c5-6789-0abc-def012345678" : "ac593199-c299-4f03-b1b7-8675fe4fa6d9"
    try {
      // 1. Semilla determinista por día+turno (antes: hash del último id UUID,
      // que es aleatorio → cambiaba las predicciones al insertarse cualquier fila).
      const ctxSeed = hashSeed(today, turno)

      // 2. Histórico COMPLETO del turno con fecha estrictamente anterior a hoy.
      const draws = await cargarHistorico(supabase, turno, GAME_ID, today)

      const minDraws = turno === "Poceada" ? 3 : 10
      if (!draws || draws.length < minDraws) {
        results.push({ turno, ok: false, error: `Insufficient draws (${draws?.length || 0}/${minDraws})` })
        continue
      }

      // 3. Run V6 (SQL RPC)
      const v6Rows = await ejecutarV6(supabase, turno, today)

      // 4. Run V7 (TypeScript engine)
      let v7Predictions: BlendedPrediction[] = []
      let weights: ReturnType<typeof v7WeightsToFactorBreakdown> | null = null
      try {
        const v7Weights = await loadV7Weights(turno)
        weights = v7WeightsToFactorBreakdown(v7Weights)
        const v7Result = await predictEnsembleV7(draws, turno, 10, ctxSeed, weights)
        v7Predictions = v7ToBlended(v7Result.predictions)
      } catch (e) {
        logger.warn("[cron-precompute] V7 failed", { turno, error: String(e) })
      }

      // 5. Run ML (Random Forest + Neural Net + Markov)
      let mlPredictions: BlendedPrediction[] = []
      try {
        const mlResult = await getMLPredictions(turno, draws)
        if (mlResult?.available && mlResult.scores.size > 0) {
          mlPredictions = mlToBlended(mlResult.scores)
        }
      } catch (e) {
        logger.warn("[cron-precompute] ML failed", { turno, error: String(e) })
      }

      // 6. Blend V6 + V7 + ML with dynamic weights
      // Motor híbrido: V6 SQL + V7 TS + ML + análisis rápido (get_analisis_rapido RPC)
      let engineWeights = { V6: 0.40, V7: 0.35, ML: 0.25 }
      try { engineWeights = await loadEngineWeights(turno) } catch { /* use defaults */ }
      const blended = blendEngines({ v6Rows, v7Predictions, mlPredictions, engineWeights })

      // Log raw predictions for each engine (before blend) contra el sorteo de
      // HOY de este turno (si ya existe el resultado): alimenta
      // engine_predictions_log → recalculate_engine_performance → pesos dinámicos.
      const topNums = numerosTop(v6Rows, v7Predictions, mlPredictions)
      const { lineageDelRun } = await import("@/lib/ensemble/meta-ensemble")
      await registrarPrediccionesMotor(supabase, { turno, gameId: GAME_ID, today, numeros: topNums, lineage: lineageDelRun(ctxSeed, engineWeights) })

      // Guard: if all engines produced nothing, skip this turno
      if (blended.length === 0) {
        results.push({ turno, ok: false, error: "All engines produced empty predictions" })
        continue
      }

      // Meta-diversidad real (MMR determinista): diversifica determinísticamente usando scores y factor_attribution
      const diversidad = diversifyMMR(blended)
      const blendedDiversified = diversidad.seleccion.slice(0, 10)
      if (diversidad.diversityRatio < 0.05) logger.info("[cron-precompute] Meta-diversidad MMR aplicada", { turno, diversityRatio: diversidad.diversityRatio, lambdaMMR: LAMBDA_MMR, selectedCount: diversidad.seleccion.length })

      // Generate 3/4 cifras: V6 top-30 candidates → V7/ML re-score → blend
      const top10nums = blendedDiversified.map((p) => p.n)

      const { tres: v6_3rows, cuatro: v6_4rows } = await scoreCifrasV6(supabase, turno, today)

      // Take top-30 V6 candidates for V7/ML re-scoring
      const v6_3cands = mapearCandidatosV6(v6_3rows)
      const v6_4cands = mapearCandidatosV6(v6_4rows)

      // V7 re-scoring for 3C/4C candidates
      let v7_3cScores = new Map<number, number>()
      let v7_4cScores = new Map<number, number>()
      if (weights) {
        try {
          const v7_3cPreds = await predictV7ForCandidates(draws, turno, v6_3cands.map(c => c.numero), 3, weights, ctxSeed)
          for (const p of v7_3cPreds) v7_3cScores.set(parseInt(p.numero), p.score)
          const v7_4cPreds = await predictV7ForCandidates(draws, turno, v6_4cands.map(c => c.numero), 4, weights, ctxSeed)
          for (const p of v7_4cPreds) v7_4cScores.set(parseInt(p.numero), p.score)
        } catch (e) {
          logger.warn("[cron-precompute] V7 3C/4C scoring failed", { turno, error: String(e) })
        }
      }

      // ML re-scoring for 3C/4C candidates
      let ml_3cScores = new Map<number, number>()
      let ml_4cScores = new Map<number, number>()
      try {
        const ml_3c = await getMLPredictionsForCandidates(turno, draws, v6_3cands.map(c => c.numero), 3)
        if (ml_3c.available) ml_3cScores = ml_3c.scores
        const ml_4c = await getMLPredictionsForCandidates(turno, draws, v6_4cands.map(c => c.numero), 4)
        if (ml_4c.available) ml_4cScores = ml_4c.scores
      } catch (e) {
        logger.warn("[cron-precompute] ML 3C/4C scoring failed", { turno, error: String(e) })
      }

      // Blend V6 + V7 + ML for 3C / 4C
      const blended3 = blendCandidatos(v6_3cands, v7_3cScores, ml_3cScores, engineWeights)
      const blended4 = blendCandidatos(v6_4cands, v7_4cScores, ml_4cScores, engineWeights)

      const numeros_3 = formatCifras(blended3, 3)
      const numeros_4 = formatCifras(blended4, 4)
      if (numeros_3.length === 0) logger.warn("[cron-precompute] 3 cifras empty", { turno, dataLen: v6_3rows?.length ?? 0 })

      const redoblona = construirRedoblona(top10nums)

      // Monte Carlo sembrado: capa de estabilidad del top-10 (no toca scores
      // ni ranking; determinista por día+turno).
      const monteCarlo = simularTop10(draws, top10nums, today, turno)

      // 7. Compute confidence and agreement
      const { agreement, modelConsistency } = calcularConfianza(topNums, draws.length)

      // 8. Store in predictions_cache via api schema RPC
      await upsertPredictionsCache(supabase, {
        gameId: GAME_ID,
        date: today,
        turno,
        blendedDiversified,
        numeros_3,
        numeros_4,
        redoblona,
        engineWeights,
        confidence: modelConsistency,
        agreement,
        monteCarlo,
      })

      // Regla Omega: validar que los resultados cumplen con mejora OOS antes de
      // producción + registrar auditoría de promoción (idempotente por día)
      await auditarReglaOmega(supabase, {
        turno,
        today,
        sampleSize: results.filter(r => r.ok).length,
        engineWeights,
      })

      results.push({ turno, ok: true, confidence: redondear(modelConsistency, 2) })
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : typeof e === 'object' && e !== null ? JSON.stringify(e) : String(e)
      logger.error("[cron-precompute] Failed", { turno, error: errMsg })
      results.push({ turno, ok: false, error: errMsg })
    }
  }

  const elapsed = Date.now() - t0
  logger.info("[cron-precompute] Completed", { turnos: results.length, elapsed })
  logCronExecution("cron-precompute", { results, elapsed }, t0)

  // Invalidar Redis / generation bump para que /api/predictions no sirva cache obsoleto
  await invalidateAllPredictionCaches()

  // On-Demand ISR: purge static pages so fresh predictions appear immediately
  try {
    revalidatePath("/", "layout")
    revalidatePath("/pronostico/[fecha]", "page")
    revalidatePath("/resultado/[fecha]", "page")
    revalidatePath("/predictions", "page")
  } catch { /* non-fatal */ }

  return NextResponse.json({ ok: true, results, elapsed })
}
