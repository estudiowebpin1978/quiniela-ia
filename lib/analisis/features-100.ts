export interface FeatureVector {
  number: number;
  features: Record<string, number>;
  featureCount: number;
}

export interface FeatureMatrix {
  vectors: FeatureVector[];
  featureNames: string[];
  computedAt: string;
  drawCount: number;
}

export function getFeatureNames(): string[] {
  return [
    'freq_10', 'freq_20', 'freq_50', 'freq_100', 'freq_300', 'freq_1000', 'freq_total',
    'last_appearance', 'days_since_exit', 'draws_since_exit', 'recency_exponential', 'recency_linear',
    'momentum_10', 'momentum_20', 'momentum_50', 'momentum_100', 'acceleration', 'deceleration',
    'avg_interval', 'std_interval', 'estimated_cycle', 'cycle_regularity',
    'score_hot', 'score_cold',
    'same_decena', 'same_centena', 'mirror', 'neighbors_1', 'neighbors_10', 'neighbors_100', 'family_score',
    'freq_miles', 'freq_centenas', 'freq_decenas', 'freq_unidades',
    'parity', 'digit_sum', 'digital_root', 'high_low', 'consecutive_pairs', 'consecutive_trios',
    'avg_cooccurrence', 'max_cooccurrence', 'cooccurrence_diversity',
    'transition_score_10', 'transition_score_50', 'transition_score_all',
    'entropy', 'entropy_ratio',
    'coefficient_of_variation', 'trend_strength', 'burstiness',
  ];
}

function normalizeArray(arr: number[]): number[] {
  if (arr.length === 0) return [];
  let min = Infinity;
  let max = -Infinity;
  for (const v of arr) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min;
  if (range === 0) return arr.map(() => 0.5);
  return arr.map(v => (v - min) / range);
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  let sum = 0;
  for (const v of arr) sum += v;
  return sum / arr.length;
}

function stddev(arr: number[]): number {
  if (arr.length === 0) return 0;
  const m = mean(arr);
  let sum = 0;
  for (const v of arr) sum += (v - m) * (v - m);
  return Math.sqrt(sum / arr.length);
}

function entropy(arr: number[]): number {
  if (arr.length === 0) return 0;
  let ones = 0;
  for (const v of arr) {
    if (v === 1) ones++;
  }
  const p = ones / arr.length;
  if (p === 0 || p === 1) return 0;
  return -(p * Math.log2(p) + (1 - p) * Math.log2(1 - p));
}

function linearRegression(x: number[], y: number[]): { slope: number; r2: number } {
  const n = x.length;
  if (n < 2) return { slope: 0, r2: 0 };
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
    sumXY += x[i] * y[i];
    sumX2 += x[i] * x[i];
    sumY2 += y[i] * y[i];
  }
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return { slope: 0, r2: 0 };
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  const ssRes = y.reduce((s, yi, i) => s + (yi - (slope * x[i] + intercept)) ** 2, 0);
  const ssTot = y.reduce((s, yi) => s + (yi - sumY / n) ** 2, 0);
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
  return { slope, r2 };
}

function computeDigitSum(n: number): number {
  let sum = 0;
  let tmp = n;
  while (tmp > 0) {
    sum += tmp % 10;
    tmp = Math.floor(tmp / 10);
  }
  return sum;
}

function digitalRoot(n: number): number {
  let tmp = n;
  while (tmp >= 10) {
    tmp = computeDigitSum(tmp);
  }
  return tmp;
}

function getDigits(n: number): [number, number, number, number] {
  return [
    Math.floor(n / 1000) % 10,
    Math.floor(n / 100) % 10,
    Math.floor(n / 10) % 10,
    n % 10,
  ];
}

function getDecena(n: number): number {
  return Math.floor((n % 100) / 10);
}

function getCentena(n: number): number {
  return Math.floor(n / 100);
}

function getMirror(n: number): number {
  const digits = getDigits(n);
  return digits[3] * 1000 + digits[2] * 100 + digits[1] * 10 + digits[0];
}

export function computeFeatureMatrix(sequences: number[][]): FeatureMatrix {
  const drawCount = sequences.length;
  const featureNames = getFeatureNames();
  const vectors: FeatureVector[] = [];

  if (drawCount === 0) {
    return { vectors: [], featureNames, computedAt: new Date().toISOString(), drawCount: 0 };
  }

  const flattened: number[][] = [];
  for (const draw of sequences) {
    flattened.push(draw.map(n => n % 10000));
  }

  const coocurrenceCounts: Map<number, Map<number, number>> = new Map();
  for (let i = 0; i < drawCount; i++) {
    const nums = flattened[i];
    for (let a = 0; a < nums.length; a++) {
      if (nums[a] > 99) continue;
      for (let b = a + 1; b < nums.length; b++) {
        if (nums[b] > 99) continue;
        if (!coocurrenceCounts.has(nums[a])) coocurrenceCounts.set(nums[a], new Map());
        if (!coocurrenceCounts.has(nums[b])) coocurrenceCounts.set(nums[b], new Map());
        const mapA = coocurrenceCounts.get(nums[a])!;
        const mapB = coocurrenceCounts.get(nums[b])!;
        mapA.set(nums[b], (mapA.get(nums[b]) || 0) + 1);
        mapB.set(nums[a], (mapB.get(nums[a]) || 0) + 1);
      }
    }
  }

  const numberPresence: boolean[][] = [];
  for (let num = 0; num < 100; num++) {
    const presence: boolean[] = new Array(drawCount);
    for (let i = 0; i < drawCount; i++) {
      presence[i] = flattened[i].includes(num);
    }
    numberPresence.push(presence);
  }

  const rawFeatures: Record<string, number>[] = [];

  for (let num = 0; num < 100; num++) {
    const presence = numberPresence[num];
    const features: Record<string, number> = {};

    const windowFreq = (windowSize: number): number => {
      const start = Math.max(0, drawCount - windowSize);
      let count = 0;
      for (let i = start; i < drawCount; i++) {
        if (presence[i]) count++;
      }
      return count / windowSize;
    };

    features.freq_10 = windowFreq(10);
    features.freq_20 = windowFreq(20);
    features.freq_50 = windowFreq(50);
    features.freq_100 = windowFreq(100);
    features.freq_300 = windowFreq(300);
    features.freq_1000 = windowFreq(1000);
    features.freq_total = presence.filter(Boolean).length / drawCount;

    let lastIdx = -1;
    for (let i = drawCount - 1; i >= 0; i--) {
      if (presence[i]) { lastIdx = i; break; }
    }
    features.last_appearance = lastIdx === -1 ? 1 : 1 - lastIdx / drawCount;
    features.days_since_exit = lastIdx === -1 ? 1 : (drawCount - 1 - lastIdx) / drawCount;
    features.draws_since_exit = lastIdx === -1 ? 1 : (drawCount - 1 - lastIdx) / drawCount;
    features.recency_exponential = lastIdx === -1 ? 0 : Math.exp(-0.01 * (drawCount - 1 - lastIdx));
    features.recency_linear = lastIdx === -1 ? 0 : 1 - (drawCount - 1 - lastIdx) / drawCount;

    const momentum = (window: number): number => {
      const half = Math.floor(window / 2);
      const recent = Math.max(0, drawCount - half);
      const older = Math.max(0, recent - half);
      let recentCount = 0;
      for (let i = recent; i < drawCount; i++) {
        if (presence[i]) recentCount++;
      }
      let olderCount = 0;
      for (let i = older; i < recent; i++) {
        if (presence[i]) olderCount++;
      }
      const recentRate = recentCount / half;
      const olderRate = half > 0 ? olderCount / half : 0;
      if (olderRate === 0) return recentRate > 0 ? 1 : 0;
      return (recentRate - olderRate) / olderRate;
    };

    features.momentum_10 = momentum(10);
    features.momentum_20 = momentum(20);
    features.momentum_50 = momentum(50);
    features.momentum_100 = momentum(100);

    const intervals: number[] = [];
    let lastSeen = -1;
    for (let i = 0; i < drawCount; i++) {
      if (presence[i]) {
        if (lastSeen !== -1) intervals.push(i - lastSeen);
        lastSeen = i;
      }
    }

    features.acceleration = intervals.length >= 3
      ? (intervals[intervals.length - 1] - intervals[intervals.length - 3]) / 2
      : 0;
    features.deceleration = -features.acceleration;

    features.avg_interval = intervals.length > 0 ? mean(intervals) / drawCount : 1;
    features.std_interval = intervals.length > 0 ? stddev(intervals) / drawCount : 0;
    features.estimated_cycle = features.avg_interval;
    features.cycle_regularity = features.avg_interval > 0
      ? features.std_interval / features.avg_interval
      : 0;

    const recentWindow = Math.min(20, drawCount);
    const recentStart = drawCount - recentWindow;
    let recentCount = 0;
    for (let i = recentStart; i < drawCount; i++) {
      if (presence[i]) recentCount++;
    }
    const recentFreq = recentCount / recentWindow;
    const histFreq = features.freq_total;

    features.score_hot = histFreq > 0 ? recentFreq / histFreq : recentFreq > 0 ? 2 : 0;
    features.score_cold = histFreq > 0 ? 1 - (recentFreq / histFreq) : 0;

    const decena = getDecena(num);
    const centena = getCentena(num);
    const mirror = getMirror(num);

    let sameDecenaCount = 0;
    let sameCentenaCount = 0;
    let mirrorCount = 0;
    let neighbors1Count = 0;
    let neighbors10Count = 0;
    let neighbors100Count = 0;

    for (let i = 0; i < drawCount; i++) {
      for (const drawn of flattened[i]) {
        if (drawn > 99) continue;
        if (getDecena(drawn) === decena) sameDecenaCount++;
        if (getCentena(drawn) === centena) sameCentenaCount++;
        if (drawn === mirror) mirrorCount++;
        if (Math.abs(drawn - num) === 1) neighbors1Count++;
        if (Math.abs(getDecena(drawn) - decena) === 1 && Math.abs((drawn % 10) - (num % 10)) === 0) neighbors10Count++;
        if (Math.abs(getCentena(drawn) - centena) === 1) neighbors100Count++;
      }
    }

    features.same_decena = sameDecenaCount / (drawCount * 10);
    features.same_centena = sameCentenaCount / (drawCount * 10);
    features.mirror = mirrorCount / drawCount;
    features.neighbors_1 = neighbors1Count / (drawCount * 10);
    features.neighbors_10 = neighbors10Count / (drawCount * 10);
    features.neighbors_100 = neighbors100Count / (drawCount * 10);
    features.family_score = (features.same_decena + features.same_centena + features.mirror +
      features.neighbors_1 + features.neighbors_10 + features.neighbors_100) / 6;

    let milesCount = 0, centenasCount = 0, decenasCount = 0, unidadesCount = 0;
    const miles = Math.floor(num / 1000);
    const centenas = Math.floor((num % 1000) / 100);
    const decenas = Math.floor((num % 100) / 10);
    const unidades = num % 10;

    for (let i = 0; i < drawCount; i++) {
      for (const drawn of flattened[i]) {
        if (drawn > 99) continue;
        const d = getDigits(drawn);
        if (d[0] === miles) milesCount++;
        if (d[1] === centenas) centenasCount++;
        if (d[2] === decenas) decenasCount++;
        if (d[3] === unidades) unidadesCount++;
      }
    }

    features.freq_miles = milesCount / (drawCount * 10);
    features.freq_centenas = centenasCount / (drawCount * 10);
    features.freq_decenas = decenasCount / (drawCount * 10);
    features.freq_unidades = unidadesCount / (drawCount * 10);

    let evenCount = 0;
    let highCount = 0;
    let consecutivePairsCount = 0;
    const digitSumMap: number[] = new Array(drawCount).fill(0);
    const digitalRootArr: number[] = new Array(drawCount).fill(0);

    for (let i = 0; i < drawCount; i++) {
      for (const drawn of flattened[i]) {
        if (drawn > 99) continue;
        if (drawn % 2 === 0) evenCount++;
        if (drawn >= 50) highCount++;
        if (i > 0) {
          for (const prev of flattened[i - 1]) {
            if (prev > 99) continue;
            if (Math.abs(drawn - prev) === 1) consecutivePairsCount++;
          }
        }
      }
      digitSumMap[i] = computeDigitSum(num);
      digitalRootArr[i] = digitalRoot(num);
    }

    features.parity = evenCount / (drawCount * 10);
    features.digit_sum = digitSumMap[drawCount - 1] / 36;
    features.digital_root = digitalRootArr[drawCount - 1] / 9;
    features.high_low = highCount / (drawCount * 10);
    features.consecutive_pairs = consecutivePairsCount / ((drawCount - 1) * 100);

    let consecutiveTriosCount = 0;
    for (let i = 2; i < drawCount; i++) {
      for (const d2 of flattened[i]) {
        if (d2 > 99) continue;
        for (const d1 of flattened[i - 1]) {
          if (d1 > 99) continue;
          for (const d0 of flattened[i - 2]) {
            if (d0 > 99) continue;
            if (Math.abs(d2 - d1) === 1 && Math.abs(d1 - d0) === 1) consecutiveTriosCount++;
          }
        }
      }
    }
    features.consecutive_trios = consecutiveTriosCount / ((drawCount - 2) * 1000);

    const coocMap = coocurrenceCounts.get(num);
    if (coocMap && coocMap.size > 0) {
      const coocValues = Array.from(coocMap.values());
      features.avg_cooccurrence = mean(coocValues) / drawCount;
      features.max_cooccurrence = Math.max(...coocValues) / drawCount;
      const total = coocValues.reduce((s, v) => s + v, 0);
      let entropyVal = 0;
      for (const v of coocValues) {
        const p = v / total;
        if (p > 0) entropyVal -= p * Math.log2(p);
      }
      const maxEntropy = Math.log2(coocMap.size || 1);
      features.cooccurrence_diversity = maxEntropy > 0 ? entropyVal / maxEntropy : 0;
    } else {
      features.avg_cooccurrence = 0;
      features.max_cooccurrence = 0;
      features.cooccurrence_diversity = 0;
    }

    const transitionScore = (window: number): number => {
      const start = Math.max(1, drawCount - window);
      let transitions = 0;
      let total = 0;
      for (let i = start; i < drawCount; i++) {
        for (const prev of flattened[i - 1]) {
          if (prev > 99) continue;
          for (const curr of flattened[i]) {
            if (curr > 99) continue;
            total++;
            if (curr === num && prev !== num) transitions++;
          }
        }
      }
      return total > 0 ? transitions / total : 0;
    };

    features.transition_score_10 = transitionScore(10);
    features.transition_score_50 = transitionScore(50);
    features.transition_score_all = transitionScore(drawCount);

    const ent = entropy(presence.map(Number));
    const maxEnt = Math.log2(drawCount) || 1;
    features.entropy = ent;
    features.entropy_ratio = ent / maxEnt;

    if (intervals.length > 1) {
      const m = mean(intervals);
      const s = stddev(intervals);
      features.coefficient_of_variation = m > 0 ? s / m : 0;

      const xVals = intervals.map((_, i) => i);
      const reg = linearRegression(xVals, intervals);
      features.trend_strength = Math.max(0, reg.r2);

      features.burstiness = m > 0 ? (s * s) / m : 0;
    } else {
      features.coefficient_of_variation = 0;
      features.trend_strength = 0;
      features.burstiness = 0;
    }

    rawFeatures.push(features);
  }

  const featureKeys = featureNames;
  const transposed: Record<string, number[]> = {};
  for (const key of featureKeys) {
    transposed[key] = rawFeatures.map(f => f[key] || 0);
  }
  for (const key of featureKeys) {
    transposed[key] = normalizeArray(transposed[key]);
  }

  for (let num = 0; num < 100; num++) {
    const features: Record<string, number> = {};
    for (const key of featureKeys) {
      features[key] = transposed[key][num];
    }
    vectors.push({
      number: num,
      features,
      featureCount: featureKeys.length,
    });
  }

  return {
    vectors,
    featureNames,
    computedAt: new Date().toISOString(),
    drawCount,
  };
}
