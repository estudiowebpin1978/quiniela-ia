import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-client"
import { jurisParaTurno } from "@/lib/procedencia"
import { TURNOS } from "@/lib/scrapers/types"
import { calcularCoOcurrencias } from "@/lib/analisis/redoblonas-coocurrencia"
import logger from "@/lib/logger"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * GET /api/redoblonas?turno=Nocturna&limit=800
 *
 * Co-ocurrencia de pares de 2 cifras sobre el HISTORIAL OFICIAL (draws) de un
 * turno. Descripción estadística real del pasado — NO predice el futuro
 * (cada sorteo es independiente). Determinista. Pública: sólo agregados.
 *
 * Respuesta cacheada 30 min en memoria (los sorteos cambian a lo sumo 2 veces/día/turno).
 */
const CACHE = new Map<string, { ts: number; payload: unknown }>()
const TTL_MS = 30 * 60 * 1000

const pad2 = (n: number) => String(n).padStart(2, "0")

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const turno = searchParams.get("turno") || "Nocturna"
  const limit = Math.min(1200, Math.max(120, Number.parseInt(searchParams.get("limit") || "800", 10) || 800))

  const turnoCanonical = TURNOS.find((t) => t.toLowerCase() === turno.toLowerCase())
  if (!turnoCanonical) {
    return NextResponse.json({ ok: false, error: "turno inválido", turnos: TURNOS }, { status: 400 })
  }

  const cacheKey = `${turnoCanonical}:${limit}`
  const hit = CACHE.get(cacheKey)
  if (hit && Date.now() - hit.ts < TTL_MS) {
    return NextResponse.json(hit.payload, { headers: { "X-Cache": "in-memory" } })
  }

  try {
    const sb = getSupabaseAdmin()
    const { data, error } = await sb
      .from("draws")
      .select("date, numbers")
      .eq("turno", turnoCanonical)
      .in("jurisdiccion", jurisParaTurno(turnoCanonical))
      .order("date", { ascending: false })
      .limit(limit)

    if (error) {
      logger.warn("[redoblonas] error leyendo draws", { turno: turnoCanonical, error: error.message })
      return NextResponse.json({ ok: false, error: "historial no disponible" }, { status: 500 })
    }

    const rows =
      (data as Array<{ date: string; numbers: number[] }> | null)?.slice().reverse() ?? []

    const informe = calcularCoOcurrencias(rows, turnoCanonical, { topN: 5, minSoporte: 2 })

    const payload = {
      ok: true,
      turno: turnoCanonical,
      sorteos: informe.totalSorteos,
      desde: informe.desde,
      hasta: informe.hasta,
      ordenadoPor: "frecuenciaConjunta (histórico)",
      azarConjunta: informe.azarConjunta,
      azarCondicional: informe.azarCondicional,
      paresDistintos: informe.paresDistintos,
      pares: informe.pares.map((p) => ({
        par: `${pad2(p.a)}-${pad2(p.b)}`,
        frecuencia: p.frecuencia,
        probConjunta: Math.round(p.probConjunta * 10000) / 10000,
        probA_dado_B: Math.round(p.probA_dado_B * 10000) / 10000,
        probB_dado_A: Math.round(p.probB_dado_A * 10000) / 10000,
        sobreAzar: Math.round(p.sobreAzar * 100) / 100,
      })),
      nota: informe.nota,
    }

    CACHE.set(cacheKey, { ts: Date.now(), payload })
    return NextResponse.json(payload, { headers: { "X-Cache": "computed" } })
  } catch (e) {
    logger.error("[redoblonas] error de cálculo", { error: String(e), turno })
    return NextResponse.json({ ok: false, error: "error interno" }, { status: 500 })
  }
}
