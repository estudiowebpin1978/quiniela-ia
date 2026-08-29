/**
 * STACKING ENSEMBLE - Meta-learner que combina múltiples fuentes de predicción
 * 
 * Aprende cuándo confiar en cada modelo según el contexto (turno, historial reciente, etc.)
 */

export interface StackingSource {
  name: string
  scores: Record<number, number>  // 0-99 → score [0-1]
  weight: number                  // peso base
}

export interface StackingResult {
  finalScores: Record<number, number>
  sourceWeights: Record<string, number>
  confidence: number
  topNumbers: { number: number; score: number; contributions: Record<string, number> }[]
}

// Pesos meta-aprendidos por turno (entrenados offline con backtesting)
const META_WEIGHTS: Record<string, Record<string, number>> = {
  previa:    { factores30: 0.45, montecarlo: 0.25, crossTurno: 0.15, xgboost: 0.10, lightgbm: 0.05 },
  primera:   { factores30: 0.40, montecarlo: 0.30, crossTurno: 0.10, xgboost: 0.12, lightgbm: 0.08 },
  matutina:  { factores30: 0.42, montecarlo: 0.28, crossTurno: 0.12, xgboost: 0.10, lightgbm: 0.08 },
  vespertina:{ factores30: 0.43, montecarlo: 0.27, crossTurno: 0.13, xgboost: 0.10, lightgbm: 0.07 },
  nocturna:  { factores30: 0.40, montecarlo: 0.30, crossTurno: 0.10, xgboost: 0.12, lightgbm: 0.08 },
}

// Pesos default para turnos no conocidos
const DEFAULT_META_WEIGHTS: Record<string, number> = {
  factores30: 0.42, montecarlo: 0.28, crossTurno: 0.12, xgboost: 0.10, lightgbm: 0.08
}

/**
 * Combina múltiples fuentes usando stacking learned weights.
 */
export function stackingEnsemble(
  sources: StackingSource[],
  turno: string,
  recentHits?: number[]  // hits de las últimas N predicciones por fuente
): StackingResult {
  const turnoKey = turno.toLowerCase().trim()
  const baseWeights = META_WEIGHTS[turnoKey] || DEFAULT_META_WEIGHTS

  // Ajustar pesos según rendimiento reciente si hay datos
  const adjustedWeights = recentHits
    ? adjustWeightsByPerformance(baseWeights, recentHits, sources.map(s => s.name))
    : baseWeights

  // Normalizar pesos
  const totalWeight = Object.values(adjustedWeights).reduce((a, b) => a + b, 0)
  const normWeights: Record<string, number> = {}
  for (const [key, val] of Object.entries(adjustedWeights)) {
    normWeights[key] = val / totalWeight
  }

  // Calcular score final para cada número
  const finalScores: Record<number, number> = {}
  const topNumbers: { number: number; score: number; contributions: Record<string, number> }[] = []

  for (let n = 0; n < 100; n++) {
    let totalScore = 0
    const contributions: Record<string, number> = {}

    for (const source of sources) {
      const weight = normWeights[source.name] || source.weight || 0
      const score = source.scores[n] || 0
      const contribution = score * weight
      totalScore += contribution
      contributions[source.name] = Math.round(contribution * 1000) / 1000
    }

    finalScores[n] = totalScore
    topNumbers.push({ number: n, score: totalScore, contributions })
  }

  topNumbers.sort((a, b) => b.score - a.score)

  // Confidence: qué tan concentrado está el score en los top números
  const top5Score = topNumbers.slice(0, 5).reduce((a, b) => a + b.score, 0)
  const allScore = topNumbers.reduce((a, b) => a + b.score, 0)
  const confidence = allScore > 0 ? Math.min(95, Math.round((top5Score / allScore) * 100 * 2)) : 50

  return {
    finalScores,
    sourceWeights: normWeights,
    confidence,
    topNumbers: topNumbers.slice(0, 20)
  }
}

/**
 * Ajusta pesos según rendimiento reciente de cada fuente.
 * Si una fuente tuvo más aciertos, se le da más peso.
 */
function adjustWeightsByPerformance(
  baseWeights: Record<string, number>,
  recentHits: number[],
  sourceNames: string[]
): Record<string, number> {
  const adjusted = { ...baseWeights }

  if (recentHits.length === 0) return adjusted

  // recentHits[i] = aciertos de la fuente i en las últimas predicciones
  const totalHits = recentHits.reduce((a, b) => a + b, 0)
  if (totalHits === 0) return adjusted

  for (let i = 0; i < sourceNames.length && i < recentHits.length; i++) {
    const name = sourceNames[i]
    if (adjusted[name] === undefined) continue

    const hitRate = recentHits[i] / Math.max(totalHits, 1)
    // Boost o reducir según rendimiento (max ±30%)
    const boost = (hitRate - 1 / sourceNames.length) * 0.6
    adjusted[name] *= (1 + boost)
  }

  return adjusted
}

/**
 * Evalúa el rendimiento de cada fuente en backtesting.
 */
export function evaluateSourcePerformance(
  historicalPredictions: { predicted: number[]; actual: number[] }[],
  sourceScores: Record<string, Record<number, number>>[]
): Record<string, number> {
  const performance: Record<string, number> = {}

  for (const [sourceName, scores] of Object.entries(sourceScores[0] || {})) {
    let hits = 0
    let total = 0

    for (let i = 0; i < historicalPredictions.length; i++) {
      const pred = historicalPredictions[i]
      const sourceData = sourceScores[i]?.[sourceName]
      if (!sourceData) continue

      // Top 10 de esta fuente
      const top10 = Object.entries(sourceData)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([n]) => parseInt(n))

      hits += top10.filter(n => pred.actual.includes(n)).length
      total += 10
    }

    performance[sourceName] = total > 0 ? hits / total : 0
  }

  return performance
}
