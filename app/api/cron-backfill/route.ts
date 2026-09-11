/**
 * Historical backfill endpoint — recupera sorteos faltantes del histórico.
 *
 * Usa numerosenvivo.com.ar como fuente primaria (soporta ?fecha=YYYY-MM-DD).
 * USA: /api/cron-backfill?from=2025-07-10&to=2026-02-15
 * USA: /api/cron-backfill?days=30 (últimos 30 días)
 *
 * Borrar sorteos antiguos se maneja en cron-scrape después de cada guardado.
 */

import { NextRequest, NextResponse } from "next/server"
import { esDiaSinSorteo } from "@/lib/feriados"
import { TURNOS, GAME_ID, TurnoType } from "@/lib/scrapers/types"
import { parseNumerosEnvivo, parseNacionalQuiniela } from "@/lib/scrapers/parsers"
import { validateCronAuth, unauthorizedResponse, logCronExecution } from "@/lib/cron/auth"
import { getSupabaseAdmin } from "@/lib/supabase-client"
import logger from "@/lib/logger"

export const maxDuration = 300

const BATCH_DELAY_MS = 1500

function fechaArgentina(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format()
}

function dateRange(from: string, to: string): string[] {
  const dates: string[] = []
  const current = new Date(from + "T12:00:00Z")
  const end = new Date(to + "T12:00:00Z")
  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10))
    current.setUTCDate(current.getUTCDate() + 1)
  }
  return dates
}

function fechaUrl(fechaISO: string): string {
  const [yyyy, mm, dd] = fechaISO.split("-")
  return `${dd}-${mm}-${yyyy.slice(-2)}`
}

async function tieneDraw(fechaISO: string, turno: string): Promise<boolean> {
  try {
    const supabase = getSupabaseAdmin()
    const { data } = await supabase
      .from("draws")
      .select("id")
      .eq("date", fechaISO)
      .eq("turno", turno)
      .limit(1)
    return Array.isArray(data) && data.length > 0
  } catch { return false }
}

async function scrapeDate(fechaISO: string): Promise<{ saved: number; errors: number; details: string[] }> {
  const supabase = getSupabaseAdmin()
  const [yyyy, mm, dd] = fechaISO.split("-")
  const fUrl = `${dd}-${mm}-${yyyy.slice(-2)}`
  const diaSemana = new Date(`${fechaISO}T12:00:00Z`).getDay()

  if (esDiaSinSorteo(fechaISO, diaSemana)) {
    return { saved: 0, errors: 0, details: ["skip: feriado/domingo"] }
  }

  let saved = 0
  let errors = 0
  const details: string[] = []

  for (const turno of TURNOS) {
    if (await tieneDraw(fechaISO, turno)) {
      details.push(`${turno}: exists`)
      continue
    }

    // Try numerosenvivo.com.ar first
    let result = await parseNumerosEnvivo(fechaISO, fUrl, turno as TurnoType)

    // Fallback: nacionalquiniela.com
    if (!result || result.numbers.length < 20) {
      result = await parseNacionalQuiniela(fechaISO, fUrl, turno as TurnoType)
    }

    if (!result || result.numbers.length < 20) {
      details.push(`${turno}: no data`)
      errors++
      continue
    }

    const { error } = await supabase.rpc("upsert_draw" as never, {
      p_date: fechaISO,
      p_turno: turno,
      p_numbers: result.numbers,
      p_source: result.source,
      p_game_id: GAME_ID,
      p_jurisdiccion: "nacional",
    } as never)

    if (error) {
      details.push(`${turno}: save error - ${error.message}`)
      errors++
    } else {
      details.push(`${turno}: saved (${result.source})`)
      saved++
    }

    // Rate limit between turnos
    await new Promise(r => setTimeout(r, 800))
  }

  return { saved, errors, details }
}

export async function GET(req: NextRequest) {
  const authResult = await validateCronAuth(req)
  if (!authResult.authorized) return unauthorizedResponse()

  const fromParam = req.nextUrl.searchParams.get("from")
  const toParam = req.nextUrl.searchParams.get("to")
  const daysParam = req.nextUrl.searchParams.get("days")
  const dryRun = req.nextUrl.searchParams.get("dry") === "1"

  let fromDate: string
  let toDate: string

  if (fromParam && toParam && /^\d{4}-\d{2}-\d{2}$/.test(fromParam) && /^\d{4}-\d{2}-\d{2}$/.test(toParam)) {
    fromDate = fromParam
    toDate = toParam
  } else if (daysParam) {
    const days = Math.min(parseInt(daysParam) || 30, 365)
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - days)
    fromDate = start.toISOString().slice(0, 10)
    toDate = end.toISOString().slice(0, 10)
  } else {
    // Default: find gaps in existing data and backfill
    const supabase = getSupabaseAdmin()
    const { data: allDraws } = await supabase
      .from("draws")
      .select("date")
      .order("date", { ascending: true })
      .limit(5000)

    if (!Array.isArray(allDraws) || allDraws.length === 0) {
      return NextResponse.json({ ok: true, message: "No existing draws found. Use from/to params." })
    }

    const existingDates = new Set(allDraws.map((d: { date: string }) => d.date))
    const gaps: string[] = []

    // Find first and last dates
    const sortedDates = [...existingDates].sort()
    const firstDate = sortedDates[0]
    const lastDate = sortedDates[sortedDates.length - 1]

    // Scan for gaps (missing weekdays)
    const allDates = dateRange(firstDate, lastDate)
    for (const d of allDates) {
      if (!existingDates.has(d)) {
        const ds = new Date(d + "T12:00:00Z").getDay()
        if (ds !== 0 && !esDiaSinSorteo(d, ds)) {
          gaps.push(d)
        }
      }
    }

    if (gaps.length === 0) {
      return NextResponse.json({ ok: true, message: "No gaps found", totalDraws: allDraws.length })
    }

    fromDate = gaps[0]
    toDate = gaps[gaps.length - 1]
    logger.info("cron-backfill: auto-detected gaps", { count: gaps.length, from: fromDate, to: toDate })
  }

  if (dryRun) {
    const dates = dateRange(fromDate, toDate)
    const skipCount = dates.filter(d => {
      const ds = new Date(d + "T12:00:00Z").getDay()
      return ds === 0 || esDiaSinSorteo(d, ds)
    }).length
    return NextResponse.json({
      ok: true, dryRun: true,
      from: fromDate, to: toDate,
      totalDays: dates.length,
      businessDays: dates.length - skipCount,
      skipDays: skipCount,
    })
  }

  const dates = dateRange(fromDate, toDate)
  let totalSaved = 0
  let totalErrors = 0
  let datesProcessed = 0
  const results: Array<{ date: string; saved: number; errors: number }> = []

  logger.info("cron-backfill: starting", { from: fromDate, to: toDate, totalDates: dates.length })

  for (const date of dates) {
    const ds = new Date(date + "T12:00:00Z").getDay()
    if (ds === 0 || esDiaSinSorteo(date, ds)) {
      continue
    }

    const result = await scrapeDate(date)
    totalSaved += result.saved
    totalErrors += result.errors
    datesProcessed++

    if (result.saved > 0) {
      results.push({ date, saved: result.saved, errors: result.errors })
      logger.info("cron-backfill: date scraped", { date, saved: result.saved, errors: result.errors })
    }

    // Rate limit between dates
    await new Promise(r => setTimeout(r, BATCH_DELAY_MS))
  }

  logCronExecution("cron-backfill", {
    from: fromDate, to: toDate,
    datesProcessed, totalSaved, totalErrors,
  }, Date.now())

  return NextResponse.json({
    ok: true,
    from: fromDate, to: toDate,
    datesProcessed, totalSaved, totalErrors,
    results: results.slice(0, 50),
  })
}
