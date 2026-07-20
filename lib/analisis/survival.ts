/**
 * Survival Analysis (Kaplan-Meier) for Number Delay Prediction
 * 
 * Treats each number (0-99) as a "subject" and its appearance as a "failure event".
 * The hazard function λ(t) determines the probability that a number appears
 * in the next draw, given it has survived t draws without appearing.
 * 
 * Key insight: Numbers in their "critical zone" (high hazard) are statistically
 * more likely to appear than their historical average.
 */

export interface SurvivalResult {
  hazardRates: number[]              // Hazard rate per number (0-99)
  meanGaps: number[]                 // Mean gap between appearances
  lastSeen: number[]                 // Draws since last appearance
  criticalNumbers: CriticalNumber[]  // Numbers in critical zone
  kaplanMeier: number[]              // Survival probability at each time step
  overallHazard: number              // Average hazard rate
}

export interface CriticalNumber {
  number: number
  hazard: number
  meanGap: number
  currentDelay: number
  zScore: number
  riskPercentile: number
  classification: 'low' | 'moderate' | 'high' | 'critical'
}

/**
 * Compute Survival Analysis for lottery numbers.
 * Uses simplified Kaplan-Meier estimator for gap analysis.
 */
export function computeSurvivalAnalysis(
  sequences: number[][],
  maxDraws: number = 500
): SurvivalResult {
  const n = 100
  const recentSeqs = sequences.slice(0, Math.min(maxDraws, sequences.length))
  
  // Track last appearance and gaps for each number
  const lastSeen = new Array(n).fill(-1)
  const gaps: number[][] = Array.from({ length: n }, () => [])
  const currentDraw = recentSeqs.length

  // Process draws in chronological order (oldest first)
  for (let d = recentSeqs.length - 1; d >= 0; d--) {
    const seq = recentSeqs[d]
    for (const num of seq) {
      const t = num % 100
      if (t < 0 || t > 99) continue

      if (lastSeen[t] >= 0) {
        const gap = lastSeen[t] - d
        gaps[t].push(gap)
      }
      lastSeen[t] = d
    }
  }

  // Compute mean gaps and hazard rates
  const meanGaps = new Array(n).fill(0)
  const hazardRates = new Array(n).fill(0)

  for (let i = 0; i < n; i++) {
    if (gaps[i].length > 0) {
      meanGaps[i] = gaps[i].reduce((a, b) => a + b, 0) / gaps[i].length
      // Hazard rate = 1 / mean gap
      hazardRates[i] = meanGaps[i] > 0 ? 1 / meanGaps[i] : 0
    }
    // Current delay for numbers not seen recently
    if (lastSeen[i] < 0) {
      lastSeen[i] = currentDraw
    }
  }

  // Overall average hazard
  const validHazards = hazardRates.filter(h => h > 0)
  const overallHazard = validHazards.length > 0
    ? validHazards.reduce((a, b) => a + b, 0) / validHazards.length
    : 0

  // Compute mean and stddev of mean gaps for z-score calculation
  const validGaps = meanGaps.filter(g => g > 0)
  const gapMean = validGaps.length > 0
    ? validGaps.reduce((a, b) => a + b, 0) / validGaps.length
    : 0
  const gapStddev = validGaps.length > 0
    ? Math.sqrt(validGaps.reduce((sum, g) => sum + Math.pow(g - gapMean, 2), 0) / validGaps.length)
    : 1

  // Identify critical numbers
  const criticalNumbers: CriticalNumber[] = []

  for (let i = 0; i < n; i++) {
    if (meanGaps[i] <= 0) continue

    const currentDelay = currentDraw - lastSeen[i]
    const zScore = gapStddev > 0 ? (currentDelay - meanGaps[i]) / gapStddev : 0

    // Risk percentile based on z-score (normal distribution approximation)
    const riskPercentile = normalCDF(zScore) * 100

    // Classification based on z-score
    let classification: CriticalNumber['classification'] = 'low'
    if (zScore > 2.0) classification = 'critical'
    else if (zScore > 1.5) classification = 'high'
    else if (zScore > 1.0) classification = 'moderate'

    if (zScore > 1.0) {
      criticalNumbers.push({
        number: i,
        hazard: hazardRates[i],
        meanGap: meanGaps[i],
        currentDelay,
        zScore,
        riskPercentile,
        classification
      })
    }
  }

  // Sort by z-score descending (most critical first)
  criticalNumbers.sort((a, b) => b.zScore - a.zScore)

  // Compute Kaplan-Meier survival curve (simplified)
  const maxGap = Math.max(...meanGaps.filter(g => g > 0), 1)
  const kaplanMeier = new Array(Math.ceil(maxGap) + 1).fill(1)

  for (let t = 1; t < kaplanMeier.length; t++) {
    let atRisk = 0
    let events = 0
    for (let i = 0; i < n; i++) {
      if (meanGaps[i] >= t) {
        atRisk++
        if (meanGaps[i] <= t + 1) events++
      }
    }
    if (atRisk > 0) {
      kaplanMeier[t] = kaplanMeier[t - 1] * (1 - events / atRisk)
    }
  }

  return {
    hazardRates,
    meanGaps,
    lastSeen: lastSeen.map((ls, i) => currentDraw - ls),
    criticalNumbers,
    kaplanMeier,
    overallHazard
  }
}

/**
 * Get survival scores for each number.
 * Higher score = higher probability of appearing soon (based on hazard rate).
 */
export function getSurvivalScores(survival: SurvivalResult): number[] {
  const { hazardRates, overallHazard } = survival
  const scores = new Array(100).fill(0)

  for (let i = 0; i < 100; i++) {
    if (hazardRates[i] > 0 && overallHazard > 0) {
      // Score = hazard ratio relative to average
      scores[i] = hazardRates[i] / overallHazard
    }
  }

  // Normalize to [0, 1]
  const maxScore = Math.max(...scores, 0.001)
  return scores.map(s => Math.min(1, s / maxScore))
}

/**
 * Normal CDF approximation (Abramowitz and Stegun).
 */
function normalCDF(x: number): number {
  const a1 = 0.254829592
  const a2 = -0.284496736
  const a3 = 1.421413741
  const a4 = -1.453152027
  const a5 = 1.061405429
  const p = 0.3275911

  const sign = x < 0 ? -1 : 1
  x = Math.abs(x) / Math.sqrt(2)

  const t = 1.0 / (1.0 + p * x)
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x)

  return 0.5 * (1.0 + sign * y)
}
