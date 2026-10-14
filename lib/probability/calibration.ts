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
 *   - Poceada pWin(≥5): .014 (se≈.006; azar de la corrida .0104) · E[hits@8]: 1.59
 * Baseline aleatoria: quiniela P(≥1)=0.9049 (hipergeométrica EXACTA),
 * E[hits@10]=1.83 · Poceada E[hits@8]=1.60.
 *   - Poceada P(≥5): esta corrida imprimió .0104 = binomTail(8, p=.2),
 *     una BINOMIAL con reemplazo (aprox. que sobreestima la cola; el
 *     comentario original la rotulaba mal como "hipergeométrica"). El sorteo
 *     oficial es sin reemplazo (20 números distintos de 100) → la exacta
 *     (hipergeométrica N=100, D=20, K=8) es .007537; oos-eval.ts quedó
 *     corregido a hyperTail(5, topN, 20) desde 2026-10-13.
 *
 * Veredicto OOS: ningún modelo supera al azar de forma significativa
 * (|z| ≤ 1.8). Estas constantes documentan el desempeño REAL esperado del
 * pronóstico servido — no promesas de ventaja sobre el azar.
 *
 * Reglas de ganar del app (verificación "Si hubieras jugado" — fuente:
 * `lib/verificacion/criterio.ts`, alineada con la RPC
 * `verify_predictions_for_draw`):
 *   - Quiniela: WON = la CABEZA (1er número mod 100) ∈ tus 2-cifras;
 *     NEAR_MISS = cabeza ±1. Azar exacto con top-10 = 10/100 = 0.10.
 *   - Poceada:  WON = ≥5 aciertos en top-8 → azar exacto 0.007537.
 *
 * ⚠ Corrección de semántica (2026-10-13): durante la corrida OOS de
 * 2026-09-25 la regla de WON de la quiniela era la VIEJA (≥1 acierto en
 * top-10) y `pWin`/`confidencePct` miden ESA regla histórica
 * (P(≥1) = .873; azar .9049). La regla actual (cabeza ∈ top-10) tiene azar
 * 0.10; su pWin del modelo NO está medido aquí y no se inventa. El único
 * consumidor de `confidencePct` es `engine_predictions.p_confidence`
 * (cron-scrape): un número persistido, NO se muestra en la UI como
 * probabilidad de ganar.
 */

export interface GameCalibration {
  /**
   * P(≥1 acierto en top-N) medida OOS en la corrida 2026-09-25 (regla de WON
   * de ENTTONCES: "≥1 acierto"). NO es la regla actual de WON de quiniela
   * (cabeza ∈ top-10) — ver docblock. No se usa como probabilidad servida.
   */
  pWin: number
  /** P(≥1 acierto en top-N) (0-1) */
  pAnyHit: number
  /** Aciertos esperados en top-N */
  expectedHits: number
  /** Margen de error estimado (desvío estándar OOS de pWin entre cortes/turnos) */
  margin: number
  /**
   * pWin en escala 0-100. Se persiste como `engine_predictions.p_confidence`
   * (cron-scrape); NO es lo que la UI muestra como "Confianza" (ese valor
   * viene del score del blend × 100 en /api/predictions).
   */
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
