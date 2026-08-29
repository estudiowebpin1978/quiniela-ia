/**
 * ADVANCED MARKOV CHAIN ANALYSIS ENGINE
 *
 * Multi-level Markov chain analysis with larger state spaces:
 * - Level 1: 100x100 matrix (2D transitions)
 * - Level 2: 1000x1000 matrix (3D transitions, sparse with top-200 states)
 * - Level 3: Pair transitions (previous, current) → next
 *
 * Includes transition entropy, mixing time estimation, and stationary distribution.
 */

export interface AdvancedMarkovResult {
  scores: number[]; // 0-99, combined score [0-1]

  // Per-level scores
  markov1: number[]; // 100x100 transition scores
  markov2: number[]; // 1000x1000 transition scores
  markov3: number[]; // pair transition scores

  // Metrics
  transitionEntropy: number;
  mixingTime: number;
  stationaryDist: number[];

  // Transition matrices (for debugging/analysis)
  matrix100: number[][]; // 100x100
  matrix1000Top: { state: string; transitions: Record<number, number> }[]; // top states

  // Top transitions from last draw
  topTransitions: { from: number; to: number; probability: number }[];
}

const NUM_STATES = 100;
const TOP_K_1000 = 200;
const TOP_K_PAIRS = 100;
const MAX_MIXING_STEPS = 100;
const MIXING_THRESHOLD = 0.01;

/**
 * Compute advanced Markov chain analysis from sequences of draws.
 * Each sequence contains numbers (0-9999); we work modulo 100 for 2-digit states.
 */
export function computeAdvancedMarkov(sequences: number[][]): AdvancedMarkovResult {
  if (sequences.length === 0 || sequences.every(s => s.length === 0)) {
    return emptyResult();
  }

  const draws = sequences.map(s => s.map(n => n % NUM_STATES));
  const flatSequence = flattenDraws(draws);

  if (flatSequence.length < 20) {
    return emptyResult();
  }

  const lastNumber = flatSequence[flatSequence.length - 1];

  // Level 1: 100x100 transition matrix
  const { matrix100, counts100 } = buildMatrix100(flatSequence);

  // Level 2: 1000x1000 sparse matrix (top-200 states)
  const { topStates1000, matrix1000Sparse } = buildMatrix1000Sparse(draws);

  // Level 3: Pair transitions
  const { topPairs, pairTransitions } = buildPairTransitions(draws);

  // Compute scores from each level
  const markov1Scores = scoreFromMatrix100(matrix100, lastNumber);
  const markov2Scores = scoreFromMatrix1000(matrix1000Sparse, lastNumber, markov1Scores);
  const markov3Scores = scoreFromPairs(pairTransitions, lastNumber, flatSequence);

  // Learn weights from data (cross-validation style)
  const weights = learnWeights(markov1Scores, markov2Scores, markov3Scores, flatSequence);

  // Combined scores
  const combined = new Array(NUM_STATES);
  for (let i = 0; i < NUM_STATES; i++) {
    combined[i] =
      weights.w1 * markov1Scores[i] +
      weights.w2 * markov2Scores[i] +
      weights.w3 * markov3Scores[i];
  }

  // Normalize combined scores to [0, 1]
  const maxCombined = Math.max(...combined, 0.0001);
  const normalized = combined.map(s => s / maxCombined);

  // Stationary distribution
  const stationaryDist = computeStationaryDistribution(matrix100);

  // Transition entropy
  const transitionEntropy = computeTransitionEntropy(matrix100);

  // Mixing time
  const mixingTime = estimateMixingTime(matrix100, stationaryDist);

  // Top transitions from last draw
  const topTransitions = getTopTransitions(matrix100, lastNumber, 10);

  return {
    scores: normalized,
    markov1: normalizeArray(markov1Scores),
    markov2: normalizeArray(markov2Scores),
    markov3: normalizeArray(markov3Scores),
    transitionEntropy,
    mixingTime,
    stationaryDist,
    matrix100,
    matrix1000Top: topStates1000,
    topTransitions,
  };
}

// ---------------------------------------------------------------------------
// Helper: flatten all draws into a single sequence of 2-digit numbers
// ---------------------------------------------------------------------------
function flattenDraws(draws: number[][]): number[] {
  const flat: number[] = [];
  for (const draw of draws) {
    for (const n of draw) {
      flat.push(n);
    }
  }
  return flat;
}

// ---------------------------------------------------------------------------
// Level 1: Build 100x100 transition matrix
// ---------------------------------------------------------------------------
function buildMatrix100(flat: number[]): {
  matrix100: number[][];
  counts100: number[][];
} {
  const counts = Array.from({ length: NUM_STATES }, () => new Array(NUM_STATES).fill(0));

  for (let i = 0; i < flat.length - 1; i++) {
    const from = flat[i];
    const to = flat[i + 1];
    counts[from][to]++;
  }

  const matrix = Array.from({ length: NUM_STATES }, () => new Array(NUM_STATES).fill(0));
  for (let i = 0; i < NUM_STATES; i++) {
    const rowTotal = counts[i].reduce((a, b) => a + b, 0);
    if (rowTotal > 0) {
      for (let j = 0; j < NUM_STATES; j++) {
        matrix[i][j] = counts[i][j] / rowTotal;
      }
    } else {
      // Uniform fallback
      for (let j = 0; j < NUM_STATES; j++) {
        matrix[i][j] = 1 / NUM_STATES;
      }
    }
  }

  return { matrix100: matrix, counts100: counts };
}

// ---------------------------------------------------------------------------
// Level 2: Build sparse 1000x1000 matrix using top-200 most frequent 3-digit states
// ---------------------------------------------------------------------------
function buildMatrix1000Sparse(
  draws: number[][]
): {
  topStates1000: { state: string; transitions: Record<number, number> }[];
  matrix1000Sparse: Map<string, Map<number, number>>;
} {
  // Count 3-digit state frequencies across all draws
  const stateFreq = new Map<string, number>();
  const allTransitions = new Map<string, Map<number, number>>();

  for (const draw of draws) {
    for (let i = 0; i < draw.length - 1; i++) {
      // 3-digit state from last number's digits (pad with zero)
      const state = to3DigitState(draw, i);
      const next2Digit = draw[i + 1] % NUM_STATES;

      stateFreq.set(state, (stateFreq.get(state) || 0) + 1);

      if (!allTransitions.has(state)) {
        allTransitions.set(state, new Map());
      }
      const tMap = allTransitions.get(state)!;
      tMap.set(next2Digit, (tMap.get(next2Digit) || 0) + 1);
    }
  }

  // Get top-K states by frequency
  const sorted = Array.from(stateFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_K_1000);

  const topStates1000: { state: string; transitions: Record<number, number> }[] = [];
  const sparseMap = new Map<string, Map<number, number>>();

  for (const [state] of sorted) {
    const rawTransitions = allTransitions.get(state);
    if (!rawTransitions) continue;

    // Normalize to probabilities
    const total = Array.from(rawTransitions.values()).reduce((a, b) => a + b, 0);
    if (total === 0) continue;

    const probs = new Map<number, number>();
    const transitionsObj: Record<number, number> = {};
    for (const [num, count] of rawTransitions) {
      const p = count / total;
      probs.set(num, p);
      transitionsObj[num] = Math.round(p * 10000) / 10000;
    }

    sparseMap.set(state, probs);
    topStates1000.push({ state, transitions: transitionsObj });
  }

  return { topStates1000, matrix1000Sparse: sparseMap };
}

function to3DigitState(draw: number[], index: number): string {
  const num = draw[index];
  // Create a 3-digit representation: take last 3 digits, or use position info
  const hundreds = Math.floor(num / 100) % 10;
  const tens = Math.floor(num / 10) % 10;
  const ones = num % 10;
  return `${hundreds}${tens}${ones}`;
}

// ---------------------------------------------------------------------------
// Level 3: Pair transitions
// ---------------------------------------------------------------------------
function buildPairTransitions(
  draws: number[][]
): {
  topPairs: string[];
  pairTransitions: Map<string, Map<number, number>>;
} {
  const pairFreq = new Map<string, number>();
  const pairNext = new Map<string, Map<number, number>>();

  for (const draw of draws) {
    for (let i = 0; i < draw.length - 2; i++) {
      const pair = `${draw[i]},${draw[i + 1]}`;
      const next = draw[i + 2] % NUM_STATES;

      pairFreq.set(pair, (pairFreq.get(pair) || 0) + 1);

      if (!pairNext.has(pair)) {
        pairNext.set(pair, new Map());
      }
      const nMap = pairNext.get(pair)!;
      nMap.set(next, (nMap.get(next) || 0) + 1);
    }
  }

  // Keep top-K pairs
  const topPairs = Array.from(pairFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_K_PAIRS)
    .map(([pair]) => pair);

  // Normalize transitions for top pairs
  const result = new Map<string, Map<number, number>>();
  for (const pair of topPairs) {
    const raw = pairNext.get(pair);
    if (!raw) continue;
    const total = Array.from(raw.values()).reduce((a, b) => a + b, 0);
    if (total === 0) continue;
    const probs = new Map<number, number>();
    for (const [num, count] of raw) {
      probs.set(num, count / total);
    }
    result.set(pair, probs);
  }

  return { topPairs, pairTransitions: result };
}

// ---------------------------------------------------------------------------
// Scoring: Level 1
// ---------------------------------------------------------------------------
function scoreFromMatrix100(matrix: number[][], lastNumber: number): number[] {
  return matrix[lastNumber].slice();
}

// ---------------------------------------------------------------------------
// Scoring: Level 2
// ---------------------------------------------------------------------------
function scoreFromMatrix1000(
  sparse: Map<string, Map<number, number>>,
  lastNumber: number,
  fallback: number[]
): number[] {
  // Build 3-digit state from last number
  const state = numTo3DigitState(lastNumber);

  if (sparse.has(state)) {
    const probs = sparse.get(state)!;
    const scores = new Array(NUM_STATES).fill(0);
    for (let i = 0; i < NUM_STATES; i++) {
      scores[i] = probs.get(i) || 0;
    }
    return scores;
  }

  // Fallback to Level 1
  return fallback.slice();
}

function numTo3DigitState(num: number): string {
  const hundreds = Math.floor(num / 100) % 10;
  const tens = Math.floor(num / 10) % 10;
  const ones = num % 10;
  return `${hundreds}${tens}${ones}`;
}

// ---------------------------------------------------------------------------
// Scoring: Level 3
// ---------------------------------------------------------------------------
function scoreFromPairs(
  pairTransitions: Map<string, Map<number, number>>,
  lastNumber: number,
  flatSequence: number[]
): number[] {
  const scores = new Array(NUM_STATES).fill(0);

  if (flatSequence.length >= 2) {
    const prev = flatSequence[flatSequence.length - 2];
    const pair = `${prev},${lastNumber}`;

    if (pairTransitions.has(pair)) {
      const probs = pairTransitions.get(pair)!;
      for (let i = 0; i < NUM_STATES; i++) {
        scores[i] = probs.get(i) || 0;
      }
      return scores;
    }
  }

  // Fallback: average of all pair transitions from pairs involving lastNumber
  let count = 0;
  for (const [pair, probs] of pairTransitions) {
    const parts = pair.split(",");
    if (parseInt(parts[1]) === lastNumber) {
      for (let i = 0; i < NUM_STATES; i++) {
        scores[i] += probs.get(i) || 0;
      }
      count++;
    }
  }

  if (count > 0) {
    for (let i = 0; i < NUM_STATES; i++) {
      scores[i] /= count;
    }
  }

  return scores;
}

// ---------------------------------------------------------------------------
// Weight learning via leave-one-out heuristic
// ---------------------------------------------------------------------------
function learnWeights(
  s1: number[],
  s2: number[],
  s3: number[],
  flat: number[]
): { w1: number; w2: number; w3: number } {
  if (flat.length < 30) {
    return { w1: 0.4, w2: 0.35, w3: 0.25 };
  }

  // Simple approach: evaluate each level's predictive power on held-out data
  // Use last 20% as test
  const splitIdx = Math.floor(flat.length * 0.8);
  const trainEnd = flat.length - 1; // we need transitions up to last

  // Count correct predictions from each level on a sample
  let correct1 = 0;
  let correct2 = 0;
  let correct3 = 0;
  let total = 0;

  // Sample every 5th position from test portion
  for (let i = Math.max(splitIdx, 2); i < flat.length - 1; i += 5) {
    // Level 1 prediction
    const top1 = getTopK(s1, 1);
    if (top1.includes(flat[i])) correct1++;

    // Level 3 prediction (if we have enough history)
    if (i >= 2) {
      const top3 = getTopK(s3, 1);
      if (top3.includes(flat[i])) correct3++;
    }

    total++;
  }

  // If no test data, use defaults
  if (total === 0) {
    return { w1: 0.4, w2: 0.35, w3: 0.25 };
  }

  // Weight by relative performance
  const p1 = correct1 / total;
  const p2 = p1 * 0.9; // Level 2 often similar to Level 1
  const p3 = correct3 / total || p1 * 0.8;

  const rawW1 = Math.max(p1, 0.1);
  const rawW2 = Math.max(p2, 0.1);
  const rawW3 = Math.max(p3, 0.1);
  const sumW = rawW1 + rawW2 + rawW3;

  return {
    w1: rawW1 / sumW,
    w2: rawW2 / sumW,
    w3: rawW3 / sumW,
  };
}

function getTopK(scores: number[], k: number): number[] {
  return scores
    .map((s, i) => ({ s, i }))
    .sort((a, b) => b.s - a.s)
    .slice(0, k)
    .map(x => x.i);
}

// ---------------------------------------------------------------------------
// Stationary distribution via power iteration
// ---------------------------------------------------------------------------
function computeStationaryDistribution(matrix: number[][]): number[] {
  let dist = new Array(NUM_STATES).fill(1 / NUM_STATES);

  for (let iter = 0; iter < 50; iter++) {
    const newDist = new Array(NUM_STATES).fill(0);
    for (let j = 0; j < NUM_STATES; j++) {
      for (let i = 0; i < NUM_STATES; i++) {
        newDist[j] += dist[i] * matrix[i][j];
      }
    }
    dist = newDist;
  }

  // Round to 4 decimals
  return dist.map(v => Math.round(v * 10000) / 10000);
}

// ---------------------------------------------------------------------------
// Transition entropy (average row entropy of the matrix)
// ---------------------------------------------------------------------------
function computeTransitionEntropy(matrix: number[][]): number {
  let totalEntropy = 0;
  let rowCount = 0;

  for (const row of matrix) {
    // Skip uniform rows (no data)
    if (row.every(v => Math.abs(v - 1 / NUM_STATES) < 0.001)) continue;

    let entropy = 0;
    for (const p of row) {
      if (p > 0) {
        entropy -= p * Math.log2(p);
      }
    }
    totalEntropy += entropy;
    rowCount++;
  }

  return rowCount > 0 ? Math.round((totalEntropy / rowCount) * 1000) / 1000 : 0;
}

// ---------------------------------------------------------------------------
// Mixing time estimation via total variation distance convergence
// ---------------------------------------------------------------------------
function estimateMixingTime(
  matrix: number[][],
  stationary: number[]
): number {
  // Start from delta at state 0
  let dist = new Array(NUM_STATES).fill(0);
  dist[0] = 1;

  for (let step = 1; step <= MAX_MIXING_STEPS; step++) {
    // Multiply: newDist = dist * matrix
    const newDist = new Array(NUM_STATES).fill(0);
    for (let j = 0; j < NUM_STATES; j++) {
      for (let i = 0; i < NUM_STATES; i++) {
        newDist[j] += dist[i] * matrix[i][j];
      }
    }

    // Total variation distance
    let tvd = 0;
    for (let i = 0; i < NUM_STATES; i++) {
      tvd += Math.abs(newDist[i] - stationary[i]);
    }
    tvd /= 2;

    dist = newDist;

    if (tvd < MIXING_THRESHOLD) {
      return step;
    }
  }

  return MAX_MIXING_STEPS;
}

// ---------------------------------------------------------------------------
// Get top transitions from a specific state
// ---------------------------------------------------------------------------
function getTopTransitions(
  matrix: number[][],
  fromState: number,
  k: number
): { from: number; to: number; probability: number }[] {
  return matrix[fromState]
    .map((p, to) => ({ from: fromState, to, probability: Math.round(p * 10000) / 10000 }))
    .sort((a, b) => b.probability - a.probability)
    .slice(0, k);
}

// ---------------------------------------------------------------------------
// Normalize array to [0, 1]
// ---------------------------------------------------------------------------
function normalizeArray(arr: number[]): number[] {
  const max = Math.max(...arr, 0.0001);
  return arr.map(v => v / max);
}

// ---------------------------------------------------------------------------
// Empty result fallback
// ---------------------------------------------------------------------------
function emptyResult(): AdvancedMarkovResult {
  const uniform = new Array(NUM_STATES).fill(1 / NUM_STATES);
  return {
    scores: new Array(NUM_STATES).fill(1 / NUM_STATES),
    markov1: uniform.slice(),
    markov2: uniform.slice(),
    markov3: uniform.slice(),
    transitionEntropy: Math.log2(NUM_STATES),
    mixingTime: 0,
    stationaryDist: uniform.slice(),
    matrix100: Array.from({ length: NUM_STATES }, () => uniform.slice()),
    matrix1000Top: [],
    topTransitions: [],
  };
}
