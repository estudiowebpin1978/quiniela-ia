/**
 * Calibración de confianza — delega a la calibración OOS REAL.
 *
 * La calibración con datos reales vive en `lib/probability/calibration.ts`
 * (walk-forward OOS, scripts/oos-eval.ts, corrida 2026-09-25):
 *   - Quiniela: pWin .87 · confidencePct 87 · n=1314 sorteos OOS
 *   - Poceada:  pWin .01 · confidencePct 1  · n=427 sorteos OOS
 *
 * NO se inventan coeficientes aquí. Si algún día se quiere calibrar a nivel
 * score individual (en vez de a nivel juego), se requiere histórico por-score
 * con outcomes reales; eso aún no existe y cualquier número sería inventado.
 */
import { getCalibration } from "@/lib/probability/calibration"

/**
 * Devuelve la confianza calibrada (0-100) según OOS para el juego dado.
 * Es la misma fuente que usa `cron-scrape` al persistir `p_confidence`
 * en `engine_predictions`.
 */
export function calibrateConfidence(isPoceada: boolean): number {
  return getCalibration(isPoceada).confidencePct
}

/**
 * Consistencia del modelo (0-1) — NO es probabilidad de acierto.
 * Expuesta solo con `confidence_type: "model_consistency"` para no
 * presentarla como probabilidad al usuario.
 */
export function modelConsistencyLabel(): string {
  return "model_consistency"
}
