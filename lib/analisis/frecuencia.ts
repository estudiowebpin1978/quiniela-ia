export interface FrecuenciaItem {
  numero: number;
  frecuencia: number;
  porcentaje: number;
  tendencia: number;
  ultimoIdx: number;
}

export interface AnalisisFrecuencia {
  dosCifras: FrecuenciaItem[];
  tresCifras: FrecuenciaItem[];
  cuatroCifras: FrecuenciaItem[];
  porTurno: Record<string, FrecuenciaItem[]>;
  porDia: Record<string, FrecuenciaItem[]>;
  porSemana: Record<string, FrecuenciaItem[]>;
  porMes: Record<string, FrecuenciaItem[]>;
  masFrecuente: FrecuenciaItem;
  menosFrecuente: FrecuenciaItem;
  promedioFrecuencia: number;
  desviacionEstandar: number;
  distribucion: number[];
}

export function analizarFrecuencia(
  sorteos: { fecha: string; turno: string; numbers: number[] }[],
  opciones: {
    incluir2Cifras?: boolean;
    incluir3Cifras?: boolean;
    incluir4Cifras?: boolean;
    diasAnalisis?: number;
  } = {}
): AnalisisFrecuencia {
  const {
    incluir2Cifras = true,
    incluir3Cifras = true,
    incluir4Cifras = true,
    diasAnalisis = 90
  } = opciones;

  const fechaLimite = new Date();
  fechaLimite.setDate(fechaLimite.getDate() - diasAnalisis);

  const sorteosFiltrados = sorteos.filter(s => new Date(s.fecha) >= fechaLimite);

  const freq2: Map<number, number> = new Map();
  const freq3: Map<number, number> = new Map();
  const freq4: Map<number, number> = new Map();
  const freqTurno: Map<string, Map<number, number>> = new Map();
  const freqDia: Map<string, Map<number, number>> = new Map();
  const freqSemana: Map<string, Map<number, number>> = new Map();
  const freqMes: Map<string, Map<number, number>> = new Map();

  const ultimosIndices: Map<number, number> = new Map();

  sorteosFiltrados.forEach((sorteo, idx) => {
    const fecha = new Date(sorteo.fecha);
    const diaSemana = fecha.toLocaleDateString('es-AR', { weekday: 'short' });
    const semana = getSemanaAnio(fecha);
    const mes = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
    const fechaStr = formatoFecha(fecha);

    if (!freqTurno.has(sorteo.turno)) {
      freqTurno.set(sorteo.turno, new Map());
    }

    const numbers = Array.isArray(sorteo.numbers) ? sorteo.numbers : [];
    
    numbers.forEach(n => {
      if (typeof n !== 'number' || isNaN(n)) return;
      
      if (incluir2Cifras) {
        const n2 = n % 100;
        freq2.set(n2, (freq2.get(n2) || 0) + 1);
        freqTurno.get(sorteo.turno)!.set(n2, (freqTurno.get(sorteo.turno)!.get(n2) || 0) + 1);
        freqDia.get(fechaStr)?.set(n2, (freqDia.get(fechaStr)!.get(n2) || 0) + 1) || freqDia.set(fechaStr, new Map([[n2, 1]]));
        const sem = `${semana}`;
        freqSemana.get(sem)?.set(n2, (freqSemana.get(sem)!.get(n2) || 0) + 1) || freqSemana.set(sem, new Map([[n2, 1]]));
        freqMes.get(mes)?.set(n2, (freqMes.get(mes)!.get(n2) || 0) + 1) || freqMes.set(mes, new Map([[n2, 1]]));
        ultimosIndices.set(n2, idx);
      }

      if (incluir3Cifras) {
        const n3 = n % 1000;
        freq3.set(n3, (freq3.get(n3) || 0) + 1);
      }

      if (incluir4Cifras) {
        freq4.set(n, (freq4.get(n) || 0) + 1);
      }
    });
  });

  const total2 = Array.from(freq2.values()).reduce((a, b) => a + b, 0);
  const total3 = Array.from(freq3.values()).reduce((a, b) => a + b, 0);
  const total4 = Array.from(freq4.values()).reduce((a, b) => a + b, 0);

  const calcularTendencia = (freq: Map<number, number>, total: number): FrecuenciaItem[] => {
    const ultimos30 = sorteosFiltrados.slice(-30);
    const freqReciente: Map<number, number> = new Map();
    
    ultimos30.forEach(s => {
      const numbers = Array.isArray(s.numbers) ? s.numbers : [];
      numbers.forEach(n => {
        if (typeof n === 'number' && !isNaN(n)) {
          const n2 = n % 100;
          freqReciente.set(n2, (freqReciente.get(n2) || 0) + 1);
        }
      });
    });

    return Array.from(freq.entries())
      .map(([num, freqAbs]) => ({
        numero: num,
        frecuencia: freqAbs,
        porcentaje: total > 0 ? (freqAbs / total) * 100 : 0,
        tendencia: (freqReciente.get(num) || 0) / 30 - (freqAbs / total),
        ultimoIdx: ultimosIndices.get(num) || 0
      }))
      .sort((a, b) => b.frecuencia - a.frecuencia);
  };

  const dosCifras = calcularTendencia(freq2, total2);
  const tresCifras = Array.from(freq3.entries())
    .map(([num, f]) => ({ numero: num, frecuencia: f, porcentaje: total3 > 0 ? (f / total3) * 100 : 0, tendencia: 0, ultimoIdx: 0 }))
    .sort((a, b) => b.frecuencia - a.frecuencia);
  const cuatroCifras = Array.from(freq4.entries())
    .map(([num, f]) => ({ numero: num, frecuencia: f, porcentaje: total4 > 0 ? (f / total4) * 100 : 0, tendencia: 0, ultimoIdx: 0 }))
    .sort((a, b) => b.frecuencia - a.frecuencia);

  const porTurno: Record<string, FrecuenciaItem[]> = {};
  freqTurno.forEach((freq, turno) => {
    const total = Array.from(freq.values()).reduce((a, b) => a + b, 0);
    porTurno[turno] = Array.from(freq.entries())
      .map(([num, f]) => ({ numero: num, frecuencia: f, porcentaje: total > 0 ? (f / total) * 100 : 0, tendencia: 0, ultimoIdx: 0 }))
      .sort((a, b) => b.frecuencia - a.frecuencia);
  });

  const calcularPromedioDesv = (items: FrecuenciaItem[]): { prom: number; desvest: number } => {
    if (items.length === 0) return { prom: 0, desvest: 0 };
    const prom = items.reduce((a, b) => a + b.frecuencia, 0) / items.length;
    const varianza = items.reduce((a, b) => a + Math.pow(b.frecuencia - prom, 2), 0) / items.length;
    return { prom, desvest: Math.sqrt(varianza) };
  };

  const { prom, desvest } = calcularPromedioDesv(dosCifras);

  const freqArray = dosCifras.map(d => d.frecuencia);
  const maxFreq = Math.max(...freqArray);
  const distribucion = Array(10).fill(0).map((_, i) => {
    const rangoMin = (maxFreq / 10) * i;
    const rangoMax = (maxFreq / 10) * (i + 1);
    return freqArray.filter(f => f >= rangoMin && f < rangoMax).length;
  });

  return {
    dosCifras,
    tresCifras,
    cuatroCifras,
    porTurno,
    porDia: Object.fromEntries(freqDia) as any,
    porSemana: Object.fromEntries(freqSemana) as any,
    porMes: Object.fromEntries(freqMes) as any,
    masFrecuente: dosCifras[0] || { numero: 0, frecuencia: 0, porcentaje: 0, tendencia: 0, ultimoIdx: 0 },
    menosFrecuente: dosCifras[dosCifras.length - 1] || { numero: 99, frecuencia: 0, porcentaje: 0, tendencia: 0, ultimoIdx: 0 },
    promedioFrecuencia: prom,
    desviacionEstandar: desvest,
    distribucion
  };
}

function getSemanaAnio(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function formatoFecha(date: Date): string {
  return date.toISOString().split('T')[0];
}