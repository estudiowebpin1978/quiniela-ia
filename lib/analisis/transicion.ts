export interface TransicionItem {
  desde: number;
  hacia: number;
  frecuencia: number;
  probabilidad: number;
}

export interface MatrizTransicion {
  matriz: number[][];
  estados: number[];
  estacionaria: number[];
  entropia: number;
}

export interface AnalisisTransicion {
  matriz2Cifras: MatrizTransicion;
  matriz3Cifras: MatrizTransicion;
  transicionesMasProbables: TransicionItem[];
  cadenasDetectadas: { inicio: number; fin: number; longitud: number }[];
  correlacionesEntreTurnos: Record<string, number>;
  probabilidadesCondicionales: Record<string, number>;
}

export function construirMatrizTransicion(
  sorteos: { fecha: string; turno: string; numbers: number[] }[],
  tipo: '2cifras' | '3cifras' | '4cifras' = '2cifras'
): MatrizTransicion {
  const tamano = tipo === '2cifras' ? 100 : tipo === '3cifras' ? 1000 : 10000;
  const matriz: number[][] = Array.from({ length: tamano }, () => Array(tamano).fill(0));
  const states = tipo === '2cifras' ? Array.from({ length: 100 }, (_, i) => i) 
    : tipo === '3cifras' ? Array.from({ length: 1000 }, (_, i) => i)
    : Array.from({ length: 10000 }, (_, i) => i);

  const sorteosOrdenados = [...sorteos].sort((a, b) => 
    new Date(a.fecha).getTime() - new Date(b.fecha).getTime()
  );

  for (let i = 1; i < sorteosOrdenados.length; i++) {
    const actual = sorteosOrdenados[i];
    const anterior = sorteosOrdenados[i - 1];

    const numsAnterior = Array.isArray(anterior.numbers) ? anterior.numbers : [];
    const numsActual = Array.isArray(actual.numbers) ? actual.numbers : [];

    const extraer = (n: number) => {
      if (tipo === '2cifras') return n % 100;
      if (tipo === '3cifras') return n % 1000;
      return n;
    };

    numsAnterior.forEach(n => {
      if (typeof n !== 'number' || isNaN(n)) return;
      const desde = extraer(n);

      numsActual.forEach(m => {
        if (typeof m !== 'number' || isNaN(m)) return;
        const hacia = extraer(m);
        
        if (desde >= 0 && desde < tamano && hacia >= 0 && hacia < tamano) {
          matriz[desde][hacia]++;
        }
      });
    });
  }

  const matrizNorm = matriz.map((fila, i) => {
    const sumaFila = fila.reduce((a, b) => a + b, 0);
    if (sumaFila === 0) return Array(tamano).fill(1 / tamano);
    return fila.map(v => v / sumaFila);
  });

  const estacionaria = calcularDistribucionEstacionaria(matrizNorm);
  const entropia = calcularEntropia(matrizNorm);

  return {
    matriz: matrizNorm,
    estados: states,
    estacionaria,
    entropia
  };
}

function calcularDistribucionEstacionaria(matriz: number[][]): number[] {
  const n = matriz.length;
  let estado = Array(n).fill(1 / n);
  
  for (let iter = 0; iter < 100; iter++) {
    const nuevo = Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        nuevo[j] += estado[i] * matriz[i][j];
      }
    }
    estado = nuevo;
  }
  
  return estado.map(v => Math.round(v * 10000) / 10000);
}

function calcularEntropia(matriz: number[][]): number {
  let entropiaTotal = 0;
  
  for (const fila of matriz) {
    let entropiaFila = 0;
    for (const p of fila) {
      if (p > 0) {
        entropiaFila -= p * Math.log2(p);
      }
    }
    entropiaTotal += entropiaFila;
  }
  
  return Math.round(entropiaTotal / matriz.length * 100) / 100;
}

export function analizarTransicion(
  sorteos: { fecha: string; turno: string; numbers: number[] }[],
  opciones: { diasAnalisis?: number } = {}
): AnalisisTransicion {
  const { diasAnalisis = 90 } = opciones;

  const fechaLimite = new Date();
  fechaLimite.setDate(fechaLimite.getDate() - diasAnalisis);

  const sorteosFiltrados = sorteos.filter(s => new Date(s.fecha) >= fechaLimite);

  const matriz2Cifras = construirMatrizTransicion(sorteosFiltrados, '2cifras');
  const matriz3Cifras = construirMatrizTransicion(sorteosFiltrados, '3cifras');

  const transicionesMasProbables: TransicionItem[] = [];
  
  for (let i = 0; i < 100; i++) {
    let maxProb = 0;
    let masProbable = 0;
    for (let j = 0; j < 100; j++) {
      if (matriz2Cifras.matriz[i][j] > maxProb) {
        maxProb = matriz2Cifras.matriz[i][j];
        masProbable = j;
      }
    }
    if (maxProb > 0) {
      transicionesMasProbables.push({
        desde: i,
        hacia: masProbable,
        frecuencia: 0,
        probabilidad: Math.round(maxProb * 10000) / 100
      });
    }
  }

  transicionesMasProbables.sort((a, b) => b.probabilidad - a.probabilidad);
  const topTransiciones = transicionesMasProbables.slice(0, 20);

  const cadenasDetectadas = detectarCadenas(sorteosFiltrados);

  const turnos = [...new Set(sorteosFiltrados.map(s => s.turno))];
  const correlacionesEntreTurnos: Record<string, number> = {};
  
  for (let i = 0; i < turnos.length; i++) {
    for (let j = i + 1; j < turnos.length; j++) {
      const t1 = turnos[i];
      const t2 = turnos[j];
      const corr = calcularCorrelacionTurnos(sorteosFiltrados, t1, t2);
      correlacionesEntreTurnos[`${t1}-${t2}`] = corr;
    }
  }

  const probabilidadesCondicionales: Record<string, number> = {};
  
  for (let n = 0; n < 100; n++) {
    const prob = matriz2Cifras.estacionaria[n] || 0;
    probabilidadesCondicionales[`${n}`] = Math.round(prob * 10000) / 100;
  }

  return {
    matriz2Cifras,
    matriz3Cifras,
    transicionesMasProbables: topTransiciones,
    cadenasDetectadas,
    correlacionesEntreTurnos,
    probabilidadesCondicionales
  };
}

function detectarCadenas(
  sorteos: { fecha: string; turno: string; numbers: number[] }[]
): { inicio: number; fin: number; longitud: number }[] {
  const cadenas: { inicio: number; fin: number; longitud: number }[] = [];
  
  const numeros = new Set<number>();
  let inicio = -1;
  let longitud = 0;

  const sorteosOrdenados = [...sorteos].sort((a, b) => 
    new Date(a.fecha).getTime() - new Date(b.fecha).getTime()
  );

  let anterior: Set<number> | null = null;

  sorteosOrdenados.forEach(sorteo => {
    const numbers = Array.isArray(sorteo.numbers) ? sorteo.numbers : [];
    const actual = new Set<number>();
    
    numbers.forEach(n => {
      if (typeof n === 'number' && !isNaN(n)) {
        actual.add(n % 100);
      }
    });

    if (anterior) {
      let intersec = 0;
      actual.forEach(n => {
        if (anterior!.has(n)) intersec++;
      });
      
      if (intersec >= 2) {
        if (inicio === -1) inicio = Array.from(actual)[0];
        longitud++;
      } else {
        if (longitud >= 3) {
          cadenas.push({ inicio, fin: Array.from(actual)[0], longitud });
        }
        inicio = -1;
        longitud = 0;
      }
    }
    anterior = actual;
  });

  return cadenas.slice(0, 10);
}

function calcularCorrelacionTurnos(
  sorteos: { fecha: string; turno: string; numbers: number[] }[],
  turno1: string,
  turno2: string
): number {
  const t1 = sorteos.filter(s => s.turno === turno1);
  const t2 = sorteos.filter(s => s.turno === turno2);

  const fechas = [...new Set(t1.map(s => s.fecha))];
  let correlacion = 0;
  let count = 0;

  fechas.forEach(fecha => {
    const nums1 = t1.find(s => s.fecha === fecha)?.numbers || [];
    const nums2 = t2.find(s => s.fecha === fecha)?.numbers || [];
    
    const set1 = new Set(nums1.map(n => (n as number) % 100));
    const set2 = new Set(nums2.map(n => (n as number) % 100));
    
    let comun = 0;
    set1.forEach(n => {
      if (set2.has(n)) comun++;
    });
    
    if (set1.size > 0 && set2.size > 0) {
      correlacion += comun / Math.sqrt(set1.size * set2.size);
      count++;
    }
  });

  return count > 0 ? Math.round((correlacion / count) * 100) / 100 : 0;
}

export function predecirProximoPorTransicion(
  analisis: AnalisisTransicion,
  ultimoNumero: number,
  topN: number = 10
): { numero: number; probabilidad: number }[] {
  const matriz = analisis.matriz2Cifras.matriz;
  
  if (ultimoNumero < 0 || ultimoNumero >= matriz.length) {
    return [];
  }

  const fila = matriz[ultimoNumero];
  const resultados = fila
    .map((prob, num) => ({ numero: num, probabilidad: Math.round(prob * 10000) / 100 }))
    .filter(r => r.probabilidad > 0)
    .sort((a, b) => b.probabilidad - a.probabilidad)
    .slice(0, topN);

  return resultados;
}