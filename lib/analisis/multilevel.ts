export interface MultiLevelScores {
  number: number;
  score4D: number;
  score3D: number;
  score2D: number;
  scorePositions: {
    miles: number;
    centenas: number;
    decenas: number;
    unidades: number;
  };
  combined: number;
  details: Record<string, number>;
}

interface FrequencyMap {
  [key: string]: number;
}

function buildFrequencyMap(sequences: number[][], extractor: (n: number) => string): FrequencyMap {
  const freq: FrequencyMap = {};
  let total = 0;

  for (const seq of sequences) {
    for (const num of seq) {
      const key = extractor(num);
      if (key !== "") {
        freq[key] = (freq[key] || 0) + 1;
        total++;
      }
    }
  }

  if (total > 0) {
    for (const key in freq) {
      freq[key] /= total;
    }
  }

  return freq;
}

function padNumber(n: number, digits: number): string {
  return n.toString().padStart(digits, "0");
}

function getLastDigits(n: number, count: number): string {
  return padNumber(n, count).slice(-count);
}

function extractDigits(n: number): { miles: number; centenas: number; decenas: number; unidades: number } {
  const padded = padNumber(n, 4);
  return {
    miles: parseInt(padded[0]),
    centenas: parseInt(padded[1]),
    decenas: parseInt(padded[2]),
    unidades: parseInt(padded[3]),
  };
}

function buildPositionFrequency(sequences: number[][]): {
  miles: number[];
  centenas: number[];
  decenas: number[];
  unidades: number[];
} {
  const positions = {
    miles: new Array(10).fill(0),
    centenas: new Array(10).fill(0),
    decenas: new Array(10).fill(0),
    unidades: new Array(10).fill(0),
  };

  let total = 0;

  for (const seq of sequences) {
    for (const num of seq) {
      const d = extractDigits(num);
      positions.miles[d.miles]++;
      positions.centenas[d.centenas]++;
      positions.decenas[d.decenas]++;
      positions.unidades[d.unidades]++;
      total++;
    }
  }

  if (total > 0) {
    for (let i = 0; i < 10; i++) {
      positions.miles[i] /= total;
      positions.centenas[i] /= total;
      positions.decenas[i] /= total;
      positions.unidades[i] /= total;
    }
  }

  return positions;
}

function buildDigitTransitions(sequences: number[][]): number[][] {
  const transitions: number[][] = Array.from({ length: 10 }, () => new Array(10).fill(0));
  let total = 0;

  for (const seq of sequences) {
    for (const num of seq) {
      const d = extractDigits(num);
      transitions[d.miles][d.centenas]++;
      transitions[d.centenas][d.decenas]++;
      transitions[d.decenas][d.unidades]++;
      total += 3;
    }
  }

  if (total > 0) {
    for (let i = 0; i < 10; i++) {
      for (let j = 0; j < 10; j++) {
        transitions[i][j] /= total;
      }
    }
  }

  return transitions;
}

function scorePositionForNumber(
  num: number,
  posFreq: { miles: number[]; centenas: number[]; decenas: number[]; unidades: number[] }
): { miles: number; centenas: number; decenas: number; unidades: number } {
  const d = extractDigits(num);
  return {
    miles: posFreq.miles[d.miles],
    centenas: posFreq.centenas[d.centenas],
    decenas: posFreq.decenas[d.decenas],
    unidades: posFreq.unidades[d.unidades],
  };
}

function computeDynamicWeights(
  freq4D: FrequencyMap,
  freq3D: FrequencyMap,
  freq2D: FrequencyMap,
  posFreq: { miles: number[]; centenas: number[]; decenas: number[]; unidades: number[] }
): { w4D: number; w3D: number; w2D: number; wPos: number } {
  const unique4D = Object.keys(freq4D).length;
  const unique3D = Object.keys(freq3D).length;
  const unique2D = Object.keys(freq2D).length;

  const maxProb4D = Math.max(...Object.values(freq4D), 0);
  const maxProb3D = Math.max(...Object.values(freq3D), 0);
  const maxProb2D = Math.max(...Object.values(freq2D), 0);

  const maxEntropyPos = Math.max(
    ...posFreq.miles,
    ...posFreq.centenas,
    ...posFreq.decenas,
    ...posFreq.unidades,
    0
  );

  const sparsity4D = unique4D / 10000;
  const sparsity3D = unique3D / 1000;
  const sparsity2D = unique2D / 100;

  const w2D = 0.5 + 0.3 * (1 - sparsity2D) + 0.2 * maxProb2D;
  const w3D = 0.2 + 0.15 * (1 - sparsity3D) + 0.1 * maxProb3D;
  const w4D = 0.1 + 0.1 * (1 - sparsity4D) + 0.05 * maxProb4D;
  const wPos = 1 - w2D - w3D - w4D;

  const total = w2D + w3D + w4D + wPos;
  return {
    w2D: w2D / total,
    w3D: w3D / total,
    w4D: w4D / total,
    wPos: wPos / total,
  };
}

export function computeMultiLevelScores(sequences: number[][]): MultiLevelScores[] {
  if (sequences.length === 0) {
    return Array.from({ length: 100 }, (_, i) => ({
      number: i,
      score4D: 0,
      score3D: 0,
      score2D: 0,
      scorePositions: { miles: 0, centenas: 0, decenas: 0, unidades: 0 },
      combined: 0,
      details: {},
    }));
  }

  const freq4D = buildFrequencyMap(sequences, (n) => padNumber(n, 4));
  const freq3D = buildFrequencyMap(sequences, (n) => getLastDigits(n, 3));
  const freq2D = buildFrequencyMap(sequences, (n) => getLastDigits(n, 2));
  const posFreq = buildPositionFrequency(sequences);
  const transitions = buildDigitTransitions(sequences);

  const weights = computeDynamicWeights(freq4D, freq3D, freq2D, posFreq);

  const results: MultiLevelScores[] = [];

  for (let num = 0; num < 100; num++) {
    const key4D = padNumber(num, 4);
    const key3D = getLastDigits(num, 3);
    const key2D = getLastDigits(num, 2);

    const score4D = freq4D[key4D] || 0;
    const score3D = freq3D[key3D] || 0;
    const score2D = freq2D[key2D] || 0;
    const posScores = scorePositionForNumber(num, posFreq);

    const posAvg = (posScores.miles + posScores.centenas + posScores.decenas + posScores.unidades) / 4;

    const combined =
      weights.w4D * score4D +
      weights.w3D * score3D +
      weights.w2D * score2D +
      weights.wPos * posAvg;

    const d = extractDigits(num);
    const transScore =
      (transitions[d.miles][d.centenas] +
        transitions[d.centenas][d.decenas] +
        transitions[d.decenas][d.unidades]) /
      3;

    results.push({
      number: num,
      score4D,
      score3D,
      score2D,
      scorePositions: posScores,
      combined,
      details: {
        weight4D: weights.w4D,
        weight3D: weights.w3D,
        weight2D: weights.w2D,
        weightPos: weights.wPos,
        posAvg,
        transScore,
        milesDigit: d.miles,
        centenasDigit: d.centenas,
        decenasDigit: d.decenas,
        unidadesDigit: d.unidades,
      },
    });
  }

  return results;
}