export interface CooccurrenceResult {
  scores: number[];
  pmi: number[][];
  correlation: number[][];
  lift: number[][];
  cooccurrence: number[][];
  topPairs: { a: number; b: number; pmi: number; lift: number; correlation: number }[];
  perNumber: {
    number: number;
    avgPMI: number;
    avgLift: number;
    avgCorrelation: number;
    topCooccurrences: { number: number; count: number; pmi: number }[];
  }[];
}

export function computeCooccurrence(sequences: number[][]): CooccurrenceResult {
  const N = 100;
  const totalDraws = sequences.length;

  const cooccur = Array.from({ length: N }, () => new Array(N).fill(0));
  const marginals = new Array(N).fill(0);

  for (const seq of sequences) {
    const unique = [...new Set(seq.map(x => x % 100))].filter(x => x >= 0 && x < N);
    for (const num of unique) {
      marginals[num]++;
    }
    for (let i = 0; i < unique.length; i++) {
      for (let j = i + 1; j < unique.length; j++) {
        const a = unique[i];
        const b = unique[j];
        cooccur[a][b]++;
        cooccur[b][a]++;
      }
    }
  }

  const pmiMatrix = Array.from({ length: N }, () => new Array(N).fill(0));
  const liftMatrix = Array.from({ length: N }, () => new Array(N).fill(0));
  const corrMatrix = Array.from({ length: N }, () => new Array(N).fill(0));

  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      if (i === j) continue;

      const cooc = cooccur[i][j];
      if (cooc < 2) continue;

      const pi = marginals[i] / totalDraws;
      const pj = marginals[j] / totalDraws;
      const pij = cooc / totalDraws;

      if (pi < 1e-10 || pj < 1e-10) continue;

      const expected = pi * pj;
      liftMatrix[i][j] = expected > 0 ? pij / expected : 0;

      if (pij > 0 && expected > 0) {
        pmiMatrix[i][j] = Math.log2(pij / expected);
      }

      const num = pij - pi * pj;
      const den = Math.sqrt(pi * (1 - pi) * pj * (1 - pj));
      corrMatrix[i][j] = den > 0 ? num / den : 0;
    }
  }

  const scores = new Array(N).fill(0);
  const affinityCounts = new Array(N).fill(0);

  for (let i = 0; i < N; i++) {
    let totalPMI = 0;
    let totalLift = 0;
    let totalCorr = 0;
    let count = 0;

    for (let j = 0; j < N; j++) {
      if (i === j) continue;
      if (cooccur[i][j] < 2) continue;

      totalPMI += pmiMatrix[i][j];
      totalLift += liftMatrix[i][j];
      totalCorr += corrMatrix[i][j];
      count++;
    }

    if (count > 0) {
      scores[i] = totalPMI / count;
      affinityCounts[i] = count;
    }
  }

  const maxAffinity = Math.max(...scores.map(Math.abs), 0.001);
  for (let i = 0; i < N; i++) {
    scores[i] = (scores[i] / maxAffinity + 1) / 2;
  }

  const allPairs: { a: number; b: number; pmi: number; lift: number; correlation: number; cooc: number }[] = [];
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      if (cooccur[i][j] < 2) continue;
      allPairs.push({
        a: i,
        b: j,
        pmi: pmiMatrix[i][j],
        lift: liftMatrix[i][j],
        correlation: corrMatrix[i][j],
        cooc: cooccur[i][j],
      });
    }
  }

  allPairs.sort((a, b) => b.pmi - a.pmi);
  const topPairs = allPairs.slice(0, 200).map(({ a, b, pmi, lift, correlation }) => ({ a, b, pmi, lift, correlation }));

  const perNumber = Array.from({ length: N }, (_, num) => {
    const neighbors: { number: number; count: number; pmi: number }[] = [];
    for (let j = 0; j < N; j++) {
      if (num === j) continue;
      if (cooccur[num][j] < 2) continue;
      neighbors.push({ number: j, count: cooccur[num][j], pmi: pmiMatrix[num][j] });
    }

    neighbors.sort((a, b) => b.pmi - a.pmi);
    const topCooccurrences = neighbors.slice(0, 10);

    let avgPMI = 0;
    let avgLift = 0;
    let avgCorrelation = 0;

    if (neighbors.length > 0) {
      for (const n of neighbors) {
        avgPMI += pmiMatrix[num][n.number];
        avgLift += liftMatrix[num][n.number];
        avgCorrelation += corrMatrix[num][n.number];
      }
      avgPMI /= neighbors.length;
      avgLift /= neighbors.length;
      avgCorrelation /= neighbors.length;
    }

    return { number: num, avgPMI, avgLift, avgCorrelation, topCooccurrences };
  });

  return {
    scores,
    pmi: pmiMatrix,
    correlation: corrMatrix,
    lift: liftMatrix,
    cooccurrence: cooccur,
    topPairs,
    perNumber,
  };
}
