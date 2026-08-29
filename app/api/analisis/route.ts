import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-client"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const turno = req.nextUrl.searchParams.get("turno")

  try {
    const supabase = getSupabaseAdmin()

    if (turno) {
      const { data, error } = await supabase.rpc("get_analisis_frecuencia", { p_turno: turno })
      if (error) throw error
      return NextResponse.json({ turno, ...data })
    }

    const { data, error } = await supabase.rpc("get_analisis_global")
    if (error) throw error
    return NextResponse.json(data)

  } catch (e: unknown) {
    const err = e as { message?: string }
    return NextResponse.json({ error: err.message || "Error" }, { status: 500 })
  }
}
