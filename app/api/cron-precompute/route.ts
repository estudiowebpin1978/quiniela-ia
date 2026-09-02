/**
 * /api/cron-precompute
 *
 * Pre-computes predictions for all turnos and stores in predictions_cache.
 * Called by cron-job.org after each scrape, or manually.
 *
 * Flow:
 * 1. For each turno, run the full V6+V7+ML pipeline
 * 2. Store blended result in predictions_cache table
 * 3. Next GET /api/predictions reads from cache (< 200ms)
 */

import { NextRequest, NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { getSupabaseAdmin } from "@/lib/supabase-client"
import { validateCronAuth, unauthorizedResponse, logCronExecution } from "@/lib/cron/auth"
import { predictEnsembleV7 } from "@/lib/analisis/engine-v7"
import { loadV7Weights, v7WeightsToFactorBreakdown } from "@/lib/analisis/v7-weights"
import { getMLPredictions } from "@/lib/ml/integration"
import { loadEngineWeights, logEnginePredictions } from "@/lib/ensemble/meta-ensemble"
import logger from "@/lib/logger"
import { SUENOS } from "@/lib/suenos"
import type { Draw } from "@/lib/analisis/engine-v7"

export const maxDuration = 60

const TURNOS = ["Previa", "Primera", "Matutina", "Vespertina", "Nocturna"]
const GAME_ID = "ac593199-c299-4f03-b1b7-8675fe4fa6d9"

interface BlendedPrediction {
  n: number
  numero: string
  score: number
  factor_attribution: Record<string, number>
}

export async function GET(req: NextRequest) {
  const t0 = Date.now()
  const auth = await validateCronAuth(req)
  if (!auth.authorized) return unauthorizedResponse()

  const turnoFilter = req.nextUrl.searchParams.get("turno")
  const turnos = turnoFilter ? [turnoFilter] : TURNOS

  const supabase = getSupabaseAdmin()
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format()

  const results: Array<{ turno: string; ok: boolean; confidence?: number; error?: string }> = []

  for (const turno of turnos) {
    try {
      // 1. Build EngineContext (snapshot of reality)
      const { data: lastDraw } = await supabase
        .from("draws")
        .select("id")
        .order("id", { ascending: false })
        .limit(1)
        .single()

      if (!lastDraw) {
        results.push({ turno, ok: false, error: "No draws in database" })
        continue
      }

      const lastDrawId = lastDraw.id as string
      const ctxSeed = (lastDrawId.split("").reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0) + turno.split("").reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0)) % 100000

      // 2. Fetch historical draws scoped to lastDrawId
      const { data: histDraws } = await supabase
        .from("draws")
        .select("id, date, turno, numbers")
        .eq("turno", turno)
        .lte("id", lastDrawId)
        .order("date", { ascending: true })

      if (!histDraws || histDraws.length < 10) {
        results.push({ turno, ok: false, error: "Insufficient draws" })
        continue
      }

      const draws: Draw[] = histDraws.map((d: Record<string, unknown>) => ({
        fecha: d.date as string,
        turno: d.turno as string,
        numbers: d.numbers as number[],
      }))

      // 2. Run V6 (SQL RPC)
      const { data: v6Rows } = await supabase.rpc("calculate_omega_v6", {
        p_turno: turno,
        p_tier: "free",
        p_date: today,
      })

      // 3. Run V7 (TypeScript engine)
      let v7Predictions: BlendedPrediction[] = []
      try {
        const v7Weights = await loadV7Weights(turno)
        const weights = v7WeightsToFactorBreakdown(v7Weights)
        const v7Result = await predictEnsembleV7(draws, turno, 10, ctxSeed, weights)
        v7Predictions = v7Result.predictions.map((p) => ({
          n: parseInt(p.numero),
          numero: p.numero,
          score: p.score,
          factor_attribution: {},
        }))
      } catch (e) {
        logger.warn("[cron-precompute] V7 failed", { turno, error: String(e) })
      }

      // 4. Run ML (Random Forest + Neural Net + Markov)
      let mlPredictions: BlendedPrediction[] = []
      try {
        const mlResult = await getMLPredictions(turno, draws)
        if (mlResult?.available && mlResult.scores.size > 0) {
          mlPredictions = Array.from(mlResult.scores.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([num, score]) => ({
              n: num,
              numero: num < 10 ? `0${num}` : `${num}`,
              score,
              factor_attribution: {},
            }))
        }
      } catch (e) {
        logger.warn("[cron-precompute] ML failed", { turno, error: String(e) })
      }

      // 5. Blend V6 + V7 + ML with dynamic weights
      const engineWeights = await loadEngineWeights(turno)
      const allNums = new Map<number, BlendedPrediction>()

      // V6 scores
      if (v6Rows && Array.isArray(v6Rows)) {
        for (const row of v6Rows.slice(0, 20) as Array<Record<string, unknown>>) {
          const num = row.numero as number
          const score = (row.puntaje_total as number) || 0
          const fa = (row.factor_attribution as Record<string, number>) || {}
          allNums.set(num, {
            n: num,
            numero: num < 10 ? `0${num}` : `${num}`,
            score: score * engineWeights.V6,
            factor_attribution: fa,
          })
        }
      }

      // V7 blend
      for (const pred of v7Predictions) {
        const existing = allNums.get(pred.n)
        const v7Score = pred.score * engineWeights.V7
        if (existing) {
          existing.score += v7Score
        } else {
          allNums.set(pred.n, { ...pred, score: v7Score })
        }
      }

      // ML blend
      for (const pred of mlPredictions) {
        const existing = allNums.get(pred.n)
        const mlScore = pred.score * engineWeights.ML
        if (existing) {
          existing.score += mlScore
        } else {
          allNums.set(pred.n, { ...pred, score: mlScore })
        }
      }

      // Log raw predictions for each engine (before blend)
      const v6Nums = (v6Rows || []).slice(0, 10).map((r: Record<string, unknown>) => r.numero as number)
      const v7Nums = v7Predictions.slice(0, 10).map(p => p.n)
      const mlNums = mlPredictions.slice(0, 10).map(p => p.n)
      await logEnginePredictions(lastDrawId, turno, v6Nums, v7Nums, mlNums)

      // Sort and take top 10
      const blended = Array.from(allNums.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, 10)

      // Generate 3/4 cifras and redoblona from blended top 10
      const top10nums = blended.map((p) => p.n)

      // Build co-occurrence maps from historical draws for deterministic 3/4 cifras
      const hundredsFreq = new Map<number, Map<number, number>>() // 2-digit -> hundreds digit -> count
      const thousandsFreq = new Map<number, Map<number, number>>() // 2-digit -> thousands pair -> count
      for (const draw of histDraws) {
        const nums = draw.numbers as number[]
        if (!Array.isArray(nums)) continue
        for (const fullNum of nums) {
          const twoDigit = fullNum % 100
          const hundreds = Math.floor(fullNum / 100) % 10
          const thousands = Math.floor(fullNum / 100)
          if (!hundredsFreq.has(twoDigit)) hundredsFreq.set(twoDigit, new Map())
          if (!thousandsFreq.has(twoDigit)) thousandsFreq.set(twoDigit, new Map())
          const hMap = hundredsFreq.get(twoDigit)!
          hMap.set(hundreds, (hMap.get(hundreds) || 0) + 1)
          const tMap = thousandsFreq.get(twoDigit)!
          tMap.set(thousands, (tMap.get(thousands) || 0) + 1)
        }
      }

      function mostFrequent(map: Map<number, number> | undefined, fallback: number): number {
        if (!map || map.size === 0) return fallback
        let best = fallback, bestCount = 0
        for (const [val, count] of map) {
          if (count > bestCount) { best = val; bestCount = count }
        }
        return best
      }

      const numeros_3 = top10nums.slice(0, 10).map((n) => {
        const prefix = mostFrequent(hundredsFreq.get(n), 0)
        return `${prefix}${String(n).padStart(2, "0")}`
      })
      const numeros_4 = top10nums.slice(0, 10).map((n) => {
        const prefix = mostFrequent(thousandsFreq.get(n), 0)
        return `${String(prefix).padStart(2, "0")}${String(n).padStart(2, "0")}`
      })
      const redoblona = top10nums.length >= 2
        ? { cabeza: String(top10nums[0]).padStart(2, "0"), acompanante: String(top10nums[1]).padStart(2, "0") }
        : null

      // 6. Compute confidence and agreement
      const v6Top10 = new Set<number>(
        (v6Rows || []).slice(0, 10).map((r: Record<string, unknown>) => r.numero as number)
      )
      const v7Top10 = new Set<number>(v7Predictions.slice(0, 10).map((p) => p.n))
      const mlTop10 = new Set<number>(mlPredictions.slice(0, 10).map((p) => p.n))

      // Agreement: % of V6 top-10 that also appear in V7 or ML top-10
      let agreementCount = 0
      for (const num of v6Top10) {
        if (v7Top10.has(num) || mlTop10.has(num)) agreementCount++
      }
      const agreement = agreementCount / Math.max(v6Top10.size, 1)

      // Confidence: based on draws count + agreement
      const confidence = Math.min(1.0, (histDraws.length / 100) * 0.5 + agreement * 0.5)

      // 7. Store in predictions_cache
      const { error: upsertError } = await supabase
        .from("predictions_cache")
        .upsert(
          {
            game_id: GAME_ID,
            date: today,
            turno,
            numeros_2: blended.map((p) => ({
              n: p.n,
              numero: p.numero,
              score: Math.round(p.score * 1000) / 1000,
              emoji: getEmoji(p.n),
              significado: getSignificado(p.n),
              factor_attribution: p.factor_attribution,
            })),
            numeros_3,
            numeros_4,
            redoblona,
            engine_version: "meta-ensemble-v1",
            v6_weight: Math.round(engineWeights.V6 * 10000) / 10000,
            v7_weight: Math.round(engineWeights.V7 * 10000) / 10000,
            ml_weight: Math.round(engineWeights.ML * 10000) / 10000,
            confidence: Math.round(confidence * 100) / 100,
            agreement_score: Math.round(agreement * 100) / 100,
            computed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "game_id,date,turno" }
        )

      if (upsertError) {
        throw upsertError
      }

      results.push({ turno, ok: true, confidence: Math.round(confidence * 100) / 100 })
    } catch (e) {
      logger.error("[cron-precompute] Failed", { turno, error: String(e) })
      results.push({ turno, ok: false, error: String(e) })
    }
  }

  const elapsed = Date.now() - t0
  logger.info("[cron-precompute] Completed", { turnos: results.length, elapsed })
  logCronExecution("cron-precompute", { results, elapsed }, t0)

  // On-Demand ISR: purge static pages so fresh predictions appear immediately
  try {
    revalidatePath("/", "layout")
    revalidatePath("/pronostico/[fecha]", "page")
    revalidatePath("/resultado/[fecha]", "page")
    revalidatePath("/predictions", "page")
  } catch { /* non-fatal */ }

  return NextResponse.json({ ok: true, results, elapsed })
}

function getEmoji(n: number): string {
  return SUENOS[n]?.emoji || "❓"
}

function getSignificado(n: number): string {
  return SUENOS[n]?.nombre || "❓"
}
