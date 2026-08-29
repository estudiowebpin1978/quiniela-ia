/**
 * DYNAMIC ENSEMBLE SCORING
 * 
 * Combina múltiples fuentes de score con pesos auto-calibrados.
 * Recalibra automáticamente según rendimiento de últimos 100 sorteos.
 */

export interface EnsembleSource {
  name: string
  scores: Record<number, number>  // 0-99 → score [0-1]
  weight: number
  confidence: number              // [0-1] qué tan confiable es esta fuente
}

export interface EnsembleResult {
  finalScores: Record<number, number>
  top10: number[]
  sourceWeights: Record<string, number>
  debug: {
    sourceContributions: Record<string, Record<number, number>>
    calibrationApplied: boolean
  }
}

export interface CalibrationData {
  recentHits: Record<string, number[]>  // source → last N hit rates
  optimalWeights: Record<string, number>
}

const DEFAULT_WEIGHTS: Record<string, number> = {
  factores30: 0.25,
  montecarlo: 0.15,
  markov: 0.10,
  randomForest: 0.10,
  neural: 0.05,
  xgboost: 0.15,
  crossTurno: 0.05,
  hotCold: 0.05,
  recencia: 0.05,
  coocurrencia: 0.05,
}

/**
 * Calibrate weights based on recent performance
 */
export function calibrateWeights(
  calibrationData: CalibrationData,
  lookback: number = 100
): Record<string, number> {
  const { recentHits, optimalWeights } = calibrationData
  const calibrated = { ...DEFAULT_WEIGHTS }

  // Calculate average hit rate for each source
  const avgHits: Record<string, number> = {}
  for (const [source, hits] of Object.entries(recentHits)) {
    const recent = hits.slice(-lookback)
    avgHits[source] = recent.length > 0
      ? recent.reduce((a, b) => a + b, 0) / recent.length
      : 0
  }

  // Adjust weights proportionally to hit rates
  const totalHits = Object.values(avgHits).reduce((a, b) => a + b, 0)
  if (totalHits > 0) {
    for (const [source, hits] of Object.entries(avgHits)) {
      if (calibrated[source] !== undefined) {
        calibrated[source] = (hits / totalHits) * 0.5 + (calibrated[source] || 0) * 0.5
      }
    }
  }

  // Apply optimal weights from historical optimization
  for (const [source, weight] of Object.entries(optimalWeights)) {
    if (calibrated[source] !== undefined) {
      calibrated[source] = weight * 0.3 + (calibrated[source] || 0) * 0.7
    }
  }

  // Normalize to sum to 1
  const total = Object.values(calibrated).reduce((a, b) => a + b, 0)
  if (total > 0) {
    for (const key of Object.keys(calibrated)) {
      calibrated[key] /= total
    }
  }

  return calibrated
}

/**
 * Combine multiple scoring sources
 */
export function combineEnsemble(
  sources: EnsembleSource[],
  calibrationData?: CalibrationData
): EnsembleResult {
  // Calibrate weights if data available
  let weights: Record<string, number> = {}
  if (calibrationData) {
    weights = calibrateWeights(calibrationData)
  }

  const finalScores: Record<number, number> = {}
  const sourceContributions: Record<string, Record<number, number>> = {}

  // Initialize
  for (let i = 0; i < 100; i++) {
    finalScores[i] = 0
  }

  // Combine scores
  let totalWeight = 0
  for (const source of sources) {
    const w = weights[source.name] ?? source.weight
    const adjustedWeight = w * source.confidence
    totalWeight += adjustedWeight
    sourceContributions[source.name] = {}

    for (let i = 0; i < 100; i++) {
      const score = source.scores[i] || 0
      finalScores[i] += score * adjustedWeight
      sourceContributions[source.name][i] = score * adjustedWeight
    }
  }

  // Normalize
  if (totalWeight > 0) {
    for (let i = 0; i < 100; i++) {
      finalScores[i] /= totalWeight
    }
  }

  // Get top 10
  const entries = Object.entries(finalScores)
    .map(([num, score]) => ({ num: parseInt(num), score }))
    .sort((a, b) => b.score - a.score)

  const top10 = entries.slice(0, 10).map(e => e.num)

  // Source weights used
  const sourceWeights: Record<string, number> = {}
  for (const source of sources) {
    sourceWeights[source.name] = weights[source.name] ?? source.weight
  }

  return {
    finalScores,
    top10,
    sourceWeights,
    debug: {
      sourceContributions,
      calibrationApplied: !!calibrationData,
    },
  }
}

/**
 * Simple ensemble: average of multiple score sets
 */
export function simpleEnsemble(
  scoreSets: Record<number, number>[],
  weights?: number[]
): Record<number, number> {
  const result: Record<number, number> = {}
  const w = weights || scoreSets.map(() => 1 / scoreSets.length)

  for (let i = 0; i < 100; i++) {
    let total = 0
    for (let s = 0; s < scoreSets.length; s++) {
      total += (scoreSets[s][i] || 0) * w[s]
    }
    result[i] = total
  }

  return result
}

/**
 * Stacking ensemble: use meta-learner to combine predictions
 */
export function stackingEnsemble(
  basePredictions: Record<number, number>[],
  metaWeights: number[]
): Record<number, number> {
  const result: Record<number, number> = {}

  for (let i = 0; i < 100; i++) {
    let score = 0
    for (let s = 0; s < basePredictions.length; s++) {
      score += (basePredictions[s][i] || 0) * (metaWeights[s] || 0)
    }
    // Apply sigmoid for calibration
    result[i] = 1 / (1 + Math.exp(-5 * (score - 0.5)))
  }

  return result
}
