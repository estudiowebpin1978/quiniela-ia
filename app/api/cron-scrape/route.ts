/**
 * Fast scraper endpoint - solo scrapea turnos de HOY.
 * Diseñado para ser llamado cada 15 min por el agendador configurado.
 * También reintenta sorteos faltantes de los últimos cuatro días calendario.
 *
 * Fuente única autorizada: quiniela.loteriadelaciudad.gob.ar (quiniela)
 *   - fetchWithConsensus → parseOficial (HTML de resultados + resultados-data.php)
 *   - Auto-healing: si un sorteo oficial de hoy no quedó en DB, se carga
 *     al final del mismo run (mismo módulo oficial).
 *
 * Verificación ATÓMICA: se ejecuta inmediatamente después del guardado
 * en el mismo pipeline (verify predictions + update engine weights).
 */

import { NextRequest, NextResponse } from "next/server"

import { esDiaSinSorteo, esTurnoSinSorteo } from "@/lib/feriados"
import { fetchWithConsensus } from "@/lib/scrapers/consensus"
import { fetchQuinielaDraw, SOURCE_LOTBA } from "@/lib/scrapers/lotba-oficial"
import { SourceStats, TURNOS, TurnoType, GAME_ID } from "@/lib/scrapers/types"
import { validateCronAuth, unauthorizedResponse, logCronExecution } from "@/lib/cron/auth"
import { getSupabaseAdmin } from "@/lib/supabase-client"
import { invalidateAllPredictionCaches } from "@/lib/cache/prediction-cache-invalidation"
import { updateEnginePerformance } from "@/lib/ensemble/meta-ensemble"
import { getNextToPredictAfter } from "@/lib/quiniela-timeline"
import { rellenarHistoricoDeTurno } from "@/lib/scrapers/refrescar-on-demand"
import type { TurnoQuiniela } from "@/types/engine"
import logger from "@/lib/logger"
import { getCalibration } from "@/lib/probability/calibration"

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
      .in("jurisdiccion", jurisParaTurno(turno))
      .limit(1)
    if (error) return false
    return Array.isArray(data) && data.length > 0
  } catch { return false }
}

import { jurisParaTurno } from "@/lib/procedencia"

async function guardarDraw(fechaISO: string, turno: string, nums: number[], source: string, appOrigin: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = getSupabaseAdmin()
    const jurisdiccion = jurisParaTurno(turno)[0]

    // Save draw
    const { error } = await supabase.rpc("upsert_draw" as never, {
      p_date: fechaISO,
      p_turno: turno,
      p_numbers: nums,
      p_source: source,
      p_game_id: GAME_ID,
      p_jurisdiccion: jurisdiccion,
    } as never)

    if (error) {
      logger.error("cron-scrape: guardarDraw failed", { error: error.message, code: error.code, fecha: fechaISO, turno, source, numsCount: nums.length })
      return { ok: false, error: error.message }
    }

    // Verify PENDING predictions immediately (same pipeline, non-blocking)
    try {
      const { data: verifyData, error: verifyErr } = await supabase.schema("api").rpc("verify_predictions_for_draw" as never, {
        p_date: fechaISO,
        p_turno: turno,
      } as never)
      if (verifyErr) logger.warn("cron-scrape: verify failed", { error: verifyErr.message, turno })
      else if (verifyData) logger.info("cron-scrape: verified predictions", { resultado: verifyData, turno })
    } catch (e) {
      logger.warn("cron-scrape: verify exception", { error: String(e), turno })
    }

    // Invalidate caches (non-blocking)
    invalidateAllPredictionCaches().catch(() => {})

    // Trigger precompute for the NEXT turno (event-driven)
    // When this turno's draw is saved, the next turno's dependency is met
    try {
      const next = getNextToPredictAfter(turno as TurnoQuiniela)
      if (next) {
        const cronKey = process.env.CRON_SECRET || ""
        fetch(`${appOrigin}/api/cron-precompute?turno=${encodeURIComponent(next.turno)}`, {
          headers: { Authorization: `Bearer ${cronKey}` },
        }).catch(() => {})
      }
    } catch { /* non-fatal */ }

    // Clear precomputed stats cache
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

export async function GET(req: NextRequest) {
  const start = Date.now()
  
  // Centralized cron auth validation
  const authResult = await validateCronAuth(req)
  if (!authResult.authorized) {
    return unauthorizedResponse()
  }

  const appOrigin = req.nextUrl.origin
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
  const turnosBase = singleTurno && TURNOS.includes(singleTurno as TurnoType)
    ? [singleTurno as TurnoType]
    : TURNOS
  // Feriados parciales (24/12 y 31/12): Matutina/Vespertina no se sortean
  // (verificado contra oficial LOTBA 2025) → no reintentar turnos inexistentes.
  const suspendidos = turnosBase.filter((t) => esTurnoSinSorteo(fechaISO, t))
  const turnosToScrape = turnosBase.filter((t) => !suspendidos.includes(t))
  if (suspendidos.length > 0) {
    logger.info("cron-scrape: turnos suspendidos por feriado parcial", { fecha: fechaISO, suspendidos })
  }

  logger.info("cron-scrape: iniciando", { fecha: fechaISO, overrideDate: overrideDate || "none", turnos: turnosToScrape })

  const resultados: Record<string, number[]> = {}
  let guardados = 0
  let errores = 0
  let divergences = 0
  const sourceStats: SourceStats = {}
  const saveErrors: string[] = []
  const clearTurnoError = (turno: string) => {
    const index = saveErrors.findIndex((error) => error.startsWith(`${turno}:`))
    if (index < 0) return
    const [error] = saveErrors.splice(index, 1)
    if (error.includes("DIVERGENCIA")) divergences = Math.max(0, divergences - 1)
    errores = Math.max(0, errores - 1)
  }

  // Parallelize turnos for faster scraping (each turno is independent)
  const TURNO_TIMES_UTC: Record<string, string> = {
    Previa: "13:15", Primera: "15:00", Matutina: "18:00", Vespertina: "21:00", 
    Nocturna: "00:00",
  }
  const turnoResults = await Promise.allSettled(turnosToScrape.map(async (turno) => {
    // Time guard: don't save draws before the official turno time (+5 min buffer)
    if (!overrideDate) {
      const officialTimeUTC = TURNO_TIMES_UTC[turno]
      if (officialTimeUTC) {
        const now = new Date()
        const [h, m] = officialTimeUTC.split(":").map(Number)
        let officialCutoffUTC: Date
        if (turno === "Nocturna") {
          // Nocturna is at 00:00 UTC (21:00 ART previous day)
          // Check against next day's midnight UTC (fechaISO is ART date, which is still yesterday in UTC for early hours)
          officialCutoffUTC = new Date(`${fechaISO}T${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:00Z`)
          officialCutoffUTC.setUTCDate(officialCutoffUTC.getUTCDate() + 1)
        } else {
          officialCutoffUTC = new Date(`${fechaISO}T${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:00Z`)
        }
        if (now.getTime() < officialCutoffUTC.getTime() + 2 * 60 * 1000) {
          logger.info("cron-scrape: skip early scrape (before official time)", { fecha: fechaISO, turno, officialTimeUTC, cutoffUTC: officialCutoffUTC.toISOString() })
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
      logger.warn("cron-scrape: consensus abort (no quorum)", { fecha: fechaISO, turno, quorum: consensus.quorum, details: consensus.divergenceDetails })
      return { turno, status: "divergence" as const, error: consensus.divergenceDetails }
    }

    if (consensus.numbers.length < 20) {
      logger.warn("cron-scrape: pocas fuentes", { fecha: fechaISO, turno, count: consensus.numbers.length })
      return { turno, status: "insufficient" as const, count: consensus.numbers.length }
    }

    // Validación LOTBA oficial
    if (consensus.numbers.length !== 20) {
      throw new Error(`LOTBA ${turno}: se esperaban 20 números, recibidos ${consensus.numbers.length}`)
    }
    const invalid = consensus.numbers.some((n: number) => !Number.isInteger(n) || n < 0 || n > 9999)
    if (invalid) {
      throw new Error(`LOTBA ${turno}: resultado contiene números inválidos`)
    }

    // If draw exists, check if numbers changed — update if so, skip if same
    if (drawExists) {
      const supabase = getSupabaseAdmin()
      const { data: existing } = await supabase
        .from("draws")
        .select("numbers, source")
        .eq("date", fechaISO)
        .eq("turno", turno)
        .in("jurisdiccion", jurisParaTurno(turno))
        .limit(1)
        .single()
      
      if (existing && JSON.stringify(existing.numbers) === JSON.stringify(consensus.numbers)) {
        // Draw already exists with same numbers — still verify PENDING predictions
        try {
          const { data: vData, error: vErr } = await supabase.schema("api").rpc("verify_predictions_for_draw" as never, {
            p_date: fechaISO, p_turno: turno,
          } as never)
          if (vErr) logger.warn("cron-scrape: verify (exists) failed", { error: vErr.message, turno })
          else if (vData) logger.info("cron-scrape: verified (exists)", { resultado: vData, turno })
        } catch { /* non-fatal */ }
        return { turno, status: "exists" as const }
      }
      // Numbers changed — update
      logger.info("cron-scrape: numbers changed, updating", { fecha: fechaISO, turno })
    }

    const saveResult = await guardarDraw(fechaISO, turno, consensus.numbers, consensus.source, appOrigin)
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
        logger.warn("cron-scrape: consensus divergence", { fecha: fechaISO, turno: v.turno, details: v.error })
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

  // Keep the response fields for older monitors; official draws and user
  // predictions remain available for historical analysis and delayed verification.
  const eliminadas = 0
  const drawsDeleted = 0

  let duration = Date.now() - start

  // ── Verification: runs immediately after draw save via verify_predictions_for_draw ──
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
          p_confidence: getCalibration().confidencePct,
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
        const analyticsUrl = `${appOrigin}/api/cron-analytics`
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

  // ── Auto-healing oficial LOTBA: cargar sorteos de hoy que falten en DB ──
  try {
    const quinielaTurnos = (singleTurno
      ? [singleTurno as TurnoType]
      : (["Previa", "Primera", "Matutina", "Vespertina", "Nocturna"] as TurnoType[])
    )

    for (const turno of quinielaTurnos) {
      if (resultados[turno] && resultados[turno].length >= 20) continue
      if (await tieneDraw(fechaISO, turno)) continue

      const nums = await fetchQuinielaDraw(fechaISO, turno)
      if (nums && nums.length === 20) {
        const saveResult = await guardarDraw(fechaISO, turno, nums, SOURCE_LOTBA, appOrigin)
        if (saveResult.ok) {
          guardados++
          resultados[turno] = nums
          clearTurnoError(turno)
          logger.info("[cron-scrape] auto-healed from official LOTBA", { fecha: fechaISO, turno })
        }
      }
    }

  } catch (e) {
    logger.warn("[cron-scrape] official auto-healing skipped", { error: String(e) })
  }

  // Recover recent gaps as well as today's draw. This is idempotent and only
  // contacts official sources for dates that are missing from the database.
  if (!overrideDate) {
    const turnosHistorico = singleTurno ? [singleTurno as TurnoType] : TURNOS
    try {
      const reportes = await Promise.all(
        turnosHistorico.map((turno) => rellenarHistoricoDeTurno(turno, 4, appOrigin)),
      )
      for (const reporte of reportes) {
        guardados += reporte.saved
        errores += reporte.errores
        if (reporte.errores > 0) {
          saveErrors.push(`${reporte.turno}: ${reporte.errores} fallos al recuperar sorteos recientes`)
          logger.warn("[cron-scrape] recent history catch-up incomplete", {
            turno: reporte.turno,
            saved: reporte.saved,
            errors: reporte.errores,
          })
        } else if (reporte.saved > 0) {
          logger.info("[cron-scrape] recent history catch-up completed", {
            turno: reporte.turno,
            saved: reporte.saved,
          })
        }
      }
      if (reportes.some((reporte) => reporte.saved > 0)) {
        try {
          await updateEnginePerformance()
        } catch (e) {
          logger.error("[cron-scrape] catch-up engine performance update failed", { error: String(e) })
        }
      }
    } catch (e) {
      errores++
      saveErrors.push(`Catch-up histórico: ${String(e)}`)
      logger.error("[cron-scrape] recent history catch-up failed", { error: String(e) })
    }
  }

  // The API-schema wrapper refreshes only when stale and logs its own execution.
  // supabase-js returns RPC failures in .error rather than throwing.
  try {
    const supabase = getSupabaseAdmin()
    const { error: dsErr } = await supabase.schema("api").rpc("refresh_draw_stats_rpc" as never)
    if (dsErr) throw new Error(dsErr.message)
    logger.info("[cron-scrape] draw_stats refreshed")
  } catch (e: unknown) {
    logger.warn("[cron-scrape] draw_stats refresh failed (non-blocking)", { error: String(e) })
  }

  duration = Date.now() - start
  logCronExecution("cron-scrape", {
    ok: errores === 0 && divergences === 0,
    fecha: fechaISO,
    guardados,
    errores,
    divergences,
    eliminadas,
    drawsDeleted,
    totalVerified,
    sourceStats,
    saveErrors,
    duration,
  }, start)

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
