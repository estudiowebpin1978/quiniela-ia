import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export async function POST(req: NextRequest) {
  try {
    const { endpoint, p256dh, auth, userId } = await req.json()
    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 })
    }
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    await supabase.from("push_subscriptions").upsert(
      { endpoint, p256dh, auth, user_id: userId || null },
      { onConflict: "endpoint" }
    )
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Error al guardar suscripcion" }, { status: 500 })
  }
}
