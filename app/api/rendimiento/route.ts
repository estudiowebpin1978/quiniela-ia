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
      .select("date, turno, total_aciertos, aciertos_2, aciertos_3, aciertos_4")
      .eq("verified", true)
      .gte("date", cutoffStr)
      .order("date", { ascending: false })
      .limit(500)

    const rows = Array.isArray(history) ? history : []

    // 2. Aggregate stats
    let totalHits2 = 0, totalHits3 = 0, totalHits4 = 0
    let predsHit2 = 0, predsHit3 = 0, predsHit4 = 0
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
      if (h2 > 0) predsHit2++
      if (h3 > 0) predsHit3++
      if (h4 > 0) predsHit4++

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
    const dailyMap: Record<string, { preds: number; hits: number; withHit: number }> = {}
    for (const row of rows) {
      const dia = row.date || ""
      if (!dailyMap[dia]) dailyMap[dia] = { preds: 0, hits: 0, withHit: 0 }
      dailyMap[dia].preds++
      dailyMap[dia].hits += row.total_aciertos || 0
      if ((row.total_aciertos || 0) > 0) dailyMap[dia].withHit++
    }

    const dailyAccuracy: DailyAccuracy[] = Object.entries(dailyMap)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 14)
      .map(([fecha, d]) => ({
        fecha,
        total_predictions: d.preds,
        total_hits: d.hits,
        hit_rate: d.preds > 0 ? Math.round((d.withHit / d.preds) * 100) : 0,
      }))

    // 4. Rendimiento por factor (V6) desde factor_weight_history
    //    Cada fila es la evaluación de un sorteo: factor_accuracies guarda
    //    ratios 0.1–2.0 por factor (1.0 = neutral). Se promedian a % (50 = neutral).
    const { data: weightHistory } = await supabase
      .from("factor_weight_history")
      .select("turno, evaluation_date, factor_accuracies")
      .order("evaluation_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(60)

    const weights = Array.isArray(weightHistory) ? weightHistory : []

    // Pesos vigentes del motor V6 (engine_config, promedio entre turnos)
    const { data: cfgRows } = await supabase
      .from("engine_config")
      .select("w_frequency, w_hot, w_cold, w_gap, w_trend, w_markov, w_pattern, w_positional, w_cooccurrence, w_bayesian")

    const cfg = Array.isArray(cfgRows) ? cfgRows : []
    const currentWeightOf = (factor: string): number => {
      const vals = cfg
        .map((r) => Number((r as Record<string, unknown>)[`w_${factor}`]))
        .filter((v) => Number.isFinite(v) && v > 0)
      if (!vals.length) return 0
      return Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 100) / 100
    }

    const factorPerformance: FactorPerformance[] = []
    // Sin historial de evaluaciones no hay métricas por factor (la sección se oculta en el front)
    if (weights.length > 0) {
      // Presencia de factores en el historial (orden canónico V6 + extras)
      const present = new Set<string>()
      for (const w of weights) {
        const fa = (w as Record<string, unknown>).factor_accuracies as Record<string, number> | null
        if (fa && typeof fa === "object") Object.keys(fa).forEach((k) => present.add(k))
      }
      const canonical = ["frequency", "hot", "cold", "gap", "trend", "markov", "pattern", "positional", "cooccurrence", "bayesian"]
      const factors = [
        ...canonical.filter((f) => present.has(f)),
        ...[...present].filter((f) => !canonical.includes(f)).sort(),
      ]

      // Ratio 0.1–2.0 (1 = neutral) → % (50 = neutral)
      const accPct = (w: Record<string, unknown>, f: string): number | null => {
        const fa = w.factor_accuracies as Record<string, number> | null
        const r = fa ? Number(fa[f]) : NaN
        if (!Number.isFinite(r) || r <= 0) return null
        return Math.round((Math.min(2, Math.max(0.1, r)) / 2) * 100)
      }
      const avg = (vals: number[]): number | null =>
        vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : null

      for (const factor of factors) {
        const recentVals: number[] = []
        const olderVals: number[] = []
        weights.forEach((w, i) => {
          const v = accPct(w as Record<string, unknown>, factor)
          if (v === null) return
          if (i < 10) recentVals.push(v)
          else if (i < 20) olderVals.push(v)
        })

        const recentAvg = avg(recentVals) ?? 0
        const olderAvg = avg(olderVals)
        const diff = olderAvg !== null ? recentAvg - olderAvg : 0
        const trend: FactorPerformance["trend"] =
          olderAvg === null ? "stable" : diff >= 2 ? "up" : diff <= -2 ? "down" : "stable"

        factorPerformance.push({
          factor,
          current_weight: currentWeightOf(factor),
          accuracy_7d: Math.round(recentAvg),
          trend,
        })
      }
    }

    // 5. Recent hits (last 5 verified predictions with hits)
    const recentHits: RendimientoResponse["recentHits"] = []
    for (const row of rows.slice(0, 50)) {
      if ((row.total_aciertos || 0) > 0 && Array.isArray(row.aciertos_2)) {
        for (const hit of row.aciertos_2.slice(0, 2)) {
          recentHits.push({
            fecha: row.date,
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
        hitRate2: totalPreds > 0 ? Math.round((predsHit2 / totalPreds) * 100) : 0,
        hitRate3: totalPreds > 0 ? Math.round((predsHit3 / totalPreds) * 100) : 0,
        hitRate4: totalPreds > 0 ? Math.round((predsHit4 / totalPreds) * 100) : 0,
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
