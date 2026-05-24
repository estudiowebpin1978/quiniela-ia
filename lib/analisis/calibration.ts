interface CalibracionCurva {
  minScore: number;
  maxScore: number;
  hitRate: number;
  muestras: number;
}

const CURVA_CALIBRACION: CalibracionCurva[] = [
  { minScore: 0, maxScore: 20, hitRate: 0.00, muestras: 50 },
  { minScore: 20, maxScore: 30, hitRate: 0.06, muestras: 240 },
  { minScore: 30, maxScore: 40, hitRate: 0.11, muestras: 180 },
  { minScore: 40, maxScore: 50, hitRate: 0.26, muestras: 340 },
  { minScore: 50, maxScore: 60, hitRate: 0.78, muestras: 380 },
  { minScore: 60, maxScore: 100, hitRate: 0.83, muestras: 280 },
];

export function calibrarConfianza(score: number, confianzaOriginal: number): number {
  for (const punto of CURVA_CALIBRACION) {
    if (score >= punto.minScore && score < punto.maxScore) {
      return Math.min(95, Math.round(punto.hitRate * 100));
    }
  }
  return Math.min(95, Math.max(1, Math.round(score * 0.3)));
}

export function obtenerCurvaCalibracion(): CalibracionCurva[] {
  return CURVA_CALIBRACION;
}
