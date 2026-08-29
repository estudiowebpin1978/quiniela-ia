/**
 * API: Rendimiento del Algoritmo (Social Proof)
 *
 * Returns aggregated accuracy statistics from prediction_history
 * and factor_weight_history for public display.
 */

import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-client"
import logger from "@/lib/logger"

export const maxDuration = 30

interface DailyAccuracy {
  fecha: string
  total_predictions: number
  total_hits: number
  hit_rate: number
}

interface FactorPerformance {
  factor: string
  current_weight: number
  accuracy_7d: number
  trend: "up" | "down" | "stable"
}

interface RendimientoResponse {
  ok: boolean
  summary: {
    totalPredictions: number
    totalHits2: number
    hitRate2: number
    hitRate3: number
    hitRate4: number
    bestStreak: number
    currentStreak: number
    topTurno: string
    algorithmConfidence: number
  }
  dailyAccuracy: DailyAccuracy[]
  factorPerformance: FactorPerformance[]
  recentHits: {
    fecha: string
    turno: string
    numero: string
    puesto: number
  }[]
}

export async function GET() {
  const t0 = Date.now()
  const supabase = getSupabaseAdmin()

  if (!supabase) {
    return NextResponse.json({ ok: false, error: "DB unavailable" }, { status: 503 })
  }

  try {
    // 1. Get prediction history (last 30 days)
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 30)
    const cutoffStr = cutoff.toISOString().split("T")[0]

    const { data: history } = await supabase
      .from("prediction_history")
      .select("fecha, turno, total_aciertos, aciertos_2, aciertos_3, aciertos_4")
      .eq("verified", true)
      .gte("fecha", cutoffStr)
      .order("fecha", { ascending: false })
      .limit(500)

    const rows = Array.isArray(history) ? history : []

    // 2. Aggregate stats
    let totalHits2 = 0, totalHits3 = 0, totalHits4 = 0
    let currentStreak = 0, bestStreak = 0, tempStreak = 0
    const byTurno: Record<string, { preds: number; hits: number }> = {}

    for (const row of rows) {
      const h2 = Array.isArray(row.aciertos_2) ? row.aciertos_2.length : 0
      const h3 = Array.isArray(row.aciertos_3) ? row.aciertos_3.length : 0
      const h4 = Array.isArray(row.aciertos_4) ? row.aciertos_4.length : 0
      const total = h2 + h3 + h4

      totalHits2 += h2
      totalHits3 += h3
      totalHits4 += h4

      if (total > 0) {
        tempStreak++
        bestStreak = Math.max(bestStreak, tempStreak)
      } else {
        tempStreak = 0
      }

      const t = row.turno || "unknown"
      if (!byTurno[t]) byTurno[t] = { preds: 0, hits: 0 }
      byTurno[t].preds++
      byTurno[t].hits += total
    }
    currentStreak = tempStreak

    const topTurno = Object.entries(byTurno)
      .sort((a, b) => (b[1].hits / Math.max(b[1].preds, 1)) - (a[1].hits / Math.max(a[1].preds, 1)))[0]?.[0] || "Primera"

    // 3. Daily accuracy (last 14 days for chart)
    const dailyMap: Record<string, { preds: number; hits: number }> = {}
    for (const row of rows) {
      if (!dailyMap[row.fecha]) dailyMap[row.fecha] = { preds: 0, hits: 0 }
      dailyMap[row.fecha].preds++
      dailyMap[row.fecha].hits += row.total_aciertos || 0
    }

    const dailyAccuracy: DailyAccuracy[] = Object.entries(dailyMap)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 14)
      .map(([fecha, d]) => ({
        fecha,
        total_predictions: d.preds,
        total_hits: d.hits,
        hit_rate: d.preds > 0 ? Math.round((d.hits / d.preds) * 100) : 0,
      }))

    // 4. Factor performance from factor_weight_history
    const { data: weightHistory } = await supabase
      .from("factor_weight_history")
      .select("turno, evaluation_date, w_calor, w_demora, w_bayesian, w_entropy, w_survival, hit_rate")
      .order("evaluation_date", { ascending: false })
      .limit(60)

    const factorPerformance: FactorPerformance[] = []
    const factors = ["calor", "demora", "bayesian", "entropy", "survival"]
    const weights = Array.isArray(weightHistory) ? weightHistory : []

    for (const factor of factors) {
      const recent = weights.slice(0, 10)
      const older = weights.slice(10, 20)

      const getWeight = (w: Record<string, unknown>, f: string): number => Number(w[`w_${f}`]) || 0

      const recentAvg = recent.length > 0
        ? recent.reduce((sum, w) => sum + getWeight(w, factor), 0) / recent.length
        : 0
      const olderAvg = older.length > 0
        ? older.reduce((sum, w) => sum + getWeight(w, factor), 0) / older.length
        : recentAvg

      const trend = recentAvg > olderAvg * 1.05 ? "up" : recentAvg < olderAvg * 0.95 ? "down" : "stable"

      factorPerformance.push({
        factor,
        current_weight: Math.round(recentAvg * 100) / 100,
        accuracy_7d: recent.length > 0
          ? Math.round((recent.reduce((sum, w) => sum + (Number((w as Record<string, unknown>).hit_rate) || 0), 0) / recent.length) * 100)
          : 0,
        trend,
      })
    }

    // 5. Recent hits (last 5 verified predictions with hits)
    const recentHits: RendimientoResponse["recentHits"] = []
    for (const row of rows.slice(0, 50)) {
      if ((row.total_aciertos || 0) > 0 && Array.isArray(row.aciertos_2)) {
        for (const hit of row.aciertos_2.slice(0, 2)) {
          recentHits.push({
            fecha: row.fecha,
            turno: row.turno,
            numero: hit.numero || "",
            puesto: hit.puesto || 0,
          })
        }
      }
      if (recentHits.length >= 10) break
    }

    // 6. Algorithm confidence (average hit rate * calibration factor)
    const totalPreds = rows.length
    const totalHits = totalHits2 + totalHits3 + totalHits4
    const algorithmConfidence = totalPreds > 0
      ? Math.min(95, Math.round(50 + (totalHits / totalPreds) * 45))
      : 50

    const response: RendimientoResponse = {
      ok: true,
      summary: {
        totalPredictions: totalPreds,
        totalHits2,
        hitRate2: totalPreds > 0 ? Math.round((totalHits2 / totalPreds) * 100) : 0,
        hitRate3: totalPreds > 0 ? Math.round((totalHits3 / totalPreds) * 100) : 0,
        hitRate4: totalPreds > 0 ? Math.round((totalHits4 / totalPreds) * 100) : 0,
        bestStreak,
        currentStreak,
        topTurno,
        algorithmConfidence,
      },
      dailyAccuracy,
      factorPerformance,
      recentHits,
    }

    return NextResponse.json(response, {
      headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1800" },
    })
  } catch (e) {
    logger.error("rendimiento: error", { error: e instanceof Error ? e.message : String(e) })
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 })
  }
}
