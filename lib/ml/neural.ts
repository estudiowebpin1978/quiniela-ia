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
}): RedNeuronal {
  const { arquitectura, tasaAprendizaje = 0.01, epochs = 100 } = config;
  
  const capas: Capa[] = [];

  for (let i = 1; i < arquitectura.length; i++) {
    const entrada = arquitectura[i - 1];
    const salida = arquitectura[i];
    
    const pesos: number[][] = [];
    for (let j = 0; j < salida; j++) {
      const fila: number[] = [];
      for (let k = 0; k < entrada; k++) {
        fila.push((Math.random() - 0.5) * 2);
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

    if (epoch % 20 === 0) {
      console.log(`[NN] Epoch ${epoch}: pérdida ${perdidaTotal.toFixed(4)}`);
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

  console.log(`[NN] Entrenamiento completado. Precisión: ${(red.precision * 100).toFixed(1)}%`);

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
  entradas: number[][];
  salidas: number[][];
}

function propagar(red: RedNeuronal, entrada: number[]): PropagationResult {
  const entradas: number[][] = [entrada];
  let actual = entrada;

  for (const capa of red.capas) {
    const salida: number[] = [];
    
    for (let i = 0; i < capa.pesos.length; i++) {
      let suma = capa.sesgos[i];
      for (let j = 0; j < actual.length; j++) {
        suma += capa.pesos[i][j] * actual[j];
      }

      if (capa.activacion === 'relu') {
        salida.push(Math.max(0, suma));
      } else if (capa.activacion === 'sigmoid') {
        salida.push(1 / (1 + Math.exp(-suma)));
      } else if (capa.activacion === 'tanh') {
        salida.push(Math.tanh(suma));
      } else {
        salida.push(suma);
      }
    }

    if (capa.activacion === 'softmax') {
      const maxVal = Math.max(...salida);
      const expSum = salida.map(v => Math.exp(v - maxVal)).reduce((a, b) => a + b, 0);
      actual = salida.map(v => Math.exp(v - maxVal) / expSum);
    } else {
      actual = salida;
    }

    entradas.push(actual);
  }

  return { entradas, salidas: entradas };
}

function retropropagar(
  red: RedNeuronal,
  objetivo: number[],
  propagation: PropagationResult
): void {
  const errores: number[][] = [];
  
  let error: number[] = propagation.salidas[propagation.salidas.length - 1].map((y, i) => y - objetivo[i]);
  errores.unshift(error);

  for (let c = red.capas.length - 1; c >= 0; c--) {
    const capa = red.capas[c];
    const entrada = propagation.entradas[c];
    
    const gradientes: number[] = error.map((e, i) => {
      if (capa.activacion === 'relu') {
        const salidaAnterior = propagation.entradas[c + 1][i];
        return e * (salidaAnterior > 0 ? 1 : 0);
      } else if (capa.activacion === 'softmax') {
        return e;
      }
      return e;
    });

    for (let i = 0; i < capa.pesos.length; i++) {
      for (let j = 0; j < capa.pesos[i].length; j++) {
        const delta = gradientes[i] * entrada[j] * red.tasaAprendizaje;
        capa.pesos[i][j] -= delta;
      }
      capa.sesgos[i] -= gradientes[i] * red.tasaAprendizaje;
    }

    if (c > 0) {
      const errorAnterior: number[] = [];
      for (let j = 0; j < propagation.entradas[c].length; j++) {
        let sum = 0;
        for (let i = 0; i < capa.pesos.length; i++) {
          sum += capa.pesos[i][j] * gradientes[i];
        }
        errorAnterior.push(sum);
      }
      error = errorAnterior;
      errores.unshift(errorAnterior);
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