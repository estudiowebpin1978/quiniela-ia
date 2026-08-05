/**
 * Factor Weight Feedback Loop
 *
 * After each draw, evaluates which of the 12 factors were most accurate
 * and adjusts their weights via exponential moving average (momentum 0.7).
 *
 * Flow:
 *   1. Read cached_predictions (Top 10 per factor scores) for the turno
 *   2. Read actual draw numbers
 *   3. For each factor: accuracy = avg(score of hit nums) / avg(score of miss nums)
 *   4. Adjust weights: new_weight = old_weight * (1 + alpha * (accuracy - baseline))
 *   5. Normalize to sum=100, persist via RPC
 */

import { getSupabaseAdmin } from "@/lib/supabase-client"
import logger from "@/lib/logger"

const FACTORS = [
  "calor", "demora", "afinidad", "markov", "bayesian", "entropy",
  "survival", "cyclic", "drift", "correlation", "seasonal", "montecarlo",
] as const

type FactorName = (typeof FACTORS)[number]

interface FactorScores {
  [key: string]: number
}

interface CachedPrediction {
  numero: number
  puntaje_total: number
  f_calor: number
  f_demora: number
  f_afinidad: number
  f_markov: number
  f_bayesian: number
  f_entropy: number
  f_survival: number
  f_cyclic: number
  f_drift: number
  f_correlation: number
  f_seasonal: number
  f_montecarlo: number
}

interface CurrentWeights {
  w_calor: number
  w_demora: number
  w_afinidad: number
  w_markov: number
  w_bayesian: number
  w_entropy: number
  w_survival: number
  w_cyclic: number
  w_drift: number
  w_correlation: number
  w_seasonal: number
  w_montecarlo: number
}

interface EvaluationResult {
  turno: string
  fecha: string
  hitRate: number
  factorAccuracies: Record<FactorName, number>
  previousWeights: CurrentWeights
  newWeights: CurrentWeights
  drawsEvaluated: number
}

const DEFAULT_WEIGHTS: CurrentWeights = {
  w_calor: 12, w_demora: 14, w_afinidad: 8, w_markov: 10,
  w_bayesian: 10, w_entropy: 8, w_survival: 10, w_cyclic: 6,
  w_drift: 8, w_correlation: 6, w_seasonal: 4, w_montecarlo: 4,
}

const LEARNING_RATE = 0.05
const MOMENTUM = 0.7
const MIN_WEIGHT = 1.0
const MAX_WEIGHT = 25.0

function factorField(f: FactorName): string {
  return `f_${f}`
}

function weightField(f: FactorName): keyof CurrentWeights {
  return `w_${f}` as keyof CurrentWeights
}

/**
 * Evaluate factor accuracy for a single turno after a new draw.
 */
export async function evaluateAndAdjustWeights(
  turno: string,
  fecha: string
): Promise<EvaluationResult | null> {
  const supabase = getSupabaseAdmin()
  if (!supabase) {
    logger.error("factor-feedback: no supabase client")
    return null
  }

  // 1. Get the draw result
  const { data: drawRow, error: drawErr } = await supabase
    .from("draws")
    .select("numbers")
    .eq("date", fecha)
    .ilike("turno", turno)
    .limit(1)
    .maybeSingle()

  if (drawErr || !drawRow) {
    logger.warn("factor-feedback: no draw found", { turno, fecha, error: drawErr?.message })
    return null
  }

  const actualNumbers: number[] = Array.isArray(drawRow.numbers)
    ? drawRow.numbers.map((n: number) => Number(n) % 100)
    : []

  if (actualNumbers.length === 0) return null

  const actualSet = new Set(actualNumbers)

  // 2. Get cached predictions with factor breakdowns
  const { data: cached, error: cacheErr } = await supabase
    .from("cached_predictions")
    .select("numeros")
    .eq("turno", turno)
    .eq("prediction_date", fecha)
    .maybeSingle()

  if (cacheErr || !cached?.numeros) {
    logger.warn("factor-feedback: no cached prediction", { turno, fecha, error: cacheErr?.message })
    return null
  }

  const predictions: CachedPrediction[] = Array.isArray(cached.numeros) ? cached.numeros : []
  if (predictions.length === 0) return null

  // 3. Get current weights
  const { data: weightRow } = await supabase
    .from("engine_factor_weights")
    .select("*")
    .eq("turno", turno)
    .maybeSingle()

  const currentWeights: CurrentWeights = weightRow ? {
    w_calor: Number(weightRow.w_calor), w_demora: Number(weightRow.w_demora),
    w_afinidad: Number(weightRow.w_afinidad), w_markov: Number(weightRow.w_markov),
    w_bayesian: Number(weightRow.w_bayesian), w_entropy: Number(weightRow.w_entropy),
    w_survival: Number(weightRow.w_survival), w_cyclic: Number(weightRow.w_cyclic),
    w_drift: Number(weightRow.w_drift), w_correlation: Number(weightRow.w_correlation),
    w_seasonal: Number(weightRow.w_seasonal), w_montecarlo: Number(weightRow.w_montecarlo),
  } : { ...DEFAULT_WEIGHTS }

  // 4. Calculate hit rate
  const hits = predictions.filter(p => actualSet.has(p.numero)).length
  const hitRate = hits / Math.min(10, predictions.length)

  // 5. Evaluate each factor's accuracy
  const factorAccuracies = {} as Record<FactorName, number>

  for (const factor of FACTORS) {
    const field = factorField(factor)

    // Split predictions into hits and misses
    const hitScores: number[] = []
    const missScores: number[] = []

    for (const pred of predictions) {
      const score = Number(pred[field as keyof CachedPrediction]) || 0
      if (actualSet.has(pred.numero)) {
        hitScores.push(score)
      } else {
        missScores.push(score)
      }
    }

    // Accuracy = how much better hits score than misses
    // If hits score higher on average, factor is doing its job
    const avgHit = hitScores.length > 0 ? hitScores.reduce((a, b) => a + b, 0) / hitScores.length : 0
    const avgMiss = missScores.length > 0 ? missScores.reduce((a, b) => a + b, 0) / missScores.length : 1

    // Factor accuracy: ratio of hit/miss scores (capped at 2.0)
    // >1 means factor correctly scores hits higher than misses
    // <1 means factor is inversely correlated (bad)
    const rawAccuracy = avgMiss > 0 ? avgHit / avgMiss : 1.0
    factorAccuracies[factor] = Math.min(2.0, Math.max(0.1, rawAccuracy))
  }

  // 6. Adjust weights using momentum
  const newWeights = { ...currentWeights }
  const baseline = 1.0 // neutral accuracy

  for (const factor of FACTORS) {
    const wf = weightField(factor)
    const accuracy = factorAccuracies[factor]
    const oldWeight = currentWeights[wf]

    // Delta proportional to how much better/worse than baseline
    const delta = (accuracy - baseline) * LEARNING_RATE * oldWeight

    // Apply with momentum (smooth transitions)
    newWeights[wf] = oldWeight * MOMENTUM + (oldWeight + delta) * (1 - MOMENTUM)

    // Clamp
    newWeights[wf] = Math.max(MIN_WEIGHT, Math.min(MAX_WEIGHT, newWeights[wf]))
  }

  // 7. Normalize to sum ~100
  const sum = Object.values(newWeights).reduce((a, b) => a + b, 0)
  if (sum > 0) {
    for (const key of Object.keys(newWeights) as (keyof CurrentWeights)[]) {
      newWeights[key] = Math.round((newWeights[key] / sum) * 100 * 100) / 100
    }
  }

  // 8. Persist via RPC
  const { error: rpcErr } = await supabase.rpc("update_factor_weights", {
    p_turno: turno,
    p_w_calor: newWeights.w_calor,
    p_w_demora: newWeights.w_demora,
    p_w_afinidad: newWeights.w_afinidad,
    p_w_markov: newWeights.w_markov,
    p_w_bayesian: newWeights.w_bayesian,
    p_w_entropy: newWeights.w_entropy,
    p_w_survival: newWeights.w_survival,
    p_w_cyclic: newWeights.w_cyclic,
    p_w_drift: newWeights.w_drift,
    p_w_correlation: newWeights.w_correlation,
    p_w_seasonal: newWeights.w_seasonal,
    p_w_montecarlo: newWeights.w_montecarlo,
    p_hit_rate: hitRate,
    p_factor_accuracies: factorAccuracies,
    p_draws_evaluated: 1,
  })

  if (rpcErr) {
    logger.error("factor-feedback: RPC update failed", { turno, fecha, error: rpcErr.message })
    return null
  }

  logger.info("factor-feedback: weights updated", {
    turno,
    fecha,
    hitRate: Math.round(hitRate * 100),
    factorAccuracies: Object.fromEntries(
      Object.entries(factorAccuracies).map(([k, v]) => [k, Math.round(v * 100)])
    ),
    weightsChanged: Object.keys(newWeights).some(
      k => newWeights[k as keyof CurrentWeights] !== currentWeights[k as keyof CurrentWeights]
    ),
  })

  return {
    turno,
    fecha,
    hitRate,
    factorAccuracies,
    previousWeights: currentWeights,
    newWeights,
    drawsEvaluated: 1,
  }
}

/**
 * Evaluate all 5 turnos for a given date.
 */
export async function evaluateAllTurnos(fecha: string): Promise<EvaluationResult[]> {
  const turnos = ["Previa", "Primera", "Matutina", "Vespertina", "Nocturna"]
  const results: EvaluationResult[] = []

  for (const turno of turnos) {
    try {
      const result = await evaluateAndAdjustWeights(turno, fecha)
      if (result) results.push(result)
    } catch (e) {
      logger.error("factor-feedback: evaluateAndAdjustWeights failed", {
        turno,
        fecha,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  return results
}
