/**
 * /api/user/auto-predict
 * 
 * GET: Returns the current auto_predict_enabled state for the authenticated user.
 * POST: Toggles the auto_predict_enabled state.
 */

import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-client"
import { getAccessToken } from "@/lib/auth"

export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "") || ""
  if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  try {
    const supabase = getSupabaseAdmin()
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("auto_predict_enabled")
      .eq("id", user.id)
      .single()

    return NextResponse.json({ enabled: profile?.auto_predict_enabled ?? false })
  } catch {
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "") || ""
  if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  try {
    const supabase = getSupabaseAdmin()
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const { enabled } = await req.json()
    if (typeof enabled !== "boolean") {
      return NextResponse.json({ error: "Invalid value" }, { status: 400 })
    }

    const { error } = await supabase
      .from("user_profiles")
      .update({ auto_predict_enabled: enabled })
      .eq("id", user.id)

    if (error) throw error

    return NextResponse.json({ ok: true, enabled })
  } catch (e) {
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
