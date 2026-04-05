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
    // 1. Token - misma URL que funciona en test-uala
    const tokenRes = await fetch("https://auth.developers.ar.ua.la/v2/api/auth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret_id: clientSecret,
        username: userName
      })
    })

    const tokenData = await tokenRes.json()
    const token = tokenData.access_token
    if (!token) return NextResponse.json({ error: "Error token", detail: tokenData }, { status: 500 })

    // 2. Crear orden - URL correcta segun documentacion oficial
    const orderRes = await fetch("https://checkout.developers.ar.ua.la/v2/api/checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        amount: "10000",
        description: `Premium Quiniela IA - ${email}`,
        callback_success: "https://quiniela-ia-two.vercel.app/predictions?pago=ok",
        callback_fail: "https://quiniela-ia-two.vercel.app/predictions?pago=error",
        notification_url: "https://quiniela-ia-two.vercel.app/api/webhooks/uala",
        external_reference: email
      }),
      signal: AbortSignal.timeout(15000)
    })

    let orderData:any = {}
    try{ orderData = await orderRes.json() }catch{}
    if (!orderRes.ok) return NextResponse.json({
      error: "Error orden",
      httpStatus: orderRes.status,
      detail: orderData,
      tokenUsed: token.slice(0,20)+"..."
    }, { status: 500 })

    const link = orderData.links?.checkout ||
      orderData.checkout_link ||
      orderData.link ||
      `https://checkout.ualabis.com.ar/order/${orderData.uuid}`

    return NextResponse.json({ ok: true, link, uuid: orderData.uuid })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 })
  }
}
