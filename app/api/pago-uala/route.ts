import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  const { email } = await req.json()
  if (!email) return NextResponse.json({ error: "Email requerido" }, { status: 400 })

  const userName = process.env.UALA_USERNAME || ""
  const clientId = process.env.UALA_CLIENT_ID || ""
  const clientSecret = process.env.UALA_CLIENT_SECRET || ""

  if (!userName || !clientId || !clientSecret)
    return NextResponse.json({ error: "Credenciales Uala no configuradas" }, { status: 500 })

  try {
    // 1. Obtener token
    const tokenRes = await fetch("https://auth.ualabis.com.ar/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
        audience: "https://merchants.prod.uala.com.ar/"
      })
    })
    const tokenData = await tokenRes.json()
    if (!tokenData.access_token)
      return NextResponse.json({ error: "Error obteniendo token Uala", detail: tokenData }, { status: 500 })

    // 2. Crear orden de pago
    const orderRes = await fetch("https://merchants.prod.uala.com.ar/api/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${tokenData.access_token}`,
        "X-Username": userName
      },
      body: JSON.stringify({
        amount: 10000,
        description: `Premium Quiniela IA - ${email}`,
        callback_success: `https://quiniela-ia-two.vercel.app/predictions?pago=ok`,
        callback_fail: `https://quiniela-ia-two.vercel.app/predictions?pago=error`,
        notification_url: `https://quiniela-ia-two.vercel.app/api/webhooks/uala`
      })
    })
    const orderData = await orderRes.json()
    if (!orderData.uuid && !orderData.link)
      return NextResponse.json({ error: "Error creando orden", detail: orderData }, { status: 500 })

    return NextResponse.json({
      ok: true,
      link: orderData.links?.checkout || orderData.link || `https://checkout.ualabis.com.ar/${orderData.uuid}`,
      uuid: orderData.uuid
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
