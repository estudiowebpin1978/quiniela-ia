export interface AdjustedWeights {
  w30factors: number;
  wMonteCarlo: number;
  wCrossTurno: number;
  wSeasonal: number;
  wCorrelation: number;
  wMarkovSuperior: number;
  wCyclic: number;
  wGraph: number;
  wDeepLearning: number;
  wMultilevel: number;
  wPMI: number;
  wFeatures: number;
  wEnsembleML: number;
  lastAdjusted: string;
  totalAdjustments: number;
  hitRate: number;
  adjustmentHistory: {
    timestamp: string;
    hits: number;
    total: number;
    weights: Record<string, number>;
  }[];
}

const ENGINE_KEYS = [
  'w30factors', 'wMonteCarlo', 'wCrossTurno', 'wSeasonal', 'wCorrelation',
  'wMarkovSuperior', 'wCyclic', 'wGraph', 'wDeepLearning', 'wMultilevel',
  'wPMI', 'wFeatures', 'wEnsembleML'
] as const;

const DEFAULT_MOMENTUM = 0.7;

export function createInitialWeights(): AdjustedWeights {
  const base = 1 / ENGINE_KEYS.length;
  const weights: AdjustedWeights = {
    w30factors: base,
    wMonteCarlo: base,
    wCrossTurno: base,
    wSeasonal: base,
    wCorrelation: base,
    wMarkovSuperior: base,
    wCyclic: base,
    wGraph: base,
    wDeepLearning: base,
    wMultilevel: base,
    wPMI: base,
    wFeatures: base,
    wEnsembleML: base,
    lastAdjusted: new Date().toISOString(),
    totalAdjustments: 0,
    hitRate: 0,
    adjustmentHistory: []
  };
  return weights;
}

function normalize(weights: AdjustedWeights): void {
  let sum = 0;
  for (const key of ENGINE_KEYS) {
    sum += weights[key];
  }
  if (sum === 0) {
    const base = 1 / ENGINE_KEYS.length;
    for (const key of ENGINE_KEYS) {
      weights[key] = base;
    }
    return;
  }
  for (const key of ENGINE_KEYS) {
    weights[key] /= sum;
  }
}

function toRecord(w: AdjustedWeights): Record<string, number> {
  const r: Record<string, number> = {};
  for (const key of ENGINE_KEYS) {
    r[key] = w[key];
  }
  return r;
}

function scorePredictions(
  predicted: number[],
  actual: number[]
): { hits: number; contributions: Record<string, number> } {
  const actualSet = new Set(actual);
  const contributions: Record<string, number> = {};
  for (const key of ENGINE_KEYS) {
    contributions[key] = 0;
  }
  let hits = 0;
  for (let i = 0; i < predicted.length; i++) {
    if (actualSet.has(predicted[i])) {
      hits++;
      const positionWeight = 1 - (i / predicted.length) * 0.5;
      const engineIdx = i % ENGINE_KEYS.length;
      contributions[ENGINE_KEYS[engineIdx]] += positionWeight;
    }
  }
  return { hits, contributions };
}

export function adjustWeights(
  current: AdjustedWeights,
  predictions: number[][],
  actuals: number[][],
  learningRate: number = 0.05
): AdjustedWeights {
  const adjusted: AdjustedWeights = {
    ...current,
    adjustmentHistory: [...current.adjustmentHistory]
  };

  let totalHits = 0;
  let totalPredictions = 0;
  const aggregatedContributions: Record<string, number> = {};
  const aggregatedMisses: Record<string, number> = {};
  for (const key of ENGINE_KEYS) {
    aggregatedContributions[key] = 0;
    aggregatedMisses[key] = 0;
  }

  for (let i = 0; i < predictions.length; i++) {
    const pred = predictions[i];
    const act = actuals[i] || [];
    const { hits, contributions } = scorePredictions(pred, act);
    totalHits += hits;
    totalPredictions += pred.length;

    for (const key of ENGINE_KEYS) {
      aggregatedContributions[key] += contributions[key];
      if (contributions[key] === 0) {
        aggregatedMisses[key] += 1;
      }
    }
  }

  const maxContribution = Math.max(
    ...Object.values(aggregatedContributions),
    1
  );
  const missPenalty = 0.5;

  for (const key of ENGINE_KEYS) {
    const hitBonus = (aggregatedContributions[key] / maxContribution) * learningRate;
    const missReduction = (aggregatedMisses[key] / predictions.length) * learningRate * missPenalty;
    const prevWeight = adjusted[key];
    const delta = hitBonus - missReduction;
    adjusted[key] = prevWeight + delta;
  }

  for (const key of ENGINE_KEYS) {
    if (adjusted[key] < 0.01) {
      adjusted[key] = 0.01;
    }
  }

  normalize(adjusted);

  adjusted.totalAdjustments = current.totalAdjustments + 1;
  adjusted.hitRate = totalPredictions > 0 ? totalHits / totalPredictions : 0;
  adjusted.lastAdjusted = new Date().toISOString();

  const historyEntry = {
    timestamp: adjusted.lastAdjusted,
    hits: totalHits,
    total: totalPredictions,
    weights: toRecord(adjusted)
  };

  adjusted.adjustmentHistory.push(historyEntry);
  if (adjusted.adjustmentHistory.length > 50) {
    adjusted.adjustmentHistory = adjusted.adjustmentHistory.slice(-50);
  }

  return adjusted;
}

export function getWeightSummary(w: AdjustedWeights): Record<string, number> {
  const summary: Record<string, number> = {};
  for (const key of ENGINE_KEYS) {
    summary[key] = w[key];
  }
  return summary;
}
