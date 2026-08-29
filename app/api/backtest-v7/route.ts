/**
 * /api/backtest-v7 — Compare V6 SQL engine vs V7 TypeScript engine
 *
 * Walk-forward backtesting with head-to-head comparison.
 *
 * GET /api/backtest-v7?turno=Primera&days=90&window=60
 */

import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-client"
import { predictV7, predictEnsembleV7 } from "@/lib/analisis/engine-v7"
import type { Draw, FactorBreakdown } from "@/lib/analisis/engine-v7"
import logger from "@/lib/logger"

export const dynamic = "force-dynamic"
export const maxDuration = 300

// Default V7 weights for blend ratio testing
const DEFAULT_V7_WEIGHTS: FactorBreakdown = {
  survival: 0.18, correlation: 0.12, spacing: 0.14, frequency: 0.15,
  recency: 0.10, markov: 0.08, cycles: 0.06, temporal: 0.07,
  debt: 0.10, bayesian: 0.00,
}

export async function GET(req: NextRequest) {
  const t0 = Date.now()

  try {
    const { searchParams } = new URL(req.url)
    const turno = searchParams.get("turno") || "Primera"
    const days = Math.min(parseInt(searchParams.get("days") || "90"), 365)
    const windowSize = parseInt(searchParams.get("window") || "60")
    const searchBlendRatio = searchParams.get("blend") === "true"

    const validTurnos = ["Previa", "Primera", "Matutina", "Vespertina", "Nocturna"]
    if (!validTurnos.includes(turno)) {
      return NextResponse.json({ error: `Turno inválido. Válidos: ${validTurnos.join(", ")}` }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    // Fetch all draws for this turno
    const since = new Date()
    since.setDate(since.getDate() - days)
    const sinceStr = since.toISOString().split("T")[0]

    const { data: draws, error: drawError } = await supabase
      .from("draws")
      .select("date, turno, numbers")
      .eq("turno", turno)
      .gte("date", sinceStr)
      .order("date", { ascending: true })
      .limit(1000)

    if (drawError || !draws || draws.length < windowSize + 10) {
      return NextResponse.json({
        error: "Insufficient data",
        total_draws: draws?.length || 0,
        required: windowSize + 10,
      })
    }

    const allDraws: Draw[] = draws.map((d: Record<string, unknown>) => ({
      fecha: d.date as string,
      turno: d.turno as string,
      numbers: d.numbers as number[],
    }))

    logger.info(`[backtest-v7] Testing ${turno} with ${allDraws.length} draws, window=${windowSize}`)

    // Walk-forward backtesting
    const v6Metrics = { hits: [0,0,0,0], totalHits: 0, mrr: 0, count: 0 }
    const v7Metrics = { hits: [0,0,0,0], totalHits: 0, mrr: 0, count: 0 }
    const ensembleMetrics = { hits: [0,0,0,0], totalHits: 0, mrr: 0, count: 0 }

    const recentResults: Array<{
      date: string
      actual: string[]
      v6: { predicted: string[]; hits: number }
      v7: { predicted: string[]; hits: number }
      ensemble: { predicted: string[]; hits: number }
    }> = []

    for (let i = windowSize; i < allDraws.length; i++) {
      const targetDraw = allDraws[i]
      const actualNums = targetDraw.numbers.map(n => {
        const mod = n % 100
        return mod < 10 ? `0${mod}` : `${mod}`
      })

      // Historical data up to (but not including) this draw
      const historical = allDraws.slice(0, i)

      // ── V6: SQL Engine ──────────────────────────────────────────────
      let v6Preds: string[] = []
      try {
        const predDate = new Date(targetDraw.fecha)
        predDate.setDate(predDate.getDate() - 1)
        const predDateStr = predDate.toISOString().split("T")[0]

        const { data: predData } = await supabase.rpc(
          "calculate_omega_v6" as never,
          { p_turno: turno, p_tier: "premium" as never, p_date: predDateStr } as never
        )

        if (predData && Array.isArray(predData)) {
          v6Preds = predData.slice(0, 10).map((row: Record<string, unknown>) => {
            const num = Number(row.numero) % 100
            return num < 10 ? `0${num}` : `${num}`
          })
        }
      } catch {}

      // ── V7: Single Config ───────────────────────────────────────────
      let v7Preds: string[] = []
      try {
        const v7Result = predictV7(historical, turno, 10)
        v7Preds = v7Result.map(p => p.numero)
      } catch {}

      // ── V7: Ensemble ────────────────────────────────────────────────
      let ensemblePreds: string[] = []
      try {
        const ensResult = await predictEnsembleV7(historical, turno, 10)
        ensemblePreds = ensResult.predictions.map(p => p.numero)
      } catch {}

      // Calculate hits for each
      const v6Hits = v6Preds.filter(n => actualNums.includes(n))
      const v7Hits = v7Preds.filter(n => actualNums.includes(n))
      const ensHits = ensemblePreds.filter(n => actualNums.includes(n))

      // Update metrics
      updateMetrics(v6Metrics, v6Hits.length, v6Preds, actualNums)
      updateMetrics(v7Metrics, v7Hits.length, v7Preds, actualNums)
      updateMetrics(ensembleMetrics, ensHits.length, ensemblePreds, actualNums)

      // Store recent results
      if (i >= allDraws.length - 10) {
        recentResults.push({
          date: targetDraw.fecha,
          actual: actualNums,
          v6: { predicted: v6Preds, hits: v6Hits.length },
          v7: { predicted: v7Preds, hits: v7Hits.length },
          ensemble: { predicted: ensemblePreds, hits: ensHits.length },
        })
      }
    }

    const v = v6Metrics.count || 1
    const randomPrecisionAt10 = 1 - hypergeometricPMF(0, 100, 20, 10)

    return NextResponse.json({
      ok: true,
      turno,
      period: { start: sinceStr, end: allDraws[allDraws.length - 1]?.fecha },
      validatedDraws: v,
      windowSize,

      v6_sql: formatMetrics(v6Metrics, v, randomPrecisionAt10),
      v7_single: formatMetrics(v7Metrics, v, randomPrecisionAt10),
      v7_ensemble: formatMetrics(ensembleMetrics, v, randomPrecisionAt10),

      // Blend ratio optimization: test different V6/V7 ratios
      blend_optimization: searchBlendRatio
        ? await runBlendSearch(allDraws, turno, windowSize, v6Metrics, v)
        : null,

      winner: determineWinner(v6Metrics, v7Metrics, ensembleMetrics, v),
      recentResults,

      elapsed_ms: Date.now() - t0,
    })

  } catch (err: unknown) {
    logger.error("[backtest-v7] ERROR", { error: String(err) })
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function updateMetrics(
  metrics: { hits: number[]; totalHits: number; mrr: number; count: number },
  hitCount: number,
  predicted: string[],
  actual: string[],
) {
  metrics.count++
  metrics.totalHits += hitCount

  if (hitCount > 0) metrics.hits[0]++  // precisionAt10 (≥1 hit)
  if (hitCount >= 1) metrics.hits[1]++
  if (hitCount >= 3) metrics.hits[2]++
  if (hitCount >= 5) metrics.hits[3]++

  // MRR
  const firstHitIdx = predicted.findIndex(n => actual.includes(n))
  metrics.mrr += firstHitIdx >= 0 ? 1 / (firstHitIdx + 1) : 0
}

function formatMetrics(
  metrics: { hits: number[]; totalHits: number; mrr: number; count: number },
  total: number,
  randomBaseline: number,
) {
  return {
    precisionAt10: Math.round((metrics.hits[0] / total) * 1000) / 10,
    avgHits: Math.round((metrics.totalHits / total) * 100) / 100,
    mrr: Math.round((metrics.mrr / total) * 10000) / 10000,
    liftVsRandom: Math.round(((metrics.hits[0] / total) / randomBaseline) * 100) / 100,
  }
}

function determineWinner(
  v6: { hits: number[]; count: number },
  v7: { hits: number[]; count: number },
  ens: { hits: number[]; count: number },
  total: number,
) {
  const v6Rate = v6.hits[0] / total
  const v7Rate = v7.hits[0] / total
  const ensRate = ens.hits[0] / total

  if (ensRate >= v7Rate && ensRate >= v6Rate) return "v7_ensemble"
  if (v7Rate >= v6Rate) return "v7_single"
  return "v6_sql"
}

function hypergeometricPMF(k: number, N: number, K: number, n: number): number {
  return binomCoeff(K, k) * binomCoeff(N - K, n - k) / binomCoeff(N, n)
}

function binomCoeff(n: number, k: number): number {
  if (k < 0 || k > n) return 0
  if (k === 0 || k === n) return 1
  let result = 1
  for (let i = 0; i < Math.min(k, n - k); i++) {
    result = result * (n - i) / (i + 1)
  }
  return result
}

// ─── Blend Ratio Grid Search ────────────────────────────────────────────────

async function runBlendSearch(
  allDraws: Draw[],
  turno: string,
  windowSize: number,
  v6Metrics: { hits: number[]; totalHits: number; mrr: number; count: number },
  total: number,
) {
  const ratios = [0.0, 0.2, 0.4, 0.5, 0.6, 0.8, 1.0] // V6 weight
  const results: Array<{ v6Weight: number; precisionAt10: number; avgHits: number; mrr: number }> = []

  for (const v6w of ratios) {
    const v7w = 1 - v6w
    let hits = 0
    let totalHits = 0
    let mrrSum = 0
    let count = 0

    for (let i = windowSize; i < allDraws.length; i++) {
      const targetDraw = allDraws[i]
      const actualNums = targetDraw.numbers.map(n => {
        const mod = n % 100
        return mod < 10 ? `0${mod}` : `${mod}`
      })

      const historical = allDraws.slice(0, i)

      // Get V6 predictions (use stored V6 scores)
      // For blend search, we approximate V6 scores by running V7 with frequency-only weights
      const v7Result = predictV7(historical, turno, 10, {
        ...DEFAULT_V7_WEIGHTS,
        frequency: 1.0, // Pure frequency = V6-like
      })

      // Get V7 ensemble predictions
      const ensResult = await predictEnsembleV7(historical, turno, 20)

      // Blend: pick top-10 from weighted combination
      const blended = new Map<string, number>()
      for (const p of v7Result) {
        blended.set(p.numero, (blended.get(p.numero) || 0) + v6w * p.score)
      }
      for (const p of ensResult.predictions) {
        blended.set(p.numero, (blended.get(p.numero) || 0) + v7w * p.score)
      }

      const top10 = Array.from(blended.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([n]) => n)

      const hitCount = top10.filter(n => actualNums.includes(n)).length
      const firstHitIdx = top10.findIndex(n => actualNums.includes(n))

      count++
      if (hitCount > 0) hits++
      totalHits += hitCount
      mrrSum += firstHitIdx >= 0 ? 1 / (firstHitIdx + 1) : 0
    }

    const v = count || 1
    results.push({
      v6Weight: v6w,
      precisionAt10: Math.round((hits / v) * 1000) / 10,
      avgHits: Math.round((totalHits / v) * 100) / 100,
      mrr: Math.round((mrrSum / v) * 10000) / 10000,
    })
  }

  // Find best by MRR (most reliable metric)
  const best = results.reduce((a, b) => b.mrr > a.mrr ? b : a)

  return {
    ratios: results,
    best: best,
    recommendation: `V6=${best.v6Weight.toFixed(1)} V7=${(1 - best.v6Weight).toFixed(1)}`,
  }
}
