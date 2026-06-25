/**
 * Prediction Metadata Tracker
 * 
 * Stores metadata with each prediction to track what worked.
 * Enables post-hoc analysis of which engines/strategies produced
 * the most accurate predictions.
 * 
 * This solves the critical gap: previously only date/turno/numbers
 * were stored. Now we store engine scores, weights, and confidence.
 */

export interface PredictionMetadata {
  predictionId?: string;
  date: string;
  turno: string;
  timestamp: string;
  
  // Engine contributions (which engines scored each number high)
  engineScores: {
    factores30: number;
    montecarlo: number;
    crossTurno: number;
    seasonal: number;
    correlation: number;
    markovSuperior: number;
    cyclic: number;
    features: number;
    multilevel: number;
    pmi: number;
    advMarkov: number;
    positions: number;
    ensembleML: number;
    graph: number;
    deepLearning: number;
    cdm: number;
  };
  
  // Weights used
  weights: Record<string, number>;
  
  // Confidence metrics
  confidence: number;
  topScore: number;
  scoreSpread: number; // difference between top and bottom scores
  
  // Backtest context
  historicalHitRate: number; // what backtest predicted
  trainingDraws: number;
  
  // Result (filled after comparison)
  actualHits?: number;
  actualHitRate?: number;
  bestEngine?: string; // which engine contributed most to hits
}

/**
 * Compute metadata for a prediction given engine scores and weights.
 */
export function computePredictionMetadata(
  date: string,
  turno: string,
  predictedNumbers: number[],
  engineScoresPerNumber: Record<string, Record<number, number>>,
  weights: Record<string, number>,
  historicalHitRate: number,
  trainingDraws: number
): Omit<PredictionMetadata, "actualHits" | "actualHitRate" | "bestEngine"> {
  
  // Average engine score across predicted numbers
  const avgEngineScores: Record<string, number> = {};
  for (const engine of Object.keys(weights)) {
    const scores = engineScoresPerNumber[engine];
    if (!scores) continue;
    const engineAvg = predictedNumbers.reduce((sum, n) => sum + (scores[n] || 0), 0) / predictedNumbers.length;
    avgEngineScores[engine] = engineAvg;
  }

  // Top score and spread
  const allScores = predictedNumbers.map(n => {
    let total = 0;
    for (const [engine, w] of Object.entries(weights)) {
      total += w * (engineScoresPerNumber[engine]?.[n] || 0);
    }
    return total;
  });
  const topScore = Math.max(...allScores);
  const bottomScore = Math.min(...allScores);
  const scoreSpread = topScore - bottomScore;

  // Overall confidence
  const confidence = Math.min(1, historicalHitRate / 3); // normalize to 0-1

  return {
    date,
    turno,
    timestamp: new Date().toISOString(),
    engineScores: avgEngineScores as any,
    weights,
    confidence,
    topScore,
    scoreSpread,
    historicalHitRate,
    trainingDraws,
  };
}

/**
 * After comparison with actual results, determine which engine
 * contributed most to the hits.
 */
export function findBestEngine(
  predictedNumbers: number[],
  actualNumbers: number[],
  engineScoresPerNumber: Record<string, Record<number, number>>,
  weights: Record<string, number>
): string {
  const hitNumbers = predictedNumbers.filter(n => actualNumbers.includes(n));
  if (hitNumbers.length === 0) return "none";

  // For each engine, compute how well it "predicted" the hits
  const engineContributions: Record<string, number> = {};
  
  for (const engine of Object.keys(weights)) {
    const scores = engineScoresPerNumber[engine];
    if (!scores) continue;
    
    let hitScore = 0;
    let totalScore = 0;
    for (const n of hitNumbers) {
      hitScore += scores[n] || 0;
    }
    for (const n of predictedNumbers) {
      totalScore += scores[n] || 0;
    }
    
    // Normalized contribution: how much of total weight went to hits
    engineContributions[engine] = totalScore > 0 ? hitScore / totalScore : 0;
  }

  // Return engine with highest contribution to hits
  let bestEngine = "none";
  let bestContrib = 0;
  for (const [engine, contrib] of Object.entries(engineContributions)) {
    if (contrib > bestContrib) {
      bestContrib = contrib;
      bestEngine = engine;
    }
  }

  return bestEngine;
}
