/**
 * Hot Number Penalty — Regression to the Mean
 *
 * Numbers that appeared VERY recently tend to have LOWER probability
 * of appearing again soon (mean reversion). This module computes a
 * penalty factor to be applied to prediction scores.
 *
 * Deterministic: pure math, no randomness.
 */

export interface HeatAnalysis {
  numero: string
  /** Draws since last appearance (0 = appeared in most recent draw) */
  gap: number
  /** Times appeared in last N draws */
  recentCount: number
  /** Penalty multiplier: <1 for hot, >1 for cold/overdue */
  penalty: number
  /** Human-readable label */
  label: "frío" | "tibio" | "caliente" | "muy caliente" | "atrásado"
}

const HEAT_WINDOW = 10 // consider last 10 draws for heat

/**
 * Compute heat penalty for all numbers.
 *
 * Rules:
 * - Appeared in last 1 draw:  penalty 0.82 (very hot → cool down)
 * - Appeared 2-3 draws ago:   penalty 0.90 (hot)
 * - Appeared 4-6 draws ago:   penalty 0.97 (slightly warm)
 * - Appeared 7-10 draws ago:  penalty 1.00 (neutral)
 * - Not seen in 10+ draws:    penalty 1.06 (overdue → slight boost)
 * - Not seen in 20+ draws:    penalty 1.10 (very overdue)
 *
 * @param draws - historical draws, each is array of numbers (most recent LAST)
 * @returns Map from number (0-99) to HeatAnalysis
 */
export function computeHeatPenalties(draws: number[][]): Map<number, HeatAnalysis> {
  const result = new Map<number, HeatAnalysis>()
  const totalDraws = draws.length

  // Find last appearance and recent counts for each number.
  // Iterate newest → oldest so the FIRST time a number is seen is its
  // most recent appearance (gap = draws since that appearance).
  const lastSeen = new Map<number, number>()
  const recentCounts = new Map<number, number>()
  for (let d = totalDraws - 1; d >= 0; d--) {
    const windowIdx = totalDraws - 1 - d // 0 = most recent
    for (const raw of draws[d]) {
      const n = ((raw % 100) + 100) % 100
      if (!lastSeen.has(n)) lastSeen.set(n, windowIdx) // distance from most recent
      if (windowIdx < HEAT_WINDOW) {
        recentCounts.set(n, (recentCounts.get(n) || 0) + 1)
      }
    }
  }

  for (let n = 0; n < 100; n++) {
    const gap = lastSeen.has(n) ? lastSeen.get(n)! : totalDraws
    const recentCount = recentCounts.get(n) || 0

    let penalty: number
    let label: HeatAnalysis["label"]

    if (gap === 0) {
      penalty = 0.82
      label = "muy caliente"
    } else if (gap <= 2) {
      penalty = 0.90
      label = "caliente"
    } else if (gap <= 5) {
      penalty = 0.97
      label = "tibio"
    } else if (gap <= 10) {
      penalty = 1.00
      label = "frío"
    } else if (gap <= 20) {
      penalty = 1.06
      label = "atrásado"
    } else {
      penalty = 1.10
      label = "atrásado"
    }

    result.set(n, {
      numero: String(n).padStart(2, "0"),
      gap,
      recentCount,
      penalty,
      label,
    })
  }

  return result
}

/**
 * Apply heat penalty to a score. Score should be in [0, 1].
 * Returns adjusted score, clamped to [0, 1].
 */
export function applyHeatPenalty(score: number, penalty: number): number {
  return Math.max(0, Math.min(1, score * penalty))
}
