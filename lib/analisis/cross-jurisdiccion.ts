/**
 * Cross-Jurisdiccion Analysis
 *
 * Detects migration patterns between Lotería Nacional and Lotería de Provincia.
 * Theory: Numbers that appear in Provincia (Primera/Nocturna) sometimes "migrate"
 * to Nacional (Previa/Matutina/Vespertina) in subsequent draws.
 *
 * This module provides a TypeScript-side analysis that complements the SQL function
 * factor_cross_jurisdiccion().
 */

import { getSupabaseAdmin } from "@/lib/supabase-client"
import logger from "@/lib/logger"

const TURNOS_NACIONAL = ["Previa", "Matutina", "Vespertina"]
const TURNOS_PROVINCIA = ["Primera", "Nocturna"]

const ALL_TURNOS = [...TURNOS_NACIONAL, ...TURNOS_PROVINCIA]

interface DrawRow {
  date: string
  turno: string
  numbers: number[]
  jurisdiccion: string
}

interface CrossJurisdiccionResult {
  /** Numbers that appeared in the opposite jurisdiction recently */
  migratedNumbers: Map<number, { count: number; lastSeen: string; source: string }>
  /** Score per number (0-100) based on cross-jurisdiction migration */
  scores: Record<number, number>
  /** Which jurisdiction we're predicting for */
  targetJurisdiccion: string
  /** Recent numbers from the opposite jurisdiction */
  recentOpposite: number[]
}

function getJurisdiccion(turno: string): string {
  return TURNOS_PROVINCIA.includes(turno) ? "provincia" : "nacional"
}

function getOppositeJurisdiccion(jurisdiccion: string): string {
  return jurisdiccion === "nacional" ? "provincia" : "nacional"
}

/**
 * Analyze cross-jurisdiction migration patterns.
 * Looks at last N draws from the opposite jurisdiction to find numbers
 * that might "migrate" to the target jurisdiction.
 */
export async function analyzeCrossJurisdiccion(
  turno: string,
  daysBack: number = 7
): Promise<CrossJurisdiccionResult> {
  const supabase = getSupabaseAdmin()
  const targetJurisdiccion = getJurisdiccion(turno)
  const oppositeJurisdiccion = getOppositeJurisdiccion(targetJurisdiccion)

  const result: CrossJurisdiccionResult = {
    migratedNumbers: new Map(),
    scores: {},
    targetJurisdiccion,
    recentOpposite: [],
  }

  if (!supabase) return result

  try {
    // Get recent draws from both jurisdictions
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - daysBack)
    const cutoffStr = cutoffDate.toISOString().split("T")[0]

    const { data: draws } = await supabase
      .from("draws")
      .select("date, turno, numbers, jurisdiccion")
      .gte("date", cutoffStr)
      .order("date", { ascending: false })
      .limit(200)

    if (!draws || draws.length === 0) return result

    const typedDraws: DrawRow[] = draws.filter(
      (d: DrawRow) => Array.isArray(d.numbers) && d.numbers.length >= 5
    )

    // Separate by jurisdiction
    const oppositeDraws = typedDraws.filter(d => d.jurisdiccion === oppositeJurisdiccion)
    const sameDraws = typedDraws.filter(d => d.jurisdiccion === targetJurisdiccion)

    // Count frequency in opposite jurisdiction (last 15 draws)
    const oppositeFreq = new Map<number, { count: number; lastSeen: string }>()
    for (const draw of oppositeDraws.slice(0, 15)) {
      for (const num of draw.numbers) {
        const n = num % 100
        const existing = oppositeFreq.get(n)
        if (!existing || draw.date > existing.lastSeen) {
          oppositeFreq.set(n, {
            count: (existing?.count || 0) + 1,
            lastSeen: draw.date,
          })
        }
      }
    }

    // Collect recent opposite numbers for display
    const recentOppositeNums: number[] = []
    for (const draw of oppositeDraws.slice(0, 3)) {
      for (const num of draw.numbers.slice(0, 5)) {
        recentOppositeNums.push(num % 100)
      }
    }
    result.recentOpposite = [...new Set(recentOppositeNums)]

    // Count frequency in same jurisdiction for baseline
    const sameFreq = new Map<number, number>()
    for (const draw of sameDraws.slice(0, 100)) {
      for (const num of draw.numbers) {
        const n = num % 100
        sameFreq.set(n, (sameFreq.get(n) || 0) + 1)
      }
    }

    // Calculate migration scores
    const maxOppositeCount = Math.max(...Array.from(oppositeFreq.values()).map(v => v.count), 1)

    for (const [num, data] of oppositeFreq) {
      if (data.count < 2) continue // minimum threshold

      const oppositeScore = data.count / maxOppositeCount
      const sameCount = sameFreq.get(num) || 0
      const sameBaseline = sameCount / Math.max(sameDraws.length, 1)

      // Migration score: how much more likely this number appears in opposite jurisdiction
      // compared to its baseline in the target jurisdiction
      const migrationBoost = oppositeScore * (1 + sameBaseline * 0.5)

      const score = Math.min(100, migrationBoost * 50)
      result.scores[num] = Math.round(score * 100) / 100

      result.migratedNumbers.set(num, {
        count: data.count,
        lastSeen: data.lastSeen,
        source: oppositeJurisdiccion,
      })
    }

    logger.info("cross-jurisdiccion: analysis complete", {
      turno,
      targetJurisdiccion,
      oppositeJurisdiccion,
      oppositeDraws: oppositeDraws.length,
      sameDraws: sameDraws.length,
      migratedCount: result.migratedNumbers.size,
      topMigrated: Array.from(result.migratedNumbers.entries())
        .sort((a, b) => (result.scores[b[0]] || 0) - (result.scores[a[0]] || 0))
        .slice(0, 5)
        .map(([n, d]) => ({ num: n, count: d.count, score: result.scores[n] })),
    })

    return result
  } catch (e) {
    logger.error("cross-jurisdiccion: analysis failed", {
      turno,
      error: e instanceof Error ? e.message : String(e),
    })
    return result
  }
}

/**
 * Get a quick summary of cross-jurisdiction patterns for display.
 */
export async function getCrossJurisdiccionSummary(
  turno: string
): Promise<{
  hasMigration: boolean
  topMigrated: { num: number; count: number; score: number }[]
  oppositeJurisdiccion: string
}> {
  const result = await analyzeCrossJurisdiccion(turno)

  const topMigrated = Array.from(result.migratedNumbers.entries())
    .sort((a, b) => (result.scores[b[0]] || 0) - (result.scores[a[0]] || 0))
    .slice(0, 5)
    .map(([num, data]) => ({
      num,
      count: data.count,
      score: result.scores[num] || 0,
    }))

  return {
    hasMigration: topMigrated.length > 0,
    topMigrated,
    oppositeJurisdiccion: getOppositeJurisdiccion(result.targetJurisdiccion),
  }
}
