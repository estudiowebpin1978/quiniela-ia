/**
 * Phase 5: Transfer payment — "Ya transferí" button.
 * Creates a pending_transfer record and returns WhatsApp URL.
 */

import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-client"
import { validateJwt } from "@/lib/auth/jwt"
import { PLAN_AMOUNTS } from "@/lib/config"
import logger from "@/lib/logger"

const PLANS = {
  "15_days": { amount: PLAN_AMOUNTS["15_days"], label: "15 días" },
  "30_days": { amount: PLAN_AMOUNTS["30_days"], label: "30 días" },
} as const

const WHATSAPP_NUMBER = "5493415555555" // Número de WhatsApp del admin

// ─── Rate Limiting (in-memory, per-cold-start) ─────────────────────────────
const RATE_LIMIT_WINDOW = 60_000
const RATE_LIMIT_MAX = 5
const rateLimitMap = new Map<string, { count: number; windowStart: number }>()

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW) {
    rateLimitMap.set(ip, { count: 1, windowStart: now })
    return true
  }
  entry.count++
  return entry.count <= RATE_LIMIT_MAX
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("x-real-ip")
    || "unknown"
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 })
  }

  const token = req.headers.get("authorization")?.replace("Bearer ", "") || ""
  const decoded = await validateJwt(token)
  if (!decoded) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  let body: { plan?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 })
  }

  const plan = body.plan as keyof typeof PLANS | undefined
  if (!plan || !PLANS[plan]) {
    return NextResponse.json({ error: "Plan inválido" }, { status: 400 })
  }

  const planData = PLANS[plan]
  const supabase = getSupabaseAdmin()

  // Check for existing pending transfer
  const { data: existing } = await supabase
    .from("pending_transfers")
    .select("id, status")
    .eq("user_id", decoded.userId)
    .eq("status", "pending")
    .limit(1)

  if (Array.isArray(existing) && existing.length > 0) {
    return NextResponse.json({
      error: "Ya tenés una transferencia pendiente",
      transferId: existing[0].id,
    }, { status: 409 })
  }

  // Create transfer record
  const { data: transfer, error } = await supabase
    .from("pending_transfers")
    .insert({
      user_id: decoded.userId,
      plan,
      amount: planData.amount,
      status: "pending",
    })
    .select("id")
    .single()

  if (error) {
    logger.error("[transfer] Failed to create", { error: error.message })
    return NextResponse.json({ error: "Error al registrar transferencia" }, { status: 500 })
  }

  // Build WhatsApp message
  const email = decoded.email || "sin email"
  const msg = encodeURIComponent(
    `Hola, acabo de transferir $${planData.amount.toLocaleString("es-AR")} para el plan de ${planData.label}. Mi email de usuario es: ${email}`
  )
  const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${msg}`

  logger.info("[transfer] Created", { userId: decoded.userId, plan, transferId: transfer.id })

  return NextResponse.json({
    transferId: transfer.id,
    whatsappUrl,
    message: "Transferencia registrada. Envianos el comprobante por WhatsApp.",
  })
}
