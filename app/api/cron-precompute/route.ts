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
 */

import { NextRequest, NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { getSupabaseAdmin } from "@/lib/supabase-client"
import { validateCronAuth, unauthorizedResponse, logCronExecution } from "@/lib/cron/auth"
import { predictEnsembleV7, predictV7ForCandidates } from "@/lib/analisis/engine-v7"
import { loadV7Weights, v7WeightsToFactorBreakdown } from "@/lib/analisis/v7-weights"
import { getMLPredictions, getMLPredictionsForCandidates } from "@/lib/ml/integration"
import { loadEngineWeights, logEnginePredictions } from "@/lib/ensemble/meta-ensemble"
import { invalidateAllPredictionCaches } from "@/lib/cache/prediction-cache-invalidation"
import { runMonteCarlo } from "@/lib/analisis/monte-carlo"
import { hashSeed } from "@/lib/math/seeded-rng"
import logger from "@/lib/logger"

import { SUENOS } from "@/lib/suenos"
import type { Draw } from "@/lib/analisis/engine-v7"

export const maxDuration = 300

const TURNOS = ["Previa", "Primera", "Matutina", "Vespertina", "Nocturna", "Poceada"]

interface BlendedPrediction {
  n: number
  numero: string
  score: number
  factor_attribution: Record<string, number>
}

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
      // Antes: .lte("id", lastDrawId) — los id son UUIDs aleatorios, así que el
      // filtro dejaba un subconjunto arbitrario (~50%) del histórico y cambiaba
      // entre corridas (inestabilidad) además de filtrar de forma no determinista.
      const { data: histDraws } = await supabase
        .from("draws")
        .select("id, date, turno, numbers")
        .eq("turno", turno)
        .eq("game_id", GAME_ID)
        .lt("date", today)
        .order("date", { ascending: true })

      const minDraws = turno === "Poceada" ? 3 : 10
      if (!histDraws || histDraws.length < minDraws) {
        results.push({ turno, ok: false, error: `Insufficient draws (${histDraws?.length || 0}/${minDraws})` })
        continue
      }

      const draws: Draw[] = histDraws.map((d: Record<string, unknown>) => ({
        fecha: d.date as string,
        turno: d.turno as string,
        numbers: d.numbers as number[],
      }))

      // 2. Run V6 (SQL RPC)
      const { data: v6Rows, error: v6RpcErr } = await supabase.rpc("calculate_omega_v6", {
        p_turno: turno,
        p_tier: "free",
        p_date: today,
      })
      if (v6RpcErr) {
        logger.warn("[cron-precompute] V6 RPC error", { turno, error: JSON.stringify(v6RpcErr) })
      }

      // 3. Run V7 (TypeScript engine)
      let v7Predictions: BlendedPrediction[] = []
      let weights: ReturnType<typeof v7WeightsToFactorBreakdown> | null = null
      try {
        const v7Weights = await loadV7Weights(turno)
        weights = v7WeightsToFactorBreakdown(v7Weights)
        const v7Result = await predictEnsembleV7(draws, turno, 10, ctxSeed, weights)
        v7Predictions = v7Result.predictions.map((p) => ({
          n: parseInt(p.numero),
          numero: p.numero,
          score: p.score,
          factor_attribution: {},
        }))
      } catch (e) {
        logger.warn("[cron-precompute] V7 failed", { turno, error: String(e) })
      }

      // 4. Run ML (Random Forest + Neural Net + Markov)
      let mlPredictions: BlendedPrediction[] = []
      try {
        const mlResult = await getMLPredictions(turno, draws)
        if (mlResult?.available && mlResult.scores.size > 0) {
          mlPredictions = Array.from(mlResult.scores.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([num, score]) => ({
              n: num,
              numero: num < 10 ? `0${num}` : `${num}`,
              score,
              factor_attribution: {},
            }))
        }
      } catch (e) {
        logger.warn("[cron-precompute] ML failed", { turno, error: String(e) })
      }

      // 5. Blend V6 + V7 + ML with dynamic weights
      // Motor híbrido: V6 SQL + V7 TS + ML + análisis rápido (get_analisis_rapido RPC)
      let engineWeights = { V6: 0.40, V7: 0.35, ML: 0.25 }
      try { engineWeights = await loadEngineWeights(turno) } catch { /* use defaults */ }
      const allNums = new Map<number, BlendedPrediction>()

      // V6 scores
      if (v6Rows && Array.isArray(v6Rows)) {
        for (const row of v6Rows.slice(0, 20) as Array<Record<string, unknown>>) {
          const num = row.numero as number
          const score = (row.puntaje_total as number) || 0
          const fa = (row.factor_attribution as Record<string, number>) || {}
          allNums.set(num, {
            n: num,
            numero: num < 10 ? `0${num}` : `${num}`,
            score: score * engineWeights.V6,
            factor_attribution: fa,
          })
        }
      }

      // V7 blend
      for (const pred of v7Predictions) {
        const existing = allNums.get(pred.n)
        const v7Score = pred.score * engineWeights.V7
        if (existing) {
          existing.score += v7Score
        } else {
          allNums.set(pred.n, { ...pred, score: v7Score })
        }
      }

      // ML blend
      for (const pred of mlPredictions) {
        const existing = allNums.get(pred.n)
        const mlScore = pred.score * engineWeights.ML
        if (existing) {
          existing.score += mlScore
        } else {
          allNums.set(pred.n, { ...pred, score: mlScore })
        }
      }

      // Log raw predictions for each engine (before blend) contra el sorteo de
      // HOY de este turno (si ya existe el resultado): alimenta
      // engine_predictions_log → recalculate_engine_performance → pesos dinámicos.
      const v6Nums = (v6Rows || []).slice(0, 10).map((r: Record<string, unknown>) => r.numero as number)
      const v7Nums = v7Predictions.slice(0, 10).map(p => p.n)
      const mlNums = mlPredictions.slice(0, 10).map(p => p.n)
      try {
        const { data: todayDraw } = await supabase
          .from("draws")
          .select("id")
          .eq("turno", turno)
          .eq("date", today)
          .eq("game_id", GAME_ID)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
        if (todayDraw?.id) {
          await logEnginePredictions(todayDraw.id as string, turno, v6Nums, v7Nums, mlNums)
        }
      } catch { /* non-fatal — don't crash the turno for logging failures */ }

      // Sort and take top 10
      const blended = Array.from(allNums.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, 10)

      // Guard: if all engines produced nothing, skip this turno
      if (blended.length === 0) {
        results.push({ turno, ok: false, error: "All engines produced empty predictions" })
        continue
      }

      // Meta-diversidad real (MMR determinista): diversifica determinísticamente usando scores y factor_attribution
      const maxScore = blended[0]?.score || 1
      const minScore = blended[blended.length - 1]?.score || 0
      const diversityRatio = maxScore > 0 ? (maxScore - minScore) / maxScore : 0

      // MMR determinista: lambda = 0.7 (balance score vs diversidad basada en factores)
      const lambdaMMR = 0.7
      const selected: typeof blended = []
      const remaining = [...blended]
      while (selected.length < 10 && remaining.length > 0) {
        let bestMMR = -Infinity
        let bestIdx = 0
        for (let i = 0; i < remaining.length; i++) {
          const scoreNorm = remaining[i].score / maxScore
          // Similitud determinista basada en factor_attribution (no aleatorio)
          const maxSim = selected.length > 0 ? Math.max(...selected.map((s) => {
            const fa1 = remaining[i].factor_attribution as Record<string, number> || {}
            const fa2 = s.factor_attribution as Record<string, number> || {}
            const keys = Object.keys(fa1).filter(k => fa2.hasOwnProperty(k))
            if (keys.length === 0) return 0
            const avgDiff = keys.reduce((acc, k) => acc + Math.abs((fa1[k] || 0) - (fa2[k] || 0)), 0) / keys.length
            return 1 - Math.min(avgDiff, 1) // 1 = iguales, 0 = completamente diferentes
          })) : 0
          const mmr = lambdaMMR * scoreNorm - (1 - lambdaMMR) * maxSim
          if (mmr > bestMMR) {
            bestMMR = mmr
            bestIdx = i
          }
        }
        selected.push(remaining[bestIdx])
        remaining.splice(bestIdx, 1)
      }
      const blendedDiversified = selected.slice(0, 10)

      const diversityNote = diversityRatio < 0.05 ? "BAJA DIVERSIDAD: MMR determinista aplicado (lambda=0.7, basado en factor_attribution)." : "Diversidad aceptable."
      if (diversityRatio < 0.05) logger.info("[cron-precompute] Meta-diversidad MMR aplicada", { turno, diversityRatio, lambdaMMR, selectedCount: selected.length })

      // Generate 3/4 cifras: V6 top-30 candidates → V7/ML re-score → blend
      const top10nums = blendedDiversified.map((p) => p.n)

      const [v6_3rows, v6_4rows] = await Promise.all([
        supabase.rpc("score_numbers_v6" as never, {
          p_turno: turno,
          p_date: today,
          p_digit_space: "3",
          p_modulus: 1000,
          p_series_start: 0,
          p_series_end: 999,
        } as never),
        supabase.rpc("score_numbers_v6" as never, {
          p_turno: turno,
          p_date: today,
          p_digit_space: "4",
          p_modulus: 10000,
          p_series_start: 0,
          p_series_end: 9999,
        } as never),
      ])

      if (v6_3rows.error) logger.warn("[cron-precompute] 3 cifras RPC error", { turno, error: String(v6_3rows.error) })
      if (v6_4rows.error) logger.warn("[cron-precompute] 4 cifras RPC error", { turno, error: String(v6_4rows.error) })

      // Take top-30 V6 candidates for V7/ML re-scoring
      const v6_3cands: Array<{ numero: number; v6Score: number }> = (v6_3rows.data || []).slice(0, 30).map((r: Record<string, unknown>) => ({
        numero: Number(r.numero ?? r.num_val),
        v6Score: Number(r.score_val ?? r.puntaje_total) || 0,
      }))
      const v6_4cands: Array<{ numero: number; v6Score: number }> = (v6_4rows.data || []).slice(0, 30).map((r: Record<string, unknown>) => ({
        numero: Number(r.numero ?? r.num_val),
        v6Score: Number(r.score_val ?? r.puntaje_total) || 0,
      }))

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

      // Blend V6 + V7 + ML for 3C
      const blended3 = v6_3cands.map(c => {
        const v7s = v7_3cScores.get(c.numero) || 0
        const mls = ml_3cScores.get(c.numero) || 0
        const blendedScore = c.v6Score * engineWeights.V6 + v7s * engineWeights.V7 + mls * engineWeights.ML
        return { numero: c.numero, score: blendedScore }
      }).sort((a, b) => b.score - a.score)

      // Blend V6 + V7 + ML for 4C
      const blended4 = v6_4cands.map(c => {
        const v7s = v7_4cScores.get(c.numero) || 0
        const mls = ml_4cScores.get(c.numero) || 0
        const blendedScore = c.v6Score * engineWeights.V6 + v7s * engineWeights.V7 + mls * engineWeights.ML
        return { numero: c.numero, score: blendedScore }
      }).sort((a, b) => b.score - a.score)

      const numeros_3 = blended3.slice(0, 10).map((r) => String(r.numero).padStart(3, "0"))
      const numeros_4 = blended4.slice(0, 10).map((r) => String(r.numero).padStart(4, "0"))
      if (numeros_3.length === 0) logger.warn("[cron-precompute] 3 cifras empty", { turno, dataLen: v6_3rows.data?.length ?? 0 })

      const redoblona = top10nums.length >= 2
        ? { cabeza: String(top10nums[0]).padStart(2, "0"), acompanante: String(top10nums[1]).padStart(2, "0") }
        : null

      // Monte Carlo sembrado: capa de estabilidad del top-10 (no toca scores
      // ni ranking; determinista por día+turno).
      let monteCarlo: ReturnType<typeof runMonteCarlo> = null
      try {
        monteCarlo = runMonteCarlo(draws, top10nums, hashSeed("mc", today, turno))
      } catch (e) {
        logger.warn("[cron-precompute] Monte Carlo failed", { turno, error: String(e) })
      }

      // 6. Compute confidence and agreement
      const v6Top10 = new Set<number>(
        (v6Rows || []).slice(0, 10).map((r: Record<string, unknown>) => r.numero as number)
      )
      const v7Top10 = new Set<number>(v7Predictions.slice(0, 10).map((p) => p.n))
      const mlTop10 = new Set<number>(mlPredictions.slice(0, 10).map((p) => p.n))

      // Agreement: % of V6 top-10 that also appear in V7 or ML top-10
      let agreementCount = 0
      for (const num of v6Top10) {
        if (v7Top10.has(num) || mlTop10.has(num)) agreementCount++
      }
      const agreement = agreementCount / Math.max(v6Top10.size, 1)

      // Modelo de consistencia (NO probabilidad de acierto)
      const modelConsistency = Math.min(
        1,
        Math.max(
          0,
          (Math.min(histDraws.length, 100) / 100) * 0.5 +
            Math.max(0, Math.min(1, agreement)) * 0.5
        )
      )

      // 7. Store in predictions_cache via api schema RPC
      const { error: upsertError } = await supabase.schema("api").rpc("predictions_cache_upsert" as never, {
        p_game_id: GAME_ID,
        p_date: today,
        p_turno: turno,
        p_numeros_2: blendedDiversified.map((p) => ({
          n: p.n,
          numero: p.numero,
          score: Math.round(p.score * 1000) / 1000,
          emoji: getEmoji(p.n),
          significado: getSignificado(p.n),
          factor_attribution: p.factor_attribution,
        })),
        p_numeros_3: numeros_3,
        p_numeros_4: numeros_4,
        p_redoblona: redoblona,
        p_engine_version: "meta-ensemble-v1",
        p_v6_weight: Math.round(engineWeights.V6 * 10000) / 10000,
        p_v7_weight: Math.round(engineWeights.V7 * 10000) / 10000,
        p_ml_weight: Math.round(engineWeights.ML * 10000) / 10000,
        // confidence = consistencia del modelo (NO probabilidad de acierto;
        // el tipo es fijo en código: "model_consistency")
        p_confidence: Math.round(modelConsistency * 100) / 100,
        p_agreement_score: Math.round(agreement * 100) / 100,
        p_computed_at: new Date().toISOString(),
        p_updated_at: new Date().toISOString(),
        p_monte_carlo: monteCarlo,
      } as never)

      if (upsertError) {
        logger.error("[cron-precompute] upsert error", { turno, error: JSON.stringify(upsertError), numeros3Len: numeros_3.length, numeros4Len: numeros_4.length })
        throw upsertError
      }

      // Regla Omega: validar que los resultados cumplen con mejora OOS antes de producción
      try {
        const { data: omegaResult } = await supabase.rpc("omega_rule_validation" as never)
        const omegaPass = omegaResult ? (omegaResult as Record<string, unknown>).omega_pass !== false : true
        if (omegaResult && omegaPass === false) {
          logger.warn("[cron-precompute] Regla Omega: técnica no supera umbral OOS", { turno, omega: omegaResult })
        }
        // Registrar auditoría de promoción con datos del replay actual
        const { error: auditErr } = await supabase.rpc("register_omega_promotion" as never, {
          p_turno: turno,
          p_old_version: "omega-v1",
          p_new_version: "meta-ensemble-v1",
          p_decision: omegaPass === false ? "REJECTED" : "APPROVED",
          p_reason: omegaPass === false ? "Regla Omega: técnica no supera umbral OOS (backtest)." : "Regla Omega: técnica supera umbral OOS.",
          p_sample_size: results.filter(r => r.ok).length,
          p_metrics_before: { engine: "meta-ensemble-v1", note: "current" },
          p_metrics_after: { engine: "meta-ensemble-v1", note: "replay_OOS", omega: omegaResult },
          p_weights_before: { v6: Math.round(engineWeights.V6 * 10000) / 10000, v7: Math.round(engineWeights.V7 * 10000) / 10000, ml: Math.round(engineWeights.ML * 10000) / 10000 },
          p_weights_after: { v6: Math.round(engineWeights.V6 * 10000) / 10000, v7: Math.round(engineWeights.V7 * 10000) / 10000, ml: Math.round(engineWeights.ML * 10000) / 10000 },
          p_calibration_before: { note: "before_replay" },
          p_calibration_after: { note: "after_replay", omega_result: omegaResult },
          p_period_start: new Date(today).toISOString().split("T")[0],
          p_period_end: new Date(today).toISOString().split("T")[0],
        } as never)
        if (auditErr) logger.warn("[cron-precompute] Omega audit registration failed", { turno, error: JSON.stringify(auditErr) })
      } catch (omegaErr: unknown) {
        logger.warn("[cron-precompute] Regla Omega: verificación fallida (no bloquea)", { turno, error: (omegaErr as Error).message })
      }

      results.push({ turno, ok: true, confidence: Math.round(modelConsistency * 100) / 100 })
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

function getEmoji(n: number): string {
  return SUENOS[n]?.emoji || "❓"
}

function getSignificado(n: number): string {
  return SUENOS[n]?.nombre || "❓"
}
