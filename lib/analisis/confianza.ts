import { ScoreItem } from './puntaje';
import { FrecuenciaItem } from './frecuencia';
import { AusenciaItem } from './ausencias';
import { CicloItem } from './ciclos';

export interface ConfidenceScore {
  numero: number;
  porcentaje: number;
  nivel: 'bajo' | 'medio' | 'alto' | 'muy_alto';
  factores: {
    frecuencia: { valor: number; peso: number; contribucion: number };
    ausencia: { valor: number; peso: number; contribucion: number };
    ciclo: { valor: number; peso: number; contribucion: number };
    tendencia: { valor: number; peso: number; contribucion: number };
    recencia: { valor: number; peso: number; contribucion: number };
  };
  explicacion: string;
  datosHistoricos: {
    apariciones: number;
    ultimoSorteo: number;
    diasUltimaAparicion: number;
    cicloPromedio: number;
  };
}

const PESOS_CONFIANZA = {
  frecuencia: 0.35,
  ausencia: 0.25,
  ciclo: 0.20,
  tendencia: 0.12,
  recencia: 0.08
};

export function calcularConfianza(
  numero: number,
  freq: FrecuenciaItem | null,
  ausencia: AusenciaItem | null,
  ciclo: CicloItem | null,
  totalSorteos: number,
  diasAnalisis: number
): ConfidenceScore {
  const freqScore = freq 
    ? Math.min(1, freq.porcentaje / 10)
    : 0.2;
  
  const ausenciaScore = ausencia
    ? ausencia.probabilidadRetorno
    : 0.3;
  
  const cicloScore = ciclo
    ? ciclo.proximaAparicionEstimada <= 3 
      ? 0.9 
      : ciclo.proximaAparicionEstimada <= 10 
        ? 0.6 
        : 0.2
    : 0.4;
  
  const tendenciaScore = freq
    ? Math.max(0, 1 - Math.abs(freq.tendencia) * 5)
    : 0.5;
  
  const recenciaScore = ausencia
    ? ausencia.turnosAusente <= 5 
      ? 0.9 
      : ausencia.turnosAusente <= 15 
        ? 0.6 
        : 0.3
    : 0.5;

  const confianzaTotal = 
    freqScore * PESOS_CONFIANZA.frecuencia +
    ausenciaScore * PESOS_CONFIANZA.ausencia +
    cicloScore * PESOS_CONFIANZA.ciclo +
    tendenciaScore * PESOS_CONFIANZA.tendencia +
    recenciaScore * PESOS_CONFIANZA.recencia;

  const porcentaje = Math.min(95, Math.round(confianzaTotal * 100));
  
  let nivel: 'bajo' | 'medio' | 'alto' | 'muy_alto';
  if (porcentaje >= 80) nivel = 'muy_alto';
  else if (porcentaje >= 60) nivel = 'alto';
  else if (porcentaje >= 40) nivel = 'medio';
  else nivel = 'bajo';

  const factores = {
    frecuencia: {
      valor: freqScore,
      peso: PESOS_CONFIANZA.frecuencia * 100,
      contribucion: Math.round(freqScore * PESOS_CONFIANZA.frecuencia * 100)
    },
    ausencia: {
      valor: ausenciaScore,
      peso: PESOS_CONFIANZA.ausencia * 100,
      contribucion: Math.round(ausenciaScore * PESOS_CONFIANZA.ausencia * 100)
    },
    ciclo: {
      valor: cicloScore,
      peso: PESOS_CONFIANZA.ciclo * 100,
      contribucion: Math.round(cicloScore * PESOS_CONFIANZA.ciclo * 100)
    },
    tendencia: {
      valor: tendenciaScore,
      peso: PESOS_CONFIANZA.tendencia * 100,
      contribucion: Math.round(tendenciaScore * PESOS_CONFIANZA.tendencia * 100)
    },
    recencia: {
      valor: recenciaScore,
      peso: PESOS_CONFIANZA.recencia * 100,
      contribucion: Math.round(recenciaScore * PESOS_CONFIANZA.recencia * 100)
    }
  };

  let explicacion = '';

  if (freq && freq.frecuencia > 0) {
    explicacion += `Apareció ${freq.frecuencia} veces`;
    if (freq.porcentaje > 3) {
      explicacion += ` (frecuencia alta: ${freq.porcentaje.toFixed(1)}%)`;
    }
    explicacion += '. ';
  }

  if (ausencia) {
    if (ausencia.probabilidadRetorno > 0.7) {
      explicacion += `Alta probabilidad de retorno (${Math.round(ausencia.probabilidadRetorno * 100)}%). `;
    } else if (ausencia.turnosAusente > 20) {
      explicacion += `Número atrasado (${ausencia.turnosAusente} sorteos sin aparecer). `;
    }
  }

  if (ciclo) {
    if (ciclo.proximaAparicionEstimada <= 3) {
      explicacion += `Ciclo favorable (aparición esperada en ${ciclo.proximaAparicionEstimada} sorteos). `;
    }
    if (ciclo.tendencia === 'acortando') {
      explicacion += 'Ciclo recientemente acortado. ';
    }
  }

  if (!explicacion) {
    explicacion = 'Análisis multivariable completado.';
  }

  const datosHistoricos = {
    apariciones: freq?.frecuencia || 0,
    ultimoSorteo: ausencia?.turnosAusente || 0,
    diasUltimaAparicion: ausencia?.diasAusente || 0,
    cicloPromedio: ciclo?.cicloPromedio || 0
  };

  return {
    numero,
    porcentaje,
    nivel,
    factores,
    explicacion: explicacion.trim(),
    datosHistoricos
  };
}

export function calcularConfianzaParaRanking(
  ranking: ScoreItem[],
  freqData: FrecuenciaItem[],
  ausenciaData: AusenciaItem[],
  ciclosData: CicloItem[],
  totalSorteos: number,
  diasAnalisis: number
): ConfidenceScore[] {
  const freqMap = new Map(freqData.map(f => [f.numero, f]));
  const ausenciaMap = new Map(ausenciaData.map(a => [a.numero, a]));
  const cicloMap = new Map(ciclosData.map(c => [c.numero, c]));

  return ranking.map(item => {
    const freq = freqMap.get(item.numero) || null;
    const ausencia = ausenciaMap.get(item.numero) || null;
    const ciclo = cicloMap.get(item.numero) || null;

    return calcularConfianza(item.numero, freq, ausencia, ciclo, totalSorteos, diasAnalisis);
  });
}

export function generarInformeConfianza(
  confianzaItems: ConfidenceScore[]
): {
  promedio: number;
  altoConfianza: ConfidenceScore[];
  medioConfianza: ConfidenceScore[];
  bajoConfianza: ConfidenceScore[];
  resumen: string;
} {
  const promedio = Math.round(
    confianzaItems.reduce((sum, c) => sum + c.porcentaje, 0) / confianzaItems.length
  );

  const altoConfianza = confianzaItems.filter(c => c.nivel === 'muy_alto' || c.nivel === 'alto');
  const medioConfianza = confianzaItems.filter(c => c.nivel === 'medio');
  const bajoConfianza = confianzaItems.filter(c => c.nivel === 'bajo');

  let resumen = '';
  if (altoConfianza.length >= 5) {
    resumen = `Sistema con alta confianza. ${altoConfianza.length} números con +60% de confianza.`;
  } else if (promedio >= 50) {
    resumen = `Sistema con confianza media. ${altoConfianza.length} números con alta probabilidad.`;
  } else {
    resumen = `Sistema con confianza variable. Se recomienda diversificar apuestas.`;
  }

  return {
    promedio,
    altoConfianza,
    medioConfianza,
    bajoConfianza,
    resumen
  };
}