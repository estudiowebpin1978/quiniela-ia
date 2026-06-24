import { NextRequest, NextResponse } from "next/server"

const SB_URL = () => (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/"/g, "").trim()
const SB_KEY = () => (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "").replace(/"/g, "").trim()

const PLANS: Record<string, { amount: string; description: string }> = {
  semanal: { amount: "3500.00", description: "Pase Semanal - Quiniela IA" },
  mensual: { amount: "10000.00", description: "Pase Mensual - Quiniela IA" },
}

export async function POST(req: NextRequest) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 })
  }
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

    const authText = await authRes.text()

    if (!authRes.ok) {
      console.error("[create-order] Auth failed:", authRes.status)
      return NextResponse.json({ error: "Error autenticando" }, { status: 502 })
    }

    const authData = JSON.parse(authText)
    const access_token = authData.access_token
    if (!access_token) {
      console.error("[UALA CREATE] No access_token in auth response:", authData)
      return NextResponse.json({ error: "No se recibió access_token" }, { status: 502 })
    }

    const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || "https://quiniela-ia-two.vercel.app").replace(/"/g, "").trim()

    // 2. Create checkout order
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
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(orderBody),
    })

    const orderText = await orderRes.text()

    if (!orderRes.ok) {
      console.error("[create-order] Order failed:", orderRes.status)
      return NextResponse.json({ error: "Error creando orden" }, { status: 502 })
    }

    const orderData = JSON.parse(orderText)

    // Try multiple possible field names for checkout URL (Ualá v2 uses snake_case)
    const checkoutUrl =
      orderData.links?.checkout_link ||
      orderData.links?.checkoutLink ||
      orderData.checkout_url ||
      orderData.payment_url ||
      orderData.url

    if (!checkoutUrl) {
      console.error("[create-order] No checkout URL in response")
      return NextResponse.json({ error: "No se encontró URL de pago" }, { status: 502 })
    }

    return NextResponse.json({ checkoutUrl })
  } catch (e: any) {
    console.error("[UALA CREATE] Error:", e.message)
    return NextResponse.json({ error: `Error procesando: ${e.message}` }, { status: 500 })
  }
}
