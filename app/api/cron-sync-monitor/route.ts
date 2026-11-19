import { NextRequest, NextResponse } from "next/server"
import { validateCronAuth, unauthorizedResponse } from "@/lib/cron/auth"
import { getSupabaseAdmin } from "@/lib/supabase-client"
import { esDiaSinSorteo, esTurnoSinSorteo } from "@/lib/feriados"
import logger from "@/lib/logger"

export const dynamic = "force-dynamic"
export const maxDuration = 30

/**
 * GET /api/cron-sync-monitor
 *
 * Monitoreo externo (cron-job.org cada 15 min): detecta sorteos que NO
 * llegaron al último esperado (con respeto de domingos y feriados).
 * Si hay estancamiento, devuelve 500 → cron-job.org marca "failed" y
 * dispara la alerta que el usuario configuró allí (webhook/telegram/email).
 */

const TURNOS = ["Previa", "Primera", "Matutina", "Vespertina", "Nocturna", "Poceada"] as const
const hhmm = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m }
const OFFICIAL = { Previa: "10:30", Primera: "12:30", Matutina: "15:00", Vespertina: "18:30", Nocturna: "21:30", Poceada: "21:15" }

/** Fecha ART como YYYY-MM-DD */
function todayArt(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format(now)
}

/** retrocede hasta N días para encontrar el último día con sorteo (excluyendo domingos/feriados). */
function ultimoDiaConSorteo(turno: string, ahora: Date, maxDias = 10): { fecha: string; hh: string } {
  for (let i = 0; i < maxDias; i++) {
    const d = new Date(ahora.getTime() - i * 86400000)
    const fecha = todayArt(d)
    const dow = new Date(`${fecha}T12:00:00Z`).getUTCDay()
    if (esDiaSinSorteo(fecha, dow)) continue
    if (esTurnoSinSorteo(fecha, turno)) continue
    const off = OFFICIAL[turno as keyof typeof OFFICIAL] ?? "00:00"
    // Si es hoy, exigir que haya pasado la hora oficial
    if (fecha === todayArt(ahora)) {
      const nowHH = new Intl.DateTimeFormat("en-US", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit", hour12: false }).format(ahora).split(":").map(Number)
      if (nowHH[0] * 60 + nowHH[1] < hhmm(off) + 5) continue
    }
    return { fecha, hh: off }
  }
  return { fecha: todayArt(ahora), hh: "00:00" }
}

export async function GET(req: NextRequest) {
  const auth = await validateCronAuth(req)
  if (!auth.authorized) return unauthorizedResponse()

  const now = new Date()
  const stale: Array<{ turno: string; lastDate: string | null; expected: string; ageHours: number | null }> = []
  try {
    const sb = getSupabaseAdmin()
    for (const turno of TURNOS) {
      const jurisdiccion = turno === "Poceada" ? ["ciudad"] : ["CABA"]
      const { data } = await sb
        .from("draws")
        .select("date")
        .eq("turno", turno)
        .in("jurisdiccion", jurisdiccion)
        .order("date", { ascending: false })
        .limit(1)
      const lastDate = (data as Array<{ date?: string }> | null)?.[0]?.date ?? null
      const { fecha: expected } = ultimoDiaConSorteo(turno, now)
      if (!lastDate || lastDate < expected) {
        const ageHours = lastDate
          ? Math.round((now.getTime() - new Date(lastDate + "T12:00:00-03:00").getTime()) / 3600000)
          : null
        stale.push({ turno, lastDate, expected, ageHours })
      }
    }
    if (stale.length > 0) {
      logger.warn("[cron-sync-monitor] sorteos podrían estar desactualizados", { stale })
      return NextResponse.json(
        { ok: false, stale, staleCount: stale.length, hint: "La próxima ingesta on-demand o el próximo cron puede resolverlo" },
        { status: 500 },
      )
    }
    return NextResponse.json({ ok: true, message: "sin desactualización clara", checkedTurns: TURNOS.length })
  } catch (e) {
    logger.error("[cron-sync-monitor] error", { error: String(e) })
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
