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
    const UalaApiCheckout = require("ualabis-nodejs")
    await UalaApiCheckout.setUp({
      userName,
      clientId,
      clientSecret,
      isDev: false,
    })

    const order = await UalaApiCheckout.createOrder({
      amount: 10000,
      description: `Premium Quiniela IA - ${email}`,
      callbackSuccess: "https://quiniela-ia-two.vercel.app/predictions?pago=ok",
      callbackFail: "https://quiniela-ia-two.vercel.app/predictions?pago=error",
    })

    const checkoutLink = order?.links?.checkout ||
      order?.link ||
      `https://checkout.ualabis.com.ar/${order?.uuid}`

    return NextResponse.json({ ok: true, link: checkoutLink, uuid: order?.uuid })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 })
  }
}
