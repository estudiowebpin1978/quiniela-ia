export interface ArbolDecision {
  feature: string | null;
  threshold: number | null;
  valor?: number;
  izquierda?: ArbolDecision;
  derecha?: ArbolDecision;
  importancia: number;
  featureIdx?: number;
}

export interface RandomForest {
  arbres: ArbolDecision[];
  nFeatures: number;
  nArboles: number;
  featureNames: string[];
  entrenado: boolean;
  precision: number;
}

export interface PrediccionRF {
  prediccion: number;
  probabilidades: number[];
  importanciaFeatures: { feature: string; importancia: number }[];
}

const NUM_ARBOLES_DEFAULT = 50;
const MAX_PROFUNDIDAD_DEFAULT = 8;
const MIN_MUESTRAS_HOJA = 5;

export function crearRandomForest(config: {
  nArboles?: number;
  maxProfundidad?: number;
  minMuestrasHoja?: number;
}): RandomForest {
  return {
    arbres: [],
    nFeatures: 0,
    nArboles: config.nArboles || NUM_ARBOLES_DEFAULT,
    featureNames: [],
    entrenado: false,
    precision: 0
  };
}

export function entrenarRandomForest(
  rf: RandomForest,
  datos: { features: number[]; etiqueta: number }[],
  featureNames: string[]
): RandomForest {
  if (datos.length < 10) {
    console.warn('[RF] Datos insuficientes para entrenamiento');
    return rf;
  }

  rf.nFeatures = datos[0].features.length;
  rf.featureNames = featureNames;
  rf.arbres = [];

  const nBootstrap = Math.min(datos.length, datos.length);
  
  for (let i = 0; i < rf.nArboles; i++) {
    const bootstrap = generarBootstrap(datos, nBootstrap);
    const tree = construirArbol(bootstrap, 0, MAX_PROFUNDIDAD_DEFAULT);
    rf.arbres.push(tree);
  }

  rf.entrenado = true;

  const predictions = datos.map(d => predecirArbol(rf.arbres[0], d.features));
  const correctas = predictions.filter((p, i) => p === datos[i].etiqueta).length;
  rf.precision = correctas / datos.length;

  console.log(`[RF] Entrenamiento completado. Precisión: ${(rf.precision * 100).toFixed(1)}%`);

  return rf;
}

function generarBootstrap(
  datos: { features: number[]; etiqueta: number }[],
  n: number
): { features: number[]; etiqueta: number }[] {
  const bootstrap: { features: number[]; etiqueta: number }[] = [];
  for (let i = 0; i < n; i++) {
    const idx = Math.floor(Math.random() * datos.length);
    bootstrap.push(datos[idx]);
  }
  return bootstrap;
}

function construirArbol(
  datos: { features: number[]; etiqueta: number }[],
  profundidad: number,
  maxProfundidad: number
): ArbolDecision {
  if (profundidad >= maxProfundidad || datos.length < MIN_MUESTRAS_HOJA) {
    const labels = datos.map(d => d.etiqueta);
    const counts = new Map<number, number>();
    labels.forEach(l => counts.set(l, (counts.get(l) || 0) + 1));
    let maxCount = 0;
    let majority = 0;
    counts.forEach((c, l) => {
      if (c > maxCount) { maxCount = c; majority = l; }
    });
    return {
      feature: null,
      threshold: null,
      valor: majority,
      importancia: 1
    };
  }

  const mejorSplit = encontrarMejorSplit(datos);
  
  if (!mejorSplit) {
    const meanVal = datos.reduce((sum, d) => sum + d.etiqueta, 0) / datos.length;
    return {
      feature: null,
      threshold: null,
      valor: Math.round(meanVal),
      importancia: 1
    };
  }

  const izquierda = datos.filter(d => d.features[mejorSplit.feature!] <= mejorSplit.threshold!);
  const derecha = datos.filter(d => d.features[mejorSplit.feature!] > mejorSplit.threshold!);

  if (izquierda.length === 0 || derecha.length === 0) {
    const meanVal = datos.reduce((sum, d) => sum + d.etiqueta, 0) / datos.length;
    return {
      feature: null,
      threshold: null,
      valor: Math.round(meanVal),
      importancia: 1
    };
  }

  return {
    feature: mejorSplit.feature !== null ? `feature_${mejorSplit.feature}` : null,
    threshold: mejorSplit.threshold,
    izquierda: construirArbol(izquierda, profundidad + 1, maxProfundidad),
    derecha: construirArbol(derecha, profundidad + 1, maxProfundidad),
    importancia: 1,
    featureIdx: mejorSplit.feature ?? undefined
  };
}

function encontrarMejorSplit(
  datos: { features: number[]; etiqueta: number }[]
): { feature: number | null; threshold: number | null; ganancia: number } | null {
  if (datos.length < 2) return null;

  const nFeatures = datos[0].features.length;
  const nSubset = Math.max(1, Math.round(Math.sqrt(nFeatures)));
  const candidatas = new Set<number>();
  while (candidatas.size < nSubset && candidatas.size < nFeatures) {
    candidatas.add(Math.floor(Math.random() * nFeatures));
  }

  let mejorGanancia = -Infinity;
  let mejorFeature: number | null = null;
  let mejorThreshold: number | null = null;

  const entropiaPadre = calcularEntropia(datos);

  for (const f of candidatas) {
    const valores = datos.map(d => d.features[f]);
    const min = Math.min(...valores);
    const max = Math.max(...valores);
    
    if (max === min) continue;

    const paso = (max - min) / 10;
    for (let t = min + paso; t < max; t += paso) {
      const izquierda = datos.filter(d => d.features[f] <= t);
      const derecha = datos.filter(d => d.features[f] > t);

      if (izquierda.length === 0 || derecha.length === 0) continue;

      const entropiaIzq = calcularEntropia(izquierda);
      const entropiaDer = calcularEntropia(derecha);

      const ganancia = entropiaPadre - 
        (izquierda.length / datos.length) * entropiaIzq - 
        (derecha.length / datos.length) * entropiaDer;

      if (ganancia > mejorGanancia) {
        mejorGanancia = ganancia;
        mejorFeature = f;
        mejorThreshold = t;
      }
    }
  }

  return mejorFeature !== null 
    ? { feature: mejorFeature, threshold: mejorThreshold, ganancia: mejorGanancia }
    : null;
}

function calcularEntropia(datos: { features: number[]; etiqueta: number }[]): number {
  if (datos.length === 0) return 0;

  const counts = new Map<number, number>();
  datos.forEach(d => counts.set(d.etiqueta, (counts.get(d.etiqueta) || 0) + 1));

  let entropia = 0;
  counts.forEach(count => {
    const p = count / datos.length;
    entropia -= p * Math.log2(p);
  });

  return entropia;
}

export function predecirRandomForest(
  rf: RandomForest,
  features: number[]
): PrediccionRF {
  if (!rf.entrenado) {
    throw new Error('Random Forest no entrenado');
  }

  const predicciones = rf.arbres.map(arbol => predecirArbol(arbol, features));
  
  const counts = new Map<number, number>();
  predicciones.forEach(p => counts.set(p, (counts.get(p) || 0) + 1));

  const probabilidades: number[] = [];
  for (let n = 0; n < 100; n++) {
    probabilidades.push((counts.get(n) || 0) / rf.nArboles);
  }

  const maxProb = Math.max(...probabilidades);
  const prediccion = probabilidades.findIndex(p => p === maxProb);

  const featCounts = new Map<number, number>();
  const countFeatures = (nodo: ArbolDecision) => {
    if (nodo.featureIdx !== undefined) {
      featCounts.set(nodo.featureIdx, (featCounts.get(nodo.featureIdx) || 0) + 1);
    }
    if (nodo.izquierda) countFeatures(nodo.izquierda);
    if (nodo.derecha) countFeatures(nodo.derecha);
  };
  for (const tree of rf.arbres) countFeatures(tree);
  const maxCount = Math.max(...featCounts.values(), 1);
  const importanciaFeatures = rf.featureNames.map((name, i) => ({
    feature: name,
    importancia: (featCounts.get(i) || 0) / maxCount
  }));

  return {
    prediccion,
    probabilidades,
    importanciaFeatures
  };
}

function predecirArbol(arbol: ArbolDecision, features: number[]): number {
  if (arbol.valor !== undefined) {
          return typeof arbol.valor === 'number' ? Math.min(99, Math.max(0, Math.round(arbol.valor))) : 0;
  }

  if (arbol.feature === null || !features.length) {
    return 50;
  }

  const featureStr = arbol.feature;
  const featureIdx = parseInt(featureStr.replace('feature_', ''));
  if (isNaN(featureIdx) || featureIdx < 0 || featureIdx >= features.length) return 50;

  if (arbol.threshold === null) return 50;

  if (features[featureIdx] <= arbol.threshold) {
    return predecirArbol(arbol.izquierda!, features);
  } else {
    return predecirArbol(arbol.derecha!, features);
  }
}

export function serializarRandomForest(rf: RandomForest): string {
  return JSON.stringify(rf);
}

export function deserializarRandomForest(json: string): RandomForest {
  return JSON.parse(json);
}