export interface CicloItem {
  numero: number;
  cicloPromedio: number;
  cicloMinimo: number;
  cicloMaximo: number;
  desviacionCiclo: number;
  ultimoCiclo: number;
  tendencia: 'estable' | 'acortando' | 'alargando';
  proximaAparicionEstimada: number;
}

export interface PatronCiclico {
  tipo: 'semanal' | 'mensual' | 'anual' | 'diario';
  diasConMasFrecuencia: number[];
  turnosConMasFrecuencia: string[];
  confianza: number;
}

export interface AnalisisCiclos {
  ciclos2Cifras: CicloItem[];
  ciclos3Cifras: CicloItem[];
  ciclos4Cifras: CicloItem[];
  patronesSemanales: PatronCiclico;
  patronesMensuales: PatronCiclico;
  patronesTurno: Record<string, { promedio: number; varianza: number }>;
  numerosEnCicloFavorables: number[];
  numerosEnCicloDesfavorables: number[];
}

function calcStd(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

export function analizarCiclos(
  sorteos: { fecha: string; turno: string; numbers: number[] }[],
  opciones: { diasAnalisis?: number; tamanioVentana?: number } = {}
): AnalisisCiclos {
  const { diasAnalisis = 180, tamanioVentana = 20 } = opciones;

  const fechaLimite = new Date();
  fechaLimite.setDate(fechaLimite.getDate() - diasAnalisis);

  const sorteosFiltrados = sorteos.filter(s => new Date(s.fecha) >= fechaLimite)
    .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());

  const distancias2: Map<number, number[]> = new Map();
  const distancias3: Map<number, number[]> = new Map();
  const distancias4: Map<number, number[]> = new Map();
  const ultimosIdx: Map<number, number> = new Map();
  const ultimosIdx3: Map<number, number> = new Map();
  const ultimosIdx4: Map<number, number> = new Map();

  let idx = 0;
  for (const sorteo of sorteosFiltrados) {
    const numbers: number[] = (sorteo.numbers || []) as number[];
    const appearing = new Set<number>();

    numbers.filter(n => typeof n === 'number' && !isNaN(n)).forEach(n => {

      const n2 = n % 100;
      const n3 = n % 1000;

      if (!appearing.has(n2)) {
        appearing.add(n2);
        const prev = ultimosIdx.get(n2);
        if (prev !== undefined) {
          const dist = idx - prev;
          distancias2.set(n2, [...(distancias2.get(n2) || []), dist]);
        }
        ultimosIdx.set(n2, idx);
      }

      if (!distancias3.has(n3)) {
        distancias3.set(n3, []);
      }
      const prevIdx3 = ultimosIdx3.get(n3);
      if (prevIdx3 !== undefined) {
        const dist = idx - prevIdx3;
        distancias3.set(n3, [...(distancias3.get(n3) || []), dist]);
      }
      ultimosIdx3.set(n3, idx);

      if (!distancias4.has(n)) {
        distancias4.set(n, []);
      }
      const prevIdx4 = ultimosIdx4.get(n);
      if (prevIdx4 !== undefined) {
        const dist = idx - prevIdx4;
        distancias4.set(n, [...(distancias4.get(n) || []), dist]);
      }
      ultimosIdx4.set(n, idx);
    });

    idx++;
  }

  const ultIdxGlobal = sorteosFiltrados.length - 1;

  const buildCiclos = (
    distancias: Map<number, number[]>,
    tipo: '2cifras' | '3cifras' | '4cifras'
  ): CicloItem[] => {
    const items: CicloItem[] = [];
    const max = tipo === '2cifras' ? 100 : tipo === '3cifras' ? 1000 : 10000;

    for (let n = 0; n < max; n++) {
      const dists = distancias.get(n) || [];
      if (dists.length === 0) continue;

      const ult = ultimosIdx.get(n) || ultIdxGlobal;
      const ultimoCiclo = ultIdxGlobal - ult;

      const cicloPromedio = dists.reduce((a, b) => a + b, 0) / dists.length;
      const cicloMinimo = Math.min(...dists);
      const cicloMaximo = Math.max(...dists);
      const desviacion = calcStd(dists);

      let tendencia: 'estable' | 'acortando' | 'alargando' = 'estable';
      if (dists.length >= 5) {
        const ultimos = dists.slice(-5);
        const anteriores = dists.slice(-10, -5);
        if (anteriores.length > 0) {
          const promUlt = ultimos.reduce((a, b) => a + b, 0) / ultimos.length;
          const promAnt = anteriores.reduce((a, b) => a + b, 0) / anteriores.length;
          if (promUlt < promAnt - 1) tendencia = 'acortando';
          else if (promUlt > promAnt + 1) tendencia = 'alargando';
        }
      }

      const proxEstimada = cicloPromedio - ultimoCiclo;

      items.push({
        numero: n,
        cicloPromedio: Math.round(cicloPromedio * 10) / 10,
        cicloMinimo,
        cicloMaximo,
        desviacionCiclo: Math.round(desviacion * 10) / 10,
        ultimoCiclo,
        tendencia,
        proximaAparicionEstimada: Math.max(0, Math.round(proxEstimada))
      });
    }

    return items.sort((a, b) => a.proximaAparicionEstimada - b.proximaAparicionEstimada);
  };

  const ciclos2Cifras = buildCiclos(distancias2, '2cifras');
  const ciclos3Cifras = buildCiclos(distancias3, '3cifras');
  const ciclos4Cifras = buildCiclos(distancias4, '4cifras');

  const patronesSemanales = detectarPatronSemanal(sorteosFiltrados);
  const patronesMensuales = detectarPatronMensual(sorteosFiltrados);

  const turnos = [...new Set(sorteosFiltrados.map(s => s.turno))];
  const patronesTurno: Record<string, { promedio: number; varianza: number }> = {};

  turnos.forEach(turno => {
    const turnosSorteos = sorteosFiltrados.filter(s => s.turno === turno);
    const freqs: number[] = [];
    
    turnosSorteos.forEach(s => {
      const numbers = Array.isArray(s.numbers) ? s.numbers : [];
      const unicos = new Set<number>();
      numbers.forEach(n => {
        if (typeof n === 'number' && !isNaN(n)) {
          unicos.add(n % 100);
        }
      });
      freqs.push(unicos.size);
    });

    patronesTurno[turno] = {
      promedio: freqs.length > 0 ? Math.round(freqs.reduce((a, b) => a + b, 0) / freqs.length * 10) / 10 : 0,
      varianza: freqs.length > 0 ? Math.round(calcStd(freqs) * 10) / 10 : 0
    };
  });

  const numerosEnCicloFavorables = ciclos2Cifras
    .filter(c => c.proximaAparicionEstimada <= 3 && c.tendencia !== 'alargando')
    .slice(0, 15)
    .map(c => c.numero);

  const numerosEnCicloDesfavorables = ciclos2Cifras
    .filter(c => c.proximaAparicionEstimada > 15 || c.tendencia === 'alargando')
    .slice(0, 15)
    .map(c => c.numero);

  return {
    ciclos2Cifras,
    ciclos3Cifras,
    ciclos4Cifras,
    patronesSemanales,
    patronesMensuales,
    patronesTurno,
    numerosEnCicloFavorables,
    numerosEnCicloDesfavorables
  };
}

function sortable(n: unknown): number[] {
  return Array.isArray(n) ? n : [];
}

function detectarPatronSemanal(
  sorteos: { fecha: string; turno: string; numbers: number[] }[]
): PatronCiclico {
  const diasFrecuencia: Map<number, number> = new Map();
  const turnosFrecuencia: Map<string, number> = new Map();

  sorteos.forEach(s => {
    const fecha = new Date(s.fecha);
    const dia = fecha.getDay();
    diasFrecuencia.set(dia, (diasFrecuencia.get(dia) || 0) + 1);
    turnosFrecuencia.set(s.turno, (turnosFrecuencia.get(s.turno) || 0) + 1);
  });

  const diasOrdenados = Array.from(diasFrecuencia.entries()).sort((a, b) => b[1] - a[1]);
  const diasTop = diasOrdenados.slice(0, 3).map(([d]) => d);

  const turnosOrdenados = Array.from(turnosFrecuencia.entries()).sort((a, b) => b[1] - a[1]);
  const turnosTop = turnosOrdenados.slice(0, 3).map(([t]) => t);

  const maxFreq = diasOrdenados[0]?.[1] || 1;
  const confianza = Math.round((maxFreq / (sorteos.length / 7)) * 100) / 100;

  return {
    tipo: 'semanal',
    diasConMasFrecuencia: diasTop,
    turnosConMasFrecuencia: turnosTop,
    confianza: Math.min(1, confianza)
  };
}

function detectarPatronMensual(
  sorteos: { fecha: string; turno: string; numbers: number[] }[]
): PatronCiclico {
  const mesesFrecuencia: Map<string, number> = new Map();
  const diasMesFrecuencia: Map<number, number> = new Map();

  sorteos.forEach(s => {
    const fecha = new Date(s.fecha);
    const mes = fecha.getMonth();
    const dia = fecha.getDate();
    mesesFrecuencia.set(String(mes), (mesesFrecuencia.get(String(mes)) || 0) + 1);
    diasMesFrecuencia.set(dia, (diasMesFrecuencia.get(dia) || 0) + 1);
  });

  const diasOrdenados = Array.from(diasMesFrecuencia.entries()).sort((a, b) => b[1] - a[1]);
  const diasTop = diasOrdenados.slice(0, 5).map(([d]) => d);

  const maxFreq = diasOrdenados[0]?.[1] || 1;
  const confianza = Math.round((maxFreq / (sorteos.length / 30)) * 100) / 100;

  return {
    tipo: 'mensual',
    diasConMasFrecuencia: diasTop,
    turnosConMasFrecuencia: [],
    confianza: Math.min(1, confianza)
  };
}

export function predecirPorCiclos(
  analisis: AnalisisCiclos,
  topN: number = 10
): { numero: number; cicloPromedio: number; probabilidad: number }[] {
  return analisis.ciclos2Cifras
    .filter(c => c.proximaAparicionEstimada <= 5)
    .slice(0, topN)
    .map(c => ({
      numero: c.numero,
      cicloPromedio: c.cicloPromedio,
      probabilidad: Math.max(0, Math.min(95, Math.round((1 - c.proximaAparicionEstimada / c.cicloPromedio) * 100)))
    }));
}