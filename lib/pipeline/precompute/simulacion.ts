/**
 * Capa de simulación del precompute: Monte Carlo sembrado (bootstrap con
 * reemplazo) sobre el histórico del turno, usado como capa de estabilidad del
 * top-10. Determinista por día+turno (nunca Math.random).
 *
 * Extraído de app/api/cron-precompute/route.ts.
 */

import { runMonteCarlo } from "@/lib/analisis/monte-carlo"
import type { MonteCarloResultado } from "@/lib/analisis/monte-carlo"
import { hashSeed } from "@/lib/math/seeded-rng"
import logger from "@/lib/logger"

/**
 * Monte Carlo del top-10 con semilla `hashSeed("mc", hoy, turno)`.
 * No toca scores ni ranking y NUNCA lanza: si falla devuelve null
 * (misma semántica que el bloque try/catch inline original).
 */
export function simularTop10(
  draws: Array<{ numbers: number[] }>,
  top10nums: number[],
  today: string,
  turno: string,
): MonteCarloResultado | null {
  try {
    return runMonteCarlo(draws, top10nums, hashSeed("mc", today, turno))
  } catch (e) {
    logger.warn("[cron-precompute] Monte Carlo failed", { turno, error: String(e) })
    return null
  }
}
