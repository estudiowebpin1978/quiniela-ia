import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-client"
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
      const [q, q2] = await Promise.all([
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
      ])
      const count = q.count ?? 0
      const lastDate = (q2.data as Array<{ date?: string }> | null)?.[0]?.date ?? null
      let status: (typeof result)[number]["status"]
      let detail: string | undefined
      if (!lastDate || count === 0) {
        status = "empty"
        detail = "sin sorteos en la base"
      } else {
        const age = ageMinutes(lastDate, now)
        // >30h → suspicious or 2d gap; >72h → alarmas
        if (age > 72 * 60) status = "stale_3d"
        else if (age > 30 * 60) status = "stale_1d"
        else status = "fresh"
        detail = `último sorteo ${lastDate} (${Math.round(age / 60)}h atrás)`
      }
      result.push({ turno, totalSorteos: count, firstDate: lastDate, lastDate, ageMinutes: lastDate ? ageMinutes(lastDate, now) : null, status, note: detail })
    }

    // Brinco: leer brinco_draws
    const { count: brincoCount } = await sb
      .from("brinco_draws")
      .select("concurso", { count: "exact", head: true })
    const { data: brincoRows } = await sb
      .from("brinco_draws")
      .select("fecha")
      .eq("estado_verificacion", "verified_official")
      .order("fecha", { ascending: false })
      .limit(1)
    const brincoLast = (brincoRows as Array<{ fecha?: string }> | null)?.[0]?.fecha ?? null
    result.push({
      turno: "Brinco",
      totalSorteos: brincoCount ?? 0,
      firstDate: null,
      lastDate: brincoLast,
      ageMinutes: brincoLast ? Math.round((now.getTime() - new Date(brincoLast + "T12:00:00-03:00").getTime()) / 60000) : null,
      status: brincoLast ? "fresh" : "empty",
      note: brincoLast ? `último sorteo ${brincoLast}` : "sin sorteos",
    })

    // Poceada Federal
    const { count: pfCount } = await sb
      .from("poceada_federal_draws")
      .select("concurso", { count: "exact", head: true })
      .eq("estado", "validated")
    const { data: pfRows } = await sb
      .from("poceada_federal_draws")
      .select("fecha")
      .eq("estado", "validated")
      .order("fecha", { ascending: false })
      .limit(1)
    const pfLast = (pfRows as Array<{ fecha?: string }> | null)?.[0]?.fecha ?? null
    result.push({
      turno: "Poceada Federal",
      totalSorteos: pfCount ?? 0,
      firstDate: null,
      lastDate: pfLast,
      ageMinutes: pfLast ? Math.round((now.getTime() - new Date(pfLast + "T12:00:00-03:00").getTime()) / 60000) : null,
      status: pfLast ? "fresh" : "empty",
      note: pfLast ? `último sorteo ${pfLast}` : "sin sorteos",
    })

    const overallFresh = result.every((r) => r.status === "fresh")
    const overall = overallFresh ? "ok" : "attention"

    return NextResponse.json(
      {
        generatedAt: now.toISOString(),
        overall,
        modalities: result,
        alerts: result.filter((r) => r.status !== "fresh").map((r) => `${r.turno}: ${r.status} (${r.note ?? ""})`),
        note: "Cada ruta sincroniza on-demand; si está fuera de frecuencia, el próximo request la corrige automáticamente o cron-scrape lo reparará en ±15 min.",
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
