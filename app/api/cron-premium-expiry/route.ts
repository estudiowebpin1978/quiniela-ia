import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getSupabaseUrl, getSupabaseKey } from "@/lib/config"

export async function GET(req: NextRequest) {
  const isVercelCron = req.headers.get("x-vercel-cron") === "1"
  const secret = req.nextUrl.searchParams.get("secret") || ""
  const expected = process.env.CRON_SECRET
  if (!isVercelCron && !(secret && expected && secret === expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ""
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY || ""
  if (!vapidPublic || !vapidPrivate) {
    return NextResponse.json({ ok: true, notificados: 0, message: "VAPID keys no configuradas" })
  }
  let webpush
  try { webpush = await import("web-push") } catch { return NextResponse.json({ error: "Error al importar web-push" }, { status: 500 }) }
  try { webpush.setVapidDetails("mailto:estudiowebpin@gmail.com", vapidPublic, vapidPrivate) } catch { return NextResponse.json({ error: "Error al configurar VAPID" }, { status: 500 }) }

  const SB_URL = getSupabaseUrl()
  const SB_KEY = getSupabaseKey()
  if (!SB_URL || !SB_KEY) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 })

  const supabase = createClient(SB_URL, SB_KEY)

  const ahora = new Date()
  const enTresDias = new Date(ahora.getTime() + 3 * 86400000)

  const { data: expiringUsers, error } = await supabase
    .from("user_profiles")
    .select("id, email, premium_until, push_subscriptions(endpoint, p256dh, auth)")
    .eq("role", "premium")
    .lt("premium_until", enTresDias.toISOString())
    .not("premium_until", "is", null)

  if (error) return NextResponse.json({ error: "DB error: " + error.message }, { status: 500 })
  if (!expiringUsers?.length) return NextResponse.json({ ok: true, notificados: 0 })

  let notificados = 0
  for (const user of expiringUsers) {
    const daysLeft = Math.ceil((new Date(user.premium_until).getTime() - Date.now()) / 86400000)
    const expired = daysLeft <= 0
    const subs = (user as any).push_subscriptions || []
    if (!Array.isArray(subs) || subs.length === 0) continue

    const title = expired ? "⏰ Premium vencido" : "⚠️ Premium próximo a vencer"
    const body = expired
      ? "Tu suscripción Premium ha vencido. Renová para seguir accediendo a análisis de 3 y 4 cifras."
      : `Tu Premium vence en ${daysLeft} día${daysLeft === 1 ? "" : "s"}. Renová antes del vencimiento.`

    const payload = JSON.stringify({ title, body, url: "/predictions" })

    const results = await Promise.allSettled(
      subs.map((sub: any) =>
        webpush.sendNotification({
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth }
        }, payload).then(() => { notificados++ })
      )
    )
  }

  return NextResponse.json({ ok: true, notificados, totalUsers: expiringUsers.length })
}
