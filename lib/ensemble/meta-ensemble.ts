import { getSupabaseAdmin } from "@/lib/supabase-client"
import logger from "@/lib/logger"

interface EngineWeights {
  V6: number
  V7: number
  ML: number
}

const FALLBACK_WEIGHTS: EngineWeights = { V6: 0.33, V7: 0.33, ML: 0.34 }

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
    const { data, error } = await supabase
      .from("engine_performance")
      .select("engine_name, hit_count, near_miss_count, total_runs, updated_at")
      .eq("turno", turno)

    if (error || !data || data.length === 0) return FALLBACK_WEIGHTS

    const now = Date.now()
    const rates: Record<string, number> = {}
    let total = 0

    for (const row of data) {
      const hitCount = Number(row.hit_count) ?? 0
      const nearMisses = Number(row.near_miss_count) ?? 0
      const totalRuns = Number(row.total_runs) ?? 1
      const rawRate = totalRuns > 0 ? hitCount / totalRuns : 0.3333
      const updatedAt = row.updated_at ? new Date(row.updated_at).getTime() : now
      const daysSince = (now - updatedAt) / (1000 * 60 * 60 * 24)

      const decayedRate = applyDecay(rawRate, daysSince, nearMisses, totalRuns)
      rates[row.engine_name] = decayedRate
      total += decayedRate
    }

    if (total <= 0) return FALLBACK_WEIGHTS

    return {
      V6: (rates.V6 || 0.3333) / total,
      V7: (rates.V7 || 0.3333) / total,
      ML: (rates.ML || 0.3333) / total,
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
 * Log raw engine predictions for later evaluation.
 */
export async function logEnginePredictions(
  drawId: string,
  turno: string,
  predsV6: number[],
  predsV7: number[],
  predsML: number[],
): Promise<void> {
  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from("engine_predictions_log").upsert(
    [
      { draw_id: drawId, turno, engine_name: "V6", predicted_numbers: predsV6 },
      { draw_id: drawId, turno, engine_name: "V7", predicted_numbers: predsV7 },
      { draw_id: drawId, turno, engine_name: "ML", predicted_numbers: predsML },
    ],
    { onConflict: "draw_id,engine_name" },
  )
  if (error) {
    logger.error("[meta-ensemble] logEnginePredictions failed", { error: error.message })
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
 * Calls update_engine_performance(p_engine_name, p_hit, p_near_miss).
 * Use this when you know the hit/miss result for a specific engine.
 */
export async function recordEngineHit(
  engineName: string,
  hit: boolean,
  nearMiss: boolean,
): Promise<void> {
  const supabase = getSupabaseAdmin()
  const { error } = await supabase.rpc("update_engine_performance" as never, {
    p_engine_name: engineName,
    p_hit: hit,
    p_near_miss: nearMiss,
  } as never)
  if (error) {
    logger.error("[meta-ensemble] recordEngineHit failed", { error: error.message })
  }
}
