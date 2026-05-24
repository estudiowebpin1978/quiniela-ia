interface CalibracionCurva {
  minScore: number;
  maxScore: number;
  hitRate: number;
  muestras: number;
}

const CURVA_CALIBRACION: CalibracionCurva[] = [
  { minScore: 0, maxScore: 10, hitRate: 0.01, muestras: 120 },
  { minScore: 10, maxScore: 20, hitRate: 0.02, muestras: 180 },
  { minScore: 20, maxScore: 30, hitRate: 0.04, muestras: 240 },
  { minScore: 30, maxScore: 35, hitRate: 0.06, muestras: 200 },
  { minScore: 35, maxScore: 40, hitRate: 0.08, muestras: 180 },
  { minScore: 40, maxScore: 45, hitRate: 0.12, muestras: 260 },
  { minScore: 45, maxScore: 50, hitRate: 0.18, muestras: 340 },
  { minScore: 50, maxScore: 55, hitRate: 0.22, muestras: 380 },
  { minScore: 55, maxScore: 60, hitRate: 0.28, muestras: 350 },
  { minScore: 60, maxScore: 65, hitRate: 0.32, muestras: 280 },
  { minScore: 65, maxScore: 70, hitRate: 0.38, muestras: 200 },
  { minScore: 70, maxScore: 75, hitRate: 0.44, muestras: 140 },
  { minScore: 75, maxScore: 80, hitRate: 0.50, muestras: 90 },
  { minScore: 80, maxScore: 85, hitRate: 0.55, muestras: 50 },
  { minScore: 85, maxScore: 100, hitRate: 0.60, muestras: 30 },
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
