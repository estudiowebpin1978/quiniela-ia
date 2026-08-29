/**
 * GET /api/notifications — List user notifications
 * POST /api/notifications — Mark all as read
 */

import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-client"
import { resolveUserTier } from "@/lib/auth/tier"
import logger from "@/lib/logger"

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") || ""
  const token = auth.replace("Bearer ", "")
  if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const tier = await resolveUserTier(token)
  if (!tier.userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const url = new URL(req.url)
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100)
  const unreadOnly = url.searchParams.get("unread") === "true"

  const supabase = getSupabaseAdmin()

  let query = supabase
    .from("notifications")
    .select("*")
    .eq("user_id", tier.userId)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (unreadOnly) {
    query = query.eq("read", false)
  }

  const { data, error } = await query

  if (error) {
    logger.error("[notifications] GET error", { error: error.message })
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }

  // Get unread count
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", tier.userId)
    .eq("read", false)

  return NextResponse.json({ notifications: data || [], unreadCount: count || 0 })
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") || ""
  const token = auth.replace("Bearer ", "")
  if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const tier = await resolveUserTier(token)
  if (!tier.userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const supabase = getSupabaseAdmin()

  const { error } = await supabase.rpc("mark_notifications_read", { p_user_id: tier.userId })

  if (error) {
    logger.error("[notifications] POST mark read error", { error: error.message })
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
