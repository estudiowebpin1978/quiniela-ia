import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export async function POST(req: NextRequest) {
  try {
    const secret = req.nextUrl.searchParams.get("secret") || ""
    const expected = process.env.CRON_SECRET
    if (!expected) return NextResponse.json({ error: "CRON_SECRET no configurado" }, { status: 500 })
    if (secret !== expected) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { turno, numeros, fecha } = await req.json()
    if (!turno || !numeros?.length) {
      return NextResponse.json({ error: "Faltan datos" }, { status: 400 })
    }

    const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ""
    const vapidPrivate = process.env.VAPID_PRIVATE_KEY || ""
    if (!vapidPublic || !vapidPrivate) {
      return NextResponse.json({ ok: true, enviados: 0, message: "VAPID keys no configuradas" })
    }
    const webpush = await import("web-push")
    webpush.setVapidDetails("mailto:estudiowebpin@gmail.com", vapidPublic, vapidPrivate)

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { data: subs } = await supabase.from("push_subscriptions").select("*")
    if (!subs?.length) return NextResponse.json({ ok: true, enviados: 0 })

    const cabeza = String(numeros[0]).padStart(4, "0")
    const dosCifras = cabeza.slice(-2)
    const payload = JSON.stringify({
      title: `Resultados ${turno}`,
      body: `Cabeza: ${cabeza} | 2 cifras: ${dosCifras}`,
      url: "/predictions"
    })

    let enviados = 0
    const resultados = await Promise.allSettled(
      subs.map(sub =>
        webpush.sendNotification({
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth }
        }, payload).then(() => { enviados++ })
      )
    )
    return NextResponse.json({ ok: true, enviados, total: subs.length })
  } catch {
    return NextResponse.json({ error: "Error al enviar push" }, { status: 500 })
  }
}
