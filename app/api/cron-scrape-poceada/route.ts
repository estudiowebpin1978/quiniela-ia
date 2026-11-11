import { NextRequest, NextResponse } from "next/server"
import { validateCronAuth, unauthorizedResponse } from "@/lib/cron/auth"
import { fetchPoceadaDraw } from "@/lib/scrapers/poceada"
import { getSupabaseAdmin } from '@/lib/supabase-client'
import logger from '@/lib/logger'

export const maxDuration = 30
const GAME_ID = "d0e1f2a3-b4c5-6789-0abc-def012345678"

export async function GET(req: NextRequest) {
  // Autenticado: la fuente es oficial pero la escritura debe ser auth
  const auth = await validateCronAuth(req)
  if (!auth.authorized) return unauthorizedResponse()

  const fecha = req.nextUrl.searchParams.get("date") || new Date().toISOString().split("T")[0]
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return NextResponse.json({ ok: false, error: "fecha inválida (YYYY-MM-DD)" }, { status: 400 })
  }

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
      jurisdiccion: "ciudad", // la fuente de esta ruta es LOTBA Poceada Ciudad ('ciudad')
      numbers: draw.numbers.map(Number),
      source: draw.source,
    }, { onConflict: "date,turno,game_id" })
    if (error) throw error
    return NextResponse.json({ ok: true, fecha: draw.date, sorteoNumber: draw.sorteoNumber, numbers: draw.numbers.slice(0, 5), inserted: true })
  } catch (e: unknown) {
    logger.error("[cron-scrape-poceada] error", { error: String(e), fecha })
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 })
  }
}
