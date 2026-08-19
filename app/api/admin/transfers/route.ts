/**
 * Phase 6: Admin approve/reject transfers.
 * GET: list pending transfers
 * POST: approve or reject a transfer (activates premium)
 */

import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-client"
import { validateJwt } from "@/lib/auth/jwt"
import { ADMIN_EMAILS } from "@/lib/config"
import { revalidatePath } from "next/cache"
import logger from "@/lib/logger"

const PLAN_DAYS: Record<string, number> = {
  "15_days": 15,
  "30_days": 30,
}

async function isAdmin(token: string): Promise<boolean> {
  const decoded = validateJwt(token)
  if (!decoded?.email) return false
  return ADMIN_EMAILS.includes(decoded.email.toLowerCase())
}

export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "") || ""
  if (!await isAdmin(token)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()
  const { searchParams } = new URL(req.url)
  const status = searchParams.get("status") || "pending"

  const { data, error } = await supabase
    .from("pending_transfers")
    .select("*")
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(100)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ transfers: data || [] })
}

export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "") || ""
  if (!await isAdmin(token)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  let body: { transferId?: string; action?: "approve" | "reject" }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 })
  }

  if (!body.transferId || !body.action) {
    return NextResponse.json({ error: "Faltan transferId y action" }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  // Get transfer
  const { data: transfers } = await supabase
    .from("pending_transfers")
    .select("*")
    .eq("id", body.transferId)
    .limit(1)

  const transfer = Array.isArray(transfers) ? transfers[0] : null
  if (!transfer) {
    return NextResponse.json({ error: "Transferencia no encontrada" }, { status: 404 })
  }

  if (transfer.status !== "pending") {
    return NextResponse.json({ error: `Transferencia ya ${transfer.status}` }, { status: 409 })
  }

  if (body.action === "reject") {
    await supabase
      .from("pending_transfers")
      .update({ status: "rejected", reviewed_at: new Date().toISOString() })
      .eq("id", body.transferId)

    return NextResponse.json({ ok: true, message: "Transferencia rechazada" })
  }

  // ── APPROVE: activate premium (same logic as webhook) ──
  const days = PLAN_DAYS[transfer.plan] || 30

  // Get current profile
  const { data: profiles } = await supabase
    .from("user_profiles")
    .select("id, premium_until")
    .eq("id", transfer.user_id)
    .limit(1)

  const profile = Array.isArray(profiles) ? profiles[0] : null

  let premiumUntil: Date
  if (profile?.premium_until && new Date(profile.premium_until) > new Date()) {
    premiumUntil = new Date(new Date(profile.premium_until).getTime() + days * 86400000)
  } else {
    premiumUntil = new Date(Date.now() + days * 86400000)
  }

  // Update profile to premium
  const { error: updateError } = await supabase
    .from("user_profiles")
    .update({ role: "premium", premium_until: premiumUntil.toISOString() })
    .eq("id", transfer.user_id)

  if (updateError) {
    logger.error("[admin-transfer] Update profile failed", { error: updateError.message })
    return NextResponse.json({ error: "Error al activar premium" }, { status: 500 })
  }

  // Mark transfer as approved
  await supabase
    .from("pending_transfers")
    .update({ status: "approved", reviewed_at: new Date().toISOString() })
    .eq("id", body.transferId)

  // Create notification
  try {
    await supabase.from("notifications").insert({
      user_id: transfer.user_id,
      type: "premium_activated",
      title: "Premium activado",
      body: `Tu plan ${transfer.plan.replace("_", " ")} fue activado por transferencia.`,
      data: JSON.stringify({ plan: transfer.plan, method: "transfer" }),
    })
  } catch { /* noop */ }

  try { revalidatePath("/predictions", "page") } catch {}

  logger.info("[admin-transfer] Approved", { userId: transfer.user_id, plan: transfer.plan, until: premiumUntil.toISOString() })

  return NextResponse.json({
    ok: true,
    message: "Premium activado",
    premium_until: premiumUntil.toISOString(),
  })
}
