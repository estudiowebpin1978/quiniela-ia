export interface PosicionItem {
  digito: number;
  posicion: 'miles' | 'centenas' | 'decenas' | 'unidades';
  frecuencia: number;
  porcentaje: number;
  tendencia: number;
}

export interface AnalisisPosiciones {
  miles: PosicionItem[];
  centenas: PosicionItem[];
  decenas: PosicionItem[];
  unidades: PosicionItem[];
  combinacionMasProbable: string;
  heatmapPosiciones: number[][];
  digitosDominantes: { posicion: string; digitos: number[] };
  correlacionesPosiciones: Record<string, number>;
}

export function extraerDigitos(num: number): number[] {
  const s = String(num).padStart(4, '0');
  return [
    parseInt(s[0]),
    parseInt(s[1]),
    parseInt(s[2]),
    parseInt(s[3])
  ];
}

export function analizarPosiciones(
  sorteos: { fecha: string; turno: string; numbers: number[] }[],
  opciones: { diasAnalisis?: number } = {}
): AnalisisPosiciones {
  const { diasAnalisis = 90 } = opciones;

  const fechaLimite = new Date();
  fechaLimite.setDate(fechaLimite.getDate() - diasAnalisis);

  const sorteosFiltrados = sorteos.filter(s => new Date(s.fecha) >= fechaLimite);

  const freqMiles = new Array(10).fill(0);
  const freqCentenas = new Array(10).fill(0);
  const freqDecenas = new Array(10).fill(0);
  const freqUnidades = new Array(10).fill(0);

  const freqMilesReciente = new Array(10).fill(0);
  const freqCentenasReciente = new Array(10).fill(0);
  const freqDecenasReciente = new Array(10).fill(0);
  const freqUnidadesReciente = new Array(10).fill(0);

  const ultimos30 = sorteosFiltrados.slice(-30);
  const totalGeneral = { miles: 0, centenas: 0, decenas: 0, unidades: 0 };
  const totalReciente = { miles: 0, centenas: 0, decenas: 0, unidades: 0 };

  sorteosFiltrados.forEach(sorteo => {
    const numbers: number[] = (sorteo.numbers || []) as number[];
    const nums = numbers.filter(n => typeof n === 'number' && !isNaN(n));
    nums.forEach(n => {
      if (typeof n !== 'number' || isNaN(n)) return;
      const digitos = extraerDigitos(n);
      freqMiles[digitos[0]]++;
      freqCentenas[digitos[1]]++;
      freqDecenas[digitos[2]]++;
      freqUnidades[digitos[3]]++;
      totalGeneral.miles++;
      totalGeneral.centenas++;
      totalGeneral.decenas++;
      totalGeneral.unidades++;
    });
  });

  ultimos30.forEach(sorteo => {
    const numbers: number[] = (sorteo.numbers || []) as number[];
    const nums = numbers.filter(n => typeof n === 'number' && !isNaN(n));
    nums.forEach(n => {
      if (typeof n !== 'number' || isNaN(n)) return;
      const digitos = extraerDigitos(n);
      freqMilesReciente[digitos[0]]++;
      freqCentenasReciente[digitos[1]]++;
      freqDecenasReciente[digitos[2]]++;
      freqUnidadesReciente[digitos[3]]++;
      totalReciente.miles++;
      totalReciente.centenas++;
      totalReciente.decenas++;
      totalReciente.unidades++;
    });
  });

  const construirItems = (
    freq: number[],
    total: number,
    freqReciente: number[],
    totalReciente: number,
    posicion: 'miles' | 'centenas' | 'decenas' | 'unidades'
  ): PosicionItem[] => {
    return freq.map((f, d) => ({
      digito: d,
      posicion,
      frecuencia: f,
      porcentaje: total > 0 ? Math.round((f / total) * 10000) / 100 : 0,
      tendencia: (totalReciente as number) > 0 ? Math.round(((freqReciente[d] / (totalReciente as number)) - (f / total)) * 10000) / 100 : 0
    })).sort((a, b) => b.frecuencia - a.frecuencia);
  };

  const miles = construirItems(freqMiles, totalGeneral.miles, freqMilesReciente, totalReciente.miles, 'miles');
  const centenas = construirItems(freqCentenas, totalGeneral.centenas, freqCentenasReciente, totalReciente.centenas, 'centenas');
  const decenas = construirItems(freqDecenas, totalGeneral.decenas, freqDecenasReciente, totalReciente.decenas, 'decenas');
  const unidades = construirItems(freqUnidades, totalGeneral.unidades, freqUnidadesReciente, totalReciente.unidades, 'unidades');

  const combinacionTop = [
    miles[0]?.digito || 0,
    centenas[0]?.digito || 0,
    decenas[0]?.digito || 0,
    unidades[0]?.digito || 0
  ].join('');

  const heatmapPosiciones: number[][] = [];
  for (let i = 0; i < 10; i++) {
    const fila: number[] = [];
    for (let j = 0; j < 10; j++) {
      let count = 0;
      const pos1 = i;
      const pos2 = j;
      sorteosFiltrados.forEach(s => {
        const numbers = Array.isArray(s.numbers) ? s.numbers : [];
        numbers.forEach(n => {
          if (typeof n !== 'number' || isNaN(n)) return;
          const dig = extraerDigitos(n);
          if (dig[2] === pos1 && dig[3] === pos2) count++;
        });
      });
      fila.push(count);
    }
    heatmapPosiciones.push(fila);
  }

  const digitosDominantes = {
    posicion: 'miles',
    digitos: miles.slice(0, 3).map(i => i.digito)
  };

  const correlacionesPosiciones: Record<string, number> = {};
  
  const calcCorr = (arr1: number[], arr2: number[]) => {
    const mean1 = arr1.reduce((a, b) => a + b, 0) / arr1.length;
    const mean2 = arr2.reduce((a, b) => a + b, 0) / arr2.length;
    let num = 0, den1 = 0, den2 = 0;
    for (let i = 0; i < 10; i++) {
      const d1 = arr1[i] - mean1;
      const d2 = arr2[i] - mean2;
      num += d1 * d2;
      den1 += d1 * d1;
      den2 += d2 * d2;
    }
    return den1 * den2 > 0 ? Math.round((num / Math.sqrt(den1 * den2)) * 100) / 100 : 0;
  };

  correlacionesPosiciones['miles-centenas'] = calcCorr(freqMiles, freqCentenas);
  correlacionesPosiciones['centenas-decenas'] = calcCorr(freqCentenas, freqDecenas);
  correlacionesPosiciones['decenas-unidades'] = calcCorr(freqDecenas, freqUnidades);
  correlacionesPosiciones['miles-unidades'] = calcCorr(freqMiles, freqUnidades);

  return {
    miles,
    centenas,
    decenas,
    unidades,
    combinacionMasProbable: combinacionTop,
    heatmapPosiciones,
    digitosDominantes,
    correlacionesPosiciones
  };
}

function sortable(n: unknown): number[] {
  return Array.isArray(n) ? n : [];
}

export function generar4CifrasPorPosiciones(
  analisis: AnalisisPosiciones,
  topPorPosicion: number = 2
): { numero: string; probabilidad: number }[] {
  const combinaciones: { numero: string; probabilidad: number }[] = [];

  const topMiles = analisis.miles.slice(0, topPorPosicion).map(i => i.digito);
  const topCentenas = analisis.centenas.slice(0, topPorPosicion).map(i => i.digito);
  const topDecenas = analisis.decenas.slice(0, topPorPosicion).map(i => i.digito);
  const topUnidades = analisis.unidades.slice(0, topPorPosicion).map(i => i.digito);

  for (const m of topMiles) {
    for (const c of topCentenas) {
      for (const d of topDecenas) {
        for (const u of topUnidades) {
          const numero = `${m}${c}${d}${u}`;
          const prob = (analisis.miles.find(i => i.digito === m)?.porcentaje || 0) *
            (analisis.centenas.find(i => i.digito === c)?.porcentaje || 0) *
            (analisis.decenas.find(i => i.digito === d)?.porcentaje || 0) *
            (analisis.unidades.find(i => i.digito === u)?.porcentaje || 0) / 10000;
          combinaciones.push({ numero, probabilidad: Math.round(prob * 10000) / 100 });
        }
      }
    }
  }

  return combinaciones
    .sort((a, b) => b.probabilidad - a.probabilidad)
    .slice(0, 20);
}

export function generar3CifrasPorPosiciones(
  analisis: AnalisisPosiciones
): { numero: string; probabilidad: number }[] {
  const combinaciones: { numero: string; probabilidad: number }[] = [];

  const topCentenas = analisis.centenas.slice(0, 3).map(i => i.digito);
  const topDecenas = analisis.decenas.slice(0, 3).map(i => i.digito);
  const topUnidades = analisis.unidades.slice(0, 3).map(i => i.digito);

  for (const c of topCentenas) {
    for (const d of topDecenas) {
      for (const u of topUnidades) {
        const numero = `${c}${d}${u}`;
        const prob = (analisis.centenas.find(i => i.digito === c)?.porcentaje || 0) *
          (analisis.decenas.find(i => i.digito === d)?.porcentaje || 0) *
          (analisis.unidades.find(i => i.digito === u)?.porcentaje || 0) / 100;
        combinaciones.push({ numero, probabilidad: Math.round(prob * 100) / 100 });
      }
    }
  }

  return combinaciones
    .sort((a, b) => b.probabilidad - a.probabilidad)
    .slice(0, 10);
}