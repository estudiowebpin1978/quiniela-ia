/**
 * Webhook Ualá Bis v2 — Pago aprobado → upgrade a premium + notificación al admin.
 *
 * La doc oficial (developers.ualabis.com.ar/v2/orders/create/webhook) NO define
 * firma HMAC: el payload es { uuid, external_reference, status, ... } sin headers
 * de firma. La fuente de verdad es la verificación server-side contra la API
 * (GET /orders/{id}) — cualquier payload falsificado muere ahí.
 *
 * Firma (fail-closed): si UALA_WEBHOOK_SECRET está configurada, un header de
 * firma ausente o inválido RECHAZA la petición (401) y queda registrado en logs
 * y webhook_logs. Si la env NO está configurada se emite un warning y se mantiene
 * el comportamiento anterior (se confía en la verificación contra la API de Ualá).
 *
 * Monto: SIEMPRE proviene de la verificación server-side contra la API de Ualá.
 * El `amount` del body del cliente NUNCA se usa (ver paso 7).
 *
 * Ante cualquier fallo de verificación/activación se notifica al admin (campanita)
 * para activación manual desde /api/admin.
 *
 * URL a registrar en Ualá Bis (se envía via notification_url al crear la orden):
 *   https://quiniela-ia-two.vercel.app/api/webhook-uala
 */

import { NextRequest, NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { timingSafeEqual, createHmac } from "crypto"
import { getSupabaseAdmin } from "@/lib/supabase-client"
import { PLAN_DAYS, AMOUNT_PLAN_MAP, ADMIN_EMAILS } from "@/lib/config"
import logger from "@/lib/logger"

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface UalaBisPayload {
  id?: string
  order_id?: string
  uuid?: string
  status?: string
  state?: string
  external_reference?: string
  // `amount` intencionalmente NO se declara: el monto del body del cliente se
  // ignora por completo; solo vale el monto devuelto por la API de Ualá.
  [key: string]: unknown
}

// ─── Constants ───────────────────────────────────────────────────────────────

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ─── HMAC Signature Verification ──────────────────────────────────────────────

function getWebhookSecret(): string {
  return (process.env.UALA_WEBHOOK_SECRET || "").replace(/"/g, "").trim()
}

function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const secret = getWebhookSecret()
  // Sin secret no hay nada que verificar — el caller decide (fail-open + warning).
  if (!secret) return false
  if (!signature) return false

  try {
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex")
    // Comparación timing-safe: solo si las longitudes coinciden.
    const sigBuf = Buffer.from(signature, "utf8")
    const expectedBuf = Buffer.from(expected, "utf8")
    if (sigBuf.length !== expectedBuf.length) return false
    return timingSafeEqual(sigBuf, expectedBuf)
  } catch {
    return false
  }
}

/**
 * Registra un webhook rechazado en webhook_logs (nunca bloquea el handler).
 *
 * El `order_id` NUNCA se persiste en rechazos: es la clave de idempotencia
 * (unique index) y puede venir de un payload no autenticado — usarlo permitiría
 * que un atacante "envenenara" una orden legítima y bloqueara su activación.
 * El orderId viaja dentro de `payload`.
 */
async function recordWebhookRejection(reason: string, detail: Record<string, unknown>): Promise<void> {
  try {
    const supabase = getSupabaseAdmin()
    const { error } = await supabase.from("webhook_logs").insert({
      source: "ualabis",
      order_id: null,
      payload: JSON.stringify({ rejected: true, reason, ...detail }),
      user_id: null,
      status: "rejected",
      created_at: new Date().toISOString(),
    })
    if (error && !error.message?.includes("relation") && !error.message?.includes("does not exist")) {
      logger.warn("[webhook-uala] Could not persist rejection to webhook_logs", { reason, error: error.message })
    }
  } catch {
    // logging debe ser best-effort
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

// ─── Admin notification (in-app bell) ────────────────────────────────────────

async function notifyAdmins(
  title: string,
  body: string,
  data: Record<string, unknown>
): Promise<void> {
  try {
    const supabase = getSupabaseAdmin()
    const [byRole, byEmail] = await Promise.all([
      supabase.from("user_profiles").select("id").eq("role", "admin").limit(10),
      supabase.from("user_profiles").select("id").in("email", ADMIN_EMAILS).limit(10),
    ])
    const ids = [...new Set(
      [...(byRole.data || []), ...(byEmail.data || [])].map(r => String(r.id))
    )]
    for (const id of ids) {
      await supabase.from("notifications").insert({
        user_id: id,
        type: "system",
        title,
        body,
        data,
      })
    }
    if (ids.length > 0) logger.info("[webhook-uala] Admin notified", { title, admins: ids.length })
  } catch (e) {
    logger.error("[webhook-uala] Admin notify failed", { error: String(e), title })
  }
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

  // ── 0b. Signature check (fail-closed si UALA_WEBHOOK_SECRET está configurada) ──
  // Con secret configurado: firma ausente o inválida ⇒ 401 + registro en logs/webhook_logs.
  // Sin secret: se emite warning y se mantiene el comportamiento anterior (la fuente
  // de verdad sigue siendo la verificación server-side contra la API de Ualá, paso 5).
  const signature = req.headers.get("x-signature") || req.headers.get("x-uala-signature") || req.headers.get("x-webhook-signature")
  const secretConfigured = !!getWebhookSecret()

  if (!secretConfigured) {
    logger.warn("[webhook-uala] UALA_WEBHOOK_SECRET not configured — signature check skipped (fail-open, server-side order verification only)")
  } else if (!signature || !verifyWebhookSignature(rawBody, signature)) {
    logger.error("[webhook-uala] Webhook rejected: missing or invalid signature", { hasSignature: !!signature })
    await recordWebhookRejection("invalid_signature", { hasSignature: !!signature })
    return NextResponse.json({ ok: false, error: "Firma inválida" }, { status: 401 })
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
    await notifyAdmins(
      "💰 Pago Ualá pendiente de verificación",
      `No se pudo verificar la orden ${orderId} contra la API de Ualá. Revisá y activá premium manualmente desde Admin si el pago es real.`,
      { orderId: String(orderId), verifyStatus: verification.status }
    )
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
    await notifyAdmins(
      "💰 Pago Ualá sin usuario asociado",
      `La orden ${orderId} está aprobada pero no tiene external_reference. Identificá el usuario y activá premium manualmente desde Admin.`,
      { orderId: String(orderId), amount: verification.amount }
    )
    return NextResponse.json({ ok: true })
  }

  const safeUserId = String(userId).replace(/[^a-zA-Z0-9_-]/g, "")
  if (!UUID_REGEX.test(safeUserId)) {
    logger.warn("[webhook-uala] Invalid userId format", { userId: safeUserId })
    await notifyAdmins(
      "💰 Pago Ualá con referencia inválida",
      `La orden ${orderId} tiene external_reference inválido (${safeUserId}). Activá premium manualmente desde Admin.`,
      { orderId: String(orderId), externalReference: safeUserId }
    )
    return NextResponse.json({ ok: true })
  }

  // ── 7. Determine plan from amount (SOLO monto verificado server-side) ──
  // El `amount` del body del cliente NUNCA se usa. Si la verificación contra la
  // API de Ualá no devuelve un monto utilizable, se rechaza el webhook.
  const amount = Number(verification.amount)

  if (!Number.isFinite(amount) || amount <= 0) {
    logger.warn("[webhook-uala] Rejected: no amount from server-side verification (client amount never used)", { orderId })
    await recordWebhookRejection("missing_verified_amount", {
      orderId: String(orderId),
      ualaStatus: verification.status,
    })
    await notifyAdmins(
      "💰 Pago Ualá sin monto verificado",
      `La orden ${orderId} está aprobada pero la API de Ualá no devolvió el monto. Verificá el pago y activá premium manualmente desde Admin.`,
      { orderId: String(orderId), verifyStatus: verification.status }
    )
    return NextResponse.json(
      { ok: false, error: "Monto no disponible en la verificación server-side de Ualá" },
      { status: 422 }
    )
  }

  const amountStr = String(Math.round(amount))
  const plan = AMOUNT_PLAN_MAP[amountStr]
  if (!plan) {
    logger.warn("[webhook-uala] Unknown amount, rejecting", { amount: amountStr })
    await notifyAdmins(
      "💰 Pago Ualá con monto no reconocido",
      `La orden ${orderId} está aprobada con monto $${amountStr} (no corresponde a ningún plan). Verificá y asigná el plan manualmente desde Admin.`,
      { orderId: String(orderId), userId: safeUserId, amount: amountStr }
    )
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
    await notifyAdmins(
      "💰 Pago Ualá: activación manual requerida",
      `Orden ${orderId} aprobada (${plan}) pero falló la actualización del perfil de ${safeUserId}: ${updateError.message}. Activá premium manualmente desde Admin.`,
      { orderId: String(orderId), userId: safeUserId, plan, days, until: premiumUntil.toISOString() }
    )
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
  await notifyAdmins(
    "✅ Pago Ualá aprobado — premium activado",
    `Plan ${plan} (${days} días) activado para ${safeUserId} hasta ${premiumUntil.toISOString()}. Orden ${orderId}.`,
    { orderId: String(orderId), userId: safeUserId, plan, days, until: premiumUntil.toISOString() }
  )
  return NextResponse.json({ ok: true })
}
