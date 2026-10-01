import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-client"
import logger from "@/lib/logger"
import { predictEnsembleV7 } from "@/lib/analisis/engine-v7"
import { loadV7Weights, v7WeightsToFactorBreakdown } from "@/lib/analisis/v7-weights"
import { getMLPredictions } from "@/lib/ml/integration"
import { loadEngineWeightsDecayed } from "@/lib/ensemble/meta-ensemble"

export const maxDuration = 300

interface ChunkConfig {
  turno: string
  chunkSize: number // max test dates to process per invocation
  chunkOffset: number // pagination cursor
}

export async function GET(req: NextRequest) {
  const t0 = Date.now()
  const auth = await (await import("@/lib/cron/auth")).validateCronAuth(req)
  if (!auth.authorized) return NextResponse.json({ error: auth.reason || "Unauthorized" }, { status: 403 })

  const supabase = getSupabaseAdmin()
  const turnoFilter = req.nextUrl.searchParams.get("turno")
  const chunkSizeParam = parseInt(req.nextUrl.searchParams.get("chunk_size") || "30")
  const offsetParam = parseInt(req.nextUrl.searchParams.get("offset") || "0")
  const chunkSize = Math.min(Math.max(chunkSizeParam, 5), 30)

  const turnos = turnoFilter ? [turnoFilter] : ["Previa", "Primera", "Matutina", "Vespertina", "Nocturna"]

  const results: Array<{ turno: string; processed: number; hits_total: number; near_total: number; dates: string[]; elapsed: number }> = []

  for (const turno of turnos) {
    const tTurno = Date.now()
    try {
      // 1. Get historical draws up to current date (use all for backtest replay)
      const { data: draws } = await supabase
        .from("draws")
        .select("id, date, turno, numbers")
        .eq("turno", turno)
        .not("numbers", "is", null)
        .order("date", { ascending: true })

      if (!draws || draws.length === 0) {
        results.push({ turno, processed: 0, hits_total: 0, near_total: 0, dates: [], elapsed: Date.now() - tTurno })
        continue
      }

      // 2. Determine test dates: each draw date where at least 30 prior draws exist (walk-forward)
      const minPriorDraws = 30
      const testDates: Date[] = []
      for (let i = minPriorDraws; i < draws.length; i++) {
        testDates.push(new Date(draws[i].date))
      }
      if (testDates.length === 0) {
        results.push({ turno, processed: 0, hits_total: 0, near_total: 0, dates: [], elapsed: Date.now() - tTurno })
        continue
      }

      // Read progress cursor
      const { data: progressRow } = await supabase
        .from("walkforward_progress")
        .select("last_processed_date")
        .eq("turno", turno)
        .single()

      let effectiveOffset = offsetParam
      if (progressRow?.last_processed_date && offsetParam === 0) {
        const lastIdx = testDates.findIndex((d) => d.toISOString().split("T")[0] > progressRow.last_processed_date)
        if (lastIdx >= 0) effectiveOffset = lastIdx
        else effectiveOffset = testDates.length
      }

      // Chunk pagination
      const chunkDates = testDates.slice(effectiveOffset, effectiveOffset + chunkSize)
      const datesProcessed: string[] = []
      let hitsTotal = 0
      let nearTotal = 0

      for (const testDate of chunkDates) {
        const dateStr = testDate.toISOString().split("T")[0]
        datesProcessed.push(dateStr)
        const priorDraws = draws.filter((d) => new Date(d.date) < testDate)

        if (priorDraws.length < minPriorDraws) continue

        // 3. Replay V6 (SQL RPC with historical context)
        const { data: v6Rows, error: v6Err } = await supabase
          .rpc("calculate_omega_v6" as never, {
            p_turno: turno,
            p_tier: "free",
            p_date: dateStr,
          } as never)

        if (v6Err) logger.warn("[walkforward-backtest] V6 RPC error", { turno, date: dateStr, error: JSON.stringify(v6Err) })

        const v6Top: number[] = (v6Rows || []).slice(0, 10).map((r: Record<string, unknown>) => (r.numero ?? r.num_val) as number)

        // 4. Replay V7 (TypeScript engine — uses prior draws)
        const drawsForV7 = (priorDraws as Array<{ date: string; turno: string; numbers: number[]; id: string }>).map((d) => ({
          fecha: d.date,
          turno: d.turno,
          numbers: d.numbers,
        }))
        let v7Top: string[] = []
        try {
          const weights = await loadV7Weights(turno)
          const v7Weights = v7WeightsToFactorBreakdown(weights)
          const v7Result = await predictEnsembleV7(drawsForV7, turno, 10, 0, v7Weights)
          v7Top = v7Result.predictions.map((p: { numero: string }) => p.numero)
        } catch (v7e) {
          logger.warn("[walkforward-backtest] V7 replay error", { turno, date: dateStr, error: (v7e as Error).message })
          v7Top = []
        }

        // 5. Replay ML (load models + predict with historical draws)
        let mlTop: string[] = []
        try {
          const mlDrawsType = (priorDraws as Array<{ date: string; turno: string; numbers: number[]; id: string }>).map((d) => ({
            fecha: d.date,
            turno: d.turno,
            numbers: d.numbers,
          }))
          const mlPred = await getMLPredictions(turno, mlDrawsType)
          if (mlPred.available && mlPred.scores.size > 0) {
            mlTop = Array.from(mlPred.scores.entries())
              .sort((a, b) => b[1] - a[1])
              .slice(0, 10)
              .map(([num]) => (num < 10 ? `0${num}` : `${num}`))
          }
        } catch (mle) {
          logger.warn("[walkforward-backtest] ML replay error", { turno, date: dateStr, error: (mle as Error).message })
          mlTop = []
        }

        // 6. Actual draw for comparison
        const { data: actualDraw } = await supabase
          .from("draws")
          .select("numbers")
          .eq("turno", turno)
          .eq("date", dateStr)
          .single()
        const actualNums: number[] = (actualDraw?.numbers || []) as number[]

        // 7. Evaluate each engine independently (hit = any top-10 matches actual draw number)
        const v6HitsCount = v6Top.filter((n: number) => actualNums.includes(n)).length
        const isHitV6 = v6HitsCount > 0
        const isNearV6 = !isHitV6 && v6Top.some((n: number) => actualNums.some((a: number) => Math.abs(a - n) <= 2))

        const v7TopNums = v7Top.map((nStr: string) => parseInt(nStr, 10)).filter((n: number) => !isNaN(n))
        const v7HitsCount = v7TopNums.filter((n: number) => actualNums.includes(n)).length
        const isHitV7 = v7HitsCount > 0
        const isNearV7 = !isHitV7 && v7TopNums.some((n: number) => actualNums.some((a: number) => Math.abs(a - n) <= 2))

        const mlTopNums = mlTop.map((nStr: string) => parseInt(nStr, 10)).filter((n: number) => !isNaN(n))
        const mlHitsCount = mlTopNums.filter((n: number) => actualNums.includes(n)).length
        const isHitML = mlHitsCount > 0
        const isNearML = !isHitML && mlTopNums.some((n: number) => actualNums.some((a: number) => Math.abs(a - n) <= 2))

        // 8. Ensemble blend (use real dynamic weights from engine_performance + backtest)
        let engineWeights = { V6: 0.40, V7: 0.35, ML: 0.25 }
        try { engineWeights = await loadEngineWeightsDecayed(turno) } catch { /* use defaults */ }
        let ensembleTop: number[] = []
        try {
          // Rebuild blend using the same logic as cron-precompute but with replay predictions
          const blended = new Map<number, { score: number }>()
          for (const [eng, nums] of [
            ["V6", v6Top],
            ["V7", v7TopNums.map((n: number) => n)],
            ["ML", mlTopNums.map((n: number) => n)],
          ] as [string, number[]][]) {
            const weight = (eng === "V6" ? engineWeights.V6 : eng === "V7" ? engineWeights.V7 : engineWeights.ML)
            for (const n of nums) {
              const existing = blended.get(n)
              if (existing) existing.score += weight * 1.0 // normalized score approximation
              else blended.set(n, { score: weight * 1.0 })
            }
          }
          ensembleTop = Array.from(blended.entries())
            .sort((a, b) => b[1].score - a[1].score)
            .slice(0, 10)
            .map(([n]) => n as number)
        } catch (blendErr: unknown) {
          logger.warn("[walkforward-backtest] Blend error", { turno, date: dateStr, error: (blendErr as Error).message })
          ensembleTop = v6Top // fallback to V6 if blend fails
        }

        const ensembleHitsCount = ensembleTop.filter((n: number) => actualNums.includes(n)).length
        const isHitEnsemble = ensembleHitsCount > 0
        const isNearEnsemble = !isHitEnsemble && ensembleTop.some((n: number) => actualNums.some((a: number) => Math.abs(a - n) <= 2))

        hitsTotal += (isHitV6 ? 1 : 0) + (isHitV7 ? 1 : 0) + (isHitML ? 1 : 0) + (isHitEnsemble ? 1 : 0)
        nearTotal += (isNearV6 ? 1 : 0) + (isNearV7 ? 1 : 0) + (isNearML ? 1 : 0) + (isNearEnsemble ? 1 : 0)

        // 9. Persist each engine independently
        const upserts = [
          { turno, test_date: dateStr, engine_name: "V6", predicted_numbers: v6Top, actual_numbers: actualNums, is_hit: isHitV6, is_near_miss: isNearV6 },
          { turno, test_date: dateStr, engine_name: "V7", predicted_numbers: v7TopNums, actual_numbers: actualNums, is_hit: isHitV7, is_near_miss: isNearV7 },
          { turno, test_date: dateStr, engine_name: "ML", predicted_numbers: mlTopNums, actual_numbers: actualNums, is_hit: isHitML, is_near_miss: isNearML },
          { turno, test_date: dateStr, engine_name: "ENSEMBLE", predicted_numbers: ensembleTop, actual_numbers: actualNums, is_hit: isHitEnsemble, is_near_miss: isNearEnsemble },
        ]
        for (const item of upserts) {
          await supabase.from("walkforward_results").upsert({
            turno: item.turno,
            test_date: item.test_date,
            engine_name: item.engine_name,
            predicted_numbers: item.predicted_numbers,
            actual_numbers: item.actual_numbers,
            is_hit: item.is_hit,
            is_near_miss: item.is_near_miss,
            near_miss_details: item.is_near_miss ? { near_numbers: item.predicted_numbers.filter((n: number) => item.actual_numbers.some((a: number) => Math.abs(a - n) <= 2)) } : {},
            weights_json: { v6: engineWeights.V6, v7: engineWeights.V7, ml: engineWeights.ML },
            created_at: new Date().toISOString(),
          }, { onConflict: "turno,test_date,engine_name" })
        }
      }

      results.push({ turno, processed: chunkDates.length, hits_total: hitsTotal, near_total: nearTotal, dates: datesProcessed, elapsed: Date.now() - tTurno })

      // Save progress cursor
      const lastProcessedDate = datesProcessed[datesProcessed.length - 1]
      if (lastProcessedDate) {
        await supabase.from("walkforward_progress").upsert({
          turno,
          last_processed_date: lastProcessedDate,
          total_dates: testDates.length,
          completed_dates: effectiveOffset + chunkDates.length,
          status: effectiveOffset + chunkDates.length >= testDates.length ? "completed" : "running",
          updated_at: new Date().toISOString(),
        }, { onConflict: "turno" })
      }

    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : typeof e === 'object' && e !== null ? JSON.stringify(e) : String(e)
      logger.error("[walkforward-backtest] Chunk error", { turno, error: msg })
      results.push({ turno, processed: 0, hits_total: 0, near_total: 0, dates: [], elapsed: Date.now() - tTurno })
    }
  }

  return NextResponse.json({ ok: true, mode: "chunked_walkforward", chunk_size: chunkSize, offset: offsetParam, results })
}
