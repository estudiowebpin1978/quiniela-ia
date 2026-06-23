/**
 * BACKTESTING FRAMEWORK
 *
 * Walk-forward validation with Hit@K, Precision, Recall, ROI metrics.
 * Includes weight optimization to maximize Hit@10.
 */

export interface BacktestResult {
  period: { from: string; to: string; draws: number }
  metrics: {
    hitAt1: number
    hitAt5: number
    hitAt10: number
    hitAt20: number
    precisionAt10: number
    recallAt10: number
    roi: number
  }
  perDraw: {
    date: string
    turno: string
    predicted: number[]
    actual: number[]
    hits: number
  }[]
  weightOptimization: {
    originalWeights: Record<string, number>
    optimizedWeights: Record<string, number>
    improvement: number
  }
}

interface BacktestOptions {
  trainRatio?: number
  topN?: number
}

const DEFAULT_WEIGHTS: Record<string, number> = {
  frequency: 0.20,
  recency: 0.15,
  momentum: 0.10,
  cooccurrence: 0.15,
  markov: 0.15,
  position: 0.10,
  cycle: 0.10,
  hotCold: 0.05,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mean(arr: number[]): number {
  if (arr.length === 0) return 0
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

function normalizeArray(arr: number[]): number[] {
  if (arr.length === 0) return []
  let min = Infinity
  let max = -Infinity
  for (const v of arr) {
    if (v < min) min = v
    if (v > max) max = v
  }
  const range = max - min
  if (range === 0) return arr.map(() => 0.5)
  return arr.map(v => (v - min) / range)
}

function pad4(n: number): string {
  return n.toString().padStart(4, '0')
}

function last2(n: number): string {
  return pad4(n).slice(-2)
}

// ---------------------------------------------------------------------------
// Score a single number against historical sequences using a weight vector
// ---------------------------------------------------------------------------

function scoreNumber(
  num: number,
  sequences: number[][],
  weights: Record<string, number>
): number {
  const flat = sequences.flat()
  const n2d = num % 100

  const totalDraws = sequences.length
  const recent10 = sequences.slice(-10)
  const recent50 = sequences.slice(-50)

  const freqAll = flat.filter(n => n % 100 === n2d).length / Math.max(1, flat.length)
  const freqRecent10 = recent10.flat().filter(n => n % 100 === n2d).length / Math.max(1, recent10.flat().length)
  const freqRecent50 = recent50.flat().filter(n => n % 100 === n2d).length / Math.max(1, recent50.flat().length)

  let lastSeen = -1
  for (let i = sequences.length - 1; i >= 0; i--) {
    if (sequences[i].some(n => n % 100 === n2d)) {
      lastSeen = i
      break
    }
  }
  const recency = lastSeen === -1 ? 0 : 1 - (sequences.length - 1 - lastSeen) / totalDraws

  const momentum = freqRecent10 > 0 && freqRecent50 > 0
    ? (freqRecent10 - freqRecent50) / Math.max(freqRecent50, 0.001)
    : 0

  let coocScore = 0
  if (sequences.length > 0) {
    const lastNums = sequences[sequences.length - 1].map(n => n % 100)
    const coocMap = new Map<number, number>()
    for (const seq of sequences) {
      const nums2d = seq.map(n => n % 100)
      for (const other of nums2d) {
        if (other === n2d) continue
        for (const prev of lastNums) {
          if (other === prev) {
            coocMap.set(n2d, (coocMap.get(n2d) || 0) + 1)
          }
        }
      }
    }
    coocScore = (coocMap.get(n2d) || 0) / Math.max(1, sequences.length)
  }

  let markovScore = 0
  if (sequences.length >= 2) {
    const matrix = Array.from({ length: 100 }, () => new Array(100).fill(0))
    for (let i = 1; i < sequences.length; i++) {
      for (const prev of sequences[i - 1]) {
        for (const curr of sequences[i]) {
          matrix[prev % 100][curr % 100]++
        }
      }
    }
    const lastNums = sequences[sequences.length - 1].map(n => n % 100)
    for (const prev of lastNums) {
      const rowTotal = matrix[prev].reduce((a: number, b: number) => a + b, 0)
      if (rowTotal > 0) markovScore += matrix[prev][n2d] / rowTotal
    }
    markovScore /= lastNums.length || 1
  }

  const d = pad4(num)
  const posScores = new Array(4).fill(0)
  for (let i = 0; i < 4; i++) {
    const digit = parseInt(d[i])
    let count = 0
    for (const seq of sequences) {
      for (const n of seq) {
        if (parseInt(pad4(n)[i]) === digit) count++
      }
    }
    posScores[i] = count / Math.max(1, flat.length)
  }
  const positionScore = mean(posScores)

  const intervals: number[] = []
  let lastSeenIdx = -1
  for (let i = 0; i < sequences.length; i++) {
    if (sequences[i].some(n => n % 100 === n2d)) {
      if (lastSeenIdx !== -1) intervals.push(i - lastSeenIdx)
      lastSeenIdx = i
    }
  }
  const avgInterval = intervals.length > 0 ? mean(intervals) : totalDraws
  const expectedNext = lastSeenIdx === -1 ? totalDraws : lastSeenIdx + avgInterval
  const cycleScore = Math.max(0, 1 - Math.abs(expectedNext - totalDraws) / totalDraws)

  const hotScore = freqRecent10 > 0 ? freqRecent10 / Math.max(freqAll, 0.001) : 0

  return (
    weights.frequency * freqAll +
    weights.recency * recency +
    weights.momentum * Math.max(0, Math.min(1, momentum + 0.5)) +
    weights.cooccurrence * Math.min(1, coocScore) +
    weights.markov * markovScore +
    weights.position * positionScore +
    weights.cycle * cycleScore +
    weights.hotCold * Math.min(1, hotScore)
  )
}

// ---------------------------------------------------------------------------
// Predict top N numbers for a given training set
// ---------------------------------------------------------------------------

function predictTopN(
  sequences: number[][],
  topN: number,
  weights: Record<string, number>
): number[] {
  const scores: [number, number][] = []
  for (let n = 0; n < 10000; n++) {
    scores.push([n, scoreNumber(n, sequences, weights)])
  }
  scores.sort((a, b) => b[1] - a[1])
  return scores.slice(0, topN).map(([n]) => n)
}

// ---------------------------------------------------------------------------
// Compute metrics for a set of draw predictions
// ---------------------------------------------------------------------------

function computeMetrics(
  perDraw: BacktestResult['perDraw'],
  topN: number
): BacktestResult['metrics'] {
  const draws = perDraw.length
  if (draws === 0) {
    return { hitAt1: 0, hitAt5: 0, hitAt10: 0, hitAt20: 0, precisionAt10: 0, recallAt10: 0, roi: 0 }
  }

  let hit1 = 0, hit5 = 0, hit10 = 0, hit20 = 0
  let totalHits = 0, totalPredicted = 0, totalActual = 0

  for (const d of perDraw) {
    if (d.predicted.length > 0 && d.actual.includes(d.predicted[0])) hit1++
    if (d.predicted.slice(0, 5).some(n => d.actual.includes(n))) hit5++
    if (d.predicted.slice(0, 10).some(n => d.actual.includes(n))) hit10++
    if (d.predicted.slice(0, 20).some(n => d.actual.includes(n))) hit20++

    const hitsInDraw = d.predicted.filter(n => d.actual.includes(n)).length
    totalHits += hitsInDraw
    totalPredicted += Math.min(topN, d.predicted.length)
    totalActual += d.actual.length
  }

  const betCount = draws * Math.min(topN, 10)
  const avgPayoutPerHit = 20
  const roi = betCount > 0 ? (totalHits * avgPayoutPerHit - betCount) / betCount : 0

  return {
    hitAt1: Math.round((hit1 / draws) * 10000) / 100,
    hitAt5: Math.round((hit5 / draws) * 10000) / 100,
    hitAt10: Math.round((hit10 / draws) * 10000) / 100,
    hitAt20: Math.round((hit20 / draws) * 10000) / 100,
    precisionAt10: totalPredicted > 0 ? Math.round((totalHits / totalPredicted) * 10000) / 100 : 0,
    recallAt10: totalActual > 0 ? Math.round((totalHits / totalActual) * 10000) / 100 : 0,
    roi: Math.round(roi * 10000) / 100,
  }
}

// ---------------------------------------------------------------------------
// Grid search weight optimization to maximize Hit@10
// ---------------------------------------------------------------------------

function optimizeWeights(
  sequences: number[][],
  testDates: string[],
  testTurnos: string[]
): { originalWeights: Record<string, number>; optimizedWeights: Record<string, number>; improvement: number } {
  const keys = Object.keys(DEFAULT_WEIGHTS)
  const originalMetrics = runPrediction(sequences, testDates, testTurnos, DEFAULT_WEIGHTS, 10)
  const originalHit10 = computeMetrics(originalMetrics, 10).hitAt10

  let bestWeights = { ...DEFAULT_WEIGHTS }
  let bestHit10 = originalHit10

  const steps = [0.05, 0.10, 0.15, 0.20, 0.25, 0.30]

  for (let i = 0; i < keys.length; i++) {
    for (const w of steps) {
      const trial = { ...bestWeights }
      trial[keys[i]] = w

      const sum = Object.values(trial).reduce((a, b) => a + b, 0)
      if (Math.abs(sum - 1) > 0.3) continue

      for (const k of keys) {
        if (k !== keys[i]) trial[k] *= (1 - w) / Math.max(0.01, sum - trial[keys[i]])
      }

      const total = Object.values(trial).reduce((a, b) => a + b, 0)
      if (total > 0) {
        for (const k of keys) trial[k] /= total
      }

      const metrics = runPrediction(sequences, testDates, testTurnos, trial, 10)
      const hit10 = computeMetrics(metrics, 10).hitAt10

      if (hit10 > bestHit10) {
        bestHit10 = hit10
        bestWeights = { ...trial }
      }
    }
  }

  return {
    originalWeights: { ...DEFAULT_WEIGHTS },
    optimizedWeights: bestWeights,
    improvement: bestHit10 - originalHit10,
  }
}

// ---------------------------------------------------------------------------
// Run predictions on test data
// ---------------------------------------------------------------------------

function runPrediction(
  sequences: number[][],
  dates: string[],
  turnos: string[],
  weights: Record<string, number>,
  topN: number
): BacktestResult['perDraw'] {
  const perDraw: BacktestResult['perDraw'] = []
  const minTrain = Math.min(50, Math.floor(sequences.length * 0.3))

  for (let i = minTrain; i < sequences.length; i++) {
    const trainSeq = sequences.slice(0, i)
    const actual = sequences[i]
    const predicted = predictTopN(trainSeq, topN, weights)
    const hits = predicted.filter(n => actual.includes(n)).length

    perDraw.push({
      date: dates[i] || `draw-${i}`,
      turno: turnos[i] || 'unknown',
      predicted,
      actual,
      hits,
    })
  }

  return perDraw
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function runBacktest(
  sequences: number[][],
  dates: string[],
  turnos: string[],
  options?: BacktestOptions
): BacktestResult {
  const topN = options?.topN ?? 10

  if (sequences.length < 10) {
    return {
      period: { from: '', to: '', draws: 0 },
      metrics: { hitAt1: 0, hitAt5: 0, hitAt10: 0, hitAt20: 0, precisionAt10: 0, recallAt10: 0, roi: 0 },
      perDraw: [],
      weightOptimization: {
        originalWeights: { ...DEFAULT_WEIGHTS },
        optimizedWeights: { ...DEFAULT_WEIGHTS },
        improvement: 0,
      },
    }
  }

  const trainRatio = options?.trainRatio ?? 0.8
  const splitIdx = Math.floor(sequences.length * trainRatio)

  const trainSeq = sequences.slice(0, splitIdx)
  const testSeq = sequences.slice(splitIdx)
  const testDates = dates.slice(splitIdx)
  const testTurnos = turnos.slice(splitIdx)

  const perDraw = runPrediction(
    sequences.slice(0, splitIdx),
    testDates,
    testTurnos,
    DEFAULT_WEIGHTS,
    topN
  )

  const metrics = computeMetrics(perDraw, topN)

  const weightOptimization = optimizeWeights(sequences.slice(0, splitIdx), testDates, testTurnos)

  const firstDate = testDates[0] || ''
  const lastDate = testDates[testDates.length - 1] || ''

  return {
    period: {
      from: firstDate,
      to: lastDate,
      draws: testSeq.length,
    },
    metrics,
    perDraw,
    weightOptimization,
  }
}

// Compatibility wrapper for /api/backtest route
export interface WalkForwardOptions {
  turno: string
  minTrainingDraws: number
  topN: number
  walkForwardStep: number
}

export function walkForwardBacktest(
  sequences: number[][],
  options: WalkForwardOptions
): {
  hitAt1: number
  hitAt5: number
  hitAt10: number
  hitAt20: number
  precisionAt10: number
  recallAt10: number
  roi: number
  totalDraws: number
} {
  const { minTrainingDraws, topN, walkForwardStep } = options
  const n = sequences.length
  if (n < minTrainingDraws + 10) {
    return { hitAt1: 0, hitAt5: 0, hitAt10: 0, hitAt20: 0, precisionAt10: 0, recallAt10: 0, roi: 0, totalDraws: 0 }
  }

  let hits1 = 0, hits5 = 0, hits10 = 0, hits20 = 0
  let totalPrecision = 0, totalRecall = 0, testCount = 0

  for (let start = minTrainingDraws; start < n - 1; start += walkForwardStep) {
    const trainSeqs = sequences.slice(0, start)
    const actual = sequences[start].map(x => x % 100)
    const actualSet = new Set(actual)

    // Frequency-based prediction from training data
    const freq: Record<number, number> = {}
    for (const seq of trainSeqs) {
      for (const n of seq) { freq[n % 100] = (freq[n % 100] || 0) + 1 }
    }
    const ranked = Object.entries(freq)
      .map(([num, count]) => ({ num: Number(num), count }))
      .sort((a, b) => b.count - a.count)
    const predicted = ranked.slice(0, Math.max(topN, 20)).map(r => r.num)

    const predSet1 = new Set(predicted.slice(0, 1))
    const predSet5 = new Set(predicted.slice(0, 5))
    const predSet10 = new Set(predicted.slice(0, 10))
    const predSet20 = new Set(predicted.slice(0, 20))

    for (const a of actual) {
      if (predSet1.has(a)) hits1++
      if (predSet5.has(a)) hits5++
      if (predSet10.has(a)) hits10++
      if (predSet20.has(a)) hits20++
    }

    const pred10 = predicted.slice(0, 10)
    const hitsInPred = pred10.filter(p => actualSet.has(p)).length
    totalPrecision += hitsInPred / 10
    totalRecall += actualSet.size > 0 ? hitsInPred / actualSet.size : 0
    testCount++
  }

  const td = testCount || 1
  return {
    hitAt1: Math.round((hits1 / (td * 20)) * 10000) / 100,
    hitAt5: Math.round((hits5 / (td * 20)) * 10000) / 100,
    hitAt10: Math.round((hits10 / (td * 20)) * 10000) / 100,
    hitAt20: Math.round((hits20 / (td * 20)) * 10000) / 100,
    precisionAt10: Math.round((totalPrecision / td) * 10000) / 100,
    recallAt10: Math.round((totalRecall / td) * 10000) / 100,
    roi: 0,
    totalDraws: testCount
  }
}
