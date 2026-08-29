import { RandomForest, crearRandomForest, entrenarRandomForest, predecirRandomForest } from './random-forest';
import { CadenaMarkov, crearCadenaMarkov, entrenarCadenaMarkov, predecirSiguienteMarkov } from './markov';
import { RedNeuronal, crearRedNeuronal, entrenarRedNeuronal, predecirRedNeuronal } from './neural';
import { hashSeed, seededShuffle } from '@/lib/math/seeded-rng';

export interface ModeloEntrenado {
  nombre: string;
  tipo: 'random-forest' | 'markov' | 'neural';
  precision: number;
  fechaEntrenamiento: string;
  config: Record<string, unknown>;
  modelo: RandomForest | CadenaMarkov | RedNeuronal;
  metricas: MetricasModelo;
}

export interface MetricasModelo {
  precisionTop1: number;
  precisionTop5: number;
  precisionTop10: number;
  perdida?: number;
  f1Score?: number;
  ROC_AUC?: number;
}

export interface ResultadoTraining {
  modelos: ModeloEntrenado[];
  mejorModelo: ModeloEntrenado;
  tiempoTotal: number;
  datosEntrenamiento: { entrenamiento: number; validacion: number; test: number };
}

export function dividirDatos<T>(
  datos: T[],
  entrenamiento: number = 0.7,
  validacion: number = 0.15,
  test: number = 0.15,
  seedHint: string | number = "split"
): { entrenamiento: T[]; validacion: T[]; test: T[] } {
  const total = entrenamiento + validacion + test;
  if (Math.abs(total - 1) > 0.001) {
    throw new Error('Las proporciones deben sumar 1');
  }

  // Split temporal-ish + shuffle determinista (reproducible)
  const shuffled = seededShuffle(datos, hashSeed(seedHint, datos.length));
  
  const nEntrenamiento = Math.floor(datos.length * entrenamiento);
  const nValidacion = Math.floor(datos.length * validacion);

  return {
    entrenamiento: shuffled.slice(0, nEntrenamiento),
    validacion: shuffled.slice(nEntrenamiento, nEntrenamiento + nValidacion),
    test: shuffled.slice(nEntrenamiento + nValidacion)
  };
}

export function prepararFeatures(sorteos: { fecha: string; turno: string; numbers: number[] }[]): {
  features: number[][];
  etiquetas: number[];
} {
  const features: number[][] = [];
  const etiquetas: number[] = [];

  const sorteosOrdenados = [...sorteos].sort((a, b) => 
    new Date(a.fecha).getTime() - new Date(b.fecha).getTime()
  );

  const windowSize = 5;

  for (let i = windowSize; i < sorteosOrdenados.length; i++) {
    const window = sorteosOrdenados.slice(i - windowSize, i);
    const proximo = sorteosOrdenados[i];

    const freqs = new Array(100).fill(0);
    let ultIdx = 0;

    window.forEach((s, idx) => {
      const numbers = Array.isArray(s.numbers) ? s.numbers : [];
      numbers.forEach(n => {
        if (typeof n !== 'number' || isNaN(n)) return;
        freqs[n % 100]++;
        ultIdx = idx;
      });
    });

    const maxFreq = Math.max(...freqs);
    const freqsNorm = maxFreq > 0 ? freqs.map(f => f / maxFreq) : freqs;
    
    const featureVector = [
      ...freqsNorm,
      ...freqsNorm.slice(-50),
      window.length,
      ultIdx
    ];

    const targetNumbers = Array.isArray(proximo.numbers) ? proximo.numbers : [];
    if (targetNumbers.length > 0) {
      const labels = new Set<number>();
      for (const n of targetNumbers) {
        if (typeof n === 'number' && !isNaN(n)) labels.add(n % 100);
      }
      for (const lbl of labels) {
        features.push(featureVector);
        etiquetas.push(lbl);
      }
    }
  }

  return { features, etiquetas };
}

export async function entrenarModelos(
  sorteos: { fecha: string; turno: string; numbers: number[] }[],
  opciones: {
    incluirRF?: boolean;
    incluirMarkov?: boolean;
    incluirNN?: boolean;
    diasAnalisis?: number;
  } = {}
): Promise<ResultadoTraining> {
  const startTime = Date.now();
  const modelos: ModeloEntrenado[] = [];

  const { features, etiquetas } = prepararFeatures(sorteos);

  if (features.length < 20) {
    throw new Error('Datos insuficientes para entrenamiento');
  }

  const { entrenamiento, validacion, test } = dividirDatos(
    features.map((f, i) => ({ features: f, etiqueta: etiquetas[i] })),
    0.7, 0.15, 0.15
  );

  if (opciones.incluirRF !== false) {
    const rf = crearRandomForest({ nArboles: 30, maxProfundidad: 6 });
    const datosEntrenamiento = entrenamiento.map(d => ({ features: d.features, etiqueta: d.etiqueta }));
    const nFeatures = features[0].length;
    const featureNames = Array.from({ length: nFeatures }, (_, i) => `f${i}`);
    const rfEntrenado = entrenarRandomForest(rf, datosEntrenamiento, featureNames);

    const prediccionesTest = test.map(d => predecirRandomForest(rfEntrenado, d.features).prediccion);
    const metricasRF = calcularMetricas(prediccionesTest.map(p => p), test.map(d => d.etiqueta));

    modelos.push({
      nombre: 'Random Forest',
      tipo: 'random-forest',
      precision: rfEntrenado.precision,
      fechaEntrenamiento: new Date().toISOString(),
      config: { nArboles: 30, maxProfundidad: 6 },
      modelo: rfEntrenado,
      metricas: metricasRF
    });
  }

  if (opciones.incluirMarkov !== false) {
    const markov = crearCadenaMarkov(1);

    const ordenados = [...sorteos].sort((a, b) =>
      new Date(a.fecha).getTime() - new Date(b.fecha).getTime()
    );
    // Build sequential transitions: each draw's numbers → next draw's first number
    const numerosDraws = ordenados
      .filter(s => Array.isArray(s.numbers) && s.numbers.length > 0)
      .map(s => s.numbers.map(n => n % 100).filter(n => n >= 0 && n <= 99));
    
    // Build sequences as consecutive number transitions
    const secuencias: number[][] = [];
    for (let i = 0; i < numerosDraws.length - 1; i++) {
      const nums1 = numerosDraws[i];
      const nums2 = numerosDraws[i + 1];
      // Create pairs: each number in draw[i] → each number in draw[i+1]
      for (const n1 of nums1.slice(0, 5)) {
        for (const n2 of nums2.slice(0, 5)) {
          secuencias.push([n1, n2]);
        }
      }
    }

    const markovEntrenado = entrenarCadenaMarkov(markov, secuencias);

    // Evaluate Markov on test data
    const markovPredicciones: number[] = [];
    for (const t of test) {
      try {
        const estado = Array.isArray(t.features) ? t.features.slice(0, markovEntrenado.orden) : [t.features[0] || 0];
        const pred = predecirSiguienteMarkov(markovEntrenado, estado, 10);
        markovPredicciones.push(pred.proximoEstado);
      } catch {
        markovPredicciones.push(0);
      }
    }
    const metricasMarkov = markovPredicciones.length > 0
      ? calcularMetricas(markovPredicciones, test.map(d => d.etiqueta))
      : { precisionTop1: 0, precisionTop5: 0, precisionTop10: 0 };

    modelos.push({
      nombre: 'Cadena de Markov',
      tipo: 'markov',
      precision: metricasMarkov.precisionTop1,
      fechaEntrenamiento: new Date().toISOString(),
      config: { orden: 1 },
      modelo: markovEntrenado,
      metricas: metricasMarkov
    });
  }

  if (opciones.incluirNN !== false && features[0].length > 0) {
    const nn = crearRedNeuronal({
      arquitectura: [features[0].length, 64, 32, 100],
      tasaAprendizaje: 0.001,
      epochs: 50
    });

    const nnEntrenada = entrenarRedNeuronal(
      nn,
      entrenamiento.map(d => d.features),
      entrenamiento.map(d => d.etiqueta)
    );

    const prediccionesTestNN = test.map(d => predecirRedNeuronal(nnEntrenada, d.features).clasePredicha);
    const metricasNN = calcularMetricas(prediccionesTestNN, test.map(d => d.etiqueta));

    modelos.push({
      nombre: 'Red Neuronal',
      tipo: 'neural',
      precision: nnEntrenada.precision,
      fechaEntrenamiento: new Date().toISOString(),
      config: { arquitectura: [features[0].length, 64, 32, 100], tasaAprendizaje: 0.001, epochs: 50 },
      modelo: nnEntrenada,
      metricas: metricasNN
    });
  }

  const mejorModelo = modelos.reduce((best, actual) => 
    (actual.precision || 0) > (best.precision || 0) ? actual : best
  , modelos[0]);

  return {
    modelos,
    mejorModelo,
    tiempoTotal: Date.now() - startTime,
    datosEntrenamiento: {
      entrenamiento: entrenamiento.length,
      validacion: validacion.length,
      test: test.length
    }
  };
}

function calcularMetricas(predicciones: number[], reales: number[]): MetricasModelo {
  let top1 = 0, top5 = 0, top10 = 0;

  for (let i = 0; i < predicciones.length; i++) {
    if (predicciones[i] === reales[i]) top1++;
    const real = reales[i];
    // top-5: within ±2 positions (5 nearest)
    const top5Neighbors = [
      real, (real + 1) % 100, (real + 99) % 100, (real + 2) % 100, (real + 98) % 100
    ];
    // top-10: within ±5 positions (10 nearest)
    const top10Neighbors = [
      real, 
      (real + 1) % 100, (real + 99) % 100, 
      (real + 2) % 100, (real + 98) % 100,
      (real + 3) % 100, (real + 97) % 100,
      (real + 4) % 100, (real + 96) % 100,
      (real + 5) % 100, (real + 95) % 100
    ];
    if (top5Neighbors.includes(predicciones[i])) top5++;
    if (top10Neighbors.includes(predicciones[i])) top10++;
  }

  return {
    precisionTop1: Math.round((top1 / predicciones.length) * 10000) / 100,
    precisionTop5: Math.round((top5 / predicciones.length) * 10000) / 100,
    precisionTop10: Math.round((top10 / predicciones.length) * 10000) / 100
  };
}

export function prepararPrediccion(sorteos: { fecha: string; turno: string; numbers: number[] }[]): number[] {
  const window = sorteos.slice(-5);
  if (window.length < 5) throw new Error("Se necesitan al menos 5 sorteos para la predicción");
  const freqs = new Array(100).fill(0);
  let ultIdx = 0;

  window.forEach((s, idx) => {
    const numbers = Array.isArray(s.numbers) ? s.numbers : [];
    numbers.forEach(n => {
      if (typeof n !== "number" || isNaN(n)) return;
      freqs[n % 100]++;
      ultIdx = idx;
    });
  });

  const maxFreq = Math.max(...freqs);
  const freqsNorm = maxFreq > 0 ? freqs.map(f => f / maxFreq) : freqs;

  return [...freqsNorm, ...freqsNorm.slice(-50), window.length, ultIdx];
}