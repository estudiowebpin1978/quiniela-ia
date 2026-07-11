import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getSupabaseUrl, getSupabaseKey } from "@/lib/config"

export async function POST(req: NextRequest) {
  try {
    const { endpoint } = await req.json()
    if (!endpoint) {
      return NextResponse.json({ error: "Falta endpoint" }, { status: 400 })
    }
    const SB_URL = getSupabaseUrl()
    const SB_KEY = getSupabaseKey()
    if (!SB_URL || !SB_KEY) return NextResponse.json({ error: "Config" }, { status: 500 })
    const supabase = createClient(SB_URL, SB_KEY)
    await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Error al eliminar suscripcion" }, { status: 500 })
  }
}
