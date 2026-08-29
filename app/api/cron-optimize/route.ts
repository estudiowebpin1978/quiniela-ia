/**
 * /api/cron-optimize — Weekly weight optimization via grid search.
 *
 * POST /api/cron-optimize
 *
 * Runs walk-forward backtesting for each turno, tests weight variations,
 * and updates engine_config with the best weights found.
 * Uses a time-bound loop (9s budget) to prevent Vercel timeouts.
 * Requires CRON_SECRET auth.
 */

import { NextRequest, NextResponse } from "next/server"
import { validateCronAuth, unauthorizedResponse, logCronExecution } from "@/lib/cron/auth"
import { getSupabaseAdmin } from "@/lib/supabase-client"
import logger from "@/lib/logger"

export const maxDuration = 300

const TURNOS = ["Previa", "Primera", "Matutina", "Vespertina", "Nocturna"]

const FACTORS = [
  "w_frequency", "w_markov", "w_hot", "w_cold", "w_gap",
  "w_cooccurrence", "w_positional", "w_pattern", "w_trend"
]

const DEFAULT_WEIGHTS: Record<string, number> = {
  w_frequency: 0.18,
  w_markov: 0.15,
  w_hot: 0.18,
  w_cold: 0.12,
  w_gap: 0.10,
  w_cooccurrence: 0.10,
  w_positional: 0.07,
  w_pattern: 0.05,
  w_trend: 0.05,
}

const TIME_BUDGET_MS = 9_000 // 9 seconds — safe for Vercel serverless

interface BacktestResult {
  top10_hit_rate?: number
  avg_hits?: number
  total_tests?: number
  error?: string
}

async function runV6Backtest(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  turno: string,
  startDate: string,
  endDate: string,
): Promise<BacktestResult> {
  try {
    const { data, error } = await supabase.rpc("backtest_v6" as never, {
      p_turno: turno,
      p_start_date: startDate,
      p_end_date: endDate,
    } as never)

    if (error) return { error: error.message }
    if (data && Array.isArray(data) && data.length > 0) return data[0]
    return { error: "No data returned" }
  } catch (e) {
    return { error: String(e) }
  }
}

async function getConfig(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  turno: string,
): Promise<Record<string, number>> {
  const { data } = await supabase
    .from("engine_config" as never)
    .select("*")
    .eq("engine_version" as never, "omega_v6" as never)
    .eq("turno" as never, turno as never)
    .limit(1)

  if (data && Array.isArray(data) && data.length > 0) {
    const cfg = data[0] as Record<string, unknown>
    return FACTORS.reduce((acc, f) => {
      acc[f] = Number(cfg[f]) || DEFAULT_WEIGHTS[f]
      return acc
    }, {} as Record<string, number>)
  }
  return { ...DEFAULT_WEIGHTS }
}

async function updateConfig(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  turno: string,
  weights: Record<string, number>,
  backtestScore: number,
  totalTests: number,
  endDate: string,
) {
  await supabase.from("engine_config" as never).upsert({
    engine_version: "omega_v6",
    turno,
    ...weights,
    decay_lambda: 0.02,
    markov_window_days: 90,
    bayesian_prior: 100,
    pattern_penalty_enabled: true,
    optimized_from: "weekly_cron",
    backtest_score: backtestScore,
    backtest_date: endDate,
    total_tests: totalTests,
    updated_at: new Date().toISOString(),
  } as never, { onConflict: "engine_version,turno" })
}

export async function POST(req: NextRequest) {
  const t0 = Date.now()

  try {
    const authResult = await validateCronAuth(req)
    if (!authResult.authorized) {
      return unauthorizedResponse()
    }

    logger.info("cron-optimize: authorized", { source: authResult.source })

    const supabase = getSupabaseAdmin()
    const endDate = new Date().toISOString().split("T")[0]
    const startDateObj = new Date()
    startDateObj.setDate(startDateObj.getDate() - 90)
    const startDate = startDateObj.toISOString().split("T")[0]

    const results: Array<{
      turno: string
      baseline_rate: number
      optimized_rate: number
      improvement: number
      weights: Record<string, number>
      tests: number
    }> = []

    let partialCompletion = false

    for (const turno of TURNOS) {
      // Time-bound check: stop if budget exhausted
      if (Date.now() - t0 > TIME_BUDGET_MS) {
        logger.info("cron-optimize: time budget exhausted, stopping", { elapsed: Date.now() - t0, processedTurnos: results.map(r => r.turno) })
        partialCompletion = true
        break
      }

      logger.info("cron-optimize: processing turno", { turno })

      const currentWeights = await getConfig(supabase, turno)

      const baseline = await runV6Backtest(supabase, turno, startDate, endDate)
      const baselineRate = Number(baseline.top10_hit_rate) || 0

      let bestRate = baselineRate
      let bestWeights = { ...currentWeights }

      for (const factor of FACTORS) {
        // Time-bound check inside factor loop
        if (Date.now() - t0 > TIME_BUDGET_MS) {
          partialCompletion = true
          break
        }

        const baselineWeight = currentWeights[factor]
        for (const delta of [0.03, -0.03]) {
          const newWeight = Math.max(0.01, Math.min(0.50, baselineWeight + delta))

          const testWeights = { ...currentWeights, [factor]: newWeight }
          const sum = Object.values(testWeights).reduce((a, b) => a + b, 0)
          if (Math.abs(sum - 1.0) > 0.01) {
            const diff = 1.0 - newWeight
            const otherSum = Object.entries(testWeights)
              .filter(([k]) => k !== factor)
              .reduce((a, [, v]) => a + v, 0)
            if (otherSum > 0) {
              for (const k of Object.keys(testWeights)) {
                if (k !== factor) {
                  testWeights[k] = Math.max(0.01, (testWeights[k] / otherSum) * diff)
                }
              }
            }
            const newSum = Object.values(testWeights).reduce((a, b) => a + b, 0)
            if (Math.abs(newSum - 1.0) > 0.01) continue
          }

          await updateConfig(supabase, turno, testWeights, 0, 0, endDate)

          const testResult = await runV6Backtest(supabase, turno, startDate, endDate)
          const testRate = Number(testResult.top10_hit_rate) || 0

          if (testRate > bestRate) {
            bestRate = testRate
            bestWeights = { ...testWeights }
          }
        }
      }

      // Always save best found for this turno (even on partial completion)
      await updateConfig(supabase, turno, bestWeights, bestRate, baseline.total_tests || 0, endDate)

      const improvement = bestRate - baselineRate
      results.push({
        turno,
        baseline_rate: baselineRate,
        optimized_rate: bestRate,
        improvement,
        weights: bestWeights,
        tests: baseline.total_tests || 0,
      })

      logger.info("cron-optimize: turno done", {
        turno,
        baseline: baselineRate,
        optimized: bestRate,
        improvement,
      })
    }

    const elapsed = Date.now() - t0

    logCronExecution("cron-optimize", {
      turnos: results.map((r: { turno: string }) => r.turno).join(","),
      elapsed_ms: elapsed,
      partial: partialCompletion,
    }, t0)

    return NextResponse.json({
      ok: true,
      partial: partialCompletion,
      period: { start: startDate, end: endDate },
      results,
      total_improvement: results.reduce((sum, r) => sum + r.improvement, 0),
      elapsed_ms: elapsed,
    })

  } catch (err) {
    logger.error("cron-optimize: ERROR", { error: String(err) })
    logCronExecution("cron-optimize", { error: String(err) }, Date.now())
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
