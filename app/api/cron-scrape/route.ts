/**
 * Fast scraper endpoint - solo scrapea turnos de HOY.
 * Diseñado para ser llamado cada 15 min por cron-job.org o Vercel Cron.
 * No hace backfill (para eso usar /api/cron-nacional?fill=deep).
 *
 * Orquestador de scraping con fallback en cascada:
 *   1. quinielanacional1.com.ar (primaria rápida)
 *   2. quinieleando.com.ar (fallback 1)
 *   3. loteria-ciudad.gob.ar (fallback 2 - oficial)
 *   Cross-validation: quiniela22.com (verificación de cabeza)
 */

import { NextRequest, NextResponse } from "next/server"
import { revalidateTag } from "next/cache"
import { esDiaSinSorteo } from "@/lib/feriados"
import { autoVerifyPredictions } from "@/lib/verificacion/auto-verify"
import { enqueueVerification } from "@/lib/verification-queue"
import { fetchWithFallback } from "@/lib/scrapers/orchestrator"
import { SourceStats, TURNOS, TurnoType, GAME_ID } from "@/lib/scrapers/types"
import { validateCronAuth, unauthorizedResponse, logCronExecution } from "@/lib/cron/auth"
import { getSupabaseAdmin } from "@/lib/supabase-client"
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

async function guardarDraw(fechaISO: string, turno: string, nums: number[], source: string): Promise<boolean> {
  try {
    const supabase = getSupabaseAdmin()
    const { error } = await supabase.from("draws").upsert(
      { date: fechaISO, turno, numbers: nums, source, game_id: GAME_ID },
      { onConflict: "date,turno,game_id" }
    )
    if (error) {
      logger.error("cron-scrape: guardarDraw failed", { error: error.message, fecha: fechaISO, turno })
    }
    return !error
  } catch (e) {
    logger.error("cron-scrape: guardarDraw exception", { error: String(e), fecha: fechaISO, turno })
    return false
  }
}

async function limpiarPrediccionesViejas(): Promise<number> {
  try {
    const supabase = getSupabaseAdmin()
    const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    
    const { data: old, error: fetchError } = await supabase
      .from("user_predictions")
      .select("id")
      .lt("created_at", hace24h)
    
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
  const sourceStats: SourceStats = {}

  for (const turno of turnosToScrape) {
    const drawExists = await tieneDraw(fechaISO, turno)
    
    if (!drawExists) {
      const result = await fetchWithFallback(fechaISO, fUrl, turno, sourceStats)

      if (result.numbers.length >= 20) {
        try {
          if (await guardarDraw(fechaISO, turno, result.numbers, result.source)) {
            guardados++
            resultados[turno] = result.numbers
            logger.info("cron-scrape: guardado", {
              fecha: fechaISO, turno, cantidad: result.numbers.length,
              source: result.source, cabezaMatch: result.cabezaMatch
            })
            // Trigger Engine Omega recalculation (backup for trigger)
            getSupabaseAdmin().rpc('refresh_cached_predictions', { turno_objetivo: turno }).then(() => {}, () => {})
          } else {
            logger.warn("cron-scrape: fallo al guardar", { fecha: fechaISO, turno })
            errores++
          }
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e)
          logger.error("cron-scrape: error guardando draw", { fecha: fechaISO, turno, error: errMsg })
          errores++
        }
      } else {
        logger.warn("cron-scrape: todas las fuentes fallaron", { fecha: fechaISO, turno })
        errores++
      }
    }

    // Always trigger verification for this date/turno (covers predictions made after draw was saved)
    try {
      await enqueueVerification(fechaISO, turno)
    } catch {}
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

  // Log cron execution
  logCronExecution("cron-scrape", {
    fecha: fechaISO,
    guardados,
    errores,
    eliminadas,
    sourceStats
  }, start)

  // Background tasks (after response) - use after() for Next.js 15
  const backgroundTasks = async () => {
    if (guardados > 0) {
      // Local TS training + analytics (no Python microservice)
      try {
        const { autoTrainAll } = await import("@/lib/ml/auto-train")
        await autoTrainAll()
      } catch (e) {
        logger.error("cron-scrape: error en auto-train", { error: String(e) })
      }

      // Trigger analytics cron via internal fetch
      try {
        const analyticsUrl = `${process.env.NEXT_PUBLIC_BASE_URL || "https://quiniela-ia-two.vercel.app"}/api/cron-analytics`
        const cronSecret = process.env.CRON_SECRET || ""
        fetch(analyticsUrl, {
          method: "POST",
          headers: { "Authorization": `Bearer ${cronSecret}`, "Content-Type": "application/json" },
        }).catch((e) => {
          logger.warn("cron-scrape: failed to trigger cron-analytics", { error: String(e) })
        })
      } catch (e) {
        logger.warn("cron-scrape: error triggering analytics", { error: String(e) })
      }
    }
  }

  // Use after() for background execution (Next.js 15)
  try {
    const { after } = await import("next/server")
    after(backgroundTasks)
  } catch {
    // Fallback: execute inline if after() not available
    backgroundTasks().catch(() => {})
  }

  return NextResponse.json({
    ok: errores === 0,
    fecha: fechaISO,
    guardados,
    errores,
    eliminadas,
    duration,
    sourceStats,
    resultados,
    message: guardados > 0
      ? `${guardados} sorteos guardados${errores > 0 ? `, ${errores} errores` : ""}`
      : errores > 0
        ? `${errores} errores, sin sorteos nuevos`
        : "Sin nuevos sorteos"
  })
}
