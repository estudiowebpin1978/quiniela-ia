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
import { getSupabaseAdmin } from "@/lib/supabase-client"
import { validateCronAuth, unauthorizedResponse, logCronExecution } from "@/lib/cron/auth"
import { predictEnsembleV7 } from "@/lib/analisis/engine-v7"
import { loadV7Weights, v7WeightsToFactorBreakdown } from "@/lib/analisis/v7-weights"
import { getMLPredictions } from "@/lib/ml/integration"
import { loadEngineWeights, logEnginePredictions } from "@/lib/ensemble/meta-ensemble"
import logger from "@/lib/logger"
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
      const ctxSeed = (lastDrawId.split("").reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0) + turno.length * 17) % 100000

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
        const v7Result = await predictEnsembleV7(draws, turno, 10, ctxSeed)
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
      const numeros_3 = top10nums.slice(0, 10).map((n) => {
        // Generate 3-digit by prepending a digit (0-9) based on score ranking
        const prefix = Math.floor(Math.random() * 10)
        return `${prefix}${String(n).padStart(2, "0")}`
      })
      const numeros_4 = top10nums.slice(0, 10).map((n) => {
        // Generate 4-digit by prepending two digits
        const prefix = Math.floor(Math.random() * 100)
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

  return NextResponse.json({ ok: true, results, elapsed })
}

function getEmoji(n: number): string {
  const SUENOS: Record<number, string> = {
    0: "🥚", 1: "💧", 2: "👶", 3: "🐰", 4: "🛏️", 5: "🐱",
    6: "🐕", 7: "🔫", 8: "🔥", 9: "🌊", 10: "🥛", 11: "⛏️",
    12: "💂", 13: "😱", 14: "🍺", 15: "👸", 16: "💍", 17: "💀",
    18: "🩸", 19: "🐟", 20: "🎉", 21: "👩", 22: "🤪", 23: "👨‍🍳",
    24: "🐴", 25: "🐔", 26: "⛪", 27: "🪮", 28: "⛰️", 29: "✝️",
    30: "💑", 31: "🌸", 32: "🎨", 33: "🎵", 34: "🌙", 35: "⭐",
    36: "🌈", 37: "🔥", 38: "💎", 39: "🎯", 40: "🏆", 41: "🎪",
    42: "🎭", 43: "🎰", 44: "🎲", 45: "🧸", 46: "🎀", 47: "🎈",
    48: "🎊", 49: "🎁",
  }
  return SUENOS[n] || (n <= 99 ? "❓" : "❓")
}

function getSignificado(n: number): string {
  const NOMBRES: Record<number, string> = {
    0: "Huevos", 1: "Agua", 2: "Niño", 3: "San Cono", 4: "La cama",
    5: "Gato", 6: "Perro", 7: "Revolver", 8: "Incendio", 9: "Arroyo",
    10: "Leche", 11: "Minero", 12: "Soldado", 13: "Yeta", 14: "Borracho",
    15: "Niña Bonita", 16: "Anillo", 17: "Desgracia", 18: "Sangre",
    19: "Pescado", 20: "La fiesta", 21: "Mujer", 22: "Loco", 23: "Cocinero",
    24: "Caballo", 25: "Gallina", 26: "La misa", 27: "Peine", 28: "Cerro",
    29: "San Pedro", 30: "Pareja", 31: "Rosa", 32: "Pintor", 33: "Músico",
    34: "Luna", 35: "Estrella", 36: "Arcoíris", 37: "Fuego", 38: "Diamante",
    39: "Bala", 40: "Trofeo", 41: "Circo", 42: "Teatro", 43: "Máquina",
    44: "Dado", 45: "Oso", 46: "Cinta", 47: "Globo", 48: "Fiesta",
    49: "Regalo",
  }
  return NOMBRES[n] || `Número ${n}`
}
