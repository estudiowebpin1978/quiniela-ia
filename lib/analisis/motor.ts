import { analizarFrecuencia, AnalisisFrecuencia } from './frecuencia';
import { analizarAusencias, AnalisisAusencias } from './ausencias';
import { analizarTransicion, AnalisisTransicion } from './transicion';
import { analizarPosiciones, AnalisisPosiciones, generar4CifrasPorPosiciones, generar3CifrasPorPosiciones } from './posiciones';
import { analizarCiclos, AnalisisCiclos, predecirPorCiclos } from './ciclos';
import { generarRanking, RankingCompleto, ScoreItem } from './puntaje';
import { calcularConfianzaParaRanking, generarInformeConfianza, ConfidenceScore } from './confianza';

export interface Sorteo {
  fecha: string;
  turno: string;
  numbers: number[];
}

export interface AnalisisCompleto {
  frecuencia: AnalisisFrecuencia;
  ausencias: AnalisisAusencias;
  transicion: AnalisisTransicion;
  posiciones: AnalisisPosiciones;
  ciclos: AnalisisCiclos;
  ranking: RankingCompleto;
  confianza: ConfidenceScore[];
  resumen: {
    totalSorteos: number;
    totalNumeros: number;
    diasAnalisis: number;
    promedioConfianza: number;
    metodologia: string;
  };
  recomendaciones: {
    dosCifras: { numero: number; confianza: number; razon: string }[];
    tresCifras: { numero: string; confianza: number; razon: string }[];
    cuatroCifras: { numero: string; confianza: number; razon: string }[];
    redoblona: string;
    evitar: number[];
  };
  generado: string;
}

export interface ConfiguracionAnalisis {
  diasAnalisis?: number;
  incluir2Cifras?: boolean;
  incluir3Cifras?: boolean;
  incluir4Cifras?: boolean;
  topNRanking?: number;
  turno?: string;
}

const DEFAULT_CONFIG: ConfiguracionAnalisis = {
  diasAnalisis: 90,
  incluir2Cifras: true,
  incluir3Cifras: true,
  incluir4Cifras: true,
  topNRanking: 10
};

export function ejecutarAnalisisCompleto(
  sorteos: Sorteo[],
  config: ConfiguracionAnalisis = {}
): AnalisisCompleto {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const diasAnalisis = cfg.diasAnalisis || 90;

  const fechaLimite = new Date();
  fechaLimite.setDate(fechaLimite.getDate() - diasAnalisis);

  let sorteosFiltrados = sorteos.filter(s => new Date(s.fecha) >= fechaLimite);
  
  if (cfg.turno) {
    sorteosFiltrados = sorteosFiltrados.filter(
      s => s.turno.toLowerCase() === cfg.turno!.toLowerCase()
    );
  }

  const totalSorteos = sorteosFiltrados.length;
  const totalNumeros = sorteosFiltrados.reduce((sum, s) => sum + (Array.isArray(s.numbers) ? s.numbers.length : 0), 0);

  console.log(`[Motor] Analizando ${totalSorteos} sorteos con ${totalNumeros} números...`);

  console.log('[Motor] 1/6 Calculando análisis de frecuencia...');
  const frecuencia = analizarFrecuencia(sorteosFiltrados, {
    incluir2Cifras: cfg.incluir2Cifras,
    incluir3Cifras: cfg.incluir3Cifras,
    incluir4Cifras: cfg.incluir4Cifras,
    diasAnalisis
  });

  console.log('[Motor] 2/6 Calculando análisis de ausencias...');
  const ausencias = analizarAusencias(sorteosFiltrados, { diasAnalisis });

  console.log('[Motor] 3/6 Calculando matrices de transición...');
  const transicion = analizarTransicion(sorteosFiltrados, { diasAnalisis });

  console.log('[Motor] 4/6 Calculando análisis de posiciones...');
  const posiciones = analizarPosiciones(sorteosFiltrados, { diasAnalisis });

  console.log('[Motor] 5/6 Calculando análisis de ciclos...');
  const ciclos = analizarCiclos(sorteosFiltrados, { diasAnalisis });

  console.log('[Motor] 6/6 Generando ranking y scoring...');
  const ranking = generarRanking(
    sorteosFiltrados,
    frecuencia,
    ausencias,
    transicion,
    ciclos,
    { topN: cfg.topNRanking }
  );

  const confianza = calcularConfianzaParaRanking(
    ranking.dosCifras,
    frecuencia.dosCifras,
    ausencias.numeros,
    ciclos.ciclos2Cifras,
    totalSorteos,
    diasAnalisis
  );

  const informeConfianza = generarInformeConfianza(confianza);

  const recomendaciones = generarRecomendaciones(
    ranking,
    confianza,
    frecuencia,
    ciclos,
    posiciones
  );

  return {
    frecuencia,
    ausencias,
    transicion,
    posiciones,
    ciclos,
    ranking,
    confianza,
    resumen: {
      totalSorteos,
      totalNumeros,
      diasAnalisis,
      promedioConfianza: informeConfianza.promedio,
      metodologia: 'Análisis multivariable con pesos adaptativos'
    },
    recomendaciones,
    generado: new Date().toISOString()
  };
}

function generarRecomendaciones(
  ranking: RankingCompleto,
  confianza: ConfidenceScore[],
  frecuencia: AnalisisFrecuencia,
  ciclos: AnalisisCiclos,
  posiciones: AnalisisPosiciones
) {
  const dosCifras = confianza
    .filter(c => c.nivel === 'muy_alto' || c.nivel === 'alto')
    .slice(0, 10)
    .map(c => ({
      numero: c.numero,
      confianza: c.porcentaje,
      razon: c.explicacion.substring(0, 60) + (c.explicacion.length > 60 ? '...' : '')
    }));

  const nums3 = ranking.tresCifras.slice(0, 5).map(s => ({
    numero: String(s.numero).padStart(3, '0'),
    confianza: s.confianza,
    razon: `Frecuencia histórica del número`
  }));

  const nums4 = generar4CifrasPorPosiciones(posiciones, 2).slice(0, 5).map(p => ({
    numero: p.numero,
    probabilidad: p.probabilidad,
    confianza: Math.round(p.probabilidad),
    razon: `Combinación de posiciones más probable`
  }));

  const redoblona = ranking.redoblona.a !== undefined 
    ? `${String(ranking.redoblona.a).padStart(2, '0')}-${String(ranking.redoblona.b).padStart(2, '0')}`
    : '00-00';

  const evitar = ciclos.numerosEnCicloDesfavorables.slice(0, 10);

  return {
    dosCifras,
    tresCifras: nums3,
    cuatroCifras: nums4,
    redoblona,
    evitar
  };
}

export function ejecutarAnalisisPorTurno(
  sorteos: Sorteo[],
  turno: string,
  config: ConfiguracionAnalisis = {}
): AnalisisCompleto {
  return ejecutarAnalisisCompleto(sorteos, { ...config, turno });
}

export function ejecutarAnalisisGlobal(
  sorteos: Sorteo[],
  config: ConfiguracionAnalisis = {}
): AnalisisCompleto {
  return ejecutarAnalisisCompleto(sorteos, config);
}

export function compararAnalisis(
  analisis1: AnalisisCompleto,
  analisis2: AnalisisCompleto
): {
  cambiosFrecuencia: { numero: number; cambio: number }[];
  cambiosConfianza: { numero: number; antes: number; despues: number }[];
  conclusion: string;
} {
  const freq1 = new Map(analisis1.frecuencia.dosCifras.map(f => [f.numero, f.porcentaje]));
  const freq2 = new Map(analisis2.frecuencia.dosCifras.map(f => [f.numero, f.porcentaje]));

  const cambiosFrecuencia: { numero: number; cambio: number }[] = [];

  for (let n = 0; n < 100; n++) {
    const antes = freq1.get(n) || 0;
    const despues = freq2.get(n) || 0;
    if (antes !== despues) {
      cambiosFrecuencia.push({ numero: n, cambio: Math.round((despues - antes) * 100) / 100 });
    }
  }

  cambiosFrecuencia.sort((a, b) => Math.abs(b.cambio) - Math.abs(a.cambio));

  const conf1 = new Map(analisis1.confianza.map(c => [c.numero, c.porcentaje]));
  const conf2 = new Map(analisis2.confianza.map(c => [c.numero, c.porcentaje]));

  const cambiosConfianza: { numero: number; antes: number; despues: number }[] = [];

  for (const [num, antes] of conf1) {
    const despues = conf2.get(num as number);
    if (despues !== undefined && despues !== antes) {
      cambiosConfianza.push({ numero: num as number, antes, despues });
    }
  }

  cambiosConfianza.sort((a, b) => Math.abs(b.despues - b.antes) - Math.abs(a.despues - a.antes));

  let conclusion = '';
  if (cambiosFrecuencia.length === 0) {
    conclusion = 'No hay cambios significativos en la frecuencia entre análisis.';
  } else if (Math.abs(cambiosFrecuencia[0].cambio) < 1) {
    conclusion = 'Cambios mínimos detectados. El sistema está estable.';
  } else {
    conclusion = `Se detectaron ${cambiosFrecuencia.length} cambios significativos. Mayor cambio: ${cambiosFrecuencia[0].numero} con ${cambiosFrecuencia[0].cambio > 0 ? '+' : ''}${cambiosFrecuencia[0].cambio}%`;
  }

  return {
    cambiosFrecuencia: cambiosFrecuencia.slice(0, 10),
    cambiosConfianza: cambiosConfianza.slice(0, 10),
    conclusion
  };
}