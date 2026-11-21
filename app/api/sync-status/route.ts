import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-client"
import { classifyDrawFreshness } from "@/lib/cron/freshness"
import logger from "@/lib/logger"

export const dynamic = "force-dynamic"
export const maxDuration = 45

/**
 * GET /api/sync-status
 *
 * Reporte de frescura/cobertura de cada modalidad y turno.
 * Seguro para exponer públicamente: sólo devuelve conteos, fechas y estatus
 * cualitativo (fresh/stale). Nada de datos privados ni jugadas de usuarios.
 *
 * Uso: dashboard / cron / monitores (cron-job.org) pueden evaluarlo para
 * alertas de ingesta colapsada sin necesidad de estado server.
 */

const OFFICIAL_TIME_ART: Record<string, string> = {
  Previa: "10:30",
  Primera: "12:30",
  Matutina: "15:00",
  Vespertina: "18:30",
  Nocturna: "21:30",
  Poceada: "21:15",
}

const TURNOS = ["Previa", "Primera", "Matutina", "Vespertina", "Nocturna", "Poceada"] as const

function ageMinutes(dateIso: string, now = new Date()): number {
  const d = new Date(`${dateIso}T12:00:00-03:00`)
  return Math.round((now.getTime() - d.getTime()) / 60000)
}

export async function GET(_req: NextRequest) {
  const now = new Date()
  try {
    const sb = getSupabaseAdmin()
    const result: Array<{
      turno: string
      totalSorteos: number
      firstDate: string | null
      lastDate: string | null
      ageMinutes: number | null
      status: "fresh" | "stale_1d" | "stale_3d" | "empty" | "error"
      note?: string
    }> = []

    for (const turno of TURNOS) {
      const jurisdiccion = turno === "Poceada" ? ["ciudad"] : ["CABA"] as const
      const [q, latest, earliest] = await Promise.all([
        sb
          .from("draws")
          .select("id", { count: "exact", head: true })
          .eq("turno", turno)
          .in("jurisdiccion", jurisdiccion),
        sb
          .from("draws")
          .select("date")
          .eq("turno", turno)
          .in("jurisdiccion", jurisdiccion)
          .order("date", { ascending: false })
          .limit(1),
        sb
          .from("draws")
          .select("date")
          .eq("turno", turno)
          .in("jurisdiccion", jurisdiccion)
          .order("date", { ascending: true })
          .limit(1),
      ])
      const count = q.count ?? 0
      const lastDate = (latest.data as Array<{ date?: string }> | null)?.[0]?.date ?? null
      const firstDate = (earliest.data as Array<{ date?: string }> | null)?.[0]?.date ?? null
      let status: (typeof result)[number]["status"]
      let detail: string | undefined
      if (q.error || latest.error || earliest.error) {
        status = "error"
        detail = q.error?.message ?? latest.error?.message ?? earliest.error?.message
        logger.error("[sync-status] draws query failed", { turno, error: detail })
      } else if (!lastDate || count === 0) {
        status = "empty"
        detail = "sin sorteos en la base"
      } else {
        const age = ageMinutes(lastDate, now)
        status = classifyDrawFreshness(age)
        detail = `último sorteo ${lastDate} (${Math.round(age / 60)}h atrás)`
      }
      result.push({ turno, totalSorteos: count, firstDate, lastDate, ageMinutes: lastDate ? ageMinutes(lastDate, now) : null, status, note: detail })
    }

    // Brinco: leer brinco_draws
    const [brincoCountQuery, brincoLatest, brincoEarliest] = await Promise.all([
      sb.from("brinco_draws").select("concurso", { count: "exact", head: true }).in("estado_verificacion", ["verified_official", "cross_checked"]),
      sb.from("brinco_draws").select("fecha").in("estado_verificacion", ["verified_official", "cross_checked"]).order("fecha", { ascending: false }).limit(1),
      sb.from("brinco_draws").select("fecha").in("estado_verificacion", ["verified_official", "cross_checked"]).order("fecha", { ascending: true }).limit(1),
    ])
    const brincoCount = brincoCountQuery.count ?? 0
    const brincoLast = (brincoLatest.data as Array<{ fecha?: string }> | null)?.[0]?.fecha ?? null
    const brincoFirst = (brincoEarliest.data as Array<{ fecha?: string }> | null)?.[0]?.fecha ?? null
    const brincoAge = brincoLast ? Math.round((now.getTime() - new Date(brincoLast + "T12:00:00-03:00").getTime()) / 60000) : null
    const brincoError = brincoCountQuery.error ?? brincoLatest.error ?? brincoEarliest.error
    result.push({
      turno: "Brinco",
      totalSorteos: brincoCount,
      firstDate: brincoFirst,
      lastDate: brincoLast,
      ageMinutes: brincoAge,
      status: brincoError ? "error" : brincoLast && brincoAge != null ? classifyDrawFreshness(brincoAge, 8 * 24 * 60, 15 * 24 * 60) : "empty",
      note: brincoError?.message ?? (brincoLast ? `último sorteo ${brincoLast} (${Math.round((brincoAge ?? 0) / 60)}h atrás)` : "sin sorteos"),
    })
    if (brincoError) logger.error("[sync-status] Brinco query failed", { error: brincoError.message })

    // Poceada Federal
    const [pfCountQuery, pfLatest, pfEarliest] = await Promise.all([
      sb.from("poceada_federal_draws").select("concurso", { count: "exact", head: true }).eq("estado", "validated"),
      sb.from("poceada_federal_draws").select("fecha").eq("estado", "validated").order("fecha", { ascending: false }).limit(1),
      sb.from("poceada_federal_draws").select("fecha").eq("estado", "validated").order("fecha", { ascending: true }).limit(1),
    ])
    const pfCount = pfCountQuery.count ?? 0
    const pfLast = (pfLatest.data as Array<{ fecha?: string }> | null)?.[0]?.fecha ?? null
    const pfFirst = (pfEarliest.data as Array<{ fecha?: string }> | null)?.[0]?.fecha ?? null
    const pfAge = pfLast ? Math.round((now.getTime() - new Date(pfLast + "T12:00:00-03:00").getTime()) / 60000) : null
    const pfError = pfCountQuery.error ?? pfLatest.error ?? pfEarliest.error
    result.push({
      turno: "Poceada Federal",
      totalSorteos: pfCount,
      firstDate: pfFirst,
      lastDate: pfLast,
      ageMinutes: pfAge,
      status: pfError ? "error" : pfLast && pfAge != null ? classifyDrawFreshness(pfAge) : "empty",
      note: pfError?.message ?? (pfLast ? `último sorteo ${pfLast}` : "sin sorteos"),
    })
    if (pfError) logger.error("[sync-status] Poceada Federal query failed", { error: pfError.message })

    const overallFresh = result.every((r) => r.status === "fresh")
    const overall = overallFresh ? "ok" : "attention"

    return NextResponse.json(
      {
        generatedAt: now.toISOString(),
        overall,
        modalities: result,
        alerts: result.filter((r) => r.status !== "fresh").map((r) => `${r.turno}: ${r.status} (${r.note ?? ""})`),
        note: "Las rutas de predicción sincronizan antes de leer caché. cron-scrape reintenta sorteos actuales y completa huecos recientes automáticamente.",
      },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (e) {
    logger.error("[sync-status] error", { error: String(e) })
    return NextResponse.json(
      { generatedAt: now.toISOString(), overall: "error", modalities: [], alerts: [`error: ${String(e)}`] },
      { status: 500 },
    )
  }
}
