import { NextRequest, NextResponse } from "next/server"

const SB_URL = () => (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/"/g, "").trim()
const SB_KEY = () => (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "").replace(/"/g, "").trim()

const PLANS: Record<string, { amount: string; description: string }> = {
  semanal: { amount: "3500.00", description: "Pase Semanal - Quiniela IA" },
  mensual: { amount: "10000.00", description: "Pase Mensual - Quiniela IA" },
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { plan, userId } = body

  if (!plan || !PLANS[plan]) {
    return NextResponse.json({ error: "Plan inválido" }, { status: 400 })
  }
  if (!userId) {
    return NextResponse.json({ error: "userId requerido" }, { status: 400 })
  }

  const username = (process.env.UALA_USERNAME || "").trim()
  const clientId = (process.env.UALA_CLIENT_ID || "").trim()
  const clientSecret = (process.env.UALA_CLIENT_SECRET || "").trim()

  console.log("[UALA CREATE] Env vars:", {
    username: username ? "SET" : "MISSING",
    clientId: clientId ? "SET" : "MISSING",
    clientSecret: clientSecret ? "SET" : "MISSING",
  })

  if (!username || !clientId || !clientSecret) {
    return NextResponse.json({ error: "Variables UALA_* no configuradas" }, { status: 500 })
  }

  try {
    // 1. Authenticate with Ualá v2
    const authBody = {
      username,
      client_id: clientId,
      client_secret_id: clientSecret,
      grant_type: "client_credentials",
    }
    console.log("[UALA CREATE] Auth request: { grant_type: client_credentials }")

    const authRes = await fetch("https://auth.developers.ar.ua.la/v2/api/auth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(authBody),
    })

    const authText = await authRes.text()
    console.log("[UALA CREATE] Auth response:", authRes.status, authRes.ok ? "OK" : "FAILED")

    if (!authRes.ok) {
      console.error("[UALA CREATE] Auth failed:", authRes.status, authText)
      return NextResponse.json({ error: `Error autenticando: ${authText}` }, { status: 502 })
    }

    const authData = JSON.parse(authText)
    const access_token = authData.access_token
    if (!access_token) {
      console.error("[UALA CREATE] No access_token in auth response:", authData)
      return NextResponse.json({ error: "No se recibió access_token" }, { status: 502 })
    }

    // 2. Create checkout order
    const planData = PLANS[plan]
    const orderBody = {
      amount: planData.amount, // STRING — Ualá v2 requires "3500.00" not 3500
      description: planData.description,
      notification_url: "https://quiniela-ia-two.vercel.app/api/webhook-uala",
      callback_success: "https://quiniela-ia-two.vercel.app/predictions?payment=success",
      callback_fail: "https://quiniela-ia-two.vercel.app/predictions?payment=failed",
      external_reference: userId,
    }
    console.log("[UALA CREATE] Order request: plan=" + plan + ", amount=" + planData.amount)

    const orderRes = await fetch("https://checkout.developers.ar.ua.la/v2/api/checkout", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(orderBody),
    })

    const orderText = await orderRes.text()
    console.log("[UALA CREATE] Order response:", orderRes.status, orderRes.ok ? "OK" : "FAILED")

    if (!orderRes.ok) {
      console.error("[UALA CREATE] Order failed:", orderRes.status, orderText)
      return NextResponse.json({ error: `Error creando orden: ${orderText}` }, { status: 502 })
    }

    const orderData = JSON.parse(orderText)
    console.log("[UALA CREATE] Order data keys:", Object.keys(orderData))

    // Try multiple possible field names for checkout URL (Ualá v2 uses snake_case)
    const checkoutUrl =
      orderData.links?.checkout_link ||
      orderData.links?.checkoutLink ||
      orderData.checkout_url ||
      orderData.payment_url ||
      orderData.url

    console.log("[UALA CREATE] Extracted checkout URL:", checkoutUrl)

    if (!checkoutUrl) {
      console.error("[UALA CREATE] No checkout URL found. Full response:", JSON.stringify(orderData))
      return NextResponse.json({ error: "No se encontró URL de pago en la respuesta", fullResponse: orderData }, { status: 502 })
    }

    return NextResponse.json({ checkoutUrl })
  } catch (e: any) {
    console.error("[UALA CREATE] Error:", e.message)
    return NextResponse.json({ error: `Error procesando: ${e.message}` }, { status: 500 })
  }
}
