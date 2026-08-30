/**
 * /api/webhooks/scrape
 *
 * Unified scrape + auto-pilot orchestrator.
 * Called by cron-job.org every 15 minutes (Mon-Sat, 10:00-22:00 ART).
 *
 * Flow:
 * 1. Verify auth token
 * 2. Determine which turnos should be available now (ART time)
 * 3. Check which draws already exist in DB
 * 4. Scrape missing draws via fetchWithFallback
 * 5. Save draws via upsert_draw RPC
 * 6. Auto-verify predictions if draw already existed
 * 7. Run auto-pilot predictions for each scraped turno
 */

import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-client"
import { updateEnginePerformance } from "@/lib/ensemble/meta-ensemble"
import { validateCronAuth, unauthorizedResponse } from "@/lib/cron/auth"
import {
  getCurrentART,
  getAvailableTurnos,
  getTurnoDate,
  canScrapeTurno,
  ALL_TURNOS,
  type TurnoName,
} from "@/lib/quiniela-time"
import { fetchWithFallback } from "@/lib/scrapers/orchestrator"
import type { SourceStats } from "@/lib/scrapers/types"
import { esSabadoSinTurnos, esDiaSinSorteo } from "@/lib/feriados"
import logger from "@/lib/logger"

const GAME_ID = "ac593199-c299-4f03-b1b7-8675fe4fa6d9"

export const maxDuration = 300 // 5 minutes

interface ScrapeResult {
  turno: string
  status: "saved" | "exists" | "skipped" | "error" | "auto_predicted"
  numbers?: number[]
  source?: string
  error?: string
}

export async function POST(request: Request) {
  // ── 1. Auth ────────────────────────────────────────────────────
  const auth = await validateCronAuth(request as unknown as import("next/server").NextRequest)
  if (!auth.authorized) return unauthorizedResponse()

  const startTime = Date.now()
  const supabase = getSupabaseAdmin()

  try {
    // ── 2. Determine available turnos (ART time) ─────────────────
    const artNow = getCurrentART()
    const todayStr = artNow.dateStr
    const availableTurnos = getAvailableTurnos(artNow)

    logger.info("[webhooks/scrape] Starting", {
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

    // ── 3. Check existing draws in DB ────────────────────────────
    const { data: existingDraws } = await supabase
      .from("draws")
      .select("turno")
      .eq("date", todayStr)

    const existingTurnos = new Set((existingDraws || []).map((d) => d.turno))

    // ── 4-7. Process each available turno ────────────────────────
    const results: ScrapeResult[] = []

    for (const turno of availableTurnos) {
      // Skip Saturday Previa/Primera
      if (esSabadoSinTurnos(artNow.weekday, turno)) {
        results.push({ turno, status: "skipped" })
        continue
      }

      // Already scraped?
      if (existingTurnos.has(turno)) {
        results.push({ turno, status: "exists" })
        continue
      }

      // Not yet in scrape window?
      if (!canScrapeTurno(turno, artNow)) {
        results.push({ turno, status: "skipped" })
        continue
      }

      // ── 4. Scrape ────────────────────────────────────────────
      try {
        const [yyyy, mm, dd] = todayStr.split("-")
        const fechaUrl = `${dd}-${mm}-${yyyy.slice(-2)}`
        const sourceStats: SourceStats = {}

        const result = await fetchWithFallback(todayStr, fechaUrl, turno, sourceStats)

        if (!result.numbers || result.numbers.length < 20) {
          logger.info("[webhooks/scrape] Insufficient data", { turno, count: result.numbers?.length || 0 })
          results.push({ turno, status: "error", error: `Insufficient data: ${result.numbers?.length || 0} numbers` })
          continue
        }

        // ── 5. Save draw ──────────────────────────────────────
        const jurisdiccion = ["Primera", "Nocturna"].includes(turno) ? "provincia" : "nacional"
        const { error: saveError } = await supabase.rpc("upsert_draw" as never, {
          p_date: todayStr,
          p_turno: turno,
          p_numbers: result.numbers,
          p_source: result.source,
          p_game_id: GAME_ID,
          p_jurisdiccion: jurisdiccion,
        } as never)

        if (saveError) {
          logger.error("[webhooks/scrape] Save failed", { turno, error: saveError.message })
          results.push({ turno, status: "error", error: saveError.message })
          continue
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

        // ── 6. Auto-verify existing predictions ────────────────
        try {
          const { autoVerifyPredictions } = await import("@/lib/verificacion/auto-verify")
          await autoVerifyPredictions(todayStr, turno)
        } catch { /* non-fatal */ }

        // ── 7. Auto-pilot predictions ─────────────────────────
        let autoPredCount = 0
        try {
          const { data: autoUsers } = await supabase
            .rpc("get_auto_predict_users" as never, { p_turno: turno } as never)

          if (autoUsers && autoUsers.length > 0) {
            const baseUrl = process.env.VERCEL_URL
              ? `https://${process.env.VERCEL_URL}`
              : process.env.NEXT_PUBLIC_APP_URL || "https://quiniela-ia-two.vercel.app"

            for (const user of autoUsers as Array<{ user_id: string; role: string; predictions_used: number }>) {
              try {
                // Check if user already has prediction for this turno+date
                const { data: existing } = await supabase
                  .from("user_predictions")
                  .select("id")
                  .eq("user_id", user.user_id)
                  .eq("turno", turno)
                  .eq("date", todayStr)
                  .limit(1)

                if (existing && existing.length > 0) continue

                // Check tier limits
                const isPremium = user.role === "premium" || user.role === "admin"
                if (!isPremium && user.predictions_used >= 10) continue

                // Call prediction engine
                const predRes = await fetch(`${baseUrl}/api/predictions`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${process.env.CRON_SECRET}`,
                  },
                  body: JSON.stringify({
                    turno,
                    date: todayStr,
                    include3And4: isPremium,
                  }),
                })

                if (!predRes.ok) continue
                const predData = await predRes.json()
                if (!predData?.pred) continue

                const numeros2 = (predData.pred.numeros_2 || []).slice(0, 10)
                let numerosToStore: string[]
                if (isPremium && predData.pred.numeros_3?.length > 0) {
                  numerosToStore = [JSON.stringify({
                    "2": numeros2,
                    "3": predData.pred.numeros_3 || [],
                    "4": predData.pred.numeros_4 || [],
                    "r": predData.pred.redoblona || null,
                  })]
                } else {
                  numerosToStore = numeros2
                }

                const { error: insertErr } = await supabase.from("user_predictions").upsert({
                  user_id: user.user_id,
                  game_id: GAME_ID,
                  date: todayStr,
                  turno,
                  numeros: numerosToStore,
                  engine_version: "auto_pilot",
                  confidence: predData.confidence || null,
                }, { onConflict: "user_id,date,turno" })

                if (!insertErr) autoPredCount++
              } catch { /* skip user on error */ }
            }
          }
        } catch { /* auto-pilot is best-effort */ }

        logger.info("[webhooks/scrape] Saved + auto-pilot", {
          turno,
          numbers: result.numbers.length,
          source: result.source,
          autoPredictions: autoPredCount,
        })

        results.push({
          turno,
          status: "auto_predicted",
          numbers: result.numbers,
          source: result.source,
        })
      } catch (e) {
        logger.error("[webhooks/scrape] Turno error", { turno, error: String(e) })
        results.push({ turno, status: "error", error: String(e) })
      }
    }

    // ── 8. Cleanup old predictions ──────────────────────────────
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

    // Recalcular win_rate de motores para el meta-ensemble
    try {
      await updateEnginePerformance()
    } catch { /* non-fatal */ }

    const duration = Date.now() - startTime
    const saved = results.filter((r) => r.status === "saved" || r.status === "auto_predicted").length
    const errors = results.filter((r) => r.status === "error").length

    logger.info("[webhooks/scrape] Completed", { saved, errors, cleaned, duration })

    return NextResponse.json({
      ok: true,
      date: todayStr,
      artTime: `${artNow.hour}:${String(artNow.minute).padStart(2, "0")}`,
      saved,
      errors,
      cleaned,
      duration,
      results,
    })
  } catch (e) {
    logger.error("[webhooks/scrape] Fatal error", { error: String(e) })
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function GET(request: Request) {
  return POST(request)
}
