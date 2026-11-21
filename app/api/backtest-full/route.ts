/**
 * /api/backtest-full — Proper walk-forward backtesting
 *
 * Tests the REAL engine (calculate_omega_v6) against actual draws.
 * For each historical draw:
 *   1. Run the engine with data available BEFORE that draw
 *   2. Compare top-10 predictions against actual results
 *   3. Calculate precision@k, recall@k, MRR, hit distribution
 *
 * GET /api/backtest-full?turno=Primera&days=90&engine=v6
 */

import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-client"
import { validateCronAuth, unauthorizedResponse } from "@/lib/cron/auth"
import logger from "@/lib/logger"
import { jurisParaTurno } from "@/lib/procedencia"
import { evaluateTopK } from "@/lib/backtest/metrics"

export const dynamic = "force-dynamic"
export const maxDuration = 300

interface DrawRow {
  date: string
  turno: string
  numbers: number[]
}

interface BacktestResult {
  turno: string
  engine: string
  totalDraws: number
  validatedDraws: number
  attemptedDraws: number
  failedPredictions: number
  windowSize: number

  // Core metrics
  precisionAt1: number   // % draws where predicted #1 actually appeared
  precisionAt3: number   // % draws where ≥1 of top-3 appeared
  precisionAt5: number   // % draws where ≥1 of top-5 appeared
  precisionAt10: number  // % draws where ≥1 of top-10 appeared

  // Hit distribution
  avgHitsTop10: number   // average hits in top-10 per draw
  maxHitsTop10: number   // best single-draw result
  hitDistribution: Record<number, number>  // {0: 45, 1: 30, 2: 15, ...}

  // Random baseline comparison
  randomBaseline: {
    precisionAt10: number
    expectedHits: number
  }
  liftVsRandom: number

  // MRR (Mean Reciprocal Rank)
  mrr: number

  // Per-draw detail (last 10)
  recentResults: Array<{
    date: string
    predicted: string[]
    actual: string[]
    hits: number
    hitPositions: number[]
  }>
}

export async function GET(req: NextRequest) {
  // Cómputo pesado (hasta 300s de CPU) → exige CRON_SECRET o JWT de admin.
  const authResult = await validateCronAuth(req)
  if (!authResult.authorized) return unauthorizedResponse()

  const t0 = Date.now()

  try {
    const { searchParams } = new URL(req.url)
    const turno = searchParams.get("turno") || "Primera"
    const days = Number(searchParams.get("days") || "90")
    const windowSize = Number(searchParams.get("window") || "60")
    const engine = searchParams.get("engine") || "v6"

    const validTurnos = ["Previa", "Primera", "Matutina", "Vespertina", "Nocturna"]
    if (!validTurnos.includes(turno)) {
      return NextResponse.json({ error: `Turno inválido. Válidos: ${validTurnos.join(", ")}` }, { status: 400 })
    }
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      return NextResponse.json({ error: "days debe ser un entero entre 1 y 365" }, { status: 400 })
    }
    if (!Number.isInteger(windowSize) || windowSize < 10 || windowSize > 365) {
      return NextResponse.json({ error: "window debe ser un entero entre 10 y 365" }, { status: 400 })
    }
    if (engine !== "v6") {
      return NextResponse.json({ error: "El único motor disponible en esta ruta es v6" }, { status: 400 })
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
      .in("jurisdiccion", jurisParaTurno(turno))
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

    logger.info(`[backtest-full] Testing ${turno} with ${draws.length} draws, window=${windowSize}`)

    // Walk-forward backtesting
    let evaluatedDraws = 0
    let failedPredictions = 0
    let precisionAt1 = 0
    let precisionAt3 = 0
    let precisionAt5 = 0
    let precisionAt10 = 0
    let totalHitsTop10 = 0
    let maxHits = 0
    const hitDistribution: Record<number, number> = {}
    let mrrSum = 0
    const recentResults: BacktestResult['recentResults'] = []

    let randomExpectedHits = 0
    let randomPrecisionAt10 = 0

    for (let i = windowSize; i < draws.length; i++) {
      const targetDraw = draws[i]
      const actualNums = [...new Set((targetDraw.numbers as number[]).map((n: number) => {
        const mod = n % 100
        return mod < 10 ? `0${mod}` : `${mod}`
      }))]

      // The SQL function filters with date < p_date, so the target draw's
      // date excludes every result from that day and prevents look-ahead.
      const predDateStr = targetDraw.date

      try {
        const { data: predData, error: predError } = await supabase.rpc(
          "calculate_omega_v6" as never,
          {
            p_turno: turno,
            p_tier: "premium" as never,
            p_date: predDateStr,
          } as never
        )

        if (predError || !predData || !Array.isArray(predData) || predData.length === 0) {
          failedPredictions++
          logger.warn("[backtest-full] prediction unavailable", {
            turno,
            date: targetDraw.date,
            error: predError?.message || "empty prediction",
          })
          continue
        }

        // Extract top-10 predicted 2-digit numbers
        const predicted = [...new Set(predData
          .slice(0, 10)
          .filter((row: unknown): row is Record<string, unknown> =>
            typeof row === "object" && row !== null && "numero" in row
          )
          .map((row: Record<string, unknown>) => Number(row.numero))
          .filter((num: number) => Number.isInteger(num) && num >= 0)
          .map((num: number) => {
            const normalized = num % 100
            return normalized < 10 ? `0${normalized}` : `${normalized}`
          }))]
        if (predicted.length === 0) {
          failedPredictions++
          logger.warn("[backtest-full] prediction had no valid numbers", { turno, date: targetDraw.date })
          continue
        }

        // Calculate hits
        const metrics = evaluateTopK(predicted, actualNums)
        const hits = metrics.hitsTop10
        const hitCount = hits.length

        // Hit positions (which of the top-10 matched)
        const hitPositions = predicted
          .map((n: string, idx: number) => actualNums.includes(n) ? idx : -1)
          .filter((idx: number) => idx >= 0)

        // MRR: reciprocal rank of first hit
        const firstHitIdx = predicted.findIndex((n: string) => actualNums.includes(n))
        const rr = firstHitIdx >= 0 ? 1 / (firstHitIdx + 1) : 0
        mrrSum += rr

        // Update metrics
        if (metrics.hitAt10) precisionAt10++
        if (metrics.hitAt5) precisionAt5++
        if (predicted.slice(0, 3).some((n: string) => actualNums.includes(n))) precisionAt3++
        if (metrics.hitAt1) precisionAt1++

        evaluatedDraws++
        totalHitsTop10 += hitCount
        if (hitCount > maxHits) maxHits = hitCount
        hitDistribution[hitCount] = (hitDistribution[hitCount] || 0) + 1

        randomExpectedHits += 10 * actualNums.length / 100
        randomPrecisionAt10 += 1 - hypergeometricPMF(0, 100, actualNums.length, 10)

        // Store recent results
        if (i >= draws.length - 10) {
          recentResults.push({
            date: targetDraw.date,
            predicted,
            actual: actualNums,
            hits: hitCount,
            hitPositions,
          })
        }
      } catch (e) {
        failedPredictions++
        logger.warn("[backtest-full] engine call failed", {
          turno,
          date: targetDraw.date,
          error: e instanceof Error ? e.message : String(e),
        })
        continue
      }
    }

    const v = evaluatedDraws
    if (v === 0) {
      return NextResponse.json({
        error: "No se pudo evaluar ninguna predicción del motor.",
        totalDraws: draws.length,
        attemptedDraws: draws.length - windowSize,
        failedPredictions,
      }, { status: 503 })
    }
    randomExpectedHits /= v
    randomPrecisionAt10 /= v

    const result: BacktestResult = {
      turno,
      engine,
      totalDraws: draws.length,
      validatedDraws: v,
      attemptedDraws: draws.length - windowSize,
      failedPredictions,
      windowSize,

      precisionAt1: Math.round((precisionAt1 / v) * 1000) / 10,
      precisionAt3: Math.round((precisionAt3 / v) * 1000) / 10,
      precisionAt5: Math.round((precisionAt5 / v) * 1000) / 10,
      precisionAt10: Math.round((precisionAt10 / v) * 1000) / 10,

      avgHitsTop10: Math.round((totalHitsTop10 / v) * 100) / 100,
      maxHitsTop10: maxHits,
      hitDistribution,

      randomBaseline: {
        precisionAt10: Math.round(randomPrecisionAt10 * 1000) / 10,
        expectedHits: randomExpectedHits,
      },
      liftVsRandom: Math.round(((precisionAt10 / v) / randomPrecisionAt10) * 100) / 100,

      mrr: Math.round((mrrSum / v) * 10000) / 10000,

      recentResults,
    }

    return NextResponse.json({
      ok: true,
      ...result,
      elapsed_ms: Date.now() - t0,
    })

  } catch (err: unknown) {
    logger.error("[backtest-full] ERROR", { error: String(err) })
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    )
  }
}

/**
 * Hypergeometric PMF: P(X=k) = C(K,k) * C(N-K, n-k) / C(N,n)
 * Used to calculate random baseline probability.
 */
function hypergeometricPMF(k: number, N: number, K: number, n: number): number {
  return (
    binomCoeff(K, k) *
    binomCoeff(N - K, n - k) /
    binomCoeff(N, n)
  )
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
