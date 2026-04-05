import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  const { email } = await req.json()
  if (!email) return NextResponse.json({ error: "Email requerido" }, { status: 400 })

  const userName = process.env.UALA_USERNAME || ""
  const clientId = process.env.UALA_CLIENT_ID || ""
  const clientSecret = process.env.UALA_CLIENT_SECRET || ""

  if (!userName || !clientId || !clientSecret)
    return NextResponse.json({ error: "Credenciales no configuradas" }, { status: 500 })

  try {
    // 1. Obtener token - URL correcta de Uala Bis v2
    const tokenRes = await fetch("https://auth.developers.ar.ua.la/v2/api/auth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret_id: clientSecret,
        username: userName
      }),
      signal: AbortSignal.timeout(10000)
    })

    if (!tokenRes.ok) {
      const err = await tokenRes.text()
      return NextResponse.json({ error: "Error token Uala", detail: err }, { status: 500 })
    }

    const tokenData = await tokenRes.json()
    const token = tokenData.access_token
    if (!token) return NextResponse.json({ error: "Sin token", detail: tokenData, keys: Object.keys(tokenData) }, { status: 500 })

    // 2. Crear orden de pago
    const orderRes = await fetch("https://checkout.developers.ar.ua.la/v2/api/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": `Bearer ${token}`,
        "X-Username": userName
      },
      body: JSON.stringify({
        amount: 10000,
        description: `Premium Quiniela IA - ${email}`,
        callback_success: "https://quiniela-ia-two.vercel.app/predictions?pago=ok",
        callback_fail: "https://quiniela-ia-two.vercel.app/predictions?pago=error",
        notification_url: "https://quiniela-ia-two.vercel.app/api/webhooks/uala"
      }),
      signal: AbortSignal.timeout(10000)
    })

    const orderData = await orderRes.json()
    if (!orderRes.ok) return NextResponse.json({ error: "Error orden", status: orderRes.status, detail: orderData }, { status: 500 })

    const link = orderData.links?.checkout ||
      orderData.checkout_link ||
      orderData.link ||
      `https://checkout.ualabis.com.ar/${orderData.uuid}`

    return NextResponse.json({ ok: true, link, uuid: orderData.uuid })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 })
  }
}
