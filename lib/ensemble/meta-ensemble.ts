import { getSupabaseAdmin } from "@/lib/supabase-client"
import logger from "@/lib/logger"

interface EngineWeights {
  V6: number
  V7: number
  ML: number
}

const FALLBACK_WEIGHTS: EngineWeights = { V6: 0.40, V7: 0.35, ML: 0.25 }

// ─── Exponential Decay Constants ─────────────────────────────────────────────
const DECAY_LAMBDA = 0.1

/**
 * Calculate time-decayed weight for a win rate based on days since last update.
 * Formula: decayed_weight = blended_rate * e^(-λ * days_since_update)
 * blended_rate = 80% actual hits + 20% near-misses
 */
export function applyDecay(
  rawRate: number,
  daysSinceUpdate: number,
  nearMissCount: number = 0,
  totalPredictions: number = 1,
): number {
  const decayFactor = Math.exp(-DECAY_LAMBDA * Math.max(0, daysSinceUpdate))
  const nearMissRatio = totalPredictions > 0 ? nearMissCount / totalPredictions : 0
  const blendedRate = (rawRate * 0.8) + (nearMissRatio * 0.2)
  return Math.max(0, Math.min(1, blendedRate * decayFactor))
}

/**
 * Load engine weights with exponential decay applied.
 * Reads hit_count, near_miss_count, total_runs for accurate ratio calculation.
 */
export async function loadEngineWeightsDecayed(turno: string): Promise<EngineWeights> {
  const supabase = getSupabaseAdmin()
  try {
    // 1. Datos acumulados del sistema de verificación en producción (engine_performance)
    const { data, error } = await supabase
      .from("engine_performance")
      .select("engine_name, hit_count, near_miss_count, total_runs, updated_at")
      .eq("turno", turno)

    // 2. Datos del walk-forward backtest real (replay histórico con datos previos como contexto)
    // Esto es más objetivo que engine_performance porque es out-of-sample
    const { data: wfData, error: wfError } = await supabase
      .from("walkforward_results")
      .select("engine_name, is_hit, is_near_miss, test_date")
      .eq("turno", turno)

    if (error || !data || data.length === 0) return FALLBACK_WEIGHTS

    // Procesar datos del backtest real (prioridad alta: datos fuera de muestra)
    const wfStats: Record<string, { hits: number; nearMisses: number; total: number; lastTest: number }> = {}
    if (wfData && !wfError && wfData.length > 0) {
      for (const row of wfData) {
        const eng = row.engine_name as string
        if (!wfStats[eng]) wfStats[eng] = { hits: 0, nearMisses: 0, total: 0, lastTest: 0 }
        wfStats[eng].total += 1
        if (row.is_hit) wfStats[eng].hits += 1
        if (row.is_near_miss) wfStats[eng].nearMisses += 1
        const testTime = new Date(row.test_date).getTime()
        if (testTime > wfStats[eng].lastTest) wfStats[eng].lastTest = testTime
      }
    }

    const now = Date.now()
    const rates: Record<string, number> = {}

    // Combinar: usar datos del backtest si existen (más objetivo, OOS);
    // si no, usar engine_performance con decaída.
    const engines = ["V6", "V7", "ML"]
    for (const eng of engines) {
      // Intentar datos del backtest real primero
      const wf = wfStats[eng]
      if (wf && wf.total >= 10) {
        const rawRate = wf.total > 0 ? wf.hits / wf.total : 0
        // Decay más rápido para datos del replay histórico
        const daysSince = wf.lastTest > 0 ? (now - wf.lastTest) / (1000 * 60 * 60 * 24) : 90
        rates[eng] = applyDecay(rawRate, Math.max(0, daysSince), wf.nearMisses, wf.total)
        continue
      }

      // Fallback a engine_performance con decaída exponencial
      const perfRow = data.find((r) => r.engine_name === eng)
      if (!perfRow) continue // sin fila → se completa con la media más abajo
      const hitCount = perfRow.hit_count != null ? Number(perfRow.hit_count) : 0
      const nearMisses = perfRow.near_miss_count != null ? Number(perfRow.near_miss_count) : 0
      const totalRuns = perfRow.total_runs != null ? Math.max(1, Number(perfRow.total_runs)) : 1
      const rawRate = totalRuns > 0 ? hitCount / totalRuns : 0
      const updatedAt = perfRow.updated_at ? new Date(perfRow.updated_at).getTime() : now
      const daysSince = (now - updatedAt) / (1000 * 60 * 60 * 24)
      rates[eng] = applyDecay(rawRate, daysSince, nearMisses, totalRuns)
    }

    const present = engines.map((e) => rates[e]).filter((v): v is number => typeof v === "number")
    if (present.length === 0) return FALLBACK_WEIGHTS

    // Motor sin datos = NEUTRO (media de los presentes). Un 0.3333 hardcodeado
    // era peligroso: tras el decaimiento (e^-λ·días) los rates presentes pueden
    // ser ~0.03 y el motor ausente recibiría ~90% del peso normalizado.
    const avg = present.reduce((a, b) => a + b, 0) / present.length
    const final = { V6: rates.V6 ?? avg, V7: rates.V7 ?? avg, ML: rates.ML ?? avg }
    const total = final.V6 + final.V7 + final.ML

    if (total <= 0 || total < 0.01) return FALLBACK_WEIGHTS

    return {
      V6: final.V6 / total,
      V7: final.V7 / total,
      ML: final.ML / total,
    }
  } catch {
    return FALLBACK_WEIGHTS
  }
}

/**
 * Load engine weights (legacy alias).
 */
export async function loadEngineWeights(turno: string): Promise<EngineWeights> {
  return loadEngineWeightsDecayed(turno)
}

/**
 * Metadatos de lineage (Objetivo 11): con qué versión/semilla se generó
 * cada fila de engine_predictions_log. Todos opcionales → backward compatible.
 */
export interface LineageInfo {
  /** Versión por motor (V6/V7/ML); si falta se usa el engine_name. */
  engineVersions?: Partial<Record<string, string>>
  /** Identificador de los pesos usados (p.ej. fecha de la fila de factor_weight_history). */
  weightsVersion?: string | null
  /** Semilla del run (hashSeed) para reproducibilidad. */
  seed?: string | null
}

/**
 * Log raw engine predictions for later evaluation.
 * Si se pasa `lineage`, pobla las columnas engine_version/weights_version/seed/
 * generated_at vía UPDATE posterior (la RPC upsert no conoce esas columnas).
 */
export async function logEnginePredictions(
  drawId: string,
  turno: string,
  predsV6: number[],
  predsV7: number[],
  predsML: number[],
  lineage?: LineageInfo,
): Promise<void> {
  const supabase = getSupabaseAdmin()
  const engines = [
    { engine_name: "V6", predicted_numbers: predsV6 },
    { engine_name: "V7", predicted_numbers: predsV7 },
    { engine_name: "ML", predicted_numbers: predsML },
  ]
  for (const eng of engines) {
    const { error } = await supabase.rpc("engine_predictions_log_upsert" as never, {
      p_draw_id: drawId,
      p_turno: turno,
      p_engine_name: eng.engine_name,
      p_predicted_numbers: eng.predicted_numbers,
    } as never)
    if (error) {
      logger.error("[meta-ensemble] logEnginePredictions failed", { engine: eng.engine_name, error: error.message })
      continue
    }
    if (lineage) {
      // Mejor esfuerzo: si falla (p.ej. columnas aún no agregadas), solo warning.
      const { error: linErr } = await supabase
        .from("engine_predictions_log")
        .update({
          engine_version: lineage.engineVersions?.[eng.engine_name] ?? eng.engine_name,
          weights_version: lineage.weightsVersion ?? null,
          seed: lineage.seed ?? null,
          generated_at: new Date().toISOString(),
        })
        .eq("draw_id", drawId)
        .eq("engine_name", eng.engine_name)
      if (linErr) {
        logger.warn("[meta-ensemble] lineage update failed", { engine: eng.engine_name, error: linErr.message })
      }
    }
  }
}

/**
 * Lineage estándar de un run, compartido por los dos writers de
 * engine_predictions_log (cron-run y cron-precompute) para que produzcan
 * metadatos idénticos.
 *
 * - engineVersions: identificadores EXISTENTES del sistema (la tabla
 *   omega_promotion_audit usa old='omega-v1' / new='meta-ensemble-v1').
 *   ML no tiene identificador de versión → se omite y logEnginePredictions
 *   cae a engine_name ("ML"), sin inventar un número de versión.
 * - weightsVersion: registra los pesos de blend REALMENTE usados (reproducible).
 */
export function lineageDelRun(
  seed: number | string,
  blend: { V6: number; V7: number; ML: number },
): LineageInfo {
  return {
    seed: String(seed),
    engineVersions: { V6: "omega-v1", V7: "meta-ensemble-v1" },
    weightsVersion: `blend:v6=${blend.V6.toFixed(3)},v7=${blend.V7.toFixed(3)},ml=${blend.ML.toFixed(3)}`,
  }
}

/**
 * Batch recalculate engine performance from raw predictions.
 * Uses the recalculate_engine_performance() SQL function.
 * Called by cron jobs after verification.
 */
export async function updateEnginePerformance(): Promise<void> {
  const supabase = getSupabaseAdmin()
  const { error } = await supabase.rpc("recalculate_engine_performance" as never)
  if (error) {
    logger.error("[meta-ensemble] updateEnginePerformance failed", { error: error.message })
  }
}

/**
 * Incremental update for a single engine's performance.
 * Calls update_engine_performance(p_engine_name, p_hit, p_near_miss, p_turno).
 * Use this when you know the hit/miss result for a specific engine.
 */
export async function recordEngineHit(
  engineName: string,
  hit: boolean,
  nearMiss: boolean,
  turno: string = "ALL",
): Promise<void> {
  const supabase = getSupabaseAdmin()
  const { error } = await supabase.rpc("update_engine_performance" as never, {
    p_engine_name: engineName,
    p_hit: hit,
    p_near_miss: nearMiss,
    p_turno: turno,
  } as never)
  if (error) {
    logger.error("[meta-ensemble] recordEngineHit failed", { error: error.message })
  }
}
