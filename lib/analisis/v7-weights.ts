/**
 * V7 Adaptive Weights — DB persistence + post-verification adjustment
 *
 * Loads weights from engine_v7_weights table, adjusts after each verified draw,
 * persists back to DB. Uses EMA (exponential moving average) like factor-feedback.
 */

import { getSupabaseAdmin } from "@/lib/supabase-client"
import type { FactorBreakdown } from "./engine-v7"
import logger from "@/lib/logger"

// ─── Constants ──────────────────────────────────────────────────────────────

const LEARNING_RATE = 0.05
const MOMENTUM = 0.7
const MIN_WEIGHT = 0.01
const MAX_WEIGHT = 0.40

// ─── Types ──────────────────────────────────────────────────────────────────

export interface V7Weights {
  survival: number
  correlation: number
  spacing: number
  frequency: number
  recency: number
  markov: number
  cycles: number
  temporal: number
  debt: number
  bayesian: number
  v6Weight: number
  hitRate: number
  totalEvaluations: number
}

interface EvaluationResult {
  previousWeights: V7Weights
  newWeights: V7Weights
  hitRate: number
  factorAccuracies: Record<string, number>
}

// ─── Load Weights from DB ───────────────────────────────────────────────────

export async function loadV7Weights(turno: string): Promise<V7Weights> {
  const supabase = getSupabaseAdmin()

  try {
    const { data, error } = await supabase.rpc("get_v7_weights" as never, {
      p_turno: turno,
    } as never)

    if (error || !data || (Array.isArray(data) && data.length === 0)) {
      logger.warn(`[v7-weights] No weights found for ${turno}, using defaults`)
      return getDefaultWeights()
    }

    const row = Array.isArray(data) ? data[0] : data

    return {
      survival: row.w_survival ?? 0.18,
      correlation: row.w_correlation ?? 0.12,
      spacing: row.w_spacing ?? 0.14,
      frequency: row.w_frequency ?? 0.15,
      recency: row.w_recency ?? 0.10,
      markov: row.w_markov ?? 0.08,
      cycles: row.w_cycles ?? 0.06,
      temporal: row.w_temporal ?? 0.07,
      debt: row.w_debt ?? 0.10,
      bayesian: row.w_bayesian ?? 0.00,
      v6Weight: row.v6_weight ?? 0.60,
      hitRate: row.hit_rate ?? 0,
      totalEvaluations: row.total_evaluations ?? 0,
    }
  } catch (e) {
    logger.error("[v7-weights] Failed to load weights", { error: String(e) })
    return getDefaultWeights()
  }
}

// ─── Adjust Weights After Verified Draw ─────────────────────────────────────

export async function adjustV7Weights(
  turno: string,
  predictedTop10: Array<{ numero: string; factors: FactorBreakdown }>,
  actualNumbers: number[],
): Promise<EvaluationResult> {
  const current = await loadV7Weights(turno)

  // Calculate which predictions hit
  const actualSet = new Set(actualNumbers.map(n => n % 100))
  const hits = predictedTop10.filter(p => actualSet.has(parseInt(p.numero)))
  const hitRate = predictedTop10.length > 0 ? hits.length / predictedTop10.length : 0

  // Calculate per-factor accuracy
  const factorKeys: (keyof FactorBreakdown)[] = [
    "survival", "correlation", "spacing", "frequency", "recency",
    "markov", "cycles", "temporal", "debt", "bayesian",
  ]

  const factorAccuracies: Record<string, number> = {}
  const newWeights: V7Weights = { ...current }

  for (const key of factorKeys) {
    // Average factor value for hits vs all predictions
    const avgHit = hits.length > 0
      ? hits.reduce((sum, p) => sum + p.factors[key], 0) / hits.length
      : 0
    const avgAll = predictedTop10.length > 0
      ? predictedTop10.reduce((sum, p) => sum + p.factors[key], 0) / predictedTop10.length
      : 0

    // Factor accuracy: how much better did the factor perform for hits?
    const accuracy = avgAll > 0 ? avgHit / avgAll : 1.0
    factorAccuracies[key] = accuracy

    // Adjust weight: increase if factor helped, decrease if it didn't
    const currentWeight = current[key]
    const delta = (accuracy - 1.0) * LEARNING_RATE * currentWeight
    let newWeight = currentWeight * MOMENTUM + (currentWeight + delta) * (1 - MOMENTUM)

    // Clamp
    newWeight = Math.max(MIN_WEIGHT, Math.min(MAX_WEIGHT, newWeight))
    newWeights[key] = newWeight
  }

  // Normalize to sum to 1.0 (for V7 factors only)
  const v7Total = factorKeys.reduce((sum, key) => sum + newWeights[key], 0)
  if (v7Total > 0) {
    for (const key of factorKeys) {
      newWeights[key] /= v7Total
    }
  }

  // Adjust blend ratio: if V7 did better, increase V7 weight
  const v7Contributed = hits.filter(p => {
    const v7Score = p.factors.survival + p.factors.correlation + p.factors.spacing
    return v7Score > 0.3
  }).length

  const v7Ratio = hits.length > 0 ? v7Contributed / hits.length : 0.5
  const blendDelta = (v7Ratio - 0.5) * 0.02 // Small adjustment
  newWeights.v6Weight = Math.max(0.2, Math.min(0.8, current.v6Weight - blendDelta))

  newWeights.hitRate = hitRate
  newWeights.totalEvaluations = current.totalEvaluations + 1

  // Persist to DB
  try {
    const supabase = getSupabaseAdmin()
    await supabase.rpc("update_v7_weights" as never, {
      p_turno: turno,
      p_w_survival: newWeights.survival,
      p_w_correlation: newWeights.correlation,
      p_w_spacing: newWeights.spacing,
      p_w_frequency: newWeights.frequency,
      p_w_recency: newWeights.recency,
      p_w_markov: newWeights.markov,
      p_w_cycles: newWeights.cycles,
      p_w_temporal: newWeights.temporal,
      p_w_debt: newWeights.debt,
      p_w_bayesian: newWeights.bayesian,
      p_v6_weight: newWeights.v6Weight,
      p_hit_rate: hitRate,
    } as never)

    logger.info(`[v7-weights] Updated ${turno}: hit=${hitRate.toFixed(2)} v6w=${newWeights.v6Weight.toFixed(2)}`)
  } catch (e) {
    logger.error("[v7-weights] Failed to persist weights", { error: String(e) })
  }

  return {
    previousWeights: current,
    newWeights,
    hitRate,
    factorAccuracies,
  }
}

// ─── Convert to FactorBreakdown ─────────────────────────────────────────────

export function v7WeightsToFactorBreakdown(w: V7Weights): FactorBreakdown {
  return {
    survival: w.survival,
    correlation: w.correlation,
    spacing: w.spacing,
    frequency: w.frequency,
    recency: w.recency,
    markov: w.markov,
    cycles: w.cycles,
    temporal: w.temporal,
    debt: w.debt,
    bayesian: w.bayesian,
  }
}

// ─── Defaults ───────────────────────────────────────────────────────────────

function getDefaultWeights(): V7Weights {
  return {
    survival: 0.18,
    correlation: 0.12,
    spacing: 0.14,
    frequency: 0.15,
    recency: 0.10,
    markov: 0.08,
    cycles: 0.06,
    temporal: 0.07,
    debt: 0.10,
    bayesian: 0.00,
    v6Weight: 0.60,
    hitRate: 0,
    totalEvaluations: 0,
  }
}
