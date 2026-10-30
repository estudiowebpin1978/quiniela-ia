import { NextRequest, NextResponse } from "next/server"
import { fetchPoceadaDraw } from "@/lib/scrapers/poceada"
import { getSupabaseAdmin } from '@/lib/supabase-client'
import logger from '@/lib/logger'

export const maxDuration = 30
const GAME_ID = "d0e1f2a3-b4c5-6789-0abc-def012345678"

export async function GET(req: NextRequest) {
  const fecha = req.nextUrl.searchParams.get("date") || new Date().toISOString().split("T")[0]
  try {
    const draw = await fetchPoceadaDraw(fecha)
    if (!draw || !draw.numbers || draw.numbers.length < 20) {
      return NextResponse.json({ ok: false, reason: "No publicado aún en LOTBA para " + fecha, source: "lotba" })
    }
    const supabase = getSupabaseAdmin()
    const { error } = await supabase.from("draws").upsert({
      date: draw.date,
      turno: "Poceada",
      game_id: GAME_ID,
      jurdicion: "Poceada Federal",
      numbers: draw.numbers.map(Number),
      source: draw.source,
    }, { onConflict: "date,turno,game_id" })
    if (error) throw error
    return NextResponse.json({ ok: true, fecha: draw.date, sorteoNumber: draw.sorteoNumber, numbers: draw.numbers.slice(0, 5), inserted: true })
  } catch (e: any) {
    logger.error("[cron-scrape-poceada] error", { error: String(e), fecha })
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
