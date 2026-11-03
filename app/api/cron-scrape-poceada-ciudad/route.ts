import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from '@/lib/supabase-client'
import logger from '@/lib/logger'

export const maxDuration = 30
const GAME_ID = "d0e1f2a3-b4c5-6789-0abc-def012345678" // Poceada Ciudad (jurisdiccion "ciudad")

export async function GET(req: NextRequest) {
  const fecha = req.nextUrl.searchParams.get("date") || new Date().toISOString().split("T")[0]
  try {
    const supabase = getSupabaseAdmin()

    // 1. Buscar sorteo oficial en draws para esta fecha y jurisdicción ciudad (Poceada)
    const { data: drawRows } = await supabase
      .from("draws")
      .select("date, turno, numbers")
      .eq("game_id", GAME_ID)
      .eq("jurisdiccion", "ciudad")
      .eq("turno", "Poceada")
      .eq("date", fecha)
      .limit(1)

    if (!drawRows || drawRows.length === 0) {
      return NextResponse.json({ ok: false, reason: `No hay sorteo oficial de Poceada Ciudad para ${fecha}`, fecha })
    }

    const draw = drawRows[0]
    const nums: number[] = Array.isArray(draw.numbers) ? draw.numbers : []

    if (!nums.length) {
      return NextResponse.json({ ok: false, reason: `Sorteo sin números para ${fecha}` })
    }

    return NextResponse.json({
      ok: true,
      fecha,
      turno: "Poceada",
      jurisdiccion: "ciudad",
      numeros: nums.slice(0, 20),
      total: nums.length,
      source: "supabase-draws",
    })
  } catch (e: any) {
    logger.error("[cron-scrape-poceada-ciudad] error", { error: String(e), fecha })
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
