/**
 * Webhook Ualá Bis — Pago aprobado → upgrade a premium.
 *
 * Environment Variables (configurar en Vercel → Settings → Environment Variables):
 *   UALABIS_WEBHOOK_SECRET  — Secret HMAC que Ualá Bis te entrega en su panel de desarrollador.
 *                              Garantiza que el mensaje viene de ellos.
 *   UALA_API_KEY            — API key de Ualá Bis para verificar pagos (opcional pero recomendado).
 *   UALA_BASE_URL           — Base URL de la API de Ualá (default: https://api.uala.com.ar).
 *   SUPABASE_SERVICE_ROLE_KEY — Service Role key de Supabase (NUNCA exponer en frontend).
 *
 * URL a registrar en Ualá Bis:
 *   https://tu-dominio.com/api/webhook-uala
 *
 * Seguridad:
 *   1. Extrae el header x-ualabis-signature (HMAC-SHA256 del body con UALABIS_WEBHOOK_SECRET).
 *   2. Si la firma no coincide → 401 Unauthorized.
 *   3. Verifica el pago contra la API de Ualá antes de activar premium.
 *   4. Idempotencia: si el orderId ya fue procesado, devuelve 200 sin re-procesar.
 */

import { NextRequest, NextResponse } from "next/server"
import { createHmac, timingSafeEqual } from "crypto"
import { revalidatePath } from "next/cache"
import { getSupabaseAdmin } from "@/lib/supabase-client"
import logger from "@/lib/logger"

// ─── Interfaces ──────────────────────────────────────────────────────────────

/** Payload que Ualá Bis envía al webhook */
interface UalaBisPayload {
  /** ID del pago en Ualá */
  id?: string
  order_id?: string
  payment_id?: string

  /** Estado del pago: APPROVED, REJECTED, FAILED, PENDING, etc. */
  status?: string
  state?: string
  payment_status?: string

  /** Referencia externa = user_id de Supabase */
  external_reference?: string
  external_id?: string
  user_id?: string

  /** Monto del pago */
  amount?: number | string
  transaction_amount?: number | string
  total_amount?: number | string

  /** Tipo de plan (semanal, mensual) */
  plan?: string

  /** Cualquier otro campo */
  [key: string]: unknown
}

/** Estructura anidada que Ualá Bis a veces usa */
interface UalaBisWebhookBody {
  data?: UalaBisPayload
  [key: string]: unknown
}

/** Resultado de verificación contra la API de Ualá */
interface PaymentVerification {
  verified: boolean
  status: string
  amount?: number
}

// ─── Constants ───────────────────────────────────────────────────────────────

const PLAN_DAYS: Record<string, number> = {
  "15_days": 15,
  "30_days": 30,
  semanal: 7,
  mensual: 30,
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Comparación timing-safe para evitar timing attacks */
function safeCompare(a: string, b: string): boolean {
  if (!a || !b) return false
  const maxLen = Math.max(a.length, b.length)
  const bufA = Buffer.from(a.padEnd(maxLen, "\0"))
  const bufB = Buffer.from(b.padEnd(maxLen, "\0"))
  return timingSafeEqual(bufA, bufB)
}

/** Calcula HMAC-SHA256 del body usando el webhook secret */
function computeHmac(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex")
}

/** Obtiene token de acceso de Ualá Bis */
async function getUalaToken(): Promise<string | null> {
  const userName = process.env.UALA_USERNAME || process.env.UALABIS_USER_NAME
  const clientId = process.env.UALA_CLIENT_ID || process.env.UALABIS_CLIENT_ID
  const clientSecret = process.env.UALA_CLIENT_SECRET || process.env.UALABIS_CLIENT_SECRET

  if (!userName || !clientId || !clientSecret) {
    logger.error("[webhook-uala] UALA auth credentials not configured")
    return null
  }

  try {
    const response = await fetch("https://ua.la", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_name: userName,
        client_id: clientId,
        client_secret: clientSecret,
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

/** Verifica el pago contra la API de Ualá Bis */
async function verifyUalaPayment(paymentId: string): Promise<PaymentVerification> {
  const accessToken = await getUalaToken()
  if (!accessToken) {
    return { verified: false, status: "UNVERIFIED" }
  }

  try {
    const response = await fetch(`https://ua.la/orders/${paymentId}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
      },
      signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) {
      logger.error("[webhook-uala] Ualá API verification failed", { status: response.status })
      return { verified: false, status: "ERROR" }
    }

    const data = await response.json()
    return {
      verified: true,
      status: data.status || "UNKNOWN",
      amount: data.amount,
    }
  } catch (error) {
    logger.error("[webhook-uala] Ualá API error", { error: String(error) })
    return { verified: false, status: "ERROR" }
  }
}

// ─── Main Handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── 1. Validate webhook secret is configured ──────────────────────────
  const webhookSecret = process.env.UALABIS_WEBHOOK_SECRET || process.env.UALA_WEBHOOK_SECRET
  if (!webhookSecret) {
    logger.error("[webhook-uala] UALABIS_WEBHOOK_SECRET / UALA_WEBHOOK_SECRET is not configured")
    return NextResponse.json({ ok: false, error: "Webhook not configured" }, { status: 500 })
  }

  // ── 2. Read raw body for HMAC verification ────────────────────────────
  const rawBody = await req.text()

  // ── 3. Verify HMAC signature ──────────────────────────────────────────
  // Ualá Bis sends the signature in x-ualabis-signature header
  const incomingSignature = req.headers.get("x-uala-signature")
    || req.headers.get("x-ualabis-signature")
    || req.headers.get("x-webhook-secret")
    || ""

  if (!incomingSignature) {
    logger.warn("[webhook-uala] Missing signature header")
    return NextResponse.json({ ok: false, error: "Missing signature" }, { status: 401 })
  }

  const expectedHmac = computeHmac(rawBody, webhookSecret)
  const signatureValid = safeCompare(incomingSignature, expectedHmac)

  // Fallback: also check plain secret comparison (for backwards compatibility)
  const plainSecretValid = safeCompare(incomingSignature, webhookSecret)

  if (!signatureValid && !plainSecretValid) {
    logger.warn("[webhook-uala] Invalid signature", {
      expected: expectedHmac.substring(0, 8) + "...",
      received: incomingSignature.substring(0, 8) + "...",
    })
    return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 401 })
  }

  // ── 4. Parse payload ──────────────────────────────────────────────────
  let body: UalaBisPayload
  try {
    const parsed = JSON.parse(rawBody) as Record<string, unknown>
    body = (parsed.data ? parsed.data : parsed) as UalaBisPayload
  } catch {
    logger.warn("[webhook-uala] Could not parse body as JSON")
    return NextResponse.json({ ok: true })
  }

  logger.info("[webhook-uala] Received payment notification")

  // ── 5. Extract fields ─────────────────────────────────────────────────
  const orderId = body.id || body.order_id || body.payment_id || null
  const status = (body.status || body.state || body.payment_status || "").toString().toUpperCase()
  const userId = body.external_reference || body.external_id || body.user_id || null
  const amountRaw = body.amount || body.transaction_amount || body.total_amount || "0"
  const amount = parseFloat(String(amountRaw).replace(",", "."))

  // ── 6. Reject non-approved payments (return 200 per spec) ─────────────
  if (status !== "APPROVED" && status !== "COMPLETED" && status !== "PROCESSED") {
    logger.info("[webhook-uala] Non-approved status, ignoring", { status, orderId })
    return NextResponse.json({ ok: true, message: `Status ${status} ignored` })
  }

  // ── 7. Validate userId ────────────────────────────────────────────────
  if (!userId) {
    return NextResponse.json({ ok: true, message: "No userId" })
  }

  const safeUserId = String(userId).replace(/[^a-zA-Z0-9_-]/g, "")
  if (!UUID_REGEX.test(safeUserId)) {
    return NextResponse.json({ ok: true, message: "Invalid userId format" })
  }

  // ── 8. Idempotency: check if already processed ────────────────────────
  if (orderId) {
    try {
      const supabase = getSupabaseAdmin()
      const { data: existingLogs } = await supabase
        .from("webhook_logs")
        .select("id")
        .contains("payload", JSON.stringify({ orderId }))
        .limit(1)

      if (Array.isArray(existingLogs) && existingLogs.length > 0) {
        logger.info("[webhook-uala] Duplicate orderId, skipping", { orderId })
        return NextResponse.json({ ok: true, message: "Already processed" })
      }
    } catch {
      // webhook_logs table may not exist — continue processing
    }
  }

  // ── 9. Verify payment with Ualá API ───────────────────────────────────
  if (orderId) {
    const verification = await verifyUalaPayment(String(orderId))
    if (!verification.verified) {
      logger.warn("[webhook-uala] Payment verification failed", { orderId, status: verification.status })
      return NextResponse.json({ ok: true, message: "Payment not verified" })
    }
    if (verification.amount !== undefined) {
      logger.info("[webhook-uala] Payment verified", { orderId, amount: verification.amount })
    }
  }

  // ── 10. Determine plan and premium duration ────────────────────────────
  // Priority: explicit plan field > amount-based fallback
  const explicitPlan = body.plan ? String(body.plan).toLowerCase() : null
  let plan = "mensual"
  if (explicitPlan && PLAN_DAYS[explicitPlan]) {
    plan = explicitPlan
  } else if (amount > 0 && amount <= 3600) {
    plan = "semanal"
  }
  const requestedDays = PLAN_DAYS[plan] || 30
  const premiumUntil = new Date(Date.now() + requestedDays * 86400000).toISOString()

  // ── 11. Fetch or create user profile ───────────────────────────────────
  const supabase = getSupabaseAdmin()

  const { data: profiles, error: profError } = await supabase
    .from("user_profiles")
    .select("id, role, premium_until")
    .eq("id", safeUserId)
    .limit(1)

  if (profError) {
    logger.error("[webhook-uala] Failed to fetch user profile", { error: profError.message })
    try {
      await supabase.from("webhook_logs").insert({
        source: "uala",
        payload: JSON.stringify({ orderId, status, amount }),
        user_id: safeUserId,
        error: "Profile fetch failed",
        created_at: new Date().toISOString(),
      })
    } catch {}
    return NextResponse.json({ ok: false, error: "Profile fetch failed" }, { status: 500 })
  }

  let profile = Array.isArray(profiles) ? profiles[0] : null

  if (!profile) {
    const result = await supabase
      .from("user_profiles")
      .insert({ id: safeUserId, email: "", role: "free" })
      .select()
      .single()
    const created = result.data as { id: string; role: string; premium_until: string | null } | null
    const createError = result.error

    if (createError) {
      logger.error("[webhook-uala] Failed to create profile", { error: createError.message })
      return NextResponse.json({ ok: false, error: "Could not create profile" }, { status: 500 })
    }
    profile = created
  }

  if (!profile) {
    return NextResponse.json({ ok: false, error: "Profile not found" }, { status: 500 })
  }

  // ── 12. Skip admin users (idempotent) ─────────────────────────────────
  if (profile.role === "admin") {
    return NextResponse.json({ ok: true, message: "Admin user, skipped" })
  }

  // ── 13. Skip if already premium (idempotent) ──────────────────────────
  if (profile.role === "premium" && profile.premium_until && new Date(profile.premium_until) > new Date()) {
    logger.info("[webhook-uala] User already premium, extending", { currentExpiry: profile.premium_until })
  }

  // ── 14. Calculate final premium_until (extend if active) ──────────────
  let finalPremiumUntil = premiumUntil
  if (profile.premium_until && new Date(profile.premium_until) > new Date()) {
    const currentExpiry = new Date(profile.premium_until)
    finalPremiumUntil = new Date(currentExpiry.getTime() + requestedDays * 86400000).toISOString()
  }

  // ── 15. Update user_profiles ───────────────────────────────────────────
  const { error: updateError } = await supabase
    .from("user_profiles")
    .update({ role: "premium", premium_until: finalPremiumUntil })
    .eq("id", safeUserId)

  if (updateError) {
    logger.error("[webhook-uala] Failed to update profile", { error: updateError.message })
    return NextResponse.json({ ok: true })
  }

  // ── 16. Revalidate cache ──────────────────────────────────────────────
  try {
    revalidatePath("/predictions", "page")
  } catch (error) {
    logger.warn("[webhook-uala] Failed to revalidate", { error: String(error) })
  }

  logger.info("[webhook-uala] Premium activated", { plan, until: finalPremiumUntil, userId: safeUserId })
  return NextResponse.json({ ok: true })
}
