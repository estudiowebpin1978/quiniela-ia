export interface AusenciaItem {
  numero: number;
  ultimoSorteo: string;
  turnosAusente: number;
  diasAusente: number;
  probabilidadRetorno: number;
  estado: 'caliente' | 'tibio' | 'frio' | 'atrasado';
  cicloPromedio: number;
}

export interface AnalisisAusencias {
  numeros: AusenciaItem[];
  caliente: AusenciaItem[];
  tibio: AusenciaItem[];
  frio: AusenciaItem[];
  atrasados: AusenciaItem[];
  promedioAusencia: number;
  maximaAusencia: number;
  numerosEnRiesgo: number;
}

export function analizarAusencias(
  sorteos: { fecha: string; turno: string; numbers: number[] }[],
  opciones: { diasAnalisis?: number; thresholdFrio?: number; thresholdAtrasado?: number } = {}
): AnalisisAusencias {
  const { diasAnalisis = 90, thresholdFrio = 20, thresholdAtrasado = 50 } = opciones;

  const fechaLimite = new Date();
  fechaLimite.setDate(fechaLimite.getDate() - diasAnalisis);

  const sorteosFiltrados = sorteos.filter(s => new Date(s.fecha) >= fechaLimite)
    .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());

  const ultimosMovimientos: Map<number, { fecha: string; idx: number }> = new Map();
  const conteos: Map<number, number> = new Map();
  const distancias: Map<number, number[]> = new Map();

  sorteosFiltrados.forEach((sorteo, idx) => {
    const numbers = Array.isArray(sorteo.numbers) ? sorteo.numbers : [];
    const appearingNow = new Set<number>();

    numbers.forEach(n => {
      if (typeof n !== 'number' || isNaN(n)) return;
      const n2 = n % 100;
      appearingNow.add(n2);
      
      const prevIdx = ultimosMovimientos.get(n2)?.idx ?? -1;
      if (prevIdx >= 0) {
        const distancia = idx - prevIdx;
        distancias.set(n2, [...(distancias.get(n2) || []), distancia]);
      }
      ultimosMovimientos.set(n2, { fecha: sorteo.fecha, idx });
      conteos.set(n2, (conteos.get(n2) || 0) + 1);
    });
  });

  const maxIdx = sorteosFiltrados.length - 1;

  const numeros: AusenciaItem[] = [];

  for (let n = 0; n < 100; n++) {
    const info = ultimosMovimientos.get(n);
    const conteo = conteos.get(n) || 0;
    const distanciasNum = distancias.get(n) || [];
    
    const cicloPromedio = distanciasNum.length > 0
      ? distanciasNum.reduce((a, b) => a + b, 0) / distanciasNum.length
      : diasAnalisis;

    const turnosAusente = info ? maxIdx - info.idx : maxIdx;
    const diasAusente = info 
      ? Math.floor((new Date().getTime() - new Date(info.fecha).getTime()) / (1000 * 60 * 60 * 24))
      : diasAnalisis;

    const probRetorno = ciclosPromedioToProbabilidad(cicloPromedio, turnosAusente);

    let estado: 'caliente' | 'tibio' | 'frio' | 'atrasado';
    if (turnosAusente <= 3 && conteo > 0) {
      estado = 'caliente';
    } else if (turnosAusente <= 10 && conteo > 0) {
      estado = 'tibio';
    } else if (turnosAusente >= thresholdAtrasado) {
      estado = 'atrasado';
    } else {
      estado = 'frio';
    }

    numeros.push({
      numero: n,
      ultimoSorteo: info?.fecha || 'N/A',
      turnosAusente,
      diasAusente,
      probabilidadRetorno: probRetorno,
      estado,
      cicloPromedio: Math.round(cicloPromedio * 10) / 10
    });
  }

  const promedioAusencia = numeros.reduce((a, b) => a + b.turnosAusente, 0) / numeros.length;
  const maximaAusencia = Math.max(...numeros.map(n => n.turnosAusente));

  const caliente = numeros.filter(n => n.estado === 'caliente').sort((a, b) => b.probabilidadRetorno - a.probabilidadRetorno);
  const tibio = numeros.filter(n => n.estado === 'tibio').sort((a, b) => b.probabilidadRetorno - a.probabilidadRetorno);
  const frio = numeros.filter(n => n.estado === 'frio').sort((a, b) => a.turnosAusente - b.turnosAusente);
  const atrasados = numeros.filter(n => n.estado === 'atrasado').sort((a, b) => b.turnosAusente - a.turnosAusente);

  return {
    numeros,
    caliente,
    tibio,
    frio,
    atrasados,
    promedioAusencia: Math.round(promedioAusencia * 10) / 10,
    maximaAusencia,
    numerosEnRiesgo: atrasados.length
  };
}

function ciclosPromedioToProbabilidad(cicloPromedio: number, turnosAusente: number): number {
  if (cicloPromedio === 0) return 0.5;
  const ratio = turnosAusente / cicloPromedio;
  const probBase = 1 / cicloPromedio;
  const probabilidad = Math.min(0.95, probBase * (1 + ratio * 0.5));
  return Math.round(probabilidad * 100) / 100;
}

export function analizarAusenciasPorTurno(
  sorteos: { fecha: string; turno: string; numbers: number[] }[],
  turno: string
): AnalisisAusencias {
  const sorteosTurno = sorteos.filter(s => s.turno.toLowerCase() === turno.toLowerCase());
  return analizarAusencias(sorteosTurno);
}

export function predecirProximoPorAusencia(
  ausencias: AnalisisAusencias,
  topN: number = 10
): AusenciaItem[] {
  return ausencias.numeros
    .filter(n => n.turnosAusente > 0)
    .sort((a, b) => b.probabilidadRetorno - a.probabilidadRetorno)
    .slice(0, topN);
}