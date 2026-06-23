export interface LearnedWeights {
  weights: Record<string, number>;
  hitRate10_train: number;
  hitRate10_val: number;
  overfitRatio: number;
  foldResults: {
    fold: number;
    trainSize: number;
    valSize: number;
    hitRate10: number;
    weights: Record<string, number>;
  }[];
  learnedAt: string;
}

const ENGINE_KEYS = [
  'w30factors', 'wMonteCarlo', 'wCrossTurno', 'wSeasonal', 'wCorrelation',
  'wMarkovSuperior', 'wCyclic', 'wGraph', 'wDeepLearning', 'wMultilevel',
  'wPMI', 'wFeatures', 'wEnsembleML'
];

const GROUP_A = ['w30factors', 'wFeatures', 'wMultilevel'];
const GROUP_B = ['wMonteCarlo', 'wCrossTurno', 'wSeasonal', 'wMarkovSuperior', 'wCyclic'];
const GROUP_C = ['wCorrelation', 'wGraph', 'wDeepLearning', 'wPMI', 'wEnsembleML'];

const GRID_LEVELS = [0.0, 0.1, 0.2, 0.3, 0.4, 0.5];
const NUM_FOLDS = 5;
const MIN_WEIGHT = 0.01;

function normalizeWeights(weights: Record<string, number>): Record<string, number> {
  let sum = 0;
  for (const key of ENGINE_KEYS) {
    sum += weights[key] || 0;
  }
  if (sum === 0) {
    const base = 1 / ENGINE_KEYS.length;
    const result: Record<string, number> = {};
    for (const key of ENGINE_KEYS) {
      result[key] = base;
    }
    return result;
  }
  const normalized: Record<string, number> = {};
  for (const key of ENGINE_KEYS) {
    normalized[key] = (weights[key] || 0) / sum;
  }
  return normalized;
}

function computeEnsembleScores(
  engineScores: Record<string, number[][]>,
  weights: Record<string, number>
): number[] {
  const numDraws = getNumDraws(engineScores);
  const scores: number[] = new Array(numDraws).fill(0);

  for (const key of ENGINE_KEYS) {
    const eScores = engineScores[key];
    if (!eScores) continue;
    const w = weights[key] || 0;
    for (let d = 0; d < numDraws; d++) {
      const drawScores = eScores[d] || [];
      for (let n = 0; n < drawScores.length; n++) {
        scores[d] += (drawScores[n] || 0) * w;
      }
    }
  }
  return scores;
}

function getNumDraws(engineScores: Record<string, number[][]>): number {
  let max = 0;
  for (const key of ENGINE_KEYS) {
    if (engineScores[key] && engineScores[key].length > max) {
      max = engineScores[key].length;
    }
  }
  return max;
}

function hitAt10(
  ensembleScores: number[],
  actuals: number[][],
  topN: number = 10
): number {
  let hits = 0;
  let total = 0;

  for (let d = 0; d < actuals.length; d++) {
    const actual = new Set(actuals[d] || []);
    const drawScores = getDrawScores(ensembleScores, d);
    const topIndices = getTopNIndices(drawScores, topN);
    for (const idx of topIndices) {
      if (actual.has(idx + 1)) {
        hits++;
      }
    }
    total += actual.size;
  }

  return total > 0 ? hits / total : 0;
}

function getDrawScores(ensembleScores: number[], drawIdx: number): number[] {
  const start = drawIdx * 30;
  const scores: number[] = [];
  for (let i = 0; i < 30; i++) {
    scores.push(ensembleScores[start + i] || 0);
  }
  return scores;
}

function getTopNIndices(scores: number[], n: number): number[] {
  const indexed = scores.map((s, i) => ({ score: s, idx: i }));
  indexed.sort((a, b) => b.score - a.score);
  return indexed.slice(0, n).map(x => x.idx);
}

function createExpandingFolds(
  numDraws: number,
  numFolds: number
): { train: [number, number]; val: [number, number] }[] {
  const folds: { train: [number, number]; val: [number, number] }[] = [];
  const minTrainSize = Math.max(2, Math.floor(numDraws * 0.3));
  const availableForVal = numDraws - minTrainSize;
  const foldSize = Math.max(1, Math.floor(availableForVal / numFolds));

  for (let f = 0; f < numFolds; f++) {
    const valEnd = Math.min(minTrainSize + (f + 1) * foldSize, numDraws);
    const valStart = valEnd - foldSize;
    const trainEnd = valStart;
    if (trainEnd < 1 || valEnd <= valStart) continue;
    folds.push({
      train: [0, trainEnd],
      val: [valStart, valEnd]
    });
  }
  return folds;
}

function optimizeGroupWeights(
  sequences: number[][],
  engineScores: Record<string, number[][]>,
  groupKeys: string[],
  folds: { train: [number, number]; val: [number, number] }[]
): Record<string, number> {
  const bestWeights: Record<string, number> = {};
  for (const key of groupKeys) {
    bestWeights[key] = 1 / groupKeys.length;
  }

  let bestAvgHit = 0;

  const gridPermutations = generateGrid(groupKeys.length, GRID_LEVELS);

  for (const perm of gridPermutations) {
    const testWeights: Record<string, number> = {};
    let permSum = 0;
    for (let i = 0; i < groupKeys.length; i++) {
      testWeights[groupKeys[i]] = perm[i];
      permSum += perm[i];
    }
    if (permSum === 0) continue;

    const normalizedPerm: Record<string, number> = {};
    for (const key of groupKeys) {
      normalizedPerm[key] = testWeights[key] / permSum;
    }

    let totalHit = 0;
    let validFolds = 0;

    for (const fold of folds) {
      const subsetScores = subsetEngineScores(engineScores, fold.val[0], fold.val[1]);
      const subsetActuals = sequences.slice(fold.val[0], fold.val[1]);
      const flatScores = flattenScores(subsetScores);
      const ensembleScores = computeEnsembleScores(flatScores, normalizedPerm);
      const actualsPerDraw = subsetActuals.map(s => s.slice(0, 30));
      const hit = hitAt10(ensembleScores, actualsPerDraw, 10);
      totalHit += hit;
      validFolds++;
    }

    const avgHit = validFolds > 0 ? totalHit / validFolds : 0;
    if (avgHit > bestAvgHit) {
      bestAvgHit = avgHit;
      for (const key of groupKeys) {
        bestWeights[key] = normalizedPerm[key];
      }
    }
  }

  return bestWeights;
}

function generateGrid(numVars: number, levels: number[]): number[][] {
  if (numVars === 0) return [[]];
  const result: number[][] = [];
  const subPerms = generateGrid(numVars - 1, levels);
  for (const level of levels) {
    for (const sub of subPerms) {
      result.push([level, ...sub]);
    }
  }
  return result;
}

function subsetEngineScores(
  engineScores: Record<string, number[][]>,
  from: number,
  to: number
): Record<string, number[][]> {
  const subset: Record<string, number[][]> = {};
  for (const key of ENGINE_KEYS) {
    if (engineScores[key]) {
      subset[key] = engineScores[key].slice(from, to);
    }
  }
  return subset;
}

function flattenScores(
  engineScores: Record<string, number[][]>
): Record<string, number[][]> {
  const flat: Record<string, number[][]> = {};
  for (const key of ENGINE_KEYS) {
    if (engineScores[key]) {
      const flatDraws: number[][] = [];
      for (const draw of engineScores[key]) {
        flatDraws.push(draw);
      }
      flat[key] = flatDraws;
    }
  }
  return flat;
}

function optimizeWithinGroup(
  sequences: number[][],
  engineScores: Record<string, number[][]>,
  groupKeys: string[],
  groupWeight: number,
  folds: { train: [number, number]; val: [number, number] }[]
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const key of groupKeys) {
    result[key] = groupWeight / groupKeys.length;
  }

  let bestAvgHit = 0;
  const internalGrid = generateGrid(groupKeys.length, [0.5, 0.75, 1.0, 1.25, 1.5]);

  for (const perm of internalGrid) {
    let permSum = 0;
    for (let i = 0; i < groupKeys.length; i++) {
      permSum += perm[i];
    }
    if (permSum === 0) continue;

    const testWeights: Record<string, number> = {};
    for (let i = 0; i < groupKeys.length; i++) {
      testWeights[groupKeys[i]] = (perm[i] / permSum) * groupWeight;
    }

    let totalHit = 0;
    let validFolds = 0;

    for (const fold of folds) {
      const subsetScores = subsetEngineScores(engineScores, fold.val[0], fold.val[1]);
      const subsetActuals = sequences.slice(fold.val[0], fold.val[1]);
      const flatScores = flattenScores(subsetScores);
      const ensembleScores = computeEnsembleScores(flatScores, testWeights);
      const actualsPerDraw = subsetActuals.map(s => s.slice(0, 30));
      const hit = hitAt10(ensembleScores, actualsPerDraw, 10);
      totalHit += hit;
      validFolds++;
    }

    const avgHit = validFolds > 0 ? totalHit / validFolds : 0;
    if (avgHit > bestAvgHit) {
      bestAvgHit = avgHit;
      for (const key of groupKeys) {
        result[key] = testWeights[key];
      }
    }
  }

  return result;
}

export function learnWeights(
  sequences: number[][],
  engineScores: Record<string, number[][]>
): LearnedWeights {
  const numDraws = getNumDraws(engineScores);
  const folds = createExpandingFolds(numDraws, NUM_FOLDS);

  const groupAWeights = optimizeGroupWeights(sequences, engineScores, GROUP_A, folds);
  const groupBWeights = optimizeGroupWeights(sequences, engineScores, GROUP_B, folds);
  const groupCWeights = optimizeGroupWeights(sequences, engineScores, GROUP_C, folds);

  let groupASum = 0, groupBSum = 0, groupCSum = 0;
  for (const k of GROUP_A) groupASum += groupAWeights[k] || 0;
  for (const k of GROUP_B) groupBSum += groupBWeights[k] || 0;
  for (const k of GROUP_C) groupCSum += groupCWeights[k] || 0;

  const totalGroupSum = groupASum + groupBSum + groupCSum;
  if (totalGroupSum > 0) {
    for (const k of GROUP_A) groupAWeights[k] = (groupAWeights[k] || 0) / totalGroupSum;
    for (const k of GROUP_B) groupBWeights[k] = (groupBWeights[k] || 0) / totalGroupSum;
    for (const k of GROUP_C) groupCWeights[k] = (groupCWeights[k] || 0) / totalGroupSum;
  }

  const optimizedA = optimizeWithinGroup(sequences, engineScores, GROUP_A, 1 / 3, folds);
  const optimizedB = optimizeWithinGroup(sequences, engineScores, GROUP_B, 1 / 3, folds);
  const optimizedC = optimizeWithinGroup(sequences, engineScores, GROUP_C, 1 / 3, folds);

  const finalWeights: Record<string, number> = {};
  for (const k of GROUP_A) {
    finalWeights[k] = (groupAWeights[k] || 0) * (optimizedA[k] || 1 / GROUP_A.length);
  }
  for (const k of GROUP_B) {
    finalWeights[k] = (groupBWeights[k] || 0) * (optimizedB[k] || 1 / GROUP_B.length);
  }
  for (const k of GROUP_C) {
    finalWeights[k] = (groupCWeights[k] || 0) * (optimizedC[k] || 1 / GROUP_C.length);
  }

  const normalizedWeights = normalizeWeights(finalWeights);

  for (const key of ENGINE_KEYS) {
    if (normalizedWeights[key] < MIN_WEIGHT) {
      normalizedWeights[key] = MIN_WEIGHT;
    }
  }
  const finalNormalized = normalizeWeights(normalizedWeights);

  const foldResults: LearnedWeights['foldResults'] = [];
  let totalTrainHit = 0;
  let totalValHit = 0;
  let validFoldCount = 0;

  for (const fold of folds) {
    const trainScores = subsetEngineScores(engineScores, fold.train[0], fold.train[1]);
    const valScores = subsetEngineScores(engineScores, fold.val[0], fold.val[1]);
    const trainActuals = sequences.slice(fold.train[0], fold.train[1]).map(s => s.slice(0, 30));
    const valActuals = sequences.slice(fold.val[0], fold.val[1]).map(s => s.slice(0, 30));

    const trainFlat = flattenScores(trainScores);
    const valFlat = flattenScores(valScores);

    const trainEnsemble = computeEnsembleScores(trainFlat, finalNormalized);
    const valEnsemble = computeEnsembleScores(valFlat, finalNormalized);

    const trainHit = hitAt10(trainEnsemble, trainActuals, 10);
    const valHit = hitAt10(valEnsemble, valActuals, 10);

    totalTrainHit += trainHit;
    totalValHit += valHit;
    validFoldCount++;

    foldResults.push({
      fold: foldResults.length,
      trainSize: fold.train[1] - fold.train[0],
      valSize: fold.val[1] - fold.val[0],
      hitRate10: valHit,
      weights: { ...finalNormalized }
    });
  }

  const avgTrainHit = validFoldCount > 0 ? totalTrainHit / validFoldCount : 0;
  const avgValHit = validFoldCount > 0 ? totalValHit / validFoldCount : 0;
  const overfitRatio = avgTrainHit > 0 ? avgTrainHit / Math.max(avgValHit, 0.001) : 1;

  return {
    weights: finalNormalized,
    hitRate10_train: avgTrainHit,
    hitRate10_val: avgValHit,
    overfitRatio,
    foldResults,
    learnedAt: new Date().toISOString()
  };
}

export function getOptimalWeights(learned: LearnedWeights): Record<string, number> {
  return { ...learned.weights };
}
