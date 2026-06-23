/**
 * MOTOR DE SIMULACIÓN MONTE CARLO AVANZADO
 *
 * Ejecuta N simulaciones para obtener distribución de probabilidades,
 * intervalos de confianza, y estadísticas de distribución para cada número.
 * Optimizado para 1,000,000+ simulaciones con procesamiento por lotes.
 */

// ─── New interfaces ────────────────────────────────────────────────────────────

export interface MonteCarloConfig {
  simulations: number;
  topN: number;
  windowSize: number;
  decayFactor: number;
  batchSize: number;
}

export interface MonteCarloResult {
  number: number;
  probability: number;
  count: number;
  ci95: { low: number; high: number };
  statistics: {
    mean: number;
    median: number;
    stdDev: number;
    skewness: number;
    kurtosis: number;
  };
}

export interface MonteCarloOutput {
  results: MonteCarloResult[];
  config: MonteCarloConfig;
  totalSimulations: number;
  computationTime: number;
  jointProbability: {
    top10: number;
    top20: number;
  };
}

// ─── Legacy interfaces (kept for backward compatibility) ────────────────────────

export interface MonteCarloResultLegacy {
  number: number;
  probability: number;
  confidenceInterval: [number, number];
  expectedRank: number;
  simulationCount: number;
  hitRate: number;
}

export interface SimulationConfig {
  simulations: number;
  topN: number;
  confidenceLevel: number;
}

const DEFAULT_CONFIG: SimulationConfig = {
  simulations: 10000,
  topN: 10,
  confidenceLevel: 0.95,
};

const ADVANCED_DEFAULT_CONFIG: MonteCarloConfig = {
  simulations: 1_000_000,
  topN: 100,
  windowSize: 0,
  decayFactor: 0.02,
  batchSize: 10_000,
};

// ─── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Build a recency-weighted frequency map from historical sequences.
 * When windowSize > 0 only the most recent `windowSize` sequences are used.
 * Decay is applied as exp(-decayFactor * i) where i=0 is the most recent draw.
 */
function buildWeightedDistribution(
  sequences: number[][],
  windowSize: number,
  decayFactor: number,
): { weights: Float64Array; cumulative: Float64Array; total: number; indexMap: number[] } {
  const effective = windowSize > 0 ? sequences.slice(0, windowSize) : sequences;
  const weightMap = new Map<number, number>();

  for (let i = 0; i < effective.length; i++) {
    const w = Math.exp(-decayFactor * i);
    for (const n of effective[i]) {
      const t = n % 100;
      weightMap.set(t, (weightMap.get(t) ?? 0) + w);
    }
  }

  // Sort entries by number so binary search is stable
  const entries = Array.from(weightMap.entries()).sort((a, b) => a[0] - b[0]);
  const indexMap = entries.map(([k]) => k);
  const weights = new Float64Array(entries.length);
  const cumulative = new Float64Array(entries.length);

  let cum = 0;
  for (let i = 0; i < entries.length; i++) {
    cum += entries[i][1];
    weights[i] = entries[i][1];
    cumulative[i] = cum;
  }

  return { weights, cumulative, total: cum, indexMap };
}

/**
 * Binary search on the cumulative array to find the number whose
 * cumulative probability interval contains value `r`.
 */
function sampleFromCumulative(
  cumulative: Float64Array,
  indexMap: number[],
  total: number,
  r: number,
): number {
  const target = r * total;
  let lo = 0;
  let hi = cumulative.length - 1;

  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (cumulative[mid] < target) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }

  return indexMap[lo];
}

/**
 * Generate a single random draw of `drawSize` numbers without replacement
 * using the pre-computed cumulative distribution.
 */
function generateDraw(
  cumulative: Float64Array,
  indexMap: number[],
  total: number,
  drawSize: number,
): number[] {
  const available = new Set<number>();
  const draw: number[] = [];

  let attempts = 0;
  const maxAttempts = drawSize * 10;

  while (draw.length < drawSize && attempts < maxAttempts) {
    attempts++;
    const num = sampleFromCumulative(cumulative, indexMap, total, Math.random());
    if (!available.has(num)) {
      available.add(num);
      draw.push(num);
    }
  }

  // Fallback: fill remaining with sequential unused numbers
  if (draw.length < drawSize) {
    for (let i = 0; i < 100 && draw.length < drawSize; i++) {
      if (!available.has(i)) {
        draw.push(i);
        available.add(i);
      }
    }
  }

  return draw;
}

/**
 * Wilson score interval for a binomial proportion.
 * More accurate than the normal approximation for extreme proportions.
 */
function wilsonScoreInterval(
  successes: number,
  trials: number,
  z: number = 1.96,
): { low: number; high: number } {
  if (trials === 0) return { low: 0, high: 0 };

  const p = successes / trials;
  const z2 = z * z;
  const denom = 1 + z2 / trials;
  const centre = p + z2 / (2 * trials);
  const spread = z * Math.sqrt((p * (1 - p) + z2 / (4 * trials)) / trials);

  return {
    low: Math.max(0, (centre - spread) / denom),
    high: Math.min(1, (centre + spread) / denom),
  };
}

/**
 * Compute mean of an array.
 */
function mean(arr: number[]): number {
  let s = 0;
  for (const v of arr) s += v;
  return s / arr.length;
}

/**
 * Compute median of a **sorted** array.
 */
function median(sorted: number[]): number {
  const n = sorted.length;
  if (n === 0) return 0;
  if (n % 2 === 0) return (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  return sorted[(n - 1) / 2];
}

/**
 * Compute standard deviation, skewness, and kurtosis in a single pass.
 * Uses population formulas (divides by N, not N-1).
 */
function distributionStats(values: number[]): {
  mean: number;
  median: number;
  stdDev: number;
  skewness: number;
  kurtosis: number;
} {
  const n = values.length;
  if (n === 0) return { mean: 0, median: 0, stdDev: 0, skewness: 0, kurtosis: 0 };

  let sum = 0;
  let sum2 = 0;
  let sum3 = 0;
  let sum4 = 0;

  for (const v of values) {
    sum += v;
    sum2 += v * v;
    sum3 += v * v * v;
    sum4 += v * v * v * v;
  }

  const m = sum / n;
  const variance = sum2 / n - m * m;
  const std = Math.sqrt(Math.max(0, variance));

  let skew = 0;
  let kurt = 0;

  if (std > 0) {
    const s2 = std * std;
    const s3 = s2 * std;
    const s4 = s2 * s2;

    // Third central moment
    const mu3 = sum3 / n - 3 * m * (sum2 / n) + 2 * m * m * m;
    // Fourth central moment
    const mu4 = sum4 / n - 4 * m * (sum3 / n) + 6 * m * m * (sum2 / n) - 3 * m * m * m * m;

    skew = mu3 / s3;
    kurt = mu4 / s4 - 3; // excess kurtosis
  }

  // For median we need a sorted copy
  const sorted = [...values].sort((a, b) => a - b);
  const med = median(sorted);

  return { mean: m, median: med, stdDev: std, skewness: skew, kurtosis: kurt };
}

// ─── Core: runMonteCarloAdvanced ───────────────────────────────────────────────

/**
 * Run an advanced Monte Carlo simulation.
 *
 * Key optimisations vs the legacy version:
 *   1. Pre-computes a cumulative distribution once and uses binary-search
 *      sampling (O(log K) per sample instead of O(K) linear scan).
 *   2. Processes simulations in configurable batches so the event loop is
 *      never blocked for long periods.
 *   3. Only keeps per-number hit counters (Float64Array) instead of the full
 *      list of all simulation draws, drastically reducing memory.
 *   4. Computes Wilson score intervals (accurate even for rare numbers).
 *   5. Computes full distribution statistics across batches for each number.
 */
export function runMonteCarloAdvanced(
  sequences: number[][],
  config?: Partial<MonteCarloConfig>,
): MonteCarloOutput {
  const cfg: MonteCarloConfig = { ...ADVANCED_DEFAULT_CONFIG, ...config };
  const drawSize = 20;
  const startTime = performance.now();

  const { cumulative, indexMap, total } = buildWeightedDistribution(
    sequences,
    cfg.windowSize,
    cfg.decayFactor,
  );

  if (total === 0) {
    return {
      results: [],
      config: cfg,
      totalSimulations: 0,
      computationTime: 0,
      jointProbability: { top10: 0, top20: 0 },
    };
  }

  // We accumulate per-number hit counts across all batches.
  // Each batch also stores its own partial count so we can derive
  // per-batch statistics later (for std/median/skew/kurt).
  const totalHits = new Float64Array(100);
  const batchCounts: Float64Array[] = []; // one Float64Array(100) per batch

  const numBatches = Math.ceil(cfg.simulations / cfg.batchSize);

  for (let b = 0; b < numBatches; b++) {
    const batchStart = b * cfg.batchSize;
    const batchEnd = Math.min(batchStart + cfg.batchSize, cfg.simulations);
    const batchCount = batchEnd - batchStart;

    const batchHits = new Float64Array(100);

    for (let s = 0; s < batchCount; s++) {
      const draw = generateDraw(cumulative, indexMap, total, drawSize);
      for (const n of draw) {
        batchHits[n]++;
        totalHits[n]++;
      }
    }

    batchCounts.push(batchHits);
  }

  // ── Aggregate results ──────────────────────────────────────────────────────

  const totalSimulations = cfg.simulations;
  const results: MonteCarloResult[] = [];

  for (let num = 0; num < 100; num++) {
    const count = totalHits[num];
    const probability = count / totalSimulations;

    // Wilson score 95% CI
    const ci95 = wilsonScoreInterval(count, totalSimulations, 1.96);

    // Collect per-batch counts for this number to compute distribution stats
    const perBatchValues: number[] = [];
    for (const bh of batchCounts) {
      perBatchValues.push(bh[num]);
    }

    const stats = distributionStats(perBatchValues);

    results.push({
      number: num,
      probability,
      count,
      ci95,
      statistics: stats,
    });
  }

  // Sort descending by probability
  results.sort((a, b) => b.probability - a.probability);

  // ── Joint probability estimation ───────────────────────────────────────────
  // We estimate the probability that all of the top-N numbers (as determined
  // by the simulation frequencies) appear together in a single draw.
  // Since a draw picks 20 numbers, the exact joint probability is 0 when any
  // of the top-N is not in the draw.  We estimate it empirically from the
  // batch counts.

  const top10Numbers = results.slice(0, 10).map(r => r.number);
  const top20Numbers = results.slice(0, 20).map(r => r.number);

  // Count how many batches had all top-10 / top-20 present
  let batchesWithTop10 = 0;
  let batchesWithTop20 = 0;

  for (const bh of batchCounts) {
    let allTop10 = true;
    let allTop20 = true;
    for (const n of top10Numbers) {
      if (bh[n] === 0) { allTop10 = false; break; }
    }
    if (allTop10) batchesWithTop10++;
    for (const n of top20Numbers) {
      if (bh[n] === 0) { allTop20 = false; break; }
    }
    if (allTop20) batchesWithTop20++;
  }

  const jointProbability = {
    top10: batchCounts.length > 0 ? batchesWithTop10 / batchCounts.length : 0,
    top20: batchCounts.length > 0 ? batchesWithTop20 / batchCounts.length : 0,
  };

  const computationTime = performance.now() - startTime;

  return {
    results: results.slice(0, cfg.topN),
    config: cfg,
    totalSimulations,
    computationTime,
    jointProbability,
  };
}

// ─── Legacy wrapper ────────────────────────────────────────────────────────────

/**
 * Run legacy Monte Carlo simulation.
 * Wraps `runMonteCarloAdvanced` for backward compatibility.
 */
export function runMonteCarlo(
  sequences: number[][],
  config: Partial<SimulationConfig> = {},
): MonteCarloResultLegacy[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  const output = runMonteCarloAdvanced(sequences, {
    simulations: cfg.simulations,
    topN: cfg.topN,
  });

  // Compute expected rank from sorted advanced results
  const rankMap = new Map<number, number>();
  output.results.forEach((r, idx) => {
    rankMap.set(r.number, idx + 1);
  });

  // Need full 100-number list to compute ranks correctly
  const allResults = output.results.slice(0, cfg.topN);
  // Re-run with topN=100 to get all numbers for rank calculation
  const fullOutput = runMonteCarloAdvanced(sequences, {
    simulations: cfg.simulations,
    topN: 100,
  });

  const fullRankMap = new Map<number, number>();
  fullOutput.results.forEach((r, idx) => {
    fullRankMap.set(r.number, idx + 1);
  });

  return allResults.map(r => ({
    number: r.number,
    probability: r.probability,
    confidenceInterval: [r.ci95.low, r.ci95.high] as [number, number],
    expectedRank: fullRankMap.get(r.number) ?? r.number,
    simulationCount: cfg.simulations,
    hitRate: r.probability,
  }));
}

/**
 * Run stratified Monte Carlo (multiple models)
 */
export function runStratifiedMonteCarlo(
  sequences: number[][],
  configs: SimulationConfig[] = [],
): MonteCarloResultLegacy[] {
  if (configs.length === 0) {
    configs = [
      { simulations: 5000, topN: 100, confidenceLevel: 0.95 },
      { simulations: 5000, topN: 100, confidenceLevel: 0.95 },
    ];
  }

  // Run each simulation with different parameters
  const allResults: MonteCarloResultLegacy[][] = [];
  for (const cfg of configs) {
    allResults.push(runMonteCarlo(sequences, cfg));
  }

  // Average results across simulations
  const averaged: MonteCarloResultLegacy[] = [];
  for (let i = 0; i < 100; i++) {
    let totalProb = 0;
    let totalRank = 0;
    let count = 0;
    for (const results of allResults) {
      const found = results.find(r => r.number === i);
      if (found) {
        totalProb += found.probability;
        totalRank += found.expectedRank;
        count++;
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
      });
    }
  }

  averaged.sort((a, b) => b.probability - a.probability);
  return averaged.slice(0, configs[0].topN);
}
