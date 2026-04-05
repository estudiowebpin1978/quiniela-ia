import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  const { email } = await req.json()
  if (!email) return NextResponse.json({ error: "Email requerido" }, { status: 400 })

  const clientId = process.env.UALA_CLIENT_ID || ""
  const clientSecret = process.env.UALA_CLIENT_SECRET || ""

  if (!clientId || !clientSecret)
    return NextResponse.json({ error: "Credenciales no configuradas" }, { status: 500 })

  try {
    // ✅ 1. TOKEN (CORREGIDO)
    const tokenRes = await fetch("https://auth.developers.ar.ua.la/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
        audience: "https://checkout.developers.ar.ua.la/api"
      })
    })

    const tokenData = await tokenRes.json()

    if (!tokenRes.ok) {
      return NextResponse.json({ error: "Error token", detail: tokenData }, { status: 500 })
    }

    const token = tokenData.access_token
    if (!token) {
      return NextResponse.json({ error: "Sin token", detail: tokenData }, { status: 500 })
    }

    // ✅ 2. CREAR ORDEN (CORREGIDO)
    const orderRes = await fetch("https://checkout.developers.ar.ua.la/v2/api/checkout/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({
        amount: "10000",
        description: `Premium Quiniela IA - ${email}`,
        notification_url: "https://quiniela-ia-two.vercel.app/api/webhooks/uala",
        external_reference: email
      })
    })

    const orderData = await orderRes.json()

    if (!orderRes.ok) {
      return NextResponse.json({ error: "Error orden", detail: orderData }, { status: 500 })
    }

    const link =
      orderData.links?.checkout ||
      orderData.checkout_link ||
      orderData.link

    return NextResponse.json({ ok: true, link, raw: orderData })

  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 })
  }
}