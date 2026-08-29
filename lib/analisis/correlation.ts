/**
 * CORRELATION ANALYSIS
 * Detecta pares de números que aparecen juntos más o menos de lo esperado.
 * Usa Chi-cuadrado y correlación de Pearson.
 */

export interface CorrelationResult {
  pairs: Array<{
    a: number; b: number;
    chiSquared: number;
    pearson: number;
    lift: number;
    support: number;
  }>;
  numberScores: number[];
}

export function analyzeCorrelations(sequences: number[][]): CorrelationResult {
  const n = 100
  const lastNums = sequences.map(s => s.map(x => x % 100))

  // Count co-occurrences (same draw)
  const cooccur = Array.from({ length: n }, () => new Array(n).fill(0))
  const marginals = new Array(n).fill(0)
  let totalDraws = 0

  for (const draw of lastNums) {
    const unique = [...new Set(draw)]
    totalDraws++
    for (const num of unique) {
      if (num >= 0 && num < n) marginals[num]++
    }
    for (let i = 0; i < unique.length; i++) {
      for (let j = i + 1; j < unique.length; j++) {
        const a = unique[i], b = unique[j]
        if (a >= 0 && a < n && b >= 0 && b < n) {
          cooccur[a][b]++
          cooccur[b][a]++
        }
      }
    }
  }

  // Calculate metrics for top pairs
  const pairs: CorrelationResult['pairs'] = []
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      if (cooccur[a][b] < 2) continue

      const observed = cooccur[a][b]
      const expected = (marginals[a] * marginals[b]) / totalDraws
      if (expected < 0.1) continue

      // Chi-squared
      const chiSquared = Math.pow(observed - expected, 2) / expected

      // Pearson correlation
      const pa = marginals[a] / totalDraws
      const pb = marginals[b] / totalDraws
      const pab = observed / totalDraws
      const num = pab - pa * pb
      const den = Math.sqrt(pa * (1 - pa) * pb * (1 - pb))
      const pearson = den > 0 ? num / den : 0

      // Lift: how much more likely they appear together vs independently
      const lift = expected > 0 ? observed / expected : 0

      // Support: how often the pair appears
      const support = observed / totalDraws

      pairs.push({ a, b, chiSquared, pearson, lift, support })
    }
  }

  pairs.sort((a, b) => b.chiSquared - a.chiSquared)
  const topPairs = pairs.slice(0, 200)

  // Score each number based on how many strong correlations it has
  const numberScores = new Array(n).fill(0)
  for (const p of topPairs.slice(0, 50)) {
    const weight = p.lift * p.support
    numberScores[p.a] += weight
    numberScores[p.b] += weight
  }

  // Normalize scores to [0, 1]
  const maxScore = Math.max(...numberScores, 0.001)
  for (let i = 0; i < n; i++) {
    numberScores[i] = numberScores[i] / maxScore
  }

  return { pairs: topPairs, numberScores }
}
