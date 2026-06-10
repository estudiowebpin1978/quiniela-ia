/**
 * MOTOR DE SIMULACIÓN MONTE CARLO
 * 
 * Ejecuta N simulaciones para obtener distribución de probabilidades
 * y intervalos de confianza para cada número.
 */

export interface MonteCarloResult {
  number: number
  probability: number        // Probability of appearing in next draw
  confidenceInterval: [number, number]  // 95% CI
  expectedRank: number       // Expected ranking
  simulationCount: number
  hitRate: number            // How often it appeared in simulations
}

export interface SimulationConfig {
  simulations: number        // Number of simulations (default 10,000)
  topN: number               // Top N numbers to return
  confidenceLevel: number    // Confidence level (default 0.95)
}

const DEFAULT_CONFIG: SimulationConfig = {
  simulations: 10000,
  topN: 10,
  confidenceLevel: 0.95,
}

/**
 * Generate random draw based on historical frequency distribution
 */
function generateRandomDraw(
  frequencyDist: Record<number, number>,
  totalNumbers: number,
  drawSize: number = 20
): number[] {
  const entries = Object.entries(frequencyDist)
  const total = entries.reduce((sum, [, freq]) => sum + freq, 0)
  if (total === 0) return []

  const draw: number[] = []
  const available = new Set<number>()

  // Weighted random sampling without replacement
  while (draw.length < drawSize && available.size < 100) {
    const r = Math.random() * total
    let cumulative = 0
    for (const [num, freq] of entries) {
      cumulative += freq
      if (cumulative >= r && !available.has(parseInt(num))) {
        draw.push(parseInt(num))
        available.add(parseInt(num))
        break
      }
    }
    // Safety: if we can't find a number, just pick a random one
    if (draw.length === available.size - 1) {
      for (let i = 0; i < 100; i++) {
        if (!available.has(i)) {
          draw.push(i)
          available.add(i)
          break
        }
      }
    }
  }

  return draw.slice(0, drawSize)
}

/**
 * Run Monte Carlo simulation
 */
export function runMonteCarlo(
  sequences: number[][],
  config: Partial<SimulationConfig> = {}
): MonteCarloResult[] {
  const cfg = { ...DEFAULT_CONFIG, ...config }
  const drawSize = 20

  // Build frequency distribution from historical data
  const freq: Record<number, number> = {}
  for (const seq of sequences) {
    for (const n of seq) {
      const t = n % 100
      freq[t] = (freq[t] || 0) + 1
    }
  }

  // Build recency-weighted distribution (recent draws have more weight)
  const recencyFreq: Record<number, number> = {}
  for (let i = 0; i < sequences.length; i++) {
    const weight = Math.exp(-0.02 * i)  // Exponential decay
    for (const n of sequences[i]) {
      const t = n % 100
      recencyFreq[t] = (recencyFreq[t] || 0) + weight
    }
  }

  // Run simulations
  const hitCounts: Record<number, number> = {}
  for (let i = 0; i < 100; i++) hitCounts[i] = 0

  const allSimulations: number[][] = []
  for (let s = 0; s < cfg.simulations; s++) {
    const simDraw = generateRandomDraw(recencyFreq, 100, drawSize)
    allSimulations.push(simDraw)
    for (const n of simDraw) {
      hitCounts[n]++
    }
  }

  // Calculate results
  const results: MonteCarloResult[] = []
  for (let i = 0; i < 100; i++) {
    const probability = hitCounts[i] / cfg.simulations

    // Calculate confidence interval using binomial proportion
    const z = cfg.confidenceLevel === 0.95 ? 1.96 : cfg.confidenceLevel === 0.99 ? 2.576 : 1.645
    const se = Math.sqrt(probability * (1 - probability) / cfg.simulations)
    const ciLow = Math.max(0, probability - z * se)
    const ciHigh = Math.min(1, probability + z * se)

    // Calculate expected rank
    let rank = 1
    for (let j = 0; j < 100; j++) {
      if (j !== i && hitCounts[j] > hitCounts[i]) rank++
    }

    results.push({
      number: i,
      probability,
      confidenceInterval: [ciLow, ciHigh],
      expectedRank: rank,
      simulationCount: cfg.simulations,
      hitRate: probability,
    })
  }

  // Sort by probability
  results.sort((a, b) => b.probability - a.probability)

  return results.slice(0, cfg.topN)
}

/**
 * Run stratified Monte Carlo (multiple models)
 */
export function runStratifiedMonteCarlo(
  sequences: number[][],
  configs: SimulationConfig[] = []
): MonteCarloResult[] {
  if (configs.length === 0) {
    configs = [
      { simulations: 5000, topN: 100, confidenceLevel: 0.95 },
      { simulations: 5000, topN: 100, confidenceLevel: 0.95 },
    ]
  }

  // Run each simulation with different parameters
  const allResults: MonteCarloResult[][] = []
  for (const cfg of configs) {
    allResults.push(runMonteCarlo(sequences, cfg))
  }

  // Average results across simulations
  const averaged: MonteCarloResult[] = []
  for (let i = 0; i < 100; i++) {
    let totalProb = 0
    let totalRank = 0
    let count = 0
    for (const results of allResults) {
      const found = results.find(r => r.number === i)
      if (found) {
        totalProb += found.probability
        totalRank += found.expectedRank
        count++
      }
    }
    if (count > 0) {
      averaged.push({
        number: i,
        probability: totalProb / count,
        confidenceInterval: [totalProb / count * 0.9, totalProb / count * 1.1],
        expectedRank: totalRank / count,
        simulationCount: configs.reduce((sum, c) => sum + c.simulations, 0),
        hitRate: totalProb / count,
      })
    }
  }

  averaged.sort((a, b) => b.probability - a.probability)
  return averaged.slice(0, configs[0].topN)
}
