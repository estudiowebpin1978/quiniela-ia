import { NextRequest, NextResponse } from "next/server"
import { fetchLatestTuJugadaPoceadaFederal, type TuJugadaDraw } from "@/lib/scrapers/tujugada-poceada-federal"
import { getSupabaseAdmin } from "@/lib/supabase-client"
import logger from "@/lib/logger"

export const maxDuration = 30

const GAME_ID = "d0e1f2a3-b4c5-6789-0abc-def012345678"

export async function GET(req: NextRequest) {
  const fechaParam = req.nextUrl.searchParams.get("date")
  const fecha = fechaParam && /^\d{4}-\d{2}-\d{2}$/.test(fechaParam) ? fechaParam : new Date().toISOString().split("T")[0]

  try {
    // --- 1. Intentar obtener de tujugada ---
    const draw: TuJugadaDraw | null = await fetchLatestTuJugadaPoceadaFederal()
    if (!draw || !draw.numbers || draw.numbers.length < 20) {
      return NextResponse.json({
        ok: false,
        reason: "No se pudo obtener sorteo de Poceada Federal desde tujugada.com.ar",
        fecha,
        source: "tujugada",
      })
    }

    // --- 2. Upsert en draws (idempotente) ---
    const supabase = getSupabaseAdmin()

    // Verificar si ya existe para esta fecha
    const { data: existing } = await supabase
      .from("draws")
      .select("id, date, turno, numbers")
      .eq("game_id", GAME_ID)
      .eq("date", fecha)
      .limit(1)

    if (existing && existing.length > 0) {
      return NextResponse.json({
        ok: true,
        fecha: draw.date,
        sorteo: draw.sorteo,
        numbers: draw.numbers,
        source: draw.source,
        skipped: true,
        reason: "Ya existe en draws",
      })
    }

    const { error: insertErr } = await supabase.from("draws").insert({
      date: draw.date,
      turno: "Poceada",
      game_id: GAME_ID,
      jurisdiccion: "ciudad",
      numbers: draw.numbers.map(Number),
      source: `tujugada:${draw.source}`,
      created_at: new Date().toISOString(),
    })

    if (insertErr) throw insertErr

    return NextResponse.json({
      ok: true,
      fecha: draw.date,
      sorteo: draw.sorteo,
      numbers: draw.numbers.slice(0, 10),
      source: draw.source,
      inserted: true,
    })
  } catch (e: any) {
    logger.error("[cron-scrape-poceada-federal-tujugada] error", { error: String(e), fecha })
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
