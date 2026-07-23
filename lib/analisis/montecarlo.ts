/**
 * Scoring empírico determinista (reemplazo de Monte Carlo estocástico).
 *
 * Cero Math.random: las "probabilidades" salen de frecuencias ponderadas
 * por recencia sobre el histórico real en Supabase.
 */

export interface MonteCarloConfig {
  simulations: number
  topN: number
  windowSize: number
  decayFactor: number
  batchSize: number
}

export interface MonteCarloResult {
  number: number
  probability: number
  count: number
  ci95: { low: number; high: number }
  statistics: {
    mean: number
    median: number
    stdDev: number
    skewness: number
    kurtosis: number
  }
}

export interface MonteCarloOutput {
  results: MonteCarloResult[]
  config: MonteCarloConfig
  totalSimulations: number
  computationTime: number
  jointProbability: { top10: number; top20: number }
}

export interface MonteCarloResultLegacy {
  number: number
  probability: number
  confidenceInterval: [number, number]
  expectedRank: number
  simulationCount: number
  hitRate: number
}

export interface SimulationConfig {
  simulations: number
  topN: number
  confidenceLevel: number
}

const DEFAULT_CONFIG: SimulationConfig = {
  simulations: 0,
  topN: 10,
  confidenceLevel: 0.95,
}

const ADVANCED_DEFAULT_CONFIG: MonteCarloConfig = {
  simulations: 0,
  topN: 100,
  windowSize: 0,
  decayFactor: 0.02,
  batchSize: 10_000,
}

function buildWeightedDistribution(
  sequences: number[][],
  windowSize: number,
  decayFactor: number,
): { weights: Float64Array; total: number; rawCounts: Float64Array; totalDraws: number } {
  const effective = windowSize > 0 ? sequences.slice(0, windowSize) : sequences
  const weights = new Float64Array(100)
  const rawCounts = new Float64Array(100)
  let total = 0

  for (let i = 0; i < effective.length; i++) {
    const w = Math.exp(-decayFactor * i)
    for (const n of effective[i]) {
      const t = ((n % 100) + 100) % 100
      weights[t] += w
      rawCounts[t] += 1
      total += w
    }
  }

  return { weights, total, rawCounts, totalDraws: effective.length }
}

function wilsonScoreInterval(
  successes: number,
  trials: number,
  z: number = 1.96,
): { low: number; high: number } {
  if (trials <= 0) return { low: 0, high: 0 }
  const p = successes / trials
  const z2 = z * z
  const denom = 1 + z2 / trials
  const centre = p + z2 / (2 * trials)
  const spread = z * Math.sqrt((p * (1 - p) + z2 / (4 * trials)) / trials)
  return {
    low: Math.max(0, (centre - spread) / denom),
    high: Math.min(1, (centre + spread) / denom),
  }
}

/**
 * Probabilidad aproximada de aparición en un sorteo de 20 posiciones
 * sin reemplazo, a partir de la masa empírica p_i = w_i / Σw.
 * Fórmula: 1 - ∏(1 - w_i/(W - k*avg)) ≈ 1-(1-p)^20 truncado.
 */
function appearanceProbability(p: number, drawSize = 20): number {
  if (p <= 0) return 0
  if (p >= 1) return 1
  return 1 - Math.pow(1 - Math.min(1, p), drawSize)
}

/**
 * Scoring determinista basado en distribución empírica ponderada.
 * Mantiene la misma API que el antiguo Monte Carlo.
 */
export function runMonteCarloAdvanced(
  sequences: number[][],
  config?: Partial<MonteCarloConfig>,
): MonteCarloOutput {
  const cfg: MonteCarloConfig = { ...ADVANCED_DEFAULT_CONFIG, ...config }
  const startTime = performance.now()

  const { weights, total, rawCounts, totalDraws } = buildWeightedDistribution(
    sequences,
    cfg.windowSize,
    cfg.decayFactor,
  )

  if (total === 0 || totalDraws === 0) {
    return {
      results: [],
      config: cfg,
      totalSimulations: 0,
      computationTime: 0,
      jointProbability: { top10: 0, top20: 0 },
    }
  }

  // Total de extracciones históricas (cada sorteo aporta ~20 números)
  const totalExtractions = Array.from(rawCounts).reduce((a, b) => a + b, 0)
  const results: MonteCarloResult[] = []

  for (let num = 0; num < 100; num++) {
    const mass = weights[num] / total
    const probability = appearanceProbability(mass, 20)
    const count = rawCounts[num]
    // CI Wilson sobre tasa histórica por sorteo
    const ratePerDraw = totalDraws > 0 ? count / totalDraws : 0
    const ci95 = wilsonScoreInterval(count, Math.max(1, totalExtractions / 20), 1.96)

    const mean = ratePerDraw
    const stdDev = Math.sqrt(Math.max(0, mean * (1 - Math.min(1, mean))))

    results.push({
      number: num,
      probability,
      count,
      ci95,
      statistics: {
        mean,
        median: mean,
        stdDev,
        skewness: 0,
        kurtosis: 0,
      },
    })
  }

  results.sort((a, b) => b.probability - a.probability)

  const top10 = results.slice(0, 10).reduce((s, r) => s + r.probability, 0) / 10
  const top20 = results.slice(0, 20).reduce((s, r) => s + r.probability, 0) / 20

  return {
    results: results.slice(0, cfg.topN),
    config: { ...cfg, simulations: 0 },
    totalSimulations: 0,
    computationTime: performance.now() - startTime,
    jointProbability: { top10, top20 },
  }
}

export function runMonteCarlo(
  sequences: number[][],
  config: Partial<SimulationConfig> = {},
): MonteCarloResultLegacy[] {
  const cfg = { ...DEFAULT_CONFIG, ...config }
  const fullOutput = runMonteCarloAdvanced(sequences, {
    simulations: 0,
    topN: 100,
  })

  const fullRankMap = new Map<number, number>()
  fullOutput.results.forEach((r, idx) => {
    fullRankMap.set(r.number, idx + 1)
  })

  return fullOutput.results.slice(0, cfg.topN).map(r => ({
    number: r.number,
    probability: r.probability,
    confidenceInterval: [r.ci95.low, r.ci95.high] as [number, number],
    expectedRank: fullRankMap.get(r.number) ?? r.number,
    simulationCount: 0,
    hitRate: r.probability,
  }))
}

export function runStratifiedMonteCarlo(
  sequences: number[][],
  _configs: SimulationConfig[] = [],
): MonteCarloResultLegacy[] {
  // Una sola pasada determinista (sin estratificación estocástica)
  return runMonteCarlo(sequences, { topN: 100, simulations: 0, confidenceLevel: 0.95 })
}
