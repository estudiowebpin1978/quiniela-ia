import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-client"

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization")?.replace("Bearer ", "")
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const supabase = getSupabaseAdmin()

    // Validate JWT using the same method as other endpoints
    let userId: string | null = null
    try {
      const { resolveUserTier } = await import("@/lib/auth/tier")
      const userTier = await resolveUserTier(authHeader)
      userId = userTier.userId
    } catch {
      // Fallback: try Supabase auth
      const { data: { user } } = await supabase.auth.getUser(authHeader)
      userId = user?.id || null
    }

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    let body: { endpoint?: string; p256dh?: string; auth?: string }
    try { body = await req.json() } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }) }
    const { endpoint, p256dh, auth } = body
    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 })
    }

    await supabase.from("push_subscriptions").upsert(
      { endpoint, p256dh, auth, user_id: userId },
      { onConflict: "endpoint" }
    )
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Error al guardar suscripcion" }, { status: 500 })
  }
}
