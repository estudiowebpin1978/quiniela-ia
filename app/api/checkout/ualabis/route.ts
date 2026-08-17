import { NextRequest, NextResponse } from "next/server"
import logger from "@/lib/logger"

const SB_URL = () => (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/"/g, "").trim()
const SB_KEY = () => (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "").replace(/"/g, "").trim()

const PLANS = {
  "15_days": { amount: "5000.00", description: "Pase 15 Días - Quiniela IA", days: 15 },
  "30_days": { amount: "10000.00", description: "Pase 30 Días - Quiniela IA", days: 30 },
} as const

type PlanKey = keyof typeof PLANS

export async function POST(req: NextRequest) {
  // ── 1. Validate JWT ────────────────────────────────────────────────
  const auth = req.headers.get("authorization") || ""
  const token = auth.replace("Bearer ", "")
  if (!token) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const sbUrl = SB_URL()
  const sbKey = SB_KEY()
  if (!sbUrl || !sbKey) {
    return NextResponse.json({ error: "Configuración incompleta" }, { status: 500 })
  }

  let userId: string | null = null
  try {
    const userRes = await fetch(`${sbUrl}/auth/v1/user`, {
      headers: { apikey: sbKey, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    })
    if (!userRes.ok) {
      logger.error("[checkout/ualabis] JWT validation failed", { status: userRes.status })
      return NextResponse.json({ error: "No autorizado", detail: `JWT status ${userRes.status}` }, { status: 401 })
    }
    const user = await userRes.json()
    userId = user?.id || null
  } catch (e) {
    logger.error("[checkout/ualabis] JWT error", { error: String(e) })
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  if (!userId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  // ── 2. Validate plan ───────────────────────────────────────────────
  let body: { plan?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 })
  }

  const plan = body.plan as PlanKey | undefined
  if (!plan || !PLANS[plan]) {
    return NextResponse.json({ error: "Plan inválido. Usa: 15_days o 30_days" }, { status: 400 })
  }

  // ── 3. Authenticate with Ualá Bis ──────────────────────────────────
  const username = (process.env.UALA_USERNAME || "").trim()
  const clientId = (process.env.UALA_CLIENT_ID || "").trim()
  const clientSecret = (process.env.UALA_CLIENT_SECRET || "").trim()

  if (!username || !clientId || !clientSecret) {
    logger.error("[checkout/ualabis] Missing UALA_* env vars")
    return NextResponse.json({ error: "Variables UALA_* no configuradas" }, { status: 500 })
  }

  let accessToken: string
  try {
    const authRes = await fetch("https://auth.developers.ar.ua.la/v2/api/auth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username,
        client_id: clientId,
        client_secret_id: clientSecret,
        grant_type: "client_credentials",
      }),
      signal: AbortSignal.timeout(10000),
    })

    if (!authRes.ok) {
      const errBody = await authRes.text().catch(() => "")
      logger.error("[checkout/ualabis] Ualá auth failed", { status: authRes.status, body: errBody.substring(0, 300) })
      return NextResponse.json({ error: "Error autenticando con proveedor de pago" }, { status: 502 })
    }

    const authData = await authRes.json()
    accessToken = authData.access_token
    if (!accessToken) {
      logger.error("[checkout/ualabis] No access_token in auth response")
      return NextResponse.json({ error: "No se recibió token de pago" }, { status: 502 })
    }
  } catch (e) {
    logger.error("[checkout/ualabis] Ualá auth error", { error: String(e) })
    return NextResponse.json({ error: "Error conectando con proveedor de pago" }, { status: 502 })
  }

  // ── 4. Create checkout order ───────────────────────────────────────
  const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || "https://quiniela-ia-two.vercel.app")
    .replace(/"/g, "").trim()

  const planData = PLANS[plan]

  const orderBody = {
    amount: planData.amount,
    description: planData.description,
    userName: "",
    callback_success: `${baseUrl}/predictions?payment=success`,
    callback_fail: `${baseUrl}/predictions?payment=failed`,
    notification_url: `${baseUrl}/api/webhook-uala`,
    external_reference: userId,
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let orderData: any
  try {
    const orderRes = await fetch("https://checkout.developers.ar.ua.la/v2/api/orders", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(orderBody),
      signal: AbortSignal.timeout(15000),
    })

    if (!orderRes.ok) {
      const errBody = await orderRes.text().catch(() => "")
      logger.error("[checkout/ualabis] Order creation failed", { status: orderRes.status, body: errBody.substring(0, 300) })
      return NextResponse.json({ error: "Error creando orden de pago" }, { status: 502 })
    }

    orderData = await orderRes.json()
  } catch (e) {
    logger.error("[checkout/ualabis] Order error", { error: String(e) })
    return NextResponse.json({ error: "Error procesando pago" }, { status: 502 })
  }

  // ── 5. Extract checkout URL ────────────────────────────────────────
  // Ualá Bis v2 returns the URL in various possible locations
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d: any = orderData
  const checkoutUrl: string | undefined =
    d?.links?.checkout_link ||
    d?.links?.checkoutLink ||
    d?.checkout_url ||
    d?.payment_url ||
    d?.url ||
    d?.data?.checkout_link ||
    d?.data?.checkoutLink ||
    d?.data?.checkout_url ||
    d?.data?.payment_url ||
    d?.data?.url

  if (!checkoutUrl) {
    logger.error("[checkout/ualabis] No checkout URL in response", { keys: Object.keys(orderData) })
    return NextResponse.json({ error: "No se encontró URL de pago" }, { status: 502 })
  }

  logger.info("[checkout/ualabis] Checkout created", { userId, plan, amount: planData.amount })
  return NextResponse.json({ checkoutUrl })
}
