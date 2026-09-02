/**
 * /api/webhooks/scrape
 *
 * Unified scrape + auto-pilot orchestrator with DUAL-SOURCE CONSENSUS.
 * Called by cron-job.org every 15 minutes (Mon-Sat, 10:00-22:00 ART).
 *
 * Flow:
 * 1. Verify auth token
 * 2. Determine which turnos should be available now (ART time)
 * 3. Check which draws already exist in DB
 * 4. Scrape via dual-source consensus (quinieleando + numerosenvivo)
 * 5. Save draw via upsert_draw RPC
 * 6. ATOMIC: Verify predictions + update engine performance (same pipeline)
 * 7. Run auto-pilot predictions for each scraped turno
 */

import { NextRequest, NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { getSupabaseAdmin } from "@/lib/supabase-client"
import { updateEnginePerformance } from "@/lib/ensemble/meta-ensemble"
import { validateCronAuth, unauthorizedResponse } from "@/lib/cron/auth"
import {
  getCurrentART,
  getAvailableTurnos,
  getTurnoDate,
  canScrapeTurno,
  getYesterdayART,
  type TurnoName,
} from "@/lib/quiniela-time"
import { fetchWithConsensus } from "@/lib/scrapers/consensus"
import type { SourceStats } from "@/lib/scrapers/types"
import { esDiaSinSorteo } from "@/lib/feriados"
import logger from "@/lib/logger"

const GAME_ID = "ac593199-c299-4f03-b1b7-8675fe4fa6d9"

export const maxDuration = 300 // 5 minutes

interface ScrapeResult {
  turno: string
  status: "saved" | "exists" | "skipped" | "error" | "auto_predicted" | "divergence"
  numbers?: number[]
  source?: string
  consensusMethod?: string
  error?: string
}

/**
 * ATOMIC: Verify predictions + update engine performance in a single transaction.
 * Called immediately after draw save — no background delays.
 */
async function atomicVerifyAndWeight(
  fechaISO: string,
  turno: string,
  supabase: ReturnType<typeof getSupabaseAdmin>,
): Promise<{ verified: number; enginesUpdated: boolean }> {
  let verified = 0
  let enginesUpdated = false

  // ── Verification is now handled by trg_verify_on_official_draw ──
  // The SQL trigger fires automatically when official_draws is inserted.
  // No TypeScript verification needed here (eliminates dual-path race condition).

  // ── Step 1: Update engine performance ──────────────────────────────────
  try {
    await updateEnginePerformance()
    enginesUpdated = true
  } catch (e) {
    logger.error("[webhooks/scrape] Engine weight update failed", { error: String(e) })
  }

  return { verified, enginesUpdated }
}

export async function POST(request: Request) {
  // ── 1. Auth ────────────────────────────────────────────────────────────
  const auth = await validateCronAuth(request as unknown as import("next/server").NextRequest)
  if (!auth.authorized) return unauthorizedResponse()

  const startTime = Date.now()
  const supabase = getSupabaseAdmin()

  try {
    // ── 2. Determine available turnos (ART time) ─────────────────────────
    const artNow = getCurrentART()
    const todayStr = artNow.dateStr
    const availableTurnos = getAvailableTurnos(artNow)

    logger.info("[webhooks/scrape] Starting (consensus mode)", {
      date: todayStr,
      artTime: `${artNow.hour}:${String(artNow.minute).padStart(2, "0")}`,
      weekday: artNow.weekday,
      availableTurnos,
    })

    // No scrapes on Sundays
    if (artNow.weekday === 0) {
      return NextResponse.json({
        ok: true,
        message: "Domingo — sin sorteos",
        date: todayStr,
        results: [],
      })
    }

    if (availableTurnos.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "Aún no hay turnos disponibles",
        date: todayStr,
        artTime: `${artNow.hour}:${String(artNow.minute).padStart(2, "0")}`,
      })
    }

    // ── 3. Check existing draws in DB ────────────────────────────────────
    const { data: existingDraws } = await supabase
      .from("draws")
      .select("turno")
      .eq("date", todayStr)

    const existingTurnos = new Set((existingDraws || []).map((d) => d.turno))

    // ── 3b. CATCH-UP: Check yesterday's Nocturna if after midnight ──────
    // Between 00:00-06:00 ART, yesterday's Nocturna might have been missed
    const turnosToProcess: Array<{ turno: TurnoName; date: string }> = []
    
    for (const turno of availableTurnos) {
      const effectiveDate = getTurnoDate(turno, artNow)
      
      // Check if this turno+date already exists
      const { data: existingCheck } = await supabase
        .from("draws")
        .select("turno")
        .eq("date", effectiveDate)
        .eq("turno", turno)
        .maybeSingle()
      
      if (!existingCheck) {
        turnosToProcess.push({ turno, date: effectiveDate })
      }
    }

    logger.info("[webhooks/scrape] Turnos to process", {
      count: turnosToProcess.length,
      turnos: turnosToProcess.map(t => `${t.turno}@${t.date}`),
    })

    // ── 4-7. Process each turno ────────────────────────────────────────
    const results: ScrapeResult[] = []

    for (const { turno, date: effectiveDate } of turnosToProcess) {
      // Not yet in scrape window?
      if (!canScrapeTurno(turno, artNow)) {
        results.push({ turno, status: "skipped" })
        continue
      }

      // ── 4. Tri-consensus scrape ──────────────────────────────────────
      try {
        const [yyyy, mm, dd] = effectiveDate.split("-")
        const fechaUrl = `${dd}-${mm}-${yyyy.slice(-2)}`
        const sourceStats: SourceStats = {}

        const consensus = await fetchWithConsensus(effectiveDate, fechaUrl, turno, sourceStats)

        // ABORT: No quorum reached (0/3, 1/3, or 3 different values)
        if (!consensus.ok && consensus.consensusMethod === "abort_no_quorum") {
          logger.error("[webhooks/scrape] TRI-CONSENSUS ABORT", {
            fecha: todayStr,
            turno,
            quorum: consensus.quorum,
            details: consensus.divergenceDetails,
          })
          results.push({
            turno,
            status: "divergence",
            error: consensus.divergenceDetails,
          })
          continue
        }

        // INSUFFICIENT: Both failed
        if (consensus.numbers.length < 20) {
          logger.info("[webhooks/scrape] Insufficient data", {
            turno,
            count: consensus.numbers.length,
          })
          results.push({
            turno,
            status: "error",
            error: `Insufficient data: ${consensus.numbers.length} numbers`,
          })
          continue
        }

        // ── 5. Save draw ────────────────────────────────────────────────
        const jurisdiccion = ["Primera", "Nocturna"].includes(turno) ? "provincia" : "nacional"
        const { error: saveError } = await supabase.rpc("upsert_draw" as never, {
          p_date: effectiveDate,
          p_turno: turno,
          p_numbers: consensus.numbers,
          p_source: consensus.source,
          p_game_id: GAME_ID,
          p_jurisdiccion: jurisdiccion,
        } as never)

        if (saveError) {
          logger.error("[webhooks/scrape] Save failed", { turno, error: saveError.message })
          results.push({ turno, status: "error", error: saveError.message })
          continue
        }

        // ── 5b. SSOT: Direct upsert to official_draws (belt-and-suspenders) ──
        try {
          await supabase.rpc("upsert_official_draw" as never, {
            p_date: effectiveDate,
            p_turno: turno,
            p_premios: consensus.numbers.slice(0, 5),
            p_source: consensus.source,
            p_game_id: GAME_ID,
          } as never)
        } catch (e) {
          logger.warn("[webhooks/scrape] official_draws upsert failed (non-critical)", { turno, error: String(e) })
        }

        // ── 6. Update engine weights (verification handled by official_draws trigger) ───
        let enginesUpdated = false
        try {
          await updateEnginePerformance()
          enginesUpdated = true
        } catch (e) {
          logger.error("[webhooks/scrape] Engine weight update failed", { error: String(e) })
        }

        // Fire-and-forget: refresh materialized views
        Promise.allSettled([
          supabase.rpc("refresh_cached_predictions_3_4" as never, { turno_objetivo: turno } as never),
          supabase.rpc("refresh_all_prediction_stats" as never),
        ]).catch(() => {})

        // Pre-compute predictions for this turno
        try {
          const baseUrl = process.env.VERCEL_URL
            ? `https://${process.env.VERCEL_URL}`
            : process.env.NEXT_PUBLIC_APP_URL || "https://quiniela-ia-two.vercel.app"
          fetch(`${baseUrl}/api/cron-precompute?turno=${encodeURIComponent(turno)}`, {
            headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
          }).catch(() => {})
        } catch { /* non-fatal */ }

        // Clear precomputed cache
        try {
          const { clearStatsCache } = await import("@/lib/analisis/precomputed")
          clearStatsCache(turno)
        } catch { /* non-fatal */ }

        // ── 7. Auto-pilot predictions (BATCH — 1 call per tier, not per user) ──
        let autoPredCount = 0
        try {
          const { data: autoUsers } = await supabase
            .rpc("get_auto_predict_users" as never, { p_turno: turno } as never)

          if (autoUsers && autoUsers.length > 0) {
            const premiumUsers = (autoUsers as Array<{ user_id: string; role: string; predictions_used: number }>)
              .filter(u => u.role === "premium" || u.role === "admin")

            if (premiumUsers.length > 0) {
              // Check which users already have predictions for this turno+date
              const premiumIds = premiumUsers.map(u => u.user_id)
              const { data: existingPreds } = await supabase
                .from("user_predictions")
                .select("user_id")
                .eq("turno", turno)
                .eq("date", todayStr)
                .in("user_id", premiumIds)

              const existingSet = new Set((existingPreds || []).map((p: { user_id: string }) => p.user_id))
              const eligiblePremium = premiumUsers.filter(u => !existingSet.has(u.user_id))

              if (eligiblePremium.length > 0) {
                // Compute prediction ONCE for the premium tier
                const baseUrl = process.env.VERCEL_URL
                  ? `https://${process.env.VERCEL_URL}`
                  : process.env.NEXT_PUBLIC_APP_URL || "https://quiniela-ia-two.vercel.app"

                const predRes = await fetch(`${baseUrl}/api/predictions`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${process.env.CRON_SECRET}`,
                  },
                  body: JSON.stringify({ turno, date: todayStr, include3And4: true }),
                  signal: AbortSignal.timeout(20_000),
                })

                if (predRes.ok) {
                  const predData = await predRes.json()
                  if (predData?.pred) {
                    const { buildPredictionRows } = await import("@/lib/batch-upsert")
                    const rows = buildPredictionRows(eligiblePremium, {
                      numeros_2: predData.pred.numeros_2 || [],
                      numeros_3: predData.pred.numeros_3 || [],
                      numeros_4: predData.pred.numeros_4 || [],
                      redoblona: predData.pred.redoblona || null,
                    }, {
                      game_id: GAME_ID,
                      date: todayStr,
                      turno,
                      engine_version: predData.engine || "auto_pilot",
                      confidence: predData.confidence || null,
                    })

                    const { batchUpsert } = await import("@/lib/batch-upsert")
                    const result = await batchUpsert("user_predictions", rows, {
                      onConflict: "user_id,date,turno",
                    })
                    autoPredCount = result.succeeded
                  }
                }
              }
            }
          }
        } catch { /* auto-pilot is best-effort */ }

        logger.info("[webhooks/scrape] Saved + auto-pilot", {
          turno,
          numbers: consensus.numbers.length,
          source: consensus.source,
          consensusMethod: consensus.consensusMethod,
          enginesUpdated,
          autoPredictions: autoPredCount,
        })

        results.push({
          turno,
          status: "auto_predicted",
          numbers: consensus.numbers,
          source: consensus.source,
          consensusMethod: consensus.consensusMethod,
        })
      } catch (e) {
        logger.error("[webhooks/scrape] Turno error", { turno, error: String(e) })
        results.push({ turno, status: "error", error: String(e) })
      }
    }

    // ── 8. Cleanup old predictions ────────────────────────────────────────
    let cleaned = 0
    try {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const { data: oldPreds } = await supabase
        .from("user_predictions")
        .select("id, date")
        .lt("created_at", cutoff)
        .lt("date", todayStr)
        .limit(200)

      if (oldPreds && oldPreds.length > 0) {
        const ids = oldPreds.map((p: { id: string }) => p.id)
        const { data: verified } = await supabase
          .from("prediction_history")
          .select("prediction_id")
          .in("prediction_id", ids)

        const verifiedIds = new Set((verified || []).map((v: { prediction_id: string }) => v.prediction_id))
        const deletable = ids.filter((id: string) => !verifiedIds.has(id))
        if (deletable.length > 0) {
          await supabase.from("user_predictions").delete().in("id", deletable)
          cleaned = deletable.length
        }
      }
    } catch { /* non-fatal */ }

    const duration = Date.now() - startTime
    const saved = results.filter((r) => r.status === "saved" || r.status === "auto_predicted").length
    const errors = results.filter((r) => r.status === "error").length
    const divergences = results.filter((r) => r.status === "divergence").length

    logger.info("[webhooks/scrape] Completed (consensus)", { saved, errors, divergences, cleaned, duration })

    // Discord alert on errors/divergences
    if (errors > 0 || divergences > 0) {
      try {
        const { alertScrapeRunErrors } = await import("@/lib/notifications/discord")
        await alertScrapeRunErrors(saved, errors, divergences, duration)
      } catch { /* non-fatal */ }
    }

    // Invalidate in-memory prediction cache so fresh predictions are served
    if (saved > 0) {
      try {
        const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000"
        await fetch(`${baseUrl}/api/predictions?invalidate=1`, {
          signal: AbortSignal.timeout(3000),
        }).catch(() => {})
      } catch { /* best-effort cache invalidation */ }

      // On-Demand ISR: purge static pronostico pages so next visitor gets fresh data
      try {
        revalidatePath("/", "layout")
        revalidatePath("/pronostico/[fecha]", "page")
        revalidatePath("/resultado/[fecha]", "page")
        revalidatePath("/predictions", "page")
      } catch { /* non-fatal */ }
    }

    return NextResponse.json({
      ok: errors === 0 && divergences === 0,
      date: todayStr,
      artTime: `${artNow.hour}:${String(artNow.minute).padStart(2, "0")}`,
      saved,
      errors,
      divergences,
      cleaned,
      duration,
      results,
      message: saved > 0
        ? `${saved} sorteos guardados (consenso dual)`
        : divergences > 0
          ? `${divergences} divergencias — datos abortados`
          : errors > 0
            ? `${errors} errores, sin sorteos nuevos`
            : "Sin nuevos sorteos"
    })
  } catch (e) {
    logger.error("[webhooks/scrape] Fatal error", { error: String(e) })
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function GET(request: Request) {
  return POST(request)
}
