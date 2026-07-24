import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getSupabaseUrl, getSupabaseKey } from "@/lib/config"

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization")?.replace("Bearer ", "")
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const SB_URL = getSupabaseUrl()
    const SB_KEY = getSupabaseKey()
    if (!SB_URL || !SB_KEY) return NextResponse.json({ error: "Config" }, { status: 500 })

    const supabase = createClient(SB_URL, SB_KEY)
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader)
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { endpoint, p256dh, auth } = await req.json()
    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 })
    }

    await supabase.from("push_subscriptions").upsert(
      { endpoint, p256dh, auth, user_id: user.id },
      { onConflict: "endpoint" }
    )
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Error al guardar suscripcion" }, { status: 500 })
  }
}
