import { createRng, hashSeed } from '@/lib/math/seeded-rng';

export interface Capa {
  pesos: number[][];
  sesgos: number[];
  activacion: 'relu' | 'sigmoid' | 'tanh' | 'softmax';
}

export interface RedNeuronal {
  capas: Capa[];
  tasaAprendizaje: number;
  epochs: number;
  entrenada: boolean;
  perdida: number;
  precision: number;
}

export interface PrediccionNN {
  salidas: number[];
  clasePredicha: number;
  confianza: number;
}

export function crearRedNeuronal(config: {
  arquitectura: number[];
  tasaAprendizaje?: number;
  epochs?: number;
  seed?: number;
}): RedNeuronal {
  const { arquitectura, tasaAprendizaje = 0.01, epochs = 100, seed } = config;
  const rng = createRng(seed ?? hashSeed(...arquitectura, tasaAprendizaje, epochs));
  
  const capas: Capa[] = [];

  for (let i = 1; i < arquitectura.length; i++) {
    const entrada = arquitectura[i - 1];
    const salida = arquitectura[i];
    // Xavier/Glorot acotado, determinista
    const scale = Math.sqrt(6 / (entrada + salida));
    
    const pesos: number[][] = [];
    for (let j = 0; j < salida; j++) {
      const fila: number[] = [];
      for (let k = 0; k < entrada; k++) {
        fila.push((rng() * 2 - 1) * scale);
      }
      pesos.push(fila);
    }

    const activacion = i === arquitectura.length - 1 ? 'softmax' : 'relu';

    capas.push({
      pesos,
      sesgos: Array(salida).fill(0),
      activacion
    });
  }

  return {
    capas,
    tasaAprendizaje,
    epochs,
    entrenada: false,
    perdida: 0,
    precision: 0
  };
}

export function entrenarRedNeuronal(
  red: RedNeuronal,
  entradas: number[][],
  salidas: number[]
): RedNeuronal {
  const numEntradas = entradas.length;
  const entradasNormalizadas = entradas.map(normalizarVector);
  
  let mejorPerdida = Infinity;

  for (let epoch = 0; epoch < red.epochs; epoch++) {
    let perdidaTotal = 0;

    for (let i = 0; i < numEntradas; i++) {
      const entrada = entradasNormalizadas[i];
      const objetivo = crearOneHot(salidas[i], 100);

      const propagation = propagar(red, entrada);
      const salida = propagation.salidas[propagation.salidas.length - 1];

      const perdida = calcularEntropiaCruzada(salida, objetivo);
      perdidaTotal += perdida;

      retropropagar(red, objetivo, propagation);
    }

    perdidaTotal /= numEntradas;

    if (perdidaTotal < mejorPerdida) {
      mejorPerdida = perdidaTotal;
    }
  }

  const predictions = entradasNormalizadas.map(entrada => {
    const propagation = propagar(red, entrada);
    const salida = propagation.salidas[propagation.salidas.length - 1];
    return salida.indexOf(Math.max(...salida));
  });

  const correctas = predictions.filter((p, i) => p === salidas[i]).length;
  red.precision = correctas / numEntradas;
  red.perdida = mejorPerdida;
  red.entrenada = true;

  return red;
}

function normalizarVector(vector: number[]): number[] {
  const max = Math.max(...vector);
  const min = Math.min(...vector);
  if (max === min) return vector.map(() => 0.5);
  return vector.map(v => (v - min) / (max - min));
}

function crearOneHot(indice: number, numClases: number): number[] {
  const oneHot = Array(numClases).fill(0);
  if (indice >= 0 && indice < numClases) {
    oneHot[indice] = 1;
  }
  return oneHot;
}

interface PropagationResult {
  entradas: number[][];  // pre-activation inputs to each layer
  salidas: number[][];   // post-activation outputs from each layer
}

function propagar(red: RedNeuronal, entrada: number[]): PropagationResult {
  const entradas: number[][] = [entrada]; // entradas[0] = raw input
  const salidas: number[][] = [];         // salidas[i] = output of layer i
  let actual = entrada;

  for (const capa of red.capas) {
    const preActivacion: number[] = [];
    
    for (let i = 0; i < capa.pesos.length; i++) {
      let suma = capa.sesgos[i];
      for (let j = 0; j < actual.length; j++) {
        suma += capa.pesos[i][j] * actual[j];
      }
      preActivacion.push(suma);
    }

    entradas.push(preActivacion);

    let postActivacion: number[];
    if (capa.activacion === 'relu') {
      postActivacion = preActivacion.map(v => Math.max(0, v));
    } else if (capa.activacion === 'sigmoid') {
      postActivacion = preActivacion.map(v => 1 / (1 + Math.exp(-v)));
    } else if (capa.activacion === 'tanh') {
      postActivacion = preActivacion.map(v => Math.tanh(v));
    } else if (capa.activacion === 'softmax') {
      const maxVal = Math.max(...preActivacion);
      const expSum = preActivacion.map(v => Math.exp(v - maxVal)).reduce((a, b) => a + b, 0);
      postActivacion = preActivacion.map(v => Math.exp(v - maxVal) / expSum);
    } else {
      postActivacion = preActivacion;
    }

    salidas.push(postActivacion);
    actual = postActivacion;
  }

  return { entradas, salidas };
}

function retropropagar(
  red: RedNeuronal,
  objetivo: number[],
  propagation: PropagationResult
): void {
  let error: number[] = propagation.salidas[propagation.salidas.length - 1].map((y, i) => y - objetivo[i]);

  for (let c = red.capas.length - 1; c >= 0; c--) {
    const capa = red.capas[c];
    const entradaPreActivacion = propagation.entradas[c];
    
    const gradientes: number[] = error.map((e, i) => {
      if (capa.activacion === 'relu') {
        const salidaPostActivacion = propagation.salidas[c][i];
        return e * (salidaPostActivacion > 0 ? 1 : 0);
      } else if (capa.activacion === 'tanh') {
        const salidaPostActivacion = propagation.salidas[c][i];
        return e * (1 - salidaPostActivacion * salidaPostActivacion);
      } else if (capa.activacion === 'softmax') {
        return e;
      }
      return e;
    });

    for (let i = 0; i < capa.pesos.length; i++) {
      for (let j = 0; j < capa.pesos[i].length; j++) {
        const delta = gradientes[i] * entradaPreActivacion[j] * red.tasaAprendizaje;
        capa.pesos[i][j] -= delta;
      }
      capa.sesgos[i] -= gradientes[i] * red.tasaAprendizaje;
    }

    if (c > 0) {
      const errorAnterior: number[] = [];
      for (let j = 0; j < capa.pesos[0].length; j++) {
        let sum = 0;
        for (let i = 0; i < capa.pesos.length; i++) {
          sum += capa.pesos[i][j] * gradientes[i];
        }
        errorAnterior.push(sum);
      }
      error = errorAnterior;
    }
  }
}

function calcularEntropiaCruzada(salida: number[], objetivo: number[]): number {
  let suma = 0;
  for (let i = 0; i < salida.length; i++) {
    const p = Math.max(salida[i], 0.00001);
    suma += objetivo[i] * Math.log(p);
  }
  return -suma;
}

export function predecirRedNeuronal(
  red: RedNeuronal,
  entrada: number[]
): PrediccionNN {
  if (!red.entrenada) {
    throw new Error('Red neuronal no entrenada');
  }

  const entradaNorm = normalizarVector(entrada);
  const propagation = propagar(red, entradaNorm);
  const salida = propagation.salidas[propagation.salidas.length - 1];

  const maxProb = Math.max(...salida);
  const clasePredicha = salida.indexOf(maxProb);

  return {
    salidas: salida.map(s => Math.round(s * 10000) / 100),
    clasePredicha,
    confianza: Math.round(maxProb * 100)
  };
}

export function predecirMultipleClases(
  red: RedNeuronal,
  entrada: number[],
  topK: number = 10
): { clase: number; probabilidad: number }[] {
  const prediccion = predecirRedNeuronal(red, entrada);
  
  return prediccion.salidas
    .map((prob, clase) => ({ clase, probabilidad: prob }))
    .sort((a, b) => b.probabilidad - a.probabilidad)
    .slice(0, topK);
}

export function serializarRedNeuronal(red: RedNeuronal): string {
  return JSON.stringify({
    capas: red.capas,
    tasaAprendizaje: red.tasaAprendizaje,
    epochs: red.epochs,
    entrenada: red.entrenada,
    perdida: red.perdida,
    precision: red.precision
  });
}

export function deserializarRedNeuronal(json: string): RedNeuronal {
  return JSON.parse(json);
}