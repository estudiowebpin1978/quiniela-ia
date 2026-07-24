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
import { fetchWithFallback } from "@/lib/scrapers/orchestrator"
import { SourceStats } from "@/lib/scrapers/types"
import { validateCronAuth, unauthorizedResponse, logCronExecution } from "@/lib/cron/auth"
import logger from "@/lib/logger"

const SB = () => (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/"/g, "").trim()
const SK = () => (process.env.SUPABASE_SERVICE_ROLE_KEY || "").replace(/"/g, "").trim()

const TURNOS = ["Previa", "Primera", "Matutina", "Vespertina", "Nocturna"]

export const maxDuration = 300

function fechaArgentina(): { fechaStr: string; diaSemana: number; fUrl: string } {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format()
  const [yyyy, mm, dd] = p.split("-")
  return { fechaStr: p, diaSemana: new Date(`${p}T12:00:00Z`).getDay(), fUrl: `${dd}-${mm}-${yyyy.slice(-2)}` }
}

async function tieneDraw(fechaISO: string, turno: string): Promise<boolean> {
  try {
    const r = await fetch(`${SB()}/rest/v1/draws?date=eq.${fechaISO}&turno=eq.${turno}&select=id&limit=1`, {
      headers: { "apikey": SK(), "Authorization": `Bearer ${SK()}` },
      signal: AbortSignal.timeout(5000)
    })
    const d = await r.json()
    return Array.isArray(d) && d.length > 0
  } catch { return false }
}

async function guardarDraw(fechaISO: string, turno: string, nums: number[], source: string): Promise<boolean> {
  const r = await fetch(`${SB()}/rest/v1/draws`, {
    method: "POST",
    headers: { 
      "apikey": SK(), 
      "Authorization": `Bearer ${SK()}`, 
      "Content-Type": "application/json", 
      "Prefer": "resolution=merge-duplicates,return=minimal" 
    },
    body: JSON.stringify({ date: fechaISO, turno, numbers: nums, source })
  })
  return r.ok
}

async function limpiarPrediccionesViejas(): Promise<number> {
  const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  try {
    const r = await fetch(
      `${SB()}/rest/v1/user_predictions?created_at=lt.${hace24h}&select=id`,
      { headers: { "apikey": SK(), "Authorization": `Bearer ${SK()}` }, signal: AbortSignal.timeout(8000) }
    )
    const old = await r.json()
    if (!Array.isArray(old) || old.length === 0) return 0
    const ids = old.map((p: any) => p.id)

    const verifiedRes = await fetch(
      `${SB()}/rest/v1/prediction_history?prediction_id=in.(${ids.join(",")})&select=prediction_id`,
      { headers: { "apikey": SK(), "Authorization": `Bearer ${SK()}` }, signal: AbortSignal.timeout(8000) }
    )
    const verified = await verifiedRes.json()
    const verifiedIds = new Set((verified || []).map((v: any) => v.prediction_id))

    const deletableIds = ids.filter((id: string) => !verifiedIds.has(id))
    if (deletableIds.length === 0) return 0

    const d = await fetch(
      `${SB()}/rest/v1/user_predictions?id=in.(${deletableIds.join(",")})`,
      { method: "DELETE", headers: { "apikey": SK(), "Authorization": `Bearer ${SK()}`, "Prefer": "return=minimal" }, signal: AbortSignal.timeout(8000) }
    )
    return d.ok ? deletableIds.length : 0
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

  logger.info("cron-scrape: iniciando", { fecha: fechaISO, overrideDate: overrideDate || "none" })

  const resultados: Record<string, number[]> = {}
  let guardados = 0
  let errores = 0
  const sourceStats: SourceStats = {}

  for (const turno of TURNOS) {
    if (await tieneDraw(fechaISO, turno)) {
      logger.debug("cron-scrape: ya existe", { fecha: fechaISO, turno })
      continue
    }

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
          autoVerifyPredictions(fechaISO, turno).catch(e => {
            logger.error("cron-scrape: error auto-verify", { fecha: fechaISO, turno, error: String(e) })
          })
          // Invalidate prediction cache for this turno
          try {
            revalidateTag(`predictions-${turno.toLowerCase()}`, "max")
            revalidateTag('predictions', "max")
          } catch {}
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

      const analyticsUrl = `${process.env.NEXT_PUBLIC_BASE_URL || "https://quiniela-ia-two.vercel.app"}/api/cron-analytics`
      fetch(analyticsUrl, {
        method: "POST",
        headers: { "Authorization": `Bearer ${process.env.CRON_SECRET}`, "Content-Type": "application/json" },
      }).catch((e) => {
        logger.warn("cron-scrape: failed to trigger cron-analytics", { error: String(e) })
      })
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
