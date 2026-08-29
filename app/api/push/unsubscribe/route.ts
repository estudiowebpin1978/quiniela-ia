import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-client"
import { validateJwt } from "@/lib/auth/jwt"

export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "") || ""
  const decoded = await validateJwt(token)
  if (!decoded) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  try {
    const { endpoint } = await req.json()
    if (!endpoint) {
      return NextResponse.json({ error: "Falta endpoint" }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    await supabase
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", endpoint)
      .eq("user_id", decoded.userId)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Error al eliminar suscripcion" }, { status: 500 })
  }
}
