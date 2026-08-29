/**
 * Webhook Ualá Bis v2 — Pago aprobado → upgrade a premium.
 *
 * La API v2 NO usa HMAC secret. El webhook:
 * 1. Recibe notificación de Ualá cuando cambia el estado de la orden
 * 2. Verifica la orden consultando la API de Ualá (GET /orders/{id})
 * 3. Si está APPROVED, activa premium en Supabase
 *
 * URL a registrar en Ualá Bis (se envía via notification_url al crear la orden):
 *   https://quiniela-ia-two.vercel.app/api/webhook-uala
 */

import { NextRequest, NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { timingSafeEqual, createHmac } from "crypto"
import { getSupabaseAdmin } from "@/lib/supabase-client"
import { PLAN_DAYS, AMOUNT_PLAN_MAP } from "@/lib/config"
import logger from "@/lib/logger"

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface UalaBisPayload {
  id?: string
  order_id?: string
  uuid?: string
  status?: string
  state?: string
  external_reference?: string
  amount?: number | string
  [key: string]: unknown
}

// ─── Constants ───────────────────────────────────────────────────────────────

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ─── HMAC Signature Verification ──────────────────────────────────────────────

function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  const secret = (process.env.UALA_WEBHOOK_SECRET || "").replace(/"/g, "").trim()
  if (!secret) {
    logger.error("[webhook-uala] UALA_WEBHOOK_SECRET not configured — rejecting webhook")
    return false
  }
  if (!signature) return false

  try {
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex")
    const sigBuf = Buffer.from(signature.padEnd(64, "\0"))
    const expectedBuf = Buffer.from(expected.padEnd(64, "\0"))
    return timingSafeEqual(sigBuf, expectedBuf)
  } catch {
    return false
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getUalaToken(): Promise<string | null> {
  const userName = process.env.UALA_USERNAME
  const clientId = process.env.UALA_CLIENT_ID
  const clientSecret = process.env.UALA_CLIENT_SECRET

  if (!userName || !clientId || !clientSecret) {
    logger.error("[webhook-uala] Missing UALA credentials")
    return null
  }

  try {
    const response = await fetch("https://auth.developers.ar.ua.la/v2/api/auth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: userName,
        client_id: clientId,
        client_secret_id: clientSecret,
        grant_type: "client_credentials",
      }),
      signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) {
      logger.error("[webhook-uala] Ualá auth failed", { status: response.status })
      return null
    }

    const data = await response.json()
    return data.access_token || null
  } catch (error) {
    logger.error("[webhook-uala] Ualá auth error", { error: String(error) })
    return null
  }
}

async function verifyUalaOrder(orderId: string): Promise<{ verified: boolean; status: string; amount?: number; externalReference?: string }> {
  const accessToken = await getUalaToken()
  if (!accessToken) {
    return { verified: false, status: "NO_TOKEN" }
  }

  try {
    const response = await fetch(`https://checkout.developers.ar.ua.la/v2/api/orders/${orderId}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) {
      logger.error("[webhook-uala] Order fetch failed", { status: response.status, orderId })
      return { verified: false, status: "FETCH_ERROR" }
    }

    const data = await response.json()
    return {
      verified: true,
      status: (data.status || "").toString().toUpperCase(),
      amount: data.amount,
      externalReference: data.external_reference,
    }
  } catch (error) {
    logger.error("[webhook-uala] Order fetch error", { error: String(error), orderId })
    return { verified: false, status: "ERROR" }
  }
}

// ─── Rate Limiting (in-memory, per-cold-start) ─────────────────────────────

const RATE_LIMIT_WINDOW = 60_000 // 1 minute
const RATE_LIMIT_MAX = 30 // max requests per window per IP
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

// ─── Main Handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── 0. Rate limit ─────────────────────────────────────────────────────
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("x-real-ip")
    || "unknown"

  if (!checkRateLimit(ip)) {
    logger.warn("[webhook-uala] Rate limited", { ip })
    return NextResponse.json({ ok: true }) // Return 200 so Ualá doesn't retry
  }

  const rawBody = await req.text()
  logger.info("[webhook-uala] Received notification")

  // ── 0b. Verify HMAC signature ────────────────────────────────────────
  const signature = req.headers.get("x-signature") || req.headers.get("x-uala-signature") || req.headers.get("x-webhook-signature")
  if (!verifyWebhookSignature(rawBody, signature)) {
    logger.warn("[webhook-uala] Invalid signature", { hasSignature: !!signature })
    return NextResponse.json({ ok: true }) // Return 200 to prevent retries
  }

  // ── 1. Parse payload ──────────────────────────────────────────────────
  let body: UalaBisPayload
  try {
    const parsed = JSON.parse(rawBody) as Record<string, unknown>
    body = (parsed.data ? parsed.data : parsed) as UalaBisPayload
  } catch {
    logger.warn("[webhook-uala] Could not parse body")
    return NextResponse.json({ ok: true })
  }

  // ── 2. Extract order ID and status ───────────────────────────────────
  const orderId = body.id || body.order_id || body.uuid || null
  const status = (body.status || body.state || "").toString().toUpperCase()

  logger.info("[webhook-uala] Notification details", { orderId, status, externalRef: body.external_reference })

  // ── 3. Skip non-approved (but return 200 so Ualá stops retrying) ─────
  if (status !== "APPROVED" && status !== "COMPLETED" && status !== "PROCESSED") {
    logger.info("[webhook-uala] Non-approved status, ignoring", { status })
    return NextResponse.json({ ok: true })
  }

  // ── 4. If no orderId, can't verify → skip ────────────────────────────
  if (!orderId) {
    logger.warn("[webhook-uala] No orderId in payload")
    return NextResponse.json({ ok: true })
  }

  // ── 5. Verify order against Ualá API ─────────────────────────────────
  const verification = await verifyUalaOrder(String(orderId))
  if (!verification.verified) {
    logger.warn("[webhook-uala] Could not verify order", { orderId })
    return NextResponse.json({ ok: true })
  }

  if (verification.status !== "APPROVED" && verification.status !== "COMPLETED" && verification.status !== "PROCESSED") {
    logger.info("[webhook-uala] Order not approved on Ualá", { orderId, ualaStatus: verification.status })
    return NextResponse.json({ ok: true })
  }

  // ── 6. Determine user from external_reference ────────────────────────
  const userId = verification.externalReference || body.external_reference || null
  if (!userId) {
    logger.warn("[webhook-uala] No external_reference")
    return NextResponse.json({ ok: true })
  }

  const safeUserId = String(userId).replace(/[^a-zA-Z0-9_-]/g, "")
  if (!UUID_REGEX.test(safeUserId)) {
    logger.warn("[webhook-uala] Invalid userId format", { userId: safeUserId })
    return NextResponse.json({ ok: true })
  }

  // ── 7. Determine plan from amount ────────────────────────────────────
  const amount = verification.amount || body.amount
  const amountStr = String(Math.round(Number(amount) || 0))
  const plan = AMOUNT_PLAN_MAP[amountStr]
  if (!plan) {
    logger.warn("[webhook-uala] Unknown amount, rejecting", { amount: amountStr })
    return NextResponse.json({ ok: true })
  }
  const days = PLAN_DAYS[plan]

  // ── 8. Idempotency: insert log FIRST to prevent race conditions ─────
  const supabase = getSupabaseAdmin()

  try {
    const { error: logError } = await supabase
      .from("webhook_logs")
      .insert({
        source: "ualabis",
        order_id: String(orderId),
        payload: JSON.stringify({ status: verification.status, amount, plan }),
        user_id: safeUserId,
        status: "processing",
        created_at: new Date().toISOString(),
      })

    // If insert failed due to unique constraint, this order was already processed
    if (logError && (logError.code === "23505" || logError.message?.includes("unique"))) {
      logger.info("[webhook-uala] Order already processed (idempotent), skipping", { orderId })
      return NextResponse.json({ ok: true })
    }
    // If insert failed for other reasons (not table missing), abort to prevent double processing
    if (logError && !logError.message?.includes("relation") && !logError.message?.includes("does not exist")) {
      logger.error("[webhook-uala] Idempotency insert failed", { error: logError.message })
      return NextResponse.json({ error: "Error de persistencia" }, { status: 500 })
    }
  } catch (e: unknown) {
    // webhook_logs table may not exist — continue without idempotency check only for that case
    const msg = e instanceof Error ? e.message : String(e)
    if (!msg.includes("relation") && !msg.includes("does not exist") && !msg.includes("42P01")) {
      logger.error("[webhook-uala] Idempotency check error", { error: msg })
      return NextResponse.json({ error: "Error de persistencia" }, { status: 500 })
    }
  }

  // ── 9. Fetch user profile ────────────────────────────────────────────
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

  // ── 10. Skip admin ────────────────────────────────────────────────────
  if (profile.role === "admin") {
    return NextResponse.json({ ok: true, message: "Admin, skipped" })
  }

  // ── 11. Calculate premium_until (extend if already active) ───────────
  let premiumUntil: Date
  if (profile.premium_until && new Date(profile.premium_until) > new Date()) {
    premiumUntil = new Date(new Date(profile.premium_until).getTime() + days * 86400000)
  } else {
    premiumUntil = new Date(Date.now() + days * 86400000)
  }

  // ── 12. Update profile ────────────────────────────────────────────────
  const { error: updateError } = await supabase
    .from("user_profiles")
    .update({ role: "premium", premium_until: premiumUntil.toISOString() })
    .eq("id", safeUserId)

  if (updateError) {
    logger.error("[webhook-uala] Update failed", { error: updateError.message })
    return NextResponse.json({ ok: false, error: "Update failed" }, { status: 500 })
  }

  // ── 13. Update log status to processed ────────────────────────────────
  try {
    await supabase
      .from("webhook_logs")
      .update({ status: "processed" })
      .eq("order_id", String(orderId))
      .eq("status", "processing")
  } catch {
    // non-fatal
  }

  // ── 14. Revalidate ───────────────────────────────────────────────────
  try { revalidatePath("/predictions", "page") } catch {}

  logger.info("[webhook-uala] Premium activated", { userId: safeUserId, plan, until: premiumUntil.toISOString() })
  return NextResponse.json({ ok: true })
}
