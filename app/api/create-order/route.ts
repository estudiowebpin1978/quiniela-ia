import { NextRequest, NextResponse } from "next/server"
import logger from "@/lib/logger"

const SB_URL = () => (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/"/g, "").trim()
const SB_KEY = () => (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "").replace(/"/g, "").trim()

const PLANS: Record<string, { amount: string; description: string }> = {
  semanal: { amount: "3500.00", description: "Pase Semanal - Quiniela IA" },
  mensual: { amount: "10000.00", description: "Pase Mensual - Quiniela IA" },
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") || ""
  const token = auth.replace("Bearer ", "")
  if (!token) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  // Verify JWT and extract userId
  const sbUrl = SB_URL()
  const sbKey = SB_KEY()
  if (!sbUrl || !sbKey) {
    return NextResponse.json({ error: "Configuración incompleta" }, { status: 500 })
  }
  let authUserId: string | null = null
  try {
    const userRes = await fetch(`${sbUrl}/auth/v1/user`, {
      headers: { "apikey": sbKey, "Authorization": `Bearer ${token}` },
      signal: AbortSignal.timeout(3000),
    })
    if (!userRes.ok) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    const user = await userRes.json()
    authUserId = user?.id || null
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }
  if (!authUserId) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 })
  }
  const { plan } = body

  if (!plan || !PLANS[plan]) {
    return NextResponse.json({ error: "Plan inválido" }, { status: 400 })
  }

  // Use authenticated userId, ignore any client-provided userId
  const userId = authUserId

  const username = (process.env.UALA_USERNAME || "").trim()
  const clientId = (process.env.UALA_CLIENT_ID || "").trim()
  const clientSecret = (process.env.UALA_CLIENT_SECRET || "").trim()

  if (!username || !clientId || !clientSecret) {
    return NextResponse.json({ error: "Variables UALA_* no configuradas" }, { status: 500 })
  }

  try {
    const authBody = {
      username,
      client_id: clientId,
      client_secret_id: clientSecret,
      grant_type: "client_credentials",
    }

    const authRes = await fetch("https://auth.developers.ar.ua.la/v2/api/auth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(authBody),
    })

    if (!authRes.ok) {
      logger.error("[create-order] Auth failed", { status: authRes.status })
      return NextResponse.json({ error: "Error autenticando con proveedor" }, { status: 502 })
    }

    const authData = await authRes.json()
    const access_token = authData.access_token
    if (!access_token) {
      logger.error("[create-order] No access_token in auth response")
      return NextResponse.json({ error: "No se recibió token de pago" }, { status: 502 })
    }

    const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || "https://quiniela-ia-two.vercel.app").replace(/"/g, "").trim()

    const planData = PLANS[plan]
    const orderBody = {
      amount: planData.amount,
      description: planData.description,
      notification_url: `${baseUrl}/api/webhook-uala`,
      callback_success: `${baseUrl}/predictions?payment=success`,
      callback_fail: `${baseUrl}/predictions?payment=failed`,
      external_reference: userId,
    }

    const orderRes = await fetch("https://checkout.developers.ar.ua.la/v2/api/checkout", {
      method: "POST",
      headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify(orderBody),
    })

    if (!orderRes.ok) {
      logger.error("[create-order] Order failed", { status: orderRes.status })
      return NextResponse.json({ error: "Error creando orden de pago" }, { status: 502 })
    }

    const orderData = await orderRes.json()

    const checkoutUrl =
      orderData.links?.checkout_link ||
      orderData.links?.checkoutLink ||
      orderData.checkout_url ||
      orderData.payment_url ||
      orderData.url

    if (!checkoutUrl) {
      logger.error("[create-order] No checkout URL in response")
      return NextResponse.json({ error: "No se encontró URL de pago" }, { status: 502 })
    }

    return NextResponse.json({ checkoutUrl })
  } catch {
    logger.error("[create-order] Error procesando orden")
    return NextResponse.json({ error: "Error procesando pago" }, { status: 500 })
  }
}
