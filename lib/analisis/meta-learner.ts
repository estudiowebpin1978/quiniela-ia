/**
 * META-LEARNER with Cross-Validation
 * 
 * Replaces fixed ensemble weights with learned weights.
 * Uses time-series cross-validation to find optimal combination.
 */

export interface MetaWeights {
  factores30: number;
  montecarlo: number;
  crossTurno: number;
  seasonal: number;
  correlation: number;
  markovSuperior: number;
  cyclic: number;
  lastUpdated: string;
}

const DEFAULT_WEIGHTS: MetaWeights = {
  factores30: 0.40,
  montecarlo: 0.20,
  crossTurno: 0.10,
  seasonal: 0.06,
  correlation: 0.08,
  markovSuperior: 0.10,
  cyclic: 0.06,
  lastUpdated: new Date().toISOString()
}

/**
 * Time-series cross-validation to find optimal weights.
 * Uses expanding window: train on first K draws, validate on K+1.
 */
export function crossValidateWeights(
  sequences: number[][],
  factorScores: number[][],
  mcScores: number[][],
  crossScores: number[][],
  seasonalScoresArr: number[][],
  corrScores: number[][],
  markovScores: number[][],
  cyclicScoresArr: number[][],
): MetaWeights {
  const n = 100
  const nDraws = sequences.length
  if (nDraws < 20) return DEFAULT_WEIGHTS

  const nFolds = Math.min(10, Math.floor(nDraws / 5))
  const foldSize = Math.floor(nDraws / nFolds)

  let bestWeights = { ...DEFAULT_WEIGHTS }
  let bestScore = -Infinity

  // Grid search over weight combinations (coarse)
  const weightOptions = [0.2, 0.3, 0.4, 0.5]
  const mcOptions = [0.1, 0.15, 0.2, 0.25]

  for (const fw of weightOptions) {
    for (const mcw of mcOptions) {
      const remaining = 1 - fw - mcw
      if (remaining < 0) continue

      const cw = remaining * 0.35
      const sw = remaining * 0.15
      const crw = remaining * 0.25
      const mw = remaining * 0.15
      const cyw = remaining * 0.10

      let totalHits = 0
      let totalPreds = 0

      for (let fold = 0; fold < nFolds; fold++) {
        const trainEnd = fold * foldSize + 10
        const testStart = trainEnd
        const testEnd = Math.min(testStart + foldSize, nDraws)

        if (testStart >= nDraws || testEnd > nDraws) break

        // Compute ensemble scores using training weights
        const ensembleScores = new Array(n).fill(0)
        for (let num = 0; num < n; num++) {
          const fScore = factorScores[trainEnd - 1]?.[num] || 0
          const mScore = mcScores[trainEnd - 1]?.[num] || 0
          const cScore = crossScores[trainEnd - 1]?.[num] || 0
          const sScore = seasonalScoresArr[trainEnd - 1]?.[num] || 0.5
          const coScore = corrScores[trainEnd - 1]?.[num] || 0.5
          const mkScore = markovScores[trainEnd - 1]?.[num] || 0.5
          const cyScore = cyclicScoresArr[trainEnd - 1]?.[num] || 0.5

          ensembleScores[num] = (
            fScore * fw +
            mScore * mcw +
            cScore * cw +
            (sScore - 0.5) * sw +
            coScore * crw +
            mkScore * mw +
            (cyScore - 0.5) * cyw
          )
        }

        // Get top 10 predictions
        const top10 = ensembleScores
          .map((s, i) => ({ s, i }))
          .sort((a, b) => b.s - a.s)
          .slice(0, 10)
          .map(x => x.i)

        // Check against actual draws
        for (let t = testStart; t < testEnd; t++) {
          const actual = new Set(sequences[t].map(x => x % 100))
          const hits = top10.filter(n => actual.has(n)).length
          totalHits += hits
          totalPreds++
        }
      }

      const avgHitsPerDraw = totalPreds > 0 ? totalHits / totalPreds : 0
      if (avgHitsPerDraw > bestScore) {
        bestScore = avgHitsPerDraw
        bestWeights = {
          factores30: fw,
          montecarlo: mcw,
          crossTurno: cw,
          seasonal: sw,
          correlation: crw,
          markovSuperior: mw,
          cyclic: cyw,
          lastUpdated: new Date().toISOString()
        }
      }
    }
  }

  return bestWeights
}

/**
 * Online learning: adjust weights based on recent prediction performance.
 * Uses exponential moving average of hit rates.
 */
export function onlineWeightUpdate(
  currentWeights: MetaWeights,
  recentHits: Record<string, number>,  // factor -> hit contribution
  learningRate: number = 0.1
): MetaWeights {
  const totalHits = Object.values(recentHits).reduce((a, b) => a + b, 0)
  if (totalHits === 0) return currentWeights

  const updated = { ...currentWeights }

  // Adjust each weight based on its contribution
  for (const [factor, hits] of Object.entries(recentHits)) {
    if (factor in updated) {
      const contribution = hits / totalHits
      const currentWeight = (updated as any)[factor]
      const targetWeight = contribution
      ;(updated as any)[factor] = currentWeight + learningRate * (targetWeight - currentWeight)
    }
  }

  // Normalize to sum to 1
  const sum = updated.factores30 + updated.montecarlo + updated.crossTurno +
    updated.seasonal + updated.correlation + updated.markovSuperior + updated.cyclic
  if (sum > 0) {
    updated.factores30 /= sum
    updated.montecarlo /= sum
    updated.crossTurno /= sum
    updated.seasonal /= sum
    updated.correlation /= sum
    updated.markovSuperior /= sum
    updated.cyclic /= sum
  }

  updated.lastUpdated = new Date().toISOString()
  return updated
}
