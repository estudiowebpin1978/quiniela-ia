import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-client"

export async function POST(req: NextRequest) {
  try {
    const { endpoint } = await req.json()
    if (!endpoint) {
      return NextResponse.json({ error: "Falta endpoint" }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Error al eliminar suscripcion" }, { status: 500 })
  }
}
