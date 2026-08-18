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
  const debugId = `dbg_${Date.now().toString(36)}`
  logger.info(`[checkout/${debugId}] === INICIO ===`)

  // ── 1. Validate JWT ────────────────────────────────────────────────
  const auth = req.headers.get("authorization") || ""
  const token = auth.replace("Bearer ", "")
  if (!token) {
    logger.warn(`[checkout/${debugId}] No token provided`)
    return NextResponse.json({ error: "No autorizado", debug: { step: "jwt", msg: "No bearer token" } }, { status: 401 })
  }

  const sbUrl = SB_URL()
  const sbKey = SB_KEY()
  if (!sbUrl || !sbKey) {
    logger.error(`[checkout/${debugId}] Missing Supabase config`, { hasUrl: !!sbUrl, hasKey: !!sbKey })
    return NextResponse.json({ error: "Configuración incompleta", debug: { step: "supabase_config", hasUrl: !!sbUrl, hasKey: !!sbKey } }, { status: 500 })
  }

  let userId: string | null = null
  try {
    const userRes = await fetch(`${sbUrl}/auth/v1/user`, {
      headers: { apikey: sbKey, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    })
    if (!userRes.ok) {
      const errBody = await userRes.text().catch(() => "")
      logger.error(`[checkout/${debugId}] JWT failed`, { status: userRes.status, body: errBody.substring(0, 200) })
      return NextResponse.json({ error: "No autorizado", detail: `JWT status ${userRes.status}`, debug: { step: "jwt", status: userRes.status } }, { status: 401 })
    }
    const user = await userRes.json()
    userId = user?.id || null
    logger.info(`[checkout/${debugId}] JWT OK, userId=${userId}`)
  } catch (e) {
    logger.error(`[checkout/${debugId}] JWT error`, { error: String(e) })
    return NextResponse.json({ error: "No autorizado", debug: { step: "jwt", error: String(e) } }, { status: 401 })
  }

  if (!userId) {
    return NextResponse.json({ error: "No autorizado", debug: { step: "jwt", msg: "userId is null" } }, { status: 401 })
  }

  // ── 2. Validate plan ───────────────────────────────────────────────
  let body: { plan?: string }
  try {
    body = await req.json()
  } catch {
    logger.warn(`[checkout/${debugId}] Invalid JSON body`)
    return NextResponse.json({ error: "Body inválido", debug: { step: "body" } }, { status: 400 })
  }

  const plan = body.plan as PlanKey | undefined
  if (!plan || !PLANS[plan]) {
    logger.warn(`[checkout/${debugId}] Invalid plan: ${plan}`)
    return NextResponse.json({ error: "Plan inválido. Usa: 15_days o 30_days", debug: { step: "plan", received: plan } }, { status: 400 })
  }
  logger.info(`[checkout/${debugId}] Plan: ${plan}, amount: ${PLANS[plan].amount}`)

  // ── 3. Check UALA credentials ──────────────────────────────────────
  const username = (process.env.UALA_USERNAME || "").trim()
  const clientId = (process.env.UALA_CLIENT_ID || "").trim()
  const clientSecret = (process.env.UALA_CLIENT_SECRET || "").trim()

  logger.info(`[checkout/${debugId}] UALA credentials check`, {
    hasUsername: !!username,
    usernameLen: username.length,
    hasClientId: !!clientId,
    clientIdLen: clientId.length,
    hasClientSecret: !!clientSecret,
    clientSecretLen: clientSecret.length,
    // Show first/last chars for debugging (never full secret)
    clientIdPreview: clientId ? `${clientId.substring(0, 4)}...${clientId.substring(clientId.length - 4)}` : "EMPTY",
    clientSecretPreview: clientSecret ? `${clientSecret.substring(0, 4)}...${clientSecret.substring(clientSecret.length - 4)}` : "EMPTY",
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
      debug: {
        step: "credentials",
        missing: [
          !username && "UALA_USERNAME",
          !clientId && "UALA_CLIENT_ID",
          !clientSecret && "UALA_CLIENT_SECRET",
        ].filter(Boolean),
        hint: "Configurar en Vercel → Settings → Environment Variables",
      }
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
        detail: `Ualá auth returned ${authRes.status}`,
        debug: {
          step: "uala_auth",
          status: authRes.status,
          response: authResBody.substring(0, 500),
          hint: authRes.status === 401 ? "Credenciales incorrectas. Verificar UALA_USERNAME, UALA_CLIENT_ID, UALA_CLIENT_SECRET en Vercel" :
                authRes.status === 404 ? "Endpoint no encontrado. Verificar que la URL de auth sea correcta" :
                `Error HTTP ${authRes.status}`,
        }
      }, { status: 502 })
    }

    const authData = JSON.parse(authResBody)
    accessToken = authData.access_token
    if (!accessToken) {
      logger.error(`[checkout/${debugId}] ❌ No access_token in response`, { keys: Object.keys(authData) })
      return NextResponse.json({
        error: "No se recibió token de pago",
        debug: { step: "uala_auth", responseKeys: Object.keys(authData) }
      }, { status: 502 })
    }
    logger.info(`[checkout/${debugId}] ✅ Ualá token obtained (${accessToken.length} chars)`)
  } catch (e) {
    logger.error(`[checkout/${debugId}] ❌ UALÁ AUTH EXCEPTION`, { error: String(e) })
    return NextResponse.json({
      error: "Error conectando con Ualá Bis",
      debug: { step: "uala_auth", error: String(e) }
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

    const orderResBody = await orderRes.text()
    logger.info(`[checkout/${debugId}] ← Ualá order response`, {
      status: orderRes.status,
      body: orderResBody.substring(0, 800),
    })

    if (!orderRes.ok) {
      logger.error(`[checkout/${debugId}] ❌ ORDER CREATION FAILED`, { status: orderRes.status, body: orderResBody.substring(0, 500) })
      return NextResponse.json({
        error: "Error creando orden de pago",
        detail: `Ualá order returned ${orderRes.status}`,
        debug: {
          step: "order_creation",
          status: orderRes.status,
          response: orderResBody.substring(0, 500),
          hint: orderRes.status === 400 ? "Payload inválido. Verificar monto, moneda, formato" :
                orderRes.status === 401 ? "Token de autenticación inválido" :
                orderRes.status === 403 ? "Permisos insuficientes" :
                `Error HTTP ${orderRes.status}`,
        }
      }, { status: 502 })
    }

    orderData = JSON.parse(orderResBody)
  } catch (e) {
    logger.error(`[checkout/${debugId}] ❌ ORDER EXCEPTION`, { error: String(e) })
    return NextResponse.json({
      error: "Error procesando pago",
      debug: { step: "order_creation", error: String(e) }
    }, { status: 502 })
  }

  // ── 6. Extract checkout URL ────────────────────────────────────────
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
      debug: {
        step: "url_extraction",
        orderDataKeys: Object.keys(orderData),
        fullResponse: JSON.stringify(orderData).substring(0, 1000),
        hint: "La API de Ualá no devolvió una URL de checkout. Verificar que la cuenta esté activa y el monto sea válido.",
      }
    }, { status: 502 })
  }

  logger.info(`[checkout/${debugId}] ✅ CHECKOUT CREATED`, { userId, plan, amount: planData.amount, url: checkoutUrl.substring(0, 80) })
  return NextResponse.json({ checkoutUrl })
}
