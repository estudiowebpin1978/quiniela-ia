/**
 * Pre-calculated draw statistics from materialized views.
 *
 * Instead of scanning 1000+ draws on every prediction request,
 * the engine reads pre-computed stats from materialized views.
 * These views refresh automatically when new draws are inserted.
 */

import { getSupabaseAdmin } from "@/lib/supabase-client"
import logger from "@/lib/logger"

export interface DrawStat {
  num: number
  global_freq: number
  freq_7: number
  freq_30: number
  freq_90: number
  last_seen_rank: number
  avg_gap: number
  total_draws: number
}

export interface MarkovTransition {
  from_num: number
  to_num: number
  transition_count: number
}

export interface Cooccurrence {
  num_a: number
  num_b: number
  cooccurrence_count: number
}

export interface PrecomputedStats {
  turno: string
  total_draws: number
  drawStats: DrawStat[]
  markov: MarkovTransition[]
  cooccurrences: Cooccurrence[]
  computedAt: string
  // Index maps for O(1) lookup
  _drawStatsMap?: Map<number, DrawStat>
  _markovByFrom?: Map<number, MarkovTransition[]>
  _cooccurrenceMap?: Map<string, Cooccurrence>
}

const statsCache = new Map<string, PrecomputedStats>()
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Load pre-calculated stats from materialized views.
 * Falls back to raw draws if views are not yet populated.
 */
export async function loadPrecomputedStats(turno: string): Promise<PrecomputedStats | null> {
  // Check cache
  const cached = statsCache.get(turno)
  if (cached) {
    const age = Date.now() - new Date(cached.computedAt).getTime()
    if (age < CACHE_TTL_MS) return cached
    statsCache.delete(turno)
  }

  try {
    const supabase = getSupabaseAdmin()

    // Load all three materialized views in parallel
    const [drawStatsResult, markovResult, cooccurResult] = await Promise.all([
      supabase.rpc("get_draw_stats" as never, { p_turno: turno } as never),
      supabase.rpc("get_markov_transitions" as never, { p_turno: turno } as never),
      supabase.rpc("get_cooccurrences" as never, { p_turno: turno } as never),
    ])

    if (drawStatsResult.error || !drawStatsResult.data) {
      return null
    }

    const drawStats: DrawStat[] = (drawStatsResult.data as unknown[]).map((row: unknown) => {
      const r = row as Record<string, unknown>
      return {
        num: r.num as number,
        global_freq: r.global_freq as number,
        freq_7: r.freq_7 as number,
        freq_30: r.freq_30 as number,
        freq_90: r.freq_90 as number,
        last_seen_rank: r.last_seen_rank as number,
        avg_gap: r.avg_gap as number,
        total_draws: r.total_draws as number,
      }
    })

    const markov: MarkovTransition[] = (markovResult.data || []).map((row: unknown) => {
      const r = row as Record<string, unknown>
      return {
        from_num: r.from_num as number,
        to_num: r.to_num as number,
        transition_count: r.transition_count as number,
      }
    })

    const cooccurrences: Cooccurrence[] = (cooccurResult.data || []).map((row: unknown) => {
      const r = row as Record<string, unknown>
      return {
        num_a: r.num_a as number,
        num_b: r.num_b as number,
        cooccurrence_count: r.cooccurrence_count as number,
      }
    })

    const total_draws = drawStats.length > 0 ? drawStats[0].total_draws : 0

    const stats: PrecomputedStats = {
      turno,
      total_draws,
      drawStats,
      markov,
      cooccurrences,
      computedAt: new Date().toISOString(),
    }

    // Build index maps for O(1) lookup
    stats._drawStatsMap = new Map(drawStats.map(ds => [ds.num, ds]))
    stats._markovByFrom = new Map()
    for (const m of markov) {
      const arr = stats._markovByFrom.get(m.from_num) || []
      arr.push(m)
      stats._markovByFrom.set(m.from_num, arr)
    }
    stats._cooccurrenceMap = new Map()
    for (const c of cooccurrences) {
      stats._cooccurrenceMap.set(`${c.num_a}-${c.num_b}`, c)
      stats._cooccurrenceMap.set(`${c.num_b}-${c.num_a}`, c)
    }

    statsCache.set(turno, stats)
    return stats
  } catch (e) {
    logger.warn("[precomputed] Failed to load stats:", { error: String(e) })
    return null
  }
}

/**
 * Get frequency score for a number using pre-calculated stats.
 * Replaces the O(n) frequency scan in the V7 engine.
 */
export function getFrequencyScore(
  num: number,
  stats: PrecomputedStats,
  window: "all" | "90" | "30" | "7" = "all"
): number {
  const ds = stats._drawStatsMap?.get(num) || stats.drawStats.find((s) => s.num === num)
  if (!ds || ds.total_draws === 0) return 0

  switch (window) {
    case "7": return ds.freq_7 / Math.min(7, ds.total_draws)
    case "30": return ds.freq_30 / Math.min(30, ds.total_draws)
    case "90": return ds.freq_90 / Math.min(90, ds.total_draws)
    default: return ds.global_freq / ds.total_draws
  }
}

/**
 * Get recency score for a number (0 = just appeared, 1 = very overdue).
 * Replaces the O(n) recency scan in the V7 engine.
 */
export function getRecencyScore(num: number, stats: PrecomputedStats): number {
  const ds = stats._drawStatsMap?.get(num) || stats.drawStats.find((s) => s.num === num)
  if (!ds || ds.total_draws === 0) return 1
  return Math.min(ds.last_seen_rank / ds.total_draws, 1)
}

/**
 * Get Markov transition probability.
 * Replaces the O(n²) transition matrix build in the V7 engine.
 */
export function getMarkovScore(
  fromNum: number,
  toNum: number,
  stats: PrecomputedStats
): number {
  const relevant = stats._markovByFrom?.get(fromNum) || stats.markov.filter((m) => m.from_num === fromNum)
  if (relevant.length === 0) return 0

  const totalTransitions = relevant.reduce((sum, m) => sum + m.transition_count, 0)
  const specific = relevant.find((m) => m.to_num === toNum)

  return specific ? specific.transition_count / totalTransitions : 0
}

/**
 * Get co-occurrence score for a pair of numbers.
 * Replaces the O(n²) co-occurrence build in the V7 engine.
 */
export function getCooccurrenceScore(
  numA: number,
  numB: number,
  stats: PrecomputedStats
): number {
  const pair = stats._cooccurrenceMap?.get(`${numA}-${numB}`) ||
    stats.cooccurrences.find(
      (c) => (c.num_a === numA && c.num_b === numB) || (c.num_a === numB && c.num_b === numA)
    )
  if (!pair) return 0

  const ds = stats._drawStatsMap?.get(Math.min(numA, numB)) || stats.drawStats.find((s) => s.num === Math.min(numA, numB))
  const totalDraws = ds?.total_draws || 1
  return pair.cooccurrence_count / totalDraws
}

/**
 * Clear stats cache (called after new draw is inserted).
 */
export function clearStatsCache(turno?: string): void {
  if (turno) {
    statsCache.delete(turno)
  } else {
    statsCache.clear()
  }
}
