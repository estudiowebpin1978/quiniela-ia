/**
 * Probabilidades calibradas con backtest OOS walk-forward (scripts/oos-eval.ts).
 *
 * Corrida de referencia: 2026-09-25, datos oficiales LOTBA limpios (repair
 * backfill-quiniela-oficial), heat-penalty corregido, loader con fecha
 * completo (factor ciclos-por-día-de-semana activo, engine-v7.ts refDow),
 * LOG_LEVEL=error.
 *   - Quiniela: 5 turnos, warmup=60, step=1 → n=1314 sorteos OOS
 *       (Previa 264, Primera 264, Matutina 262, Vespertina 261, Nocturna 263)
 *   - Poceada: warmup=60, step=2 → n=427 sorteos OOS
 *
 * Modelo de referencia = v7_ens (ensemble V7, proxy del blend servido
 * meta-ensemble V6+V7+ML):
 *   - Quiniela pWin: turnos .894/.864/.885/.862/.859 → media .873
 *   - Quiniela E[hits@10] media: 1.80 · sd(pWin entre turnos): .016
 *   - Poceada pWin(≥5): .014 (se≈.006; azar .0104) · E[hits@8]: 1.59
 * Baseline aleatoria: quiniela P(≥1)=0.905, E[hits@10]=1.83 · Poceada
 * P(≥5)=0.0104, E[hits@8]=1.60 (hipergeométrica).
 *
 * Veredicto OOS: ningún modelo supera al azar de forma significativa
 * (|z| ≤ 1.8). Estas constantes documentan el desempeño REAL esperado del
 * pronóstico servido — no promesas de ventaja sobre el azar.
 *
 * Reglas de ganar del app (verificación "Si hubieras jugado"):
 *   - Quiniela: WON = ≥1 acierto en top-10  → pWin = P(≥1)
 *   - Poceada:  WON = ≥5 aciertos en top-8  → pWin = P(≥5)
 */

export interface GameCalibration {
  /** P(ganar) según la regla de verificación del app (0-1) */
  pWin: number
  /** P(≥1 acierto en top-N) (0-1) */
  pAnyHit: number
  /** Aciertos esperados en top-N */
  expectedHits: number
  /** Margen de error estimado (desvío estándar OOS de pWin entre cortes/turnos) */
  margin: number
  /** pWin en escala 0-100 — lo que la UI muestra como "Confianza %" */
  confidencePct: number
  /** Cantidad de sorteos OOS usados en la medición */
  nOos: number
}

const QUINIELA: GameCalibration = {
  pWin: 0.87,
  pAnyHit: 0.87,
  expectedHits: 1.8,
  margin: 0.02,
  confidencePct: 87,
  nOos: 1314,
}

const POCEADA: GameCalibration = {
  pWin: 0.01,
  pAnyHit: 0.85,
  expectedHits: 1.59,
  margin: 0.006,
  confidencePct: 1,
  nOos: 427,
}

export function getCalibration(isPoceada: boolean): GameCalibration {
  return isPoceada ? POCEADA : QUINIELA
}

export function getCalibrationByGameId(gameId: string): GameCalibration {
  return getCalibration(gameId === "d0e1f2a3-b4c5-6789-0abc-def012345678")
}
