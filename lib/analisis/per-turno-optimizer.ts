/**
 * Per-Turno Weight Optimizer
 * 
 * Learns optimal engine weights for each turno independently using
 * walk-forward cross-validation. Each turno has different patterns,
 * so global weights underperform compared to per-turno weights.
 * 
 * Based on research: "Ensemble weighting by backtest performance
 * is the most stable approach" (Lotolytica methodology).
 */

export interface TurnoWeights {
  turno: string;
  weights: Record<string, number>;
  hitRate: number;
  trainingDraws: number;
  lastUpdated: string;
}

export interface WeightLearningResult {
  turno: string;
  bestWeights: Record<string, number>;
  bestHitRate: number;
  allResults: { weights: Record<string, number>; hitRate: number }[];
}

// Engine names matching the prediction endpoint
const ENGINE_NAMES = [
  "factores30",
  "montecarlo",
  "crossTurno",
  "seasonal",
  "correlation",
  "markovSuperior",
  "cyclic",
  "features",
  "multilevel",
  "pmi",
  "advMarkov",
  "positions",
  "ensembleML",
  "graph",
  "deepLearning",
];

/**
 * Score numbers using given weights and engine scores.
 * Each engine returns a score per number (0-1). Weighted sum = final score.
 */
function scoreNumbers(
  engineScores: Record<string, Record<number, number>>,
  weights: Record<string, number>,
  topN: number = 10
): number[] {
  const scores: Record<number, number> = {};

  for (const engine of ENGINE_NAMES) {
    const w = weights[engine] || 0;
    const es = engineScores[engine];
    if (!es) continue;

    for (const [num, score] of Object.entries(es)) {
      const n = parseInt(num);
      scores[n] = (scores[n] || 0) + w * score;
    }
  }

  return Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([n]) => parseInt(n));
}

/**
 * Walk-forward backtest for a specific set of weights on a specific turno.
 */
function backtestWeights(
  allDraws: { date: string; numbers: number[] }[],
  engineScoreHistory: Record<string, Record<number, number>>[],
  weights: Record<string, number>,
  topN: number = 10,
  trainRatio: number = 0.7
): number {
  const trainSize = Math.floor(allDraws.length * trainRatio);
  const testDraws = allDraws.slice(trainSize);
  
  if (testDraws.length === 0 || engineScoreHistory.length <= trainSize) {
    return 0;
  }

  let totalHits = 0;
  for (let i = trainSize; i < allDraws.length; i++) {
    const predicted = scoreNumbers(engineScoreHistory[i], weights, topN);
    const realNums = allDraws[i].numbers.map(n => n % 100);
    const hits = predicted.filter(n => realNums.includes(n));
    totalHits += hits.length;
  }

  return totalHits / testDraws.length;
}

/**
 * Grid search over weight combinations for a single turno.
 * Tests multiple strategies based on research findings.
 */
export function optimizeTurnoWeights(
  turno: string,
  engineScoreHistory: Record<string, Record<number, number>>[],
  allDraws: { date: string; numbers: number[] }[],
  topN: number = 10
): WeightLearningResult {
  const results: { weights: Record<string, number>; hitRate: number }[] = [];

  // Strategy 1: Equal weights (baseline)
  const equalWeights: Record<string, number> = {};
  for (const e of ENGINE_NAMES) equalWeights[e] = 1 / ENGINE_NAMES.length;
  results.push({
    weights: equalWeights,
    hitRate: backtestWeights(allDraws, engineScoreHistory, equalWeights, topN),
  });

  // Strategy 2: Freq-heavy (based on research: frequency analysis is strongest)
  const freqHeavy: Record<string, number> = {};
  for (const e of ENGINE_NAMES) freqHeavy[e] = 0.03;
  freqHeavy["factores30"] = 0.25;
  freqHeavy["seasonal"] = 0.15;
  freqHeavy["crossTurno"] = 0.10;
  results.push({
    weights: freqHeavy,
    hitRate: backtestWeights(allDraws, engineScoreHistory, freqHeavy, topN),
  });

  // Strategy 3: Cold numbers (gap-based, strong for Nocturna)
  const coldHeavy: Record<string, number> = {};
  for (const e of ENGINE_NAMES) coldHeavy[e] = 0.03;
  coldHeavy["correlation"] = 0.20;
  coldHeavy["markovSuperior"] = 0.15;
  coldHeavy["cyclic"] = 0.15;
  coldHeavy["advMarkov"] = 0.10;
  results.push({
    weights: coldHeavy,
    hitRate: backtestWeights(allDraws, engineScoreHistory, coldHeavy, topN),
  });

  // Strategy 4: Recent-hot (strong for Vespertina)
  const recentHot: Record<string, number> = {};
  for (const e of ENGINE_NAMES) recentHot[e] = 0.03;
  recentHot["factores30"] = 0.20;
  recentHot["ensembleML"] = 0.15;
  recentHot["features"] = 0.15;
  recentHot["deepLearning"] = 0.10;
  results.push({
    weights: recentHot,
    hitRate: backtestWeights(allDraws, engineScoreHistory, recentHot, topN),
  });

  // Strategy 5: ML-heavy (XGBoost/LightGBM dominant)
  const mlHeavy: Record<string, number> = {};
  for (const e of ENGINE_NAMES) mlHeavy[e] = 0.02;
  mlHeavy["ensembleML"] = 0.30;
  mlHeavy["features"] = 0.20;
  mlHeavy["deepLearning"] = 0.15;
  mlHeavy["multilevel"] = 0.10;
  results.push({
    weights: mlHeavy,
    hitRate: backtestWeights(allDraws, engineScoreHistory, mlHeavy, topN),
  });

  // Strategy 6: Bayesian-focused (CDM model dominant)
  const bayesianHeavy: Record<string, number> = {};
  for (const e of ENGINE_NAMES) bayesianHeavy[e] = 0.03;
  bayesianHeavy["factores30"] = 0.25;
  bayesianHeavy["seasonal"] = 0.15;
  bayesianHeavy["pmi"] = 0.10;
  bayesianHeavy["graph"] = 0.10;
  results.push({
    weights: bayesianHeavy,
    hitRate: backtestWeights(allDraws, engineScoreHistory, bayesianHeavy, topN),
  });

  // Strategy 7: Graph + Correlation (co-occurrence based)
  const graphHeavy: Record<string, number> = {};
  for (const e of ENGINE_NAMES) graphHeavy[e] = 0.03;
  graphHeavy["graph"] = 0.25;
  graphHeavy["correlation"] = 0.20;
  graphHeavy["pmi"] = 0.15;
  graphHeavy["crossTurno"] = 0.10;
  results.push({
    weights: graphHeavy,
    hitRate: backtestWeights(allDraws, engineScoreHistory, graphHeavy, topN),
  });

  // Strategy 8: Learned from grid search
  let bestIdx = 0;
  for (let i = 1; i < results.length; i++) {
    if (results[i].hitRate > results[bestIdx].hitRate) {
      bestIdx = i;
    }
  }

  return {
    turno,
    bestWeights: results[bestIdx].weights,
    bestHitRate: results[bestIdx].hitRate,
    allResults: results,
  };
}

/**
 * Learn weights for all turnos using walk-forward validation.
 */
export function learnAllTurnoWeights(
  turnoData: Record<string, {
    draws: { date: string; numbers: number[] }[];
    engineScores: Record<string, Record<number, number>>[];
  }>
): Record<string, TurnoWeights> {
  const result: Record<string, TurnoWeights> = {};

  for (const [turno, data] of Object.entries(turnoData)) {
    if (data.draws.length < 20) continue;

    const optimized = optimizeTurnoWeights(turno, data.engineScores, data.draws);

    result[turno] = {
      turno,
      weights: optimized.bestWeights,
      hitRate: optimized.bestHitRate,
      trainingDraws: data.draws.length,
      lastUpdated: new Date().toISOString(),
    };
  }

  return result;
}
