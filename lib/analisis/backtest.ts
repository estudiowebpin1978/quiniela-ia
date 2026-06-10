/**
 * ENHANCED BACKTESTING ENGINE
 * 
 * Walk-forward validation with Hit@1/5/10, Precision, Recall, ROI metrics.
 */

export interface BacktestConfig {
  turno: string
  minTrainingDraws: number   // Minimum draws for training
  topN: number               // Top N predictions to evaluate
  walkForwardStep: number    // Steps to advance each iteration
}

export interface BacktestMetrics {
  hitAt1: number             // % of times the #1 prediction appeared
  hitAt5: number             // % of times at least 1 of top 5 appeared
  hitAt10: number            // % of times at least 1 of top 10 appeared
  avgHitsPerDraw: number     // Average hits per draw
  maxHits: number            // Maximum hits in a single draw
  totalDraws: number         // Total draws evaluated
  precision: number          // Predicted & correct / Total predicted
  recall: number             // Predicted & correct / Total actual
  roi: number                // Theoretical ROI (simplified)
  distribution: Record<number, number>  // hit count → frequency
  calibrationBuckets: { predicted: number; actual: number; count: number }[]
}

export interface DrawRow {
  fecha: string
  turno: string
  numbers: number[]
}

const DEFAULT_CONFIG: BacktestConfig = {
  turno: "nocturna",
  minTrainingDraws: 50,
  topN: 10,
  walkForwardStep: 1,
}

/**
 * Walk-forward backtesting
 */
export function walkForwardBacktest(
  sequences: number[][],
  config: Partial<BacktestConfig> = {}
): BacktestMetrics {
  const cfg = { ...DEFAULT_CONFIG, ...config }
  const drawSize = 20

  if (sequences.length < cfg.minTrainingDraws + 10) {
    return emptyMetrics()
  }

  const hitsDistribution: Record<number, number> = {}
  let totalHits = 0
  let maxHits = 0
  let correctPredictions = 0
  let totalPredicted = 0
  let totalActual = 0

  // Walk-forward: train on past, test on next
  const results: { predicted: number[]; actual: number[]; hits: number }[] = []

  for (let i = cfg.minTrainingDraws; i < sequences.length - cfg.walkForwardStep; i += cfg.walkForwardStep) {
    const training = sequences.slice(0, i)
    const actual = sequences[i].map(n => n % 100)

    // Predict using frequency-based scoring (simple but effective)
    const predicted = predictTopN(training, cfg.topN)

    // Calculate hits
    const hits = predicted.filter(n => actual.includes(n)).length
    hitsDistribution[hits] = (hitsDistribution[hits] || 0) + 1
    totalHits += hits
    maxHits = Math.max(maxHits, hits)
    correctPredictions += hits
    totalPredicted += predicted.length
    totalActual += actual.length

    results.push({ predicted, actual, hits })
  }

  const totalTests = results.length
  if (totalTests === 0) return emptyMetrics()

  // Hit@K metrics
  const hitAt1 = results.filter(r => r.predicted[0] !== undefined && r.actual.includes(r.predicted[0])).length / totalTests
  const hitAt5 = results.filter(r => r.predicted.slice(0, 5).some(n => r.actual.includes(n))).length / totalTests
  const hitAt10 = results.filter(r => r.predicted.slice(0, 10).some(n => r.actual.includes(n))).length / totalTests

  // Precision & Recall
  const precision = totalPredicted > 0 ? correctPredictions / totalPredicted : 0
  const recall = totalActual > 0 ? correctPredictions / totalActual : 0

  // Simplified ROI (assuming flat bet on each prediction)
  // ROI = (hits * payout - total_bets) / total_bets
  const totalBets = totalTests * cfg.topN
  const avgPayoutPerHit = 20  // Simplified: 20x payout for quiniela
  const roi = totalBets > 0 ? (totalHits * avgPayoutPerHit - totalBets) / totalBets : 0

  // Calibration buckets
  const calibrationBuckets = calculateCalibration(results)

  return {
    hitAt1: Math.round(hitAt1 * 10000) / 100,
    hitAt5: Math.round(hitAt5 * 10000) / 100,
    hitAt10: Math.round(hitAt10 * 10000) / 100,
    avgHitsPerDraw: Math.round((totalHits / totalTests) * 100) / 100,
    maxHits,
    totalDraws: totalTests,
    precision: Math.round(precision * 10000) / 100,
    recall: Math.round(recall * 10000) / 100,
    roi: Math.round(roi * 10000) / 100,
    distribution: hitsDistribution,
    calibrationBuckets,
  }
}

/**
 * Predict top N numbers using frequency scoring
 */
function predictTopN(sequences: number[][], n: number): number[] {
  const scores: Record<number, number> = {}

  // Recency-weighted frequency
  for (let i = 0; i < sequences.length; i++) {
    const weight = Math.exp(-0.02 * i)
    for (const num of sequences[i]) {
      const t = num % 100
      scores[t] = (scores[t] || 0) + weight
    }
  }

  // Sort by score
  const sorted = Object.entries(scores)
    .map(([num, score]) => ({ num: parseInt(num), score }))
    .sort((a, b) => b.score - a.score)

  return sorted.slice(0, n).map(e => e.num)
}

/**
 * Calculate calibration buckets
 */
function calculateCalibration(
  results: { predicted: number[]; actual: number[]; hits: number }[]
): { predicted: number; actual: number; count: number }[] {
  // Group by predicted rank
  const buckets: Record<number, { predicted: number; actual: number; count: number }> = {}

  for (const r of results) {
    for (let i = 0; i < r.predicted.length; i++) {
      const rank = i + 1
      if (!buckets[rank]) buckets[rank] = { predicted: 0, actual: 0, count: 0 }
      buckets[rank].count++
      if (r.actual.includes(r.predicted[i])) {
        buckets[rank].actual++
      }
    }
  }

  // Convert to array
  return Object.entries(buckets)
    .map(([rank, data]) => ({
      predicted: 1 / parseInt(rank),  // Simplified prediction
      actual: data.actual / data.count,
      count: data.count,
    }))
    .sort((a, b) => a.predicted - b.predicted)
}

/**
 * Empty metrics for edge cases
 */
function emptyMetrics(): BacktestMetrics {
  return {
    hitAt1: 0, hitAt5: 0, hitAt10: 0,
    avgHitsPerDraw: 0, maxHits: 0, totalDraws: 0,
    precision: 0, recall: 0, roi: 0,
    distribution: {},
    calibrationBuckets: [],
  }
}
