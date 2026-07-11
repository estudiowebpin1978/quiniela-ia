import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getSupabaseUrl, getSupabaseKey } from "@/lib/config"

export async function POST(req: NextRequest) {
  try {
    const { endpoint, p256dh, auth, userId } = await req.json()
    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 })
    }
    const SB_URL = getSupabaseUrl()
    const SB_KEY = getSupabaseKey()
    if (!SB_URL || !SB_KEY) return NextResponse.json({ error: "Config" }, { status: 500 })
    const supabase = createClient(SB_URL, SB_KEY)
    await supabase.from("push_subscriptions").upsert(
      { endpoint, p256dh, auth, user_id: userId || null },
      { onConflict: "endpoint" }
    )
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Error al guardar suscripcion" }, { status: 500 })
  }
}
