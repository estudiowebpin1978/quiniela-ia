/**
 * MercadoPago Webhook — Pago aprobado → upgrade a premium.
 *
 * Flow:
 * 1. Receives notification from MercadoPago when payment status changes
 * 2. Verifies the payment via GET /v1/payments/{id} using access token
 * 3. If approved, activates premium in Supabase (extends if already active)
 *
 * URL to register in MercadoPago dashboard:
 *   https://quiniela-ia-two.vercel.app/api/webhook-mercadopago
 *
 * Env vars needed:
 *   MERCADOPAGO_ACCESS_TOKEN — from MercadoPago credentials
 */

import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-client"
import { PLAN_DAYS, AMOUNT_PLAN_MAP } from "@/lib/config"
import logger from "@/lib/logger"

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface MercadoPagoPayment {
  id: number
  status: string
  status_detail: string
  external_reference?: string
  transaction_amount?: number
  description?: string
  [key: string]: unknown
}

// ─── Constants ───────────────────────────────────────────────────────────────

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ─── Rate Limiting (in-memory) ───────────────────────────────────────────────

const rateLimitStore = new Map<string, number[]>()
const RATE_LIMIT_WINDOW = 60_000 // 1 minute
const RATE_LIMIT_MAX = 30 // per IP per window

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const timestamps = rateLimitStore.get(ip) || []
  const recent = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW)
  if (recent.length >= RATE_LIMIT_MAX) return false
  recent.push(now)
  rateLimitStore.set(ip, recent)
  return true
}

// ─── Payment Verification against MercadoPago API ────────────────────────────

async function verifyMercadoPagoPayment(paymentId: number): Promise<{
  verified: boolean
  status?: string
  externalReference?: string
  amount?: number
}> {
  const accessToken = (process.env.MERCADOPAGO_ACCESS_TOKEN || "").replace(/"/g, "").trim()
  if (!accessToken) {
    logger.error("[webhook-mercadopago] MERCADOPAGO_ACCESS_TOKEN not configured")
    return { verified: false }
  }

  try {
    const resp = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(10000),
    })

    if (!resp.ok) {
      logger.warn("[webhook-mercadopago] Payment verification failed", { status: resp.status })
      return { verified: false }
    }

    const data = await resp.json() as MercadoPagoPayment
    return {
      verified: true,
      status: data.status,
      externalReference: data.external_reference,
      amount: data.transaction_amount,
    }
  } catch (e) {
    logger.error("[webhook-mercadopago] Payment verification error", { error: String(e) })
    return { verified: false }
  }
}

// ─── POST Handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── 0a. Rate limit ─────────────────────────────────────────────────
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("x-real-ip")
    || "unknown"

  if (!checkRateLimit(ip)) {
    logger.warn("[webhook-mercadopago] Rate limited", { ip })
    return NextResponse.json({ ok: true }) // Return 200 to prevent MP retries
  }

  const rawBody = await req.text()
  logger.info("[webhook-mercadopago] Received notification")

  // ── 1. Parse payload ──────────────────────────────────────────────
  let body: Record<string, unknown>
  try {
    body = JSON.parse(rawBody)
  } catch {
    logger.warn("[webhook-mercadopago] Could not parse body")
    return NextResponse.json({ ok: true })
  }

  // ── 2. Extract payment ID ─────────────────────────────────────────
  // MercadoPago sends: { action: "payment.created", data: { id: 123456 } }
  // Or for topic-based webhooks: ?topic=payment&id=123456
  const paymentId = body.data && typeof body.data === "object"
    ? (body.data as Record<string, unknown>).id
    : body.id || (typeof body.resource === "string" ? body.resource.split("/").pop() : null)

  if (!paymentId) {
    logger.warn("[webhook-mercadopago] No payment ID in payload", { body: JSON.stringify(body).slice(0, 200) })
    return NextResponse.json({ ok: true })
  }

  const numericId = Number(paymentId)
  if (isNaN(numericId)) {
    logger.warn("[webhook-mercadopago] Invalid payment ID", { paymentId })
    return NextResponse.json({ ok: true })
  }

  // ── 3. Verify payment against MercadoPago API ────────────────────
  const verification = await verifyMercadoPagoPayment(numericId)
  if (!verification.verified) {
    logger.warn("[webhook-mercadopago] Could not verify payment", { paymentId: numericId })
    return NextResponse.json({ ok: true })
  }

  // ── 4. Skip non-approved (return 200 so MP stops retrying) ───────
  if (verification.status !== "approved") {
    logger.info("[webhook-mercadopago] Non-approved payment, ignoring", {
      paymentId: numericId,
      status: verification.status,
    })
    return NextResponse.json({ ok: true })
  }

  // ── 5. Determine user from external_reference ────────────────────
  const userId = verification.externalReference
  if (!userId) {
    logger.warn("[webhook-mercadopago] No external_reference in payment", { paymentId: numericId })
    return NextResponse.json({ ok: true })
  }

  const safeUserId = String(userId).replace(/[^a-zA-Z0-9_-]/g, "")
  if (!UUID_REGEX.test(safeUserId)) {
    logger.warn("[webhook-mercadopago] Invalid userId format", { userId: safeUserId })
    return NextResponse.json({ ok: true })
  }

  // ── 6. Determine plan from amount ────────────────────────────────
  const amount = verification.amount
  const amountStr = String(Math.round(Number(amount) || 0))
  const plan = AMOUNT_PLAN_MAP[amountStr]
  if (!plan) {
    logger.warn("[webhook-mercadopago] Unknown amount, rejecting", { amount: amountStr, paymentId: numericId })
    return NextResponse.json({ ok: true })
  }
  const days = PLAN_DAYS[plan]

  // ── 7. Idempotency: insert log FIRST to prevent race conditions ─
  const supabase = getSupabaseAdmin()

  try {
    const { error: logError } = await supabase
      .from("webhook_logs")
      .insert({
        source: "mercadopago",
        order_id: String(numericId),
        payload: JSON.stringify({ status: verification.status, amount, plan }),
        user_id: safeUserId,
        status: "processing",
        created_at: new Date().toISOString(),
      })

    if (logError && (logError.code === "23505" || logError.message?.includes("unique"))) {
      logger.info("[webhook-mercadopago] Payment already processed (idempotent), skipping", { paymentId: numericId })
      return NextResponse.json({ ok: true })
    }
    if (logError && !logError.message?.includes("relation") && !logError.message?.includes("does not exist")) {
      logger.error("[webhook-mercadopago] Idempotency insert failed", { error: logError.message })
      return NextResponse.json({ error: "Error de persistencia" }, { status: 500 })
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    if (!msg.includes("relation") && !msg.includes("does not exist") && !msg.includes("42P01")) {
      logger.error("[webhook-mercadopago] Idempotency check error", { error: msg })
      return NextResponse.json({ error: "Error de persistencia" }, { status: 500 })
    }
  }

  // ── 8. Fetch user profile ────────────────────────────────────────
  const { data: profiles } = await supabase
    .from("user_profiles")
    .select("id, role, premium_until")
    .eq("id", safeUserId)
    .limit(1)

  let profile = Array.isArray(profiles) ? profiles[0] : null

  if (!profile) {
    await supabase
      .from("user_profiles")
      .insert({ id: safeUserId, email: "", role: "free" })

    const { data: newProfiles } = await supabase
      .from("user_profiles")
      .select("id, role, premium_until")
      .eq("id", safeUserId)
      .limit(1)
    profile = Array.isArray(newProfiles) ? newProfiles[0] : null
  }

  if (!profile) {
    return NextResponse.json({ ok: false, error: "Profile not found" }, { status: 500 })
  }

  // ── 9. Skip admin ────────────────────────────────────────────────
  if (profile.role === "admin") {
    return NextResponse.json({ ok: true, message: "Admin, skipped" })
  }

  // ── 10. Calculate premium_until (extend if already active) ───────
  let premiumUntil: Date
  if (profile.premium_until && new Date(profile.premium_until) > new Date()) {
    premiumUntil = new Date(new Date(profile.premium_until).getTime() + days * 86400000)
  } else {
    premiumUntil = new Date(Date.now() + days * 86400000)
  }

  // ── 11. Update profile to premium ────────────────────────────────
  const { error: updateError } = await supabase
    .from("user_profiles")
    .update({
      role: "premium",
      premium_until: premiumUntil.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", safeUserId)

  if (updateError) {
    logger.error("[webhook-mercadopago] Failed to update profile", { error: updateError.message, userId: safeUserId })
    return NextResponse.json({ ok: false, error: "Update failed" }, { status: 500 })
  }

  logger.info("[webhook-mercadopago] Premium activated", {
    userId: safeUserId,
    plan,
    days,
    premiumUntil: premiumUntil.toISOString(),
    paymentId: numericId,
  })

  // ── 12. Update idempotency log ───────────────────────────────────
  try {
    await supabase
      .from("webhook_logs")
      .update({ status: "completed" })
      .eq("source", "mercadopago")
      .eq("order_id", String(numericId))
  } catch { /* non-fatal */ }

  return NextResponse.json({
    ok: true,
    message: "Premium activated",
    userId: safeUserId,
    plan,
    premiumUntil: premiumUntil.toISOString(),
  })
}

// ─── GET Handler (for MercadoPago validation) ────────────────────────────────

export async function GET() {
  return NextResponse.json({
    status: "ok",
    provider: "mercadopago",
    message: "Webhook endpoint active. Register this URL in MercadoPago dashboard.",
  })
}
