/**
 * CYCLIC PATTERN DETECTION
 * 
 * Detecta patrones cíclicos usando:
 * - Transformada de Fourier (DFT) para frecuencias dominantes
 * - Autocorrelación para periodicidad
 * - Análisis de ventanas deslizantes para tendencias locales
 */

export interface CyclicResult {
  scores: number[];
  dominantFrequencies: Array<{ num: number; period: number; strength: number }>;
  autocorrelationPeaks: Array<{ num: number; lag: number; correlation: number }>;
}

export function detectCyclicPatterns(sequences: number[][]): CyclicResult {
  const n = 100
  const lastNums = sequences.map(s => s.map(x => x % 100))

  // Build binary occurrence series for each number
  const series: number[][] = Array.from({ length: n }, () => [])
  for (const draw of lastNums) {
    const present = new Set(draw)
    for (let num = 0; num < n; num++) {
      series[num].push(present.has(num) ? 1 : 0)
    }
  }

  const scores = new Array(n).fill(0)
  const dominantFrequencies: CyclicResult['dominantFrequencies'] = []
  const autocorrelationPeaks: CyclicResult['autocorrelationPeaks'] = []

  for (let num = 0; num < n; num++) {
    const s = series[num]
    if (s.length < 10) continue

    const mean = s.reduce((a, b) => a + b, 0) / s.length
    const centered = s.map(x => x - mean)
    const variance = centered.reduce((a, b) => a + b * b, 0) / s.length
    if (variance < 0.001) continue

    // === DFT: find dominant frequency ===
    let maxPower = 0
    let dominantPeriod = 0
    const minPeriod = 3
    const maxPeriod = Math.floor(s.length / 2)

    for (let period = minPeriod; period <= maxPeriod; period++) {
      let real = 0, imag = 0
      for (let t = 0; t < s.length; t++) {
        const angle = (2 * Math.PI * t) / period
        real += centered[t] * Math.cos(angle)
        imag += centered[t] * Math.sin(angle)
      }
      const power = (real * real + imag * imag) / s.length
      if (power > maxPower) {
        maxPower = power
        dominantPeriod = period
      }
    }

    const strength = variance > 0 ? maxPower / (s.length * variance) : 0
    if (dominantPeriod > 0 && strength > 0.05) {
      scores[num] += strength
      dominantFrequencies.push({ num, period: dominantPeriod, strength })
    }

    // === Autocorrelation ===
    let maxAutocorr = 0
    let bestLag = 0
    const maxLag = Math.min(Math.floor(s.length / 3), 30)

    for (let lag = 1; lag <= maxLag; lag++) {
      let sum = 0
      for (let t = 0; t < s.length - lag; t++) {
        sum += centered[t] * centered[t + lag]
      }
      const autocorr = sum / ((s.length - lag) * variance)
      if (autocorr > maxAutocorr) {
        maxAutocorr = autocorr
        bestLag = lag
      }
    }

    if (maxAutocorr > 0.1 && bestLag > 0) {
      scores[num] += maxAutocorr * 0.5
      autocorrelationPeaks.push({ num, lag: bestLag, correlation: maxAutocorr })
    }

    // === Sliding window trend ===
    const windowSize = Math.min(20, Math.floor(s.length / 3))
    if (windowSize >= 5) {
      const recentWindow = s.slice(-windowSize)
      const olderWindow = s.slice(-windowSize * 2, -windowSize)
      if (olderWindow.length >= windowSize) {
        const recentMean = recentWindow.reduce((a, b) => a + b, 0) / windowSize
        const olderMean = olderWindow.reduce((a, b) => a + b, 0) / windowSize
        const trend = recentMean - olderMean
        if (trend > 0) scores[num] += trend * 2
      }
    }
  }

  // Normalize
  const maxScore = Math.max(...scores, 0.001)
  for (let i = 0; i < n; i++) {
    scores[i] = scores[i] / maxScore
  }

  dominantFrequencies.sort((a, b) => b.strength - a.strength)
  autocorrelationPeaks.sort((a, b) => b.correlation - a.correlation)

  return {
    scores,
    dominantFrequencies: dominantFrequencies.slice(0, 50),
    autocorrelationPeaks: autocorrelationPeaks.slice(0, 50)
  }
}
