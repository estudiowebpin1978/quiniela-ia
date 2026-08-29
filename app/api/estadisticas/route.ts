import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-client"

export const dynamic = "force-dynamic"

export async function GET(_req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase.rpc("get_estadisticas")

    if (error) throw error

    return NextResponse.json(data || {
      totalSorteos: 0, pct: "--", racha: 0, mensaje: "Sin datos", ultimosDias: []
    })
  } catch (e: unknown) {
    const err = e as { message?: string }
    return NextResponse.json({
      totalSorteos: 0, pct: "--", racha: "--",
      mensaje: "Error interno del servidor"
    }, { status: 500 })
  }
}
