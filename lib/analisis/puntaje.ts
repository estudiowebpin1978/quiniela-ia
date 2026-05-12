import { FrecuenciaItem } from './frecuencia';
import { AusenciaItem } from './ausencias';
import { CicloItem } from './ciclos';
import { TransicionItem } from './transicion';

export interface ScoreItem {
  numero: number;
  score: number;
  confianza: number;
  factores: {
    frecuencia: number;
    ausencia: number;
    transicion: number;
    ciclo: number;
    recencia: number;
    tendencia: number;
  };
  explication: string;
  rank: number;
}

export interface RankingCompleto {
  dosCifras: ScoreItem[];
  tresCifras: ScoreItem[];
  cuatroCifras: ScoreItem[];
  redoblona: { a: number; b: number; score: number };
  generado: string;
  metodologia: string;
}

const PESOS = {
  frecuencia: 0.30,
  ausencia: 0.20,
  transicion: 0.15,
  ciclo: 0.15,
  recencia: 0.12,
  tendencia: 0.08
};

export function calcularScore(
  numero: number,
  freq: FrecuenciaItem | null,
  ausencia: AusenciaItem | null,
  transicion: TransicionItem | null,
  ciclo: CicloItem | null,
  ultimoIdx: number,
  totalSorteos: number,
  maxIdx: number
): ScoreItem {
  const scoreFreq = freq 
    ? (freq.frecuencia / (freq.porcentaje * 10)) * PESOS.frecuencia 
    : PESOS.frecuencia * 0.5;
  
  const scoreAusencia = ausencia
    ? ausencia.probabilidadRetorno * PESOS.ausencia
    : PESOS.ausencia * 0.3;
  
  const scoreTransicion = transicion
    ? transicion.probabilidad * PESOS.transicion
    : PESOS.transicion * 0.5;
  
  const scoreCiclo = ciclo
    ? Math.max(0, 1 - ciclo.proximaAparicionEstimada / 20) * PESOS.ciclo
    : PESOS.ciclo * 0.3;
  
  const recencia = maxIdx - ultimoIdx;
  const scoreRecencia = Math.max(0, 1 - recencia / totalSorteos) * PESOS.recencia;
  
  const scoreTendencia = freq
    ? Math.abs(freq.tendencia) * PESOS.tendencia
    : PESOS.tendencia * 0.5;

  const scoreTotal = scoreFreq + scoreAusencia + scoreTransicion + scoreCiclo + scoreRecencia + scoreTendencia;
  const confianza = Math.min(95, Math.round(scoreTotal * 100));

  let explication = '';
  const factores: ScoreItem['factores'] = {
    frecuencia: Math.round(scoreFreq * 100) / 100,
    ausencia: Math.round(scoreAusencia * 100) / 100,
    transicion: Math.round(scoreTransicion * 100) / 100,
    ciclo: Math.round(scoreCiclo * 100) / 100,
    recencia: Math.round(scoreRecencia * 100) / 100,
    tendencia: Math.round(scoreTendencia * 100) / 100
  };

  if (freq && freq.porcentaje > 3) {
    explication += `Alta frecuencia (${freq.porcentaje.toFixed(1)}%). `;
  }
  if (ausencia && ausencia.probabilidadRetorno > 0.7) {
    explication += `Alta probabilidad de retorno (${Math.round(ausencia.probabilidadRetorno * 100)}%). `;
  }
  if (ciclo && ciclo.proximaAparicionEstimada <= 3) {
    explication += `Ciclo favorable (aprox. ${ciclo.proximaAparicionEstimada} sorteos). `;
  }
  if (transicion && transicion.probabilidad > 0.15) {
    explication += `Transición fuerte desde ${transicion.desde}. `;
  }

  if (!explication) {
    explication = 'Predicción basada en análisis multivariable.';
  }

  return {
    numero,
    score: Math.round(scoreTotal * 10000) / 10000,
    confianza,
    factores,
    explication: explication.trim(),
    rank: 0
  };
}

export function generarRanking(
  sorteos: { fecha: string; turno: string; numbers: number[] }[],
  analisisFrecuencia: any,
  analisisAusencias: any,
  analisisTransicion: any,
  analisisCiclos: any,
  opciones: { topN?: number } = {}
): RankingCompleto {
  const { topN = 10 } = opciones;
  const totalSorteos = sorteos.length;
  const maxIdx = totalSorteos - 1;

  const freqMap = new Map(analisisFrecuencia.dosCifras.map((f: any) => [f.numero, f]));
  const ausenciaMap = new Map(analisisAusencias.numeros.map((a: any) => [a.numero, a]));
  const transicionMap = new Map(analisisTransicion.transicionesMasProbables.map((t: any) => [t.hacia, t]));
  const cicloMap = new Map(analisisCiclos.ciclos2Cifras.map((c: any) => [c.numero, c]));

  const ultimosIndices: Map<number, number> = new Map();
  sorteos.forEach((sorteo, idx) => {
    const numbers: number[] = (sorteo.numbers || []) as number[];
    numbers.filter(n => typeof n === 'number' && !isNaN(n)).forEach(n => {
      if (typeof n === 'number' && !isNaN(n)) {
        ultimosIndices.set(n % 100, idx);
      }
    });
  });

  const scores2Cifras: ScoreItem[] = [];
  
  for (let n = 0; n < 100; n++) {
    const freq = freqMap.get(n) as any || null;
    const ausencia = ausenciaMap.get(n) as any || null;
    const transicion = transicionMap.get(n) as any || null;
    const ciclo = cicloMap.get(n) as any || null;
    const ultimoIdx = ultimosIndices.get(n) || 0;

    const score = calcularScore(n, freq, ausencia, transicion, ciclo, ultimoIdx, totalSorteos, maxIdx);
    scores2Cifras.push(score);
  }

  scores2Cifras.sort((a, b) => b.score - a.score);
  scores2Cifras.forEach((s, i) => s.rank = i + 1);

  const top2 = scores2Cifras.slice(0, topN);
  const redoblona = top2.length >= 2 
    ? { a: top2[0].numero, b: top2[1].numero, score: top2[0].score * top2[1].score }
    : { a: 0, b: 1, score: 0 };

  const tresCifrasMap = new Map(analisisFrecuencia.tresCifras.slice(0, 100).map((f: any) => [f.numero, f]));
  const scores3Cifras: ScoreItem[] = [];

  for (let n = 0; n < 1000; n++) {
    const freq = tresCifrasMap.get(n) as any;
    if (freq) {
      scores3Cifras.push({
        numero: n,
        score: freq.porcentaje / 100,
        confianza: Math.min(95, Math.round(freq.porcentaje)),
        factores: { frecuencia: freq.porcentaje / 100, ausencia: 0, transicion: 0, ciclo: 0, recencia: 0, tendencia: 0 },
        explication: `Frecuencia histórica: ${freq.frecuencia} apariciones`,
        rank: 0
      });
    }
  }

  scores3Cifras.sort((a, b) => b.score - a.score);
  scores3Cifras.forEach((s, i) => s.rank = i + 1);

  const cuatroCifrasMap = new Map(analisisFrecuencia.cuatroCifras.slice(0, 50).map((f: any) => [f.numero, f]));
  const scores4Cifras: ScoreItem[] = [];

  for (const [num, freq] of cuatroCifrasMap as any) {
    scores4Cifras.push({
      numero: num as number,
      score: freq.porcentaje / 100,
      confianza: Math.min(95, Math.round(freq.porcentaje)),
      factores: { frecuencia: freq.porcentaje / 100, ausencia: 0, transicion: 0, ciclo: 0, recencia: 0, tendencia: 0 },
      explication: `Frecuencia: ${freq.frecuencia} apariciones`,
      rank: 0
    });
  }

  scores4Cifras.sort((a, b) => b.score - a.score);
  scores4Cifras.forEach((s, i) => s.rank = i + 1);

  return {
    dosCifras: top2,
    tresCifras: scores3Cifras.slice(0, 10),
    cuatroCifras: scores4Cifras.slice(0, 10),
    redoblona,
    generado: new Date().toISOString(),
    metodologia: 'Sistema de puntaje multivariable con pesos: Frecuencia 30%, Ausencia 20%, Transición 15%, Ciclo 15%, Recencia 12%, Tendencia 8%'
  };
}

function sortable(n: unknown): number[] {
  return Array.isArray(n) ? n : [];
}

export function generarRankingPorTurno(
  sorteos: { fecha: string; turno: string; numbers: number[] }[],
  turno: string,
  analisisFrecuencia: any,
  analisisAusencias: any,
  analisisTransicion: any,
  analisisCiclos: any
): RankingCompleto {
  const sorteosTurno = sorteos.filter(s => s.turno.toLowerCase() === turno.toLowerCase());
  return generarRanking(sorteosTurno, analisisFrecuencia, analisisAusencias, analisisTransicion, analisisCiclos);
}