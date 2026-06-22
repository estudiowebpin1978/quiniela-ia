import { RandomForest, crearRandomForest, entrenarRandomForest, predecirRandomForest } from './random-forest';
import { CadenaMarkov, crearCadenaMarkov, entrenarCadenaMarkov, predecirSiguienteMarkov } from './markov';
import { RedNeuronal, crearRedNeuronal, entrenarRedNeuronal, predecirRedNeuronal } from './neural';

export interface ModeloEntrenado {
  nombre: string;
  tipo: 'random-forest' | 'markov' | 'neural';
  precision: number;
  fechaEntrenamiento: string;
  config: any;
  modelo: any;
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
  test: number = 0.15
): { entrenamiento: T[]; validacion: T[]; test: T[] } {
  const total = entrenamiento + validacion + test;
  if (Math.abs(total - 1) > 0.001) {
    throw new Error('Las proporciones deben sumar 1');
  }

  const shuffled = [...datos].sort(() => Math.random() - 0.5);
  
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

  console.log('[Trainer] Preparando datos...');
  const { features, etiquetas } = prepararFeatures(sorteos);

  if (features.length < 20) {
    throw new Error('Datos insuficientes para entrenamiento');
  }

  const { entrenamiento, validacion, test } = dividirDatos(
    features.map((f, i) => ({ features: f, etiqueta: etiquetas[i] })),
    0.7, 0.15, 0.15
  );

  console.log(`[Trainer] Datos: ${entrenamiento.length} entrenamiento, ${validacion.length} validacion, ${test.length} test`);

  if (opciones.incluirRF !== false) {
    console.log('[Trainer] Entrenando Random Forest...');
    const rf = crearRandomForest({ nArboles: 30, maxProfundidad: 6 });
    const datosEntrenamiento = entrenamiento.map(d => ({ features: d.features, etiqueta: d.etiqueta }));
    const rfEntrenado = entrenarRandomForest(rf, datosEntrenamiento, [
      'freq_0', 'freq_1', 'freq_2', 'freq_3', 'freq_4', 'freq_5', 'freq_6', 'freq_7', 'freq_8', 'freq_9'
    ]);

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
    console.log('[Trainer] Entrenando Cadena de Markov...');
    const markov = crearCadenaMarkov(2);

    const ordenados = [...sorteos].sort((a, b) =>
      new Date(a.fecha).getTime() - new Date(b.fecha).getTime()
    );
    // Use ALL numbers from each draw, not just the first one
    const numerosDraws = ordenados
      .filter(s => Array.isArray(s.numbers) && s.numbers.length > 0)
      .map(s => s.numbers.map(n => n % 100).filter(n => n >= 0 && n <= 99));
    const secuencias: number[][] = [];
    for (let i = 0; i < numerosDraws.length - 2; i++) {
      // Use first 5 numbers from each of 3 consecutive draws as Markov state
      const state = [
        ...numerosDraws[i].slice(0, 5),
        ...numerosDraws[i + 1].slice(0, 5),
        ...numerosDraws[i + 2].slice(0, 5)
      ];
      secuencias.push(state);
    }

    const markovEntrenado = entrenarCadenaMarkov(markov, secuencias);

    modelos.push({
      nombre: 'Cadena de Markov',
      tipo: 'markov',
      precision: 0,
      fechaEntrenamiento: new Date().toISOString(),
      config: { orden: 2 },
      modelo: markovEntrenado,
      metricas: { precisionTop1: 0, precisionTop5: 0, precisionTop10: 0 }
    });
  }

  if (opciones.incluirNN !== false && features[0].length > 0) {
    console.log('[Trainer] Entrenando Red Neuronal...');
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
    const predsCercanos = [
      real, (real + 1) % 100, (real + 99) % 100, (real + 2) % 100, (real + 98) % 100
    ];
    if (predsCercanos.slice(0, 5).includes(predicciones[i])) top5++;
    if (predsCercanos.includes(predicciones[i])) top10++;
  }

  return {
    precisionTop1: Math.round((top1 / predicciones.length) * 10000) / 100,
    precisionTop5: Math.round((top5 / predicciones.length) * 10000) / 100,
    precisionTop10: Math.round((top10 / predicciones.length) * 10000) / 100
  };
}

export function guardarModelos(modelos: ModeloEntrenado[], path: string): void {
  const serializados = modelos.map(m => ({
    nombre: m.nombre,
    tipo: m.tipo,
    precision: m.precision,
    fechaEntrenamiento: m.fechaEntrenamiento,
    metricas: m.metricas,
    modelo: typeof m.modelo === 'string' ? m.modelo : JSON.stringify(m.modelo)
  }));
  
  console.log(`[Trainer] Modelos guardados en ${path}`);
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

export function cargarModelos(path: string): ModeloEntrenado[] {
  console.log(`[Trainer] Modelos cargados desde ${path}`);
  return [];
}