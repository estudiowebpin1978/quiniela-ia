import { NextRequest, NextResponse } from "next/server"
import { validateCronAuth, unauthorizedResponse, logCronExecution } from "@/lib/cron/auth"
import { autoVerifyPredictions } from "@/lib/verificacion/auto-verify"
import logger from "@/lib/logger"

const SB = () => (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/"/g, "").trim()
const SK = () => (process.env.SUPABASE_SERVICE_ROLE_KEY || "").replace(/"/g, "").trim()

const TURNOS = ["Previa", "Primera", "Matutina", "Vespertina", "Nocturna"]

export const maxDuration = 300

async function getDrawsWithPredictions(daysBack: number = 7): Promise<Array<{ fecha: string; turno: string }>> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - daysBack)
  const cutoffStr = cutoff.toISOString().split("T")[0]

  try {
    const res = await fetch(
      `${SB()}/rest/v1/draws?date=gte.${cutoffStr}&select=date,turno&order=date.desc`,
      { headers: { "apikey": SK(), "Authorization": `Bearer ${SK()}` }, signal: AbortSignal.timeout(10000) }
    )
    if (!res.ok) return []
    const draws = await res.json()
    if (!Array.isArray(draws)) return []
    return draws.map((d: any) => ({ fecha: d.date, turno: d.turno }))
  } catch {
    return []
  }
}

export async function GET(req: NextRequest) {
  const start = Date.now()

  const authResult = await validateCronAuth(req)
  if (!authResult.authorized) {
    return unauthorizedResponse()
  }

  logger.info("cron-verify-catchup: authorized", { source: authResult.source })

  const url = new URL(req.url)
  const daysBack = Math.min(Number(url.searchParams.get("days") || "7"), 30)

  const draws = await getDrawsWithPredictions(daysBack)
  if (!draws.length) {
    return NextResponse.json({ ok: true, message: "No draws found in range", verified: 0 })
  }

  // Deduplicate by fecha|turno
  const uniqueDraws = Array.from(
    new Map(draws.map(d => [`${d.fecha}|${d.turno}`, d])).values()
  )

  let totalVerified = 0
  const errors: string[] = []

  for (const { fecha, turno } of uniqueDraws) {
    try {
      const results = await autoVerifyPredictions(fecha, turno, 1)
      totalVerified += results.length
      if (results.length > 0) {
        logger.info("cron-verify-catchup: verified", { fecha, turno, count: results.length })
      }
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e)
      errors.push(`${fecha}|${turno}: ${err}`)
      logger.error("cron-verify-catchup: error", { fecha, turno, error: err })
    }
  }

  const duration = Date.now() - start
  logCronExecution("cron-verify-catchup", { verified: totalVerified, drawsChecked: uniqueDraws.length, errors: errors.length }, start)

  return NextResponse.json({
    ok: errors.length === 0,
    fecha: new Date().toISOString().split("T")[0],
    verified: totalVerified,
    drawsChecked: uniqueDraws.length,
    errors,
    duration,
    message: totalVerified > 0 ? `${totalVerified} predicciones verificadas` : errors.length > 0 ? `${errors.length} errores` : "Sin nuevas verificaciones"
  })
}