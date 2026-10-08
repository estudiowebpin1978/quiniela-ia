/**
 * CHALLENGER - XGBoost (Apache-2.0). NO reemplaza OMEGA V6/V7.
 * Scaffold: estructura de entrada/feature + fit predict, sin datos de modelo entrenado.
 * Regla audit: solo se promociona si supera OMEGA en walk-forward OOS consistente.
 */
import { calibrateConfidence } from "@/lib/verificacion/calibration"

export interface ChallengerConfig {
  modelName: "xgboost-challenger";
  frozen: true; // no se toca en producción sin evidencia
  version: "0.0-scaffold";
}

export const CHALLENGER: ChallengerConfig = {
  modelName: "xgboost-challenger",
  frozen: true,
  version: "0.0-scaffold",
};

export function challengerPredict(isPoceada: boolean): { score: number; calibrated?: number } {
  // Scaffold: no hay modelo entrenado aún. Si se entrena, debe usar SAME LOTBA input que V6.
  // calibrated usa la OOS real (no inventada).
  return { score: 0, calibrated: calibrateConfidence(isPoceada) };
}
