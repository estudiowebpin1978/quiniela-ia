import { NextRequest, NextResponse } from "next/server"
import logger from "@/lib/logger"
import { validateJwt } from "@/lib/auth/jwt"
import { PLAN_AMOUNTS } from "@/lib/config"

const PLANS = {
  "15_days": { amount: String(PLAN_AMOUNTS["15_days"]), description: "Pase 15 Días - Quiniela IA", days: 15 },
  "30_days": { amount: String(PLAN_AMOUNTS["30_days"]), description: "Pase 30 Días - Quiniela IA", days: 30 },
} as const

type PlanKey = keyof typeof PLANS

// ─── Rate Limiting (in-memory, per-cold-start) ─────────────────────────────
const RATE_LIMIT_WINDOW = 60_000
const RATE_LIMIT_MAX = 10
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
  const debugId = `dbg_${Date.now().toString(36)}`
  logger.info(`[checkout/${debugId}] === INICIO ===`)

  // ── 0. Rate limit ─────────────────────────────────────────────────────
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("x-real-ip")
    || "unknown"
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 })
  }

  // ── 1. Validate JWT (server-side via Supabase Auth API) ─────────────
  const auth = req.headers.get("authorization") || ""
  const token = auth.replace("Bearer ", "")
  if (!token) {
    logger.warn(`[checkout/${debugId}] No token provided`)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const decoded = await validateJwt(token)
  if (!decoded) {
    logger.warn(`[checkout/${debugId}] Invalid JWT`)
    return NextResponse.json({ error: "Token inválido" }, { status: 401 })
  }

  const userId = decoded.userId
  if (!userId) {
    return NextResponse.json({ error: "Token inválido" }, { status: 401 })
  }
  logger.info(`[checkout/${debugId}] JWT OK, userId=${userId}`)

  // ── 2. Validate plan ───────────────────────────────────────────────
  let body: { plan?: string }
  try {
    body = await req.json()
  } catch {
    logger.warn(`[checkout/${debugId}] Invalid JSON body`)
    return NextResponse.json({ error: "Body inválido" }, { status: 400 })
  }

  const plan = body.plan as PlanKey | undefined
  if (!plan || !PLANS[plan]) {
    logger.warn(`[checkout/${debugId}] Invalid plan: ${plan}`)
    return NextResponse.json({ error: "Plan inválido" }, { status: 400 })
  }
  logger.info(`[checkout/${debugId}] Plan: ${plan}, amount: ${PLANS[plan].amount}`)

  // ── 3. Check UALA credentials ──────────────────────────────────────
  const username = (process.env.UALA_USERNAME || "").trim()
  const clientId = (process.env.UALA_CLIENT_ID || "").trim()
  const clientSecret = (process.env.UALA_CLIENT_SECRET || "").trim()

  logger.info(`[checkout/${debugId}] UALA credentials check`, {
    hasUsername: !!username,
    hasClientId: !!clientId,
    hasClientSecret: !!clientSecret,
  })

  if (!username || !clientId || !clientSecret) {
    logger.error(`[checkout/${debugId}] ❌ FALTAN CREDENCIALES UALÁ`, {
      missing: [
        !username && "UALA_USERNAME",
        !clientId && "UALA_CLIENT_ID",
        !clientSecret && "UALA_CLIENT_SECRET",
      ].filter(Boolean),
    })
    return NextResponse.json({
      error: "Variables UALA_* no configuradas en Vercel",
    }, { status: 500 })
  }

  // ── 4. Authenticate with Ualá Bis ──────────────────────────────────
  const authPayload = {
    username,
    client_id: clientId,
    client_secret_id: clientSecret,
    grant_type: "client_credentials",
  }
  logger.info(`[checkout/${debugId}] → Ualá auth request`, { url: "https://auth.developers.ar.ua.la/v2/api/auth/token", payloadKeys: Object.keys(authPayload) })

  let accessToken: string
  try {
    const authRes = await fetch("https://auth.developers.ar.ua.la/v2/api/auth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(authPayload),
      signal: AbortSignal.timeout(10000),
    })

    const authResBody = await authRes.text()
    logger.info(`[checkout/${debugId}] ← Ualá auth response`, {
      status: authRes.status,
      body: authResBody.substring(0, 500),
    })

    if (!authRes.ok) {
      logger.error(`[checkout/${debugId}] ❌ UALÁ AUTH FAILED`, { status: authRes.status, body: authResBody.substring(0, 500) })
      return NextResponse.json({
        error: "Error autenticando con Ualá Bis",
      }, { status: 502 })
    }

    const authData = JSON.parse(authResBody)
    accessToken = authData.access_token
    if (!accessToken) {
      logger.error(`[checkout/${debugId}] ❌ No access_token in response`, { keys: Object.keys(authData) })
      return NextResponse.json({
        error: "No se recibió token de pago",
      }, { status: 502 })
    }
    logger.info(`[checkout/${debugId}] ✅ Ualá token obtained (${accessToken.length} chars)`)
  } catch (e) {
    logger.error(`[checkout/${debugId}] ❌ UALÁ AUTH EXCEPTION`, { error: String(e) })
    return NextResponse.json({
      error: "Error conectando con Ualá Bis",
    }, { status: 502 })
  }

  // ── 5. Create checkout order ───────────────────────────────────────
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

  logger.info(`[checkout/${debugId}] → Ualá order request`, {
    url: "https://checkout.developers.ar.ua.la/v2/api/orders",
    orderBody: { ...orderBody, external_reference: userId },
    baseUrl,
  })

   
  let orderData: any
  try {
    const orderRes = await fetch("https://checkout.developers.ar.ua.la/v2/api/checkout", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(orderBody),
      signal: AbortSignal.timeout(15000),
    })

    const orderResBody = await orderRes.text()
    logger.info(`[checkout/${debugId}] ← Ualá order response`, {
      status: orderRes.status,
      body: orderResBody.substring(0, 800),
    })

    if (!orderRes.ok) {
      logger.error(`[checkout/${debugId}] ❌ ORDER CREATION FAILED`, { status: orderRes.status, body: orderResBody.substring(0, 500) })
      return NextResponse.json({
        error: "Error creando orden de pago",
      }, { status: 502 })
    }

    orderData = JSON.parse(orderResBody)
  } catch (e) {
    logger.error(`[checkout/${debugId}] ❌ ORDER EXCEPTION`, { error: String(e) })
    return NextResponse.json({
      error: "Error procesando pago",
    }, { status: 502 })
  }

  // ── 6. Extract checkout URL ────────────────────────────────────────
   
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

  logger.info(`[checkout/${debugId}] URL extraction result`, {
    found: !!checkoutUrl,
    url: checkoutUrl?.substring(0, 100),
    orderDataKeys: Object.keys(orderData || {}),
    fullResponse: JSON.stringify(orderData).substring(0, 1000),
  })

  if (!checkoutUrl) {
    logger.error(`[checkout/${debugId}] ❌ NO CHECKOUT URL`, {
      keys: Object.keys(orderData),
      fullResponse: JSON.stringify(orderData).substring(0, 1000),
    })
    return NextResponse.json({
      error: "No se encontró URL de pago en la respuesta de Ualá",
    }, { status: 502 })
  }

  logger.info(`[checkout/${debugId}] ✅ CHECKOUT CREATED`, { userId, plan, amount: planData.amount, url: checkoutUrl.substring(0, 80) })
  return NextResponse.json({ checkoutUrl })
}
