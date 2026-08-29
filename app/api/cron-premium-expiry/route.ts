import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-client"
import { validateCronAuth, unauthorizedResponse, logCronExecution } from "@/lib/cron/auth"
import logger from "@/lib/logger"

interface PushSub {
  endpoint: string
  p256dh: string
  auth: string
}

interface ExpiryUser {
  id: string
  email: string
  premium_until: string
  role?: string
  push_subscriptions: PushSub[] | null
}

export async function GET(req: NextRequest) {
  const t0 = Date.now()
  const authResult = await validateCronAuth(req)
  if (!authResult.authorized) {
    return unauthorizedResponse()
  }

  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ""
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY || ""
  if (!vapidPublic || !vapidPrivate) {
    return NextResponse.json({ ok: true, notificados: 0, message: "VAPID keys no configuradas" })
  }
  let webpush
  try { webpush = await import("web-push") } catch { return NextResponse.json({ error: "Error al importar web-push" }, { status: 500 }) }
  try { webpush.setVapidDetails("mailto:estudiowebpin@gmail.com", vapidPublic, vapidPrivate) } catch { return NextResponse.json({ error: "Error al configurar VAPID" }, { status: 500 }) }

  const supabase = getSupabaseAdmin()

  const ahora = new Date()
  const enTresDias = new Date(ahora.getTime() + 3 * 86400000)

  // Premium users expiring soon (only those NOT already expired — expired ones are handled below)
  const { data: expiringUsers, error } = await supabase
    .from("user_profiles")
    .select("id, email, premium_until, push_subscriptions(endpoint, p256dh, auth)")
    .eq("role", "premium")
    .gte("premium_until", ahora.toISOString())
    .lt("premium_until", enTresDias.toISOString())
    .not("premium_until", "is", null)

  // Free users whose trial has expired
  const { data: expiredTrials } = await supabase
    .from("user_profiles")
    .select("id, email, premium_until, push_subscriptions(endpoint, p256dh, auth)")
    .eq("role", "free")
    .lt("premium_until", ahora.toISOString())
    .not("premium_until", "is", null)

  if (error) {
    logger.error("[cron-premium-expiry] DB error", { error: error.message })
    return NextResponse.json({ error: "Error de base de datos" }, { status: 500 })
  }

  // ── DOWNGRADE expired premium users ──────────────────────────────────
  const { data: expiredPremium } = await supabase
    .from("user_profiles")
    .select("id")
    .eq("role", "premium")
    .lt("premium_until", ahora.toISOString())
    .not("premium_until", "is", null)

  let downgraded = 0
  if (expiredPremium && expiredPremium.length > 0) {
    const ids = expiredPremium.map((u: { id: string }) => u.id)
    const { error: downErr } = await supabase
      .from("user_profiles")
      .update({ role: "free" })
      .in("id", ids)
    if (!downErr) downgraded = ids.length
  }

  // Combine both lists
  const allUsers: ExpiryUser[] = [
    ...(expiringUsers || []),
    ...(expiredTrials || []).filter((u: ExpiryUser) => !(expiringUsers || []).some((e: ExpiryUser) => e.id === u.id))
  ]
  if (!allUsers.length) return NextResponse.json({ ok: true, notificados: 0 })

  let notificados = 0
  for (const user of allUsers) {
    const daysLeft = Math.ceil((new Date(user.premium_until).getTime() - Date.now()) / 86400000)
    const expired = daysLeft <= 0
    const isTrialExpired = user.role === "free" && expired
    const subs = user.push_subscriptions || []
    if (!Array.isArray(subs) || subs.length === 0) continue

    const title = expired ? (isTrialExpired ? "⏰ Prueba gratuita vencida" : "⏰ Premium vencido") : "⚠️ Premium próximo a vencer"
    const body = expired
      ? (isTrialExpired
        ? "Tu período de prueba gratuita ha vencido. Actualizá a Premium para seguir accediendo a análisis de 3 y 4 cifras."
        : "Tu suscripción Premium ha vencido. Renová para seguir accediendo a análisis de 3 y 4 cifras.")
      : `Tu Premium vence en ${daysLeft} día${daysLeft === 1 ? "" : "s"}. Renová antes del vencimiento.`

    const payload = JSON.stringify({ title, body, url: "/predictions" })

    const results = await Promise.allSettled(
      subs.map((sub: PushSub) =>
        webpush.sendNotification({
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth }
        }, payload).then(() => { notificados++ })
          .catch(async (e) => {
            // Clean up expired subscriptions
            if (e?.statusCode === 404 || e?.statusCode === 410) {
              await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint)
            }
          })
      )
    )
  }

  logCronExecution("cron-premium-expiry", { notificados, totalUsers: allUsers.length, downgraded }, t0)

  return NextResponse.json({ ok: true, notificados, totalUsers: allUsers.length, downgraded })
}
