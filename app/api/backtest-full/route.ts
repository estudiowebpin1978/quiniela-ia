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
import logger from "@/lib/logger"

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
  const t0 = Date.now()

  try {
    const { searchParams } = new URL(req.url)
    const turno = searchParams.get("turno") || "Primera"
    const days = Math.min(parseInt(searchParams.get("days") || "90"), 365)
    const windowSize = parseInt(searchParams.get("window") || "60")
    const engine = searchParams.get("engine") || "v6"

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

    logger.info(`[backtest-full] Testing ${turno} with ${draws.length} draws, window=${windowSize}`)

    // Walk-forward backtesting
    let precisionAt1 = 0
    let precisionAt3 = 0
    let precisionAt5 = 0
    let precisionAt10 = 0
    let totalHitsTop10 = 0
    let maxHits = 0
    const hitDistribution: Record<number, number> = {}
    let mrrSum = 0
    const recentResults: BacktestResult['recentResults'] = []

    // Random baseline: expected hits = 10 * (20/100) = 2.0
    const randomExpectedHits = 2.0
    const randomPrecisionAt10 = 1 - hypergeometricPMF(0, 100, 20, 10)

    for (let i = windowSize; i < draws.length; i++) {
      const targetDraw = draws[i]
      const actualNums = (targetDraw.numbers as number[]).map((n: number) => {
        const mod = n % 100
        return mod < 10 ? `0${mod}` : `${mod}`
      })

      // Use the SQL engine to get predictions (simulating what would have been predicted)
      // We call the engine with the turno, using the date BEFORE this draw
      const predDate = new Date(targetDraw.date)
      predDate.setDate(predDate.getDate() - 1)
      const predDateStr = predDate.toISOString().split("T")[0]

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
          continue
        }

        // Extract top-10 predicted 2-digit numbers
        const predicted = predData
          .slice(0, 10)
          .map((row: Record<string, unknown>) => {
            const num = Number(row.numero) % 100
            return num < 10 ? `0${num}` : `${num}`
          })

        // Calculate hits
        const hits = predicted.filter((n: string) => actualNums.includes(n))
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
        if (hitCount > 0) precisionAt10++
        if (hitPositions.some((p: number) => p < 5)) precisionAt5++
        if (hitPositions.some((p: number) => p < 3)) precisionAt3++
        if (hitPositions.includes(0)) precisionAt1++

        totalHitsTop10 += hitCount
        if (hitCount > maxHits) maxHits = hitCount
        hitDistribution[hitCount] = (hitDistribution[hitCount] || 0) + 1

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
        // Engine call failed for this draw, skip
        continue
      }
    }

    const v = draws.length - windowSize || 1

    const result: BacktestResult = {
      turno,
      engine,
      totalDraws: draws.length,
      validatedDraws: v,
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
