/**
 * Fast scraper endpoint - solo scrapea turnos de HOY.
 * Diseñado para ser llamado cada 15 min por Vercel Cron.
 * No hace backfill (para eso usar /api/cron-nacional?fill=deep).
 *
 * Orquestador de scraping con CONSENSO DUAL:
 *   - quinieleando.com.ar + numerosenvivo.com.ar en paralelo
 *   - Ambas coinciden → 100% oficial
 *   - Una falla → usa sobreviviente
 *   - Ambas responden pero difieren → ABORT (409)
 *
 * Verificación ATÓMICA: se ejecuta inmediatamente después del guardado
 * en el mismo pipeline (verify predictions + update engine weights).
 */

import { NextRequest, NextResponse } from "next/server"

import { esDiaSinSorteo } from "@/lib/feriados"
import { fetchWithConsensus } from "@/lib/scrapers/consensus"
import { SourceStats, TURNOS, TurnoType, GAME_ID } from "@/lib/scrapers/types"
import { validateCronAuth, unauthorizedResponse, logCronExecution } from "@/lib/cron/auth"
import { getSupabaseAdmin } from "@/lib/supabase-client"
import { updateEnginePerformance } from "@/lib/ensemble/meta-ensemble"
import logger from "@/lib/logger"

export const maxDuration = 300

function fechaArgentina(): { fechaStr: string; diaSemana: number; fUrl: string } {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format()
  const [yyyy, mm, dd] = p.split("-")
  return { fechaStr: p, diaSemana: new Date(`${p}T12:00:00Z`).getDay(), fUrl: `${dd}-${mm}-${yyyy.slice(-2)}` }
}

async function tieneDraw(fechaISO: string, turno: string): Promise<boolean> {
  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from("draws")
      .select("id")
      .eq("date", fechaISO)
      .eq("turno", turno)
      .limit(1)
    if (error) return false
    return Array.isArray(data) && data.length > 0
  } catch { return false }
}

async function guardarDraw(fechaISO: string, turno: string, nums: number[], source: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = getSupabaseAdmin()
    const jurisdiccion = ["Primera", "Nocturna"].includes(turno) ? "provincia" : "nacional"

    // Use .rpc() to avoid int4[] ↔ text[] type mismatch with PostgREST
    const { error } = await supabase.rpc("upsert_draw" as never, {
      p_date: fechaISO,
      p_turno: turno,
      p_numbers: nums,
      p_source: source,
      p_game_id: GAME_ID,
      p_jurisdiccion: jurisdiccion,
    } as never)

    if (error) {
      logger.error("cron-scrape: guardarDraw failed", { error: error.message, code: error.code, details: error.details, fecha: fechaISO, turno, source, numsCount: nums.length })
      return { ok: false, error: error.message }
    }

    // Post-save: trigger refresh functions as separate RPCs (fire-and-forget, non-blocking)
    Promise.allSettled([
      supabase.rpc("refresh_cached_predictions_3_4" as never, { turno_objetivo: turno } as never),
      supabase.rpc("refresh_all_prediction_stats" as never),
    ]).catch(() => {})

    // Pre-compute predictions for this turno (stores in predictions_cache)
    try {
      const baseUrl = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.NEXT_PUBLIC_APP_URL || "https://quiniela-ia-two.vercel.app"
      fetch(`${baseUrl}/api/cron-precompute?turno=${encodeURIComponent(turno)}`, {
        headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
      }).catch(() => {})

      // Event-driven: trigger auto-predict for the NEXT turno
      // This replaces the cron-job.org schedule — the scraper drives the pipeline
      const TURNOS_ORDER = ["Previa", "Primera", "Matutina", "Vespertina", "Nocturna"]
      const currentIdx = TURNOS_ORDER.indexOf(turno)
      if (currentIdx >= 0 && currentIdx < TURNOS_ORDER.length - 1) {
        const nextTurno = TURNOS_ORDER[currentIdx + 1]
        fetch(`${baseUrl}/api/cron-auto-predict?turno=${encodeURIComponent(nextTurno)}`, {
          headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
        }).catch(() => {})
      }
    } catch { /* non-fatal */ }

    // Clear precomputed stats cache for this turno (materialized view will refresh async)
    try {
      const { clearStatsCache } = await import("@/lib/analisis/precomputed")
      clearStatsCache(turno)
    } catch { /* non-fatal */ }

    return { ok: true }
  } catch (e) {
    const msg = String(e)
    logger.error("cron-scrape: guardarDraw exception", { error: msg, fecha: fechaISO, turno })
    return { ok: false, error: msg }
  }
}

async function limpiarPrediccionesViejas(): Promise<number> {
  try {
    const supabase = getSupabaseAdmin()
    // Use Buenos Aires time for cutoff (24h ago)
    const now = new Date()
    const bueNow = new Date(now.toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }))
    const hace24h = new Date(bueNow.getTime() - 24 * 60 * 60 * 1000)
    const cutoffISO = hace24h.toISOString()
    const todayBUE = now.toLocaleDateString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" })
    
    const { data: old, error: fetchError } = await supabase
      .from("user_predictions")
      .select("id, date")
      .lt("created_at", cutoffISO)
      .lt("date", todayBUE)
      .limit(200)
    
    if (fetchError || !Array.isArray(old) || old.length === 0) return 0
    const ids = old.map((p: { id: string }) => p.id)

    const { data: verified } = await supabase
      .from("prediction_history")
      .select("prediction_id")
      .in("prediction_id", ids)
    
    const verifiedIds = new Set((verified || []).map((v: { prediction_id: string }) => v.prediction_id))
    const deletableIds = ids.filter((id: string) => !verifiedIds.has(id))
    if (deletableIds.length === 0) return 0

    const { error: deleteError } = await supabase
      .from("user_predictions")
      .delete()
      .in("id", deletableIds)
    
    return deleteError ? 0 : deletableIds.length
  } catch { return 0 }
}

export async function GET(req: NextRequest) {
  const start = Date.now()
  
  // Centralized cron auth validation
  const authResult = await validateCronAuth(req)
  if (!authResult.authorized) {
    return unauthorizedResponse()
  }

  logger.info("cron-scrape: authorized", { source: authResult.source })

  const overrideDate = req.nextUrl.searchParams.get("date")
  const singleTurno = req.nextUrl.searchParams.get("turno")
  let fechaISO: string, diaSemana: number, fUrl: string

  if (overrideDate && /^\d{4}-\d{2}-\d{2}$/.test(overrideDate)) {
    const [yyyy, mm, dd] = overrideDate.split("-")
    fechaISO = overrideDate
    diaSemana = new Date(`${overrideDate}T12:00:00Z`).getDay()
    fUrl = `${dd}-${mm}-${yyyy.slice(-2)}`
  } else {
    const f = fechaArgentina()
    fechaISO = f.fechaStr
    diaSemana = f.diaSemana
    fUrl = f.fUrl
  }

  if (!overrideDate && esDiaSinSorteo(fechaISO, diaSemana)) {
    logger.info("cron-scrape: sin sorteos hoy", { fecha: fechaISO, diaSemana })
    return NextResponse.json({ ok: true, message: "Sin sorteos", fecha: fechaISO })
  }

  // If singleTurno is provided, validate it's a valid turno
  const turnosToScrape = singleTurno && TURNOS.includes(singleTurno as TurnoType)
    ? [singleTurno as TurnoType]
    : TURNOS

  logger.info("cron-scrape: iniciando", { fecha: fechaISO, overrideDate: overrideDate || "none", turnos: turnosToScrape })

  const resultados: Record<string, number[]> = {}
  let guardados = 0
  let errores = 0
  let divergences = 0
  const sourceStats: SourceStats = {}
  const saveErrors: string[] = []

  // Parallelize turnos for faster scraping (each turno is independent)
  const TURNO_TIMES_UTC: Record<string, string> = {
    Previa: "13:15", Primera: "15:00", Matutina: "18:00", Vespertina: "21:00", Nocturna: "00:00",
  }
  const turnoResults = await Promise.allSettled(turnosToScrape.map(async (turno) => {
    // Time guard: don't save draws before the official turno time (+5 min buffer)
    if (!overrideDate) {
      const officialTimeUTC = TURNO_TIMES_UTC[turno]
      if (officialTimeUTC) {
        const now = new Date()
        const [h, m] = officialTimeUTC.split(":").map(Number)
        const officialDate = new Date(`${fechaISO}T${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:00Z`)
        if (turno === "Nocturna") officialDate.setUTCDate(officialDate.getUTCDate() + 1)
        if (now.getTime() < officialDate.getTime() + 5 * 60 * 1000) {
          logger.info("cron-scrape: skip early scrape (before official time)", { fecha: fechaISO, turno, officialTimeUTC })
          return { turno, status: "skipped" as const }
        }
      }
    }

    const drawExists = await tieneDraw(fechaISO, turno)

    // Dual-source consensus scrape
    let consensus = await fetchWithConsensus(fechaISO, fUrl, turno, sourceStats)
    const maxRetries = turno === "Nocturna" ? 3 : 1
    for (let attempt = 1; attempt <= maxRetries && consensus.numbers.length < 20; attempt++) {
      logger.info("cron-scrape: retrying consensus scrape", { fecha: fechaISO, turno, attempt, count: consensus.numbers.length })
      await new Promise(r => setTimeout(r, 30_000))
      consensus = await fetchWithConsensus(fechaISO, fUrl, turno, sourceStats)
    }

    // ABORT: no quorum reached
    if (!consensus.ok && consensus.consensusMethod === "abort_no_quorum") {
      logger.error("cron-scrape: TRI-CONSENSUS ABORT", { fecha: fechaISO, turno, quorum: consensus.quorum, details: consensus.divergenceDetails })
      return { turno, status: "divergence" as const, error: consensus.divergenceDetails }
    }

    if (consensus.numbers.length < 20) {
      logger.warn("cron-scrape: pocas fuentes", { fecha: fechaISO, turno, count: consensus.numbers.length })
      return { turno, status: "insufficient" as const, count: consensus.numbers.length }
    }

    // If draw exists, check if numbers changed — update if so, skip if same
    if (drawExists) {
      const supabase = getSupabaseAdmin()
      const { data: existing } = await supabase
        .from("draws")
        .select("numbers")
        .eq("date", fechaISO)
        .eq("turno", turno)
        .limit(1)
        .single()
      
      if (existing && JSON.stringify(existing.numbers) === JSON.stringify(consensus.numbers)) {
        return { turno, status: "exists" as const }
      }
      // Numbers changed — update
      logger.info("cron-scrape: numbers changed, updating", { fecha: fechaISO, turno })
    }

    const saveResult = await guardarDraw(fechaISO, turno, consensus.numbers, consensus.source)
    const status = !saveResult.ok ? "error" : drawExists ? "updated" : "saved"
    return { turno, status: status as "error" | "updated" | "saved",
             numbers: saveResult.ok ? consensus.numbers : undefined,
             source: consensus.source, consensusMethod: consensus.consensusMethod, error: saveResult.error }
  }))

  for (const r of turnoResults) {
    if (r.status === 'fulfilled') {
      const v = r.value
      if (v.status === 'skipped' || v.status === 'exists') continue
      if (v.status === 'saved' || v.status === 'updated') {
        guardados++
        resultados[v.turno] = v.numbers!
        logger.info("cron-scrape: guardado", { fecha: fechaISO, turno: v.turno, cantidad: v.numbers!.length, source: v.source, consensusMethod: v.consensusMethod, updated: v.status === 'updated' })
      } else if (v.status === 'divergence') {
        saveErrors.push(`${v.turno}: DIVERGENCIA — ${v.error}`)
        logger.error("cron-scrape: consensus divergence", { fecha: fechaISO, turno: v.turno, details: v.error })
        divergences++
        errores++
      } else if (v.status === 'insufficient') {
        saveErrors.push(`${v.turno}: sin datos suficientes (${v.count})`)
        errores++
      } else {
        saveErrors.push(`${v.turno}: ${v.error}`)
        logger.warn("cron-scrape: fallo al guardar", { fecha: fechaISO, turno: v.turno, error: v.error })
        errores++
      }
    } else {
      logger.error("cron-scrape: turno rejected", { fecha: fechaISO, error: String(r.reason) })
      errores++
    }
  }

  // Limpiar predicciones de usuarios mayores a 24hs
  let eliminadas = 0
  try {
    eliminadas = await limpiarPrediccionesViejas()
    if (eliminadas > 0) {
      logger.info("cron-scrape: predicciones limpiadas", { cantidad: eliminadas })
    }
  } catch (e) {
    logger.warn("cron-scrape: error limpiando predicciones", { error: String(e) })
  }

  const duration = Date.now() - start

  // ── Verification handled by trg_verify_on_official_draw (SQL trigger) ──
  // No TypeScript verification needed — eliminates dual-path race condition.
  let totalVerified = 0
  if (guardados > 0) {
    try {
      // Update engine performance after scrapes
      await updateEnginePerformance()
      logger.info("cron-scrape: engine performance updated", { fecha: fechaISO })
    } catch (e) {
      logger.error("cron-scrape: engine performance update failed", { error: String(e) })
    }
  }

  // Log cron execution
  logCronExecution("cron-scrape", {
    fecha: fechaISO,
    guardados,
    errores,
    divergences,
    eliminadas,
    totalVerified,
    sourceStats
  }, start)

  // ── Generate engine predictions for NEXT turnos INLINE ────────
  try {
    const supabaseEngine = getSupabaseAdmin()
    for (const turno of turnosToScrape) {
      if (!resultados[turno] || resultados[turno].length === 0) continue

      const todayBsAs = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" })

      const { data: predData } = await supabaseEngine.rpc("calculate_omega_v6" as never, {
        p_turno: turno,
        p_tier: "free",
        p_date: todayBsAs,
      } as never)

      if (predData && Array.isArray(predData) && predData.length > 0) {
        const firstRow = predData[0] as Record<string, unknown>
        const pred2 = firstRow?.prediccion_2cifras
          ? String(firstRow.prediccion_2cifras).split(',').map((n: string) => parseInt(n.trim(), 10))
          : predData.slice(0, 10).map((r: Record<string, unknown>) => r.numero as number)

        const { count: drawsUsed } = await supabaseEngine
          .from("draws")
          .select("*", { count: "exact", head: true })
          .eq("turno", turno)
          .eq("game_id", GAME_ID)
          .lt("date", todayBsAs)

        await supabaseEngine.rpc("save_engine_prediction" as never, {
          p_engine_version: "omega_v6",
          p_turno: turno,
          p_prediction_date: todayBsAs,
          p_historical_cutoff: todayBsAs,
          p_draws_used: drawsUsed || 0,
          p_pred_2c: pred2,
          p_pred_3c: null,
          p_pred_4c: null,
          p_pred_redoblona: null,
          p_scores_2c: predData.slice(0, 10).map((r: Record<string, unknown>) => ({
            n: r.numero, score: r.puntaje_total, rank: 0
          })),
          p_weights_used: { w_frequency: 0.18, w_markov: 0.15, w_hot: 0.18, w_cold: 0.12, w_gap: 0.10, w_cooccurrence: 0.10, w_positional: 0.07, w_pattern: 0.05, w_trend: 0.05 },
          p_confidence: 50,
          p_factor_attribution: predData[0]?.factor_attribution || null,
        } as never)

        logger.info("cron-scrape: engine prediction saved", { turno, date: todayBsAs, drawsUsed: drawsUsed || 0 })
      }
    }
  } catch (e) {
    logger.error("cron-scrape: error generating engine predictions", { error: String(e) })
  }

  // Background tasks (after response) — logging only
  const backgroundTasks = async () => {
    const supabase = getSupabaseAdmin()

    // ── 1. Log scrape run ────────────────────────────────────────
    try {
      const turnosAttempted = turnosToScrape.map(t => t)
      const turnosSucceeded = Object.keys(resultados).filter(t => resultados[t].length > 0)
      const perTurnoMs: Record<string, number> = {}
      for (const t of turnosSucceeded) {
        perTurnoMs[t] = Math.round(duration / Math.max(turnosSucceeded.length, 1))
      }

      await supabase.from("scrape_runs" as never).insert({
        fecha: fechaISO,
        turnos_attempted: turnosAttempted,
        turnos_succeeded: turnosSucceeded,
        sources_tried: Object.keys(sourceStats),
        winning_source: Object.entries(sourceStats).sort(([,a], [,b]) => (b.ok || 0) - (a.ok || 0))[0]?.[0] || null,
        consensus_method: "parallel",
        total_duration_ms: duration,
        per_turno_ms: perTurnoMs,
        errors: saveErrors.length > 0 ? saveErrors : null,
        predictions_verified: guardados,
        predictions_generated: 0,
      } as never)
    } catch (e) {
      logger.warn("cron-scrape: failed to log scrape_run", { error: String(e) })
    }

    if (guardados > 0) {
      try {
        const analyticsUrl = `${process.env.NEXT_PUBLIC_BASE_URL || "https://quiniela-ia-two.vercel.app"}/api/cron-analytics`
        const cronSecret = process.env.CRON_SECRET || ""
        fetch(analyticsUrl, {
          method: "POST",
          headers: { "Authorization": `Bearer ${cronSecret}`, "Content-Type": "application/json" },
        }).catch(() => {})
      } catch {}

      // ── Incremental ML Training: retrain models for each scraped turno ──
      // Only retrain if we have new draws (guardados > 0) to incorporate
      try {
        const { autoTrainSingle } = await import("@/lib/ml/auto-train")
        const turnosWithNewDraws = Object.keys(resultados).filter(t => resultados[t].length > 0)
        for (const turno of turnosWithNewDraws) {
          // Fire-and-forget: retrain in background, don't block response
          autoTrainSingle(turno, false, true).catch(e =>
            logger.warn("cron-scrape: ML retrain failed", { turno, error: String(e) })
          )
        }
        if (turnosWithNewDraws.length > 0) {
          logger.info("cron-scrape: triggered incremental ML training", { turnos: turnosWithNewDraws })
        }
      } catch (e) {
        logger.warn("cron-scrape: ML training trigger failed", { error: String(e) })
      }
    }
  }

  try {
    const { after } = await import("next/server")
    after(backgroundTasks)
  } catch {
    backgroundTasks().catch(() => {})
  }

  return NextResponse.json({
    ok: errores === 0 && divergences === 0,
    fecha: fechaISO,
    guardados,
    errores,
    divergences,
    eliminadas,
    totalVerified,
    duration,
    sourceStats,
    resultados,
    saveErrors,
    message: guardados > 0
      ? `${guardados} sorteos guardados (consenso dual)`
      : divergences > 0
        ? `${divergences} divergencias — datos abortados`
        : errores > 0
          ? `${errores} errores, sin sorteos nuevos`
          : "Sin nuevos sorteos"
  })
}
