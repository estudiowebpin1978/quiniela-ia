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
}

export async function GET(req: NextRequest) {
  const t0 = Date.now()
  const authResult = await validateCronAuth(req)
  if (!authResult.authorized) {
    return unauthorizedResponse()
  }

  const supabase = getSupabaseAdmin()

  const ahora = new Date()
  const enTresDias = new Date(ahora.getTime() + 3 * 86400000)

  // ── DOWNGRADE expired premium users (first — must always run) ────────
  const { data: expiredPremium, error: expErr } = await supabase
    .from("user_profiles")
    .select("id")
    .eq("role", "premium")
    .lt("premium_until", ahora.toISOString())
    .not("premium_until", "is", null)

  let downgraded = 0
  if (expErr) {
    logger.error("[cron-premium-expiry] downgrade query error", { error: expErr.message })
  } else if (expiredPremium && expiredPremium.length > 0) {
    const ids = expiredPremium.map((u: { id: string }) => u.id)
    const { error: downErr } = await supabase
      .from("user_profiles")
      .update({ role: "free" })
      .in("id", ids)
    if (downErr) logger.error("[cron-premium-expiry] downgrade update error", { error: downErr.message })
    else downgraded = ids.length
  }

  // Premium users expiring soon (no joins — push subscriptions fetched separately)
  const { data: expiringUsers, error } = await supabase
    .from("user_profiles")
    .select("id, email, role, premium_until")
    .eq("role", "premium")
    .gte("premium_until", ahora.toISOString())
    .lt("premium_until", enTresDias.toISOString())
    .not("premium_until", "is", null)

  // Free users whose trial has expired
  const { data: expiredTrials, error: trialErr } = await supabase
    .from("user_profiles")
    .select("id, email, role, premium_until")
    .eq("role", "free")
    .lt("premium_until", ahora.toISOString())
    .not("premium_until", "is", null)

  if (error || trialErr) {
    logger.error("[cron-premium-expiry] DB error", { error: (error || trialErr)?.message, downgraded })
    return NextResponse.json({ ok: false, error: "Error de base de datos", downgraded }, { status: 500 })
  }

  // Combine both lists
  const allUsers: ExpiryUser[] = [
    ...(expiringUsers || []),
    ...(expiredTrials || []).filter((u: ExpiryUser) => !(expiringUsers || []).some((e: ExpiryUser) => e.id === u.id))
  ]
  if (!allUsers.length) {
    logCronExecution("cron-premium-expiry", { notificados: 0, totalUsers: 0, downgraded }, t0)
    return NextResponse.json({ ok: true, notificados: 0, downgraded })
  }

  // Expiration/downgrade is core billing behavior and has already run above.
  // Missing push configuration should disable notifications only, never expiry.
  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ""
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY || ""
  if (!vapidPublic || !vapidPrivate) {
    logCronExecution("cron-premium-expiry", {
      notificados: 0,
      totalUsers: allUsers.length,
      downgraded,
      notificationsSkipped: "VAPID keys not configured",
    }, t0)
    return NextResponse.json({
      ok: true,
      notificados: 0,
      totalUsers: allUsers.length,
      downgraded,
      message: "VAPID keys no configuradas; vencimientos procesados sin notificaciones",
    })
  }

  let webpush: typeof import("web-push")
  try {
    webpush = await import("web-push")
  } catch {
    return NextResponse.json({ error: "Error al importar web-push", downgraded }, { status: 500 })
  }
  try {
    webpush.setVapidDetails("mailto:estudiowebpin@gmail.com", vapidPublic, vapidPrivate)
  } catch {
    return NextResponse.json({ error: "Error al configurar VAPID", downgraded }, { status: 500 })
  }

  // Push subscriptions fetched separately (no PostgREST embed — no FK relationship cached)
  const userIds = allUsers.map((u: ExpiryUser) => u.id)
  const { data: subRows } = await supabase
    .from("push_subscriptions")
    .select("user_id, endpoint, p256dh, auth")
    .in("user_id", userIds)
  const subsByUser = new Map<string, PushSub[]>()
  for (const s of subRows || []) {
    const key = String(s.user_id)
    if (!subsByUser.has(key)) subsByUser.set(key, [])
    subsByUser.get(key)!.push({ endpoint: String(s.endpoint), p256dh: String(s.p256dh), auth: String(s.auth) })
  }

  let notificados = 0
  for (const user of allUsers) {
    const daysLeft = Math.ceil((new Date(user.premium_until).getTime() - Date.now()) / 86400000)
    const expired = daysLeft <= 0
    const isTrialExpired = user.role === "free" && expired
    const subs = subsByUser.get(user.id) || []
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
