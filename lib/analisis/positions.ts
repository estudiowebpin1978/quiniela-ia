export interface PositionAnalysis {
  thousands: number[];
  hundreds: number[];
  tens: number[];
  units: number[];

  thousandsNorm: number[];
  hundredsNorm: number[];
  tensNorm: number[];
  unitsNorm: number[];

  transThousandsToHundreds: number[][];
  transHundredsToTens: number[][];
  transTensToUnits: number[][];

  entropy: { thousands: number; hundreds: number; tens: number; units: number };

  scores: number[];

  perNumber: {
    number: number;
    digits: { miles: number; centenas: number; decenas: number; unidades: number };
    positionScores: { miles: number; centenas: number; decenas: number; unidades: number };
    transitionScore: number;
    combined: number;
  }[];
}

function extraerDigitos(num: number): [number, number, number, number] {
  const s = String(Math.abs(Math.floor(num))).padStart(4, '0');
  return [
    parseInt(s[0], 10),
    parseInt(s[1], 10),
    parseInt(s[2], 10),
    parseInt(s[3], 10),
  ];
}

function normalizar(freq: number[]): number[] {
  const max = Math.max(...freq);
  if (max === 0) return freq.map(() => 0);
  return freq.map(f => f / max);
}

function entropia(freq: number[]): number {
  const total = freq.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  let h = 0;
  for (const f of freq) {
    if (f > 0) {
      const p = f / total;
      h -= p * Math.log2(p);
    }
  }
  return h;
}

function construirMatrizTransicion(a: number[], b: number[]): number[][] {
  const m = Array.from({ length: 10 }, () => Array(10).fill(0));
  for (let i = 0; i < a.length; i++) {
    const da = a[i];
    const db = b[i];
    if (da >= 0 && da <= 9 && db >= 0 && db <= 9) {
      m[da][db]++;
    }
  }
  return m;
}

function normalizarMatriz(m: number[][]): number[][] {
  return m.map(fila => {
    const suma = fila.reduce((a, b) => a + b, 0);
    if (suma === 0) return fila.map(() => 1 / 10);
    return fila.map(v => v / suma);
  });
}

function entropiaMatriz(m: number[][]): number {
  let total = 0;
  for (const fila of m) {
    for (const p of fila) {
      if (p > 0) total -= p * Math.log2(p);
    }
  }
  return total / m.length;
}

export function analyzePositions(sequences: number[][]): PositionAnalysis {
  const freqThousands = new Array(10).fill(0);
  const freqHundreds = new Array(10).fill(0);
  const freqTens = new Array(10).fill(0);
  const freqUnits = new Array(10).fill(0);

  const digitThousands: number[] = [];
  const digitHundreds: number[] = [];
  const digitTens: number[] = [];
  const digitUnits: number[] = [];

  const flatSequences = sequences.flat();

  for (const num of flatSequences) {
    if (typeof num !== 'number' || isNaN(num)) continue;
    const [t, h, u, un] = extraerDigitos(num);
    freqThousands[t]++;
    freqHundreds[h]++;
    freqTens[u]++;
    freqUnits[un]++;

    digitThousands.push(t);
    digitHundreds.push(h);
    digitTens.push(u);
    digitUnits.push(un);
  }

  const rawMatTT = construirMatrizTransicion(digitThousands, digitHundreds);
  const rawMatHH = construirMatrizTransicion(digitHundreds, digitTens);
  const rawMatUU = construirMatrizTransicion(digitTens, digitUnits);

  const transThousandsToHundreds = normalizarMatriz(rawMatTT);
  const transHundredsToTens = normalizarMatriz(rawMatHH);
  const transTensToUnits = normalizarMatriz(rawMatUU);

  const entropy = {
    thousands: Math.round(entropia(freqThousands) * 100) / 100,
    hundreds: Math.round(entropia(freqHundreds) * 100) / 100,
    tens: Math.round(entropia(freqTens) * 100) / 100,
    units: Math.round(entropia(freqUnits) * 100) / 100,
  };

  const normT = normalizar(freqThousands);
  const normH = normalizar(freqHundreds);
  const normD = normalizar(freqTens);
  const normU = normalizar(freqUnits);

  const scores: number[] = [];
  const perNumber: PositionAnalysis['perNumber'] = [];

  for (let n = 0; n < 100; n++) {
    const [t, h, d, u] = extraerDigitos(n);

    const sT = normT[t];
    const sH = normH[h];
    const sD = normD[d];
    const sU = normU[u];

    const tth = transThousandsToHundreds[t][h];
    const tht = transHundredsToTens[h][d];
    const ttu = transTensToUnits[d][u];
    const transitionScore = Math.round((tth + tht + ttu) * 10000) / 30000;

    const combined = Math.round(((sT + sH + sD + sU) / 4 * 0.6 + transitionScore * 0.4) * 10000) / 10000;

    scores.push(combined);

    perNumber.push({
      number: n,
      digits: { miles: t, centenas: h, decenas: d, unidades: u },
      positionScores: {
        miles: Math.round(sT * 10000) / 10000,
        centenas: Math.round(sH * 10000) / 10000,
        decenas: Math.round(sD * 10000) / 10000,
        unidades: Math.round(sU * 10000) / 10000,
      },
      transitionScore,
      combined,
    });
  }

  return {
    thousands: freqThousands,
    hundreds: freqHundreds,
    tens: freqTens,
    units: freqUnits,

    thousandsNorm: normT,
    hundredsNorm: normH,
    tensNorm: normD,
    unitsNorm: normU,

    transThousandsToHundreds,
    transHundredsToTens,
    transTensToUnits,

    entropy,

    scores,

    perNumber,
  };
}
