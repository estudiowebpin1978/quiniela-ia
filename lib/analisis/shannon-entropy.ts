/**
 * Shannon Entropy Filter
 * 
 * Measures the predictability/chaos level of recent lottery draws.
 * Low entropy = high predictability (patterns exist).
 * High entropy = high chaos (purely random).
 * 
 * H(X) = -Σ P(x_i) * log2(P(x_i))
 * Normalized to [0, 1] where 1 = maximum entropy (uniform distribution)
 */

export interface EntropyResult {
  entropy: number          // Normalized 0-1
  rawEntropy: number       // Raw bits
  maxEntropy: number       // log2(n) for n outcomes
  trend: 'ascending' | 'descending' | 'stable'
  alert: boolean           // True when low entropy = high predictability
  distribution: number[]   // Probability distribution
  classification: 'highly_predictable' | 'predictable' | 'random' | 'highly_random'
}

/**
 * Compute Shannon Entropy for a set of numbers (0-99).
 * Higher entropy = more random. Lower entropy = more predictable.
 */
export function computeShannonEntropy(
  sequences: number[][],
  windowSize: number = 50
): EntropyResult {
  const n = 100
  const maxEntropy = Math.log2(n)

  // Build frequency distribution from recent draws
  const freq = new Array(n).fill(0)
  let total = 0

  const recentSeqs = sequences.slice(0, Math.min(windowSize, sequences.length))
  for (const seq of recentSeqs) {
    for (const num of seq) {
      const t = num % 100
      if (t >= 0 && t <= 99) {
        freq[t]++
        total++
      }
    }
  }

  if (total === 0) {
    return {
      entropy: 1,
      rawEntropy: maxEntropy,
      maxEntropy,
      trend: 'stable',
      alert: false,
      distribution: new Array(n).fill(1 / n),
      classification: 'highly_random'
    }
  }

  // Probability distribution
  const distribution = freq.map(f => f / total)

  // Shannon entropy
  let rawEntropy = 0
  for (let i = 0; i < n; i++) {
    if (distribution[i] > 0) {
      rawEntropy -= distribution[i] * Math.log2(distribution[i])
    }
  }

  const normalizedEntropy = rawEntropy / maxEntropy

  // Compute trend: compare first half vs second half entropy
  const halfLen = Math.floor(recentSeqs.length / 2)
  const firstHalf = recentSeqs.slice(0, halfLen)
  const secondHalf = recentSeqs.slice(halfLen)

  const entropyFirst = computeWindowEntropy(firstHalf)
  const entropySecond = computeWindowEntropy(secondHalf)

  let trend: 'ascending' | 'descending' | 'stable' = 'stable'
  const diff = entropySecond - entropyFirst
  if (diff > 0.05) trend = 'ascending'
  else if (diff < -0.05) trend = 'descending'

  // Alert: low entropy = high predictability
  const alert = normalizedEntropy < 0.85

  // Classification
  let classification: EntropyResult['classification'] = 'random'
  if (normalizedEntropy < 0.7) classification = 'highly_predictable'
  else if (normalizedEntropy < 0.85) classification = 'predictable'
  else if (normalizedEntropy > 0.95) classification = 'highly_random'

  return {
    entropy: normalizedEntropy,
    rawEntropy,
    maxEntropy,
    trend,
    alert,
    distribution,
    classification
  }
}

function computeWindowEntropy(sequences: number[][]): number {
  const n = 100
  const freq = new Array(n).fill(0)
  let total = 0

  for (const seq of sequences) {
    for (const num of seq) {
      const t = num % 100
      if (t >= 0 && t <= 99) {
        freq[t]++
        total++
      }
    }
  }

  if (total === 0) return Math.log2(n)

  let entropy = 0
  for (let i = 0; i < n; i++) {
    if (freq[i] > 0) {
      const p = freq[i] / total
      entropy -= p * Math.log2(p)
    }
  }

  return entropy / Math.log2(n)
}

/**
 * Get entropy scores for each number (information content).
 * Higher score = more information = more likely to appear.
 */
export function getEntropyScores(entropyResult: EntropyResult): number[] {
  const { distribution, entropy } = entropyResult

  // Numbers with higher probability contribute more to the distribution
  // But we want to find numbers that would REDUCE entropy if they appear
  // (i.e., numbers that are underrepresented relative to uniform)
  const scores = new Array(100).fill(0)
  const uniform = 1 / 100

  for (let i = 0; i < 100; i++) {
    const deviation = Math.abs(distribution[i] - uniform)
    // Numbers that deviate from uniform are more "interesting"
    scores[i] = deviation * (1 - entropy) // Low entropy amplifies scores
  }

  // Normalize to [0, 1]
  const maxScore = Math.max(...scores, 0.001)
  return scores.map(s => s / maxScore)
}
