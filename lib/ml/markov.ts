export interface EstadoMarkov {
  estado: number;
  probabilidad: number;
}

export interface CadenaMarkov {
  matrizTransicion: number[][];
  estados: number[];
  distribucionInicial: number[];
  distribucionEstacionaria: number[];
  orden: number;
  entrenada: boolean;
  entropia: number;
}

export interface PrediccionMarkov {
  proximoEstado: number;
  probabilidad: number;
  topK: { estado: number; probabilidad: number }[];
  distribucionCompleta: number[];
}

const NUM_ESTADOS = 100;

export function crearCadenaMarkov(orden: number = 1): CadenaMarkov {
  return {
    matrizTransicion: Array.from({ length: NUM_ESTADOS ** orden }, () => 
      Array(NUM_ESTADOS).fill(0)
    ),
    estados: Array.from({ length: NUM_ESTADOS }, (_, i) => i),
    distribucionInicial: Array(NUM_ESTADOS).fill(1 / NUM_ESTADOS),
    distribucionEstacionaria: [],
    orden,
    entrenada: false,
    entropia: 0
  };
}

export function entrenarCadenaMarkov(
  cadena: CadenaMarkov,
  secuencias: number[][]
): CadenaMarkov {
  const orden = cadena.orden;
  
  for (const seq of secuencias) {
    const extraidos = seq.map(n => n % 100);
    
    for (let i = 0; i < extraidos.length - orden; i++) {
      let idxEstado = 0;
      for (let j = 0; j < orden; j++) {
        idxEstado = idxEstado * NUM_ESTADOS + extraidos[i + j];
      }
      
      const siguiente = extraidos[i + orden];
      cadena.matrizTransicion[idxEstado][siguiente]++;
    }
  }

  for (let i = 0; i < cadena.matrizTransicion.length; i++) {
    const sumaFila = cadena.matrizTransicion[i].reduce((a, b) => a + b, 0);
    if (sumaFila > 0) {
      cadena.matrizTransicion[i] = cadena.matrizTransicion[i].map(v => v / sumaFila);
    } else {
      cadena.matrizTransicion[i] = Array(NUM_ESTADOS).fill(1 / NUM_ESTADOS);
    }
  }

  cadena.distribucionEstacionaria = calcularDistribucionEstacionaria(cadena.matrizTransicion);
  cadena.entropia = calcularEntropiaCadena(cadena.matrizTransicion);
  cadena.entrenada = true;

  return cadena;
}

function calcularDistribucionEstacionaria(matriz: number[][]): number[] {
  const n = 100;
  let dist = Array(n).fill(1 / n);
  
  const potenciaMatriz = matriz.map(fila => [...fila]);
  
  for (let iter = 0; iter < 50; iter++) {
    const nuevaDist = Array(n).fill(0);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        nuevaDist[j] += dist[i] * potenciaMatriz[i][j];
      }
    }
    dist = nuevaDist;
  }
  
  return dist.map(v => Math.round(v * 10000) / 10000);
}

function calcularEntropiaCadena(matriz: number[][]): number {
  let entropiaTotal = 0;
  let count = 0;
  
  for (const fila of matriz) {
    let entropiaFila = 0;
    for (const p of fila) {
      if (p > 0) {
        entropiaFila -= p * Math.log2(p);
      }
    }
    entropiaTotal += entropiaFila;
    count++;
  }
  
  return count > 0 ? Math.round(entropiaTotal / count * 1000) / 1000 : 0;
}

export function predecirSiguienteMarkov(
  cadena: CadenaMarkov,
  estadoActual: number | number[],
  topK: number = 10
): PrediccionMarkov {
  if (!cadena.entrenada) {
    throw new Error('Cadena de Markov no entrenada');
  }

  const orden = cadena.orden;
  const idxEstado = Array.isArray(estadoActual) 
    ? estadoActual.reduce((acc, val) => acc * NUM_ESTADOS + val, 0)
    : estadoActual;

  const fila = cadena.matrizTransicion[idxEstado] || Array(NUM_ESTADOS).fill(1 / NUM_ESTADOS);

  const probabilidades = fila.map((p, i) => ({ estado: i, probabilidad: p }));
  probabilidades.sort((a, b) => b.probabilidad - a.probabilidad);

  const topKEstados = probabilidades.slice(0, topK);

  return {
    proximoEstado: topKEstados[0].estado,
    probabilidad: Math.round(topKEstados[0].probabilidad * 10000) / 100,
    topK: topKEstados.map(t => ({
      estado: t.estado,
      probabilidad: Math.round(t.probabilidad * 10000) / 100
    })),
    distribucionCompleta: fila.map(p => Math.round(p * 10000) / 100)
  };
}

export function predecirSecuenciaMarkov(
  cadena: CadenaMarkov,
  secuenciaInicial: number[],
  longitud: number
): number[] {
  if (!cadena.entrenada) {
    throw new Error('Cadena de Markov no entrenada');
  }

  const secuencia = [...secuenciaInicial.slice(-cadena.orden)];
  const orden = cadena.orden;

  for (let i = 0; i < longitud; i++) {
    const idxEstado = secuencia.slice(-orden).reduce((acc, val) => acc * NUM_ESTADOS + (val % 100), 0);
    const fila = cadena.matrizTransicion[idxEstado] || Array(NUM_ESTADOS).fill(1 / NUM_ESTADOS);
    
    const rand = Math.random();
    let acumulador = 0;
    let siguiente = 0;
    
    for (let j = 0; j < NUM_ESTADOS; j++) {
      acumulador += fila[j];
      if (rand <= acumulador) {
        siguiente = j;
        break;
      }
    }
    
    secuencia.push(siguiente);
  }

  return secuencia.slice(orden);
}

export function evaluarModeloMarkov(
  cadena: CadenaMarkov,
  secuenciasTest: number[][]
): {
  precisionTop1: number;
  precisionTop5: number;
  precisionTop10: number;
  logLikelihood: number;
} {
  if (!cadena.entrenada) {
    throw new Error('Cadena de Markov no entrenada');
  }

  const orden = cadena.orden;
  let correctosTop1 = 0;
  let correctosTop5 = 0;
  let correctosTop10 = 0;
  let logLik = 0;
  let total = 0;

  for (const seq of secuenciasTest) {
    const extraidos = seq.map(n => n % 100);
    
    for (let i = orden; i < extraidos.length; i++) {
      const estado = extraidos.slice(i - orden, i);
      const idxEstado = estado.reduce((acc, val) => acc * NUM_ESTADOS + val, 0);
      const real = extraidos[i];
      
      const fila = cadena.matrizTransicion[idxEstado] || Array(NUM_ESTADOS).fill(1 / NUM_ESTADOS);
      
      const probs = fila.map((p, j) => ({ estado: j, probabilidad: p }));
      probs.sort((a, b) => b.probabilidad - a.probabilidad);
      
      if (probs[0].estado === real) correctosTop1++;
      if (probs.slice(0, 5).some(p => p.estado === real)) correctosTop5++;
      if (probs.slice(0, 10).some(p => p.estado === real)) correctosTop10++;
      
      const probReal = fila[real] || 0.00001;
      logLik += Math.log(probReal);
      
      total++;
    }
  }

  return {
    precisionTop1: total > 0 ? Math.round((correctosTop1 / total) * 10000) / 100 : 0,
    precisionTop5: total > 0 ? Math.round((correctosTop5 / total) * 10000) / 100 : 0,
    precisionTop10: total > 0 ? Math.round((correctosTop10 / total) * 10000) / 100 : 0,
    logLikelihood: total > 0 ? Math.round(logLik / total * 1000) / 1000 : 0
  };
}

export function serializarCadenaMarkov(cadena: CadenaMarkov): string {
  return JSON.stringify({
    matrizTransicion: cadena.matrizTransicion,
    orden: cadena.orden,
    distribucionEstacionaria: cadena.distribucionEstacionaria,
    entropia: cadena.entropia,
    entrenada: cadena.entrenada
  });
}

export function deserializarCadenaMarkov(json: string): CadenaMarkov {
  const data = JSON.parse(json);
  return {
    matrizTransicion: data.matrizTransicion,
    estados: Array.from({ length: NUM_ESTADOS }, (_, i) => i),
    distribucionInicial: Array(NUM_ESTADOS).fill(1 / NUM_ESTADOS),
    distribucionEstacionaria: data.distribucionEstacionaria,
    orden: data.orden,
    entrenada: data.entrenada,
    entropia: data.entropia
  };
}