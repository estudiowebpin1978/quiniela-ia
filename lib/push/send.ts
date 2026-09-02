/**
 * Push notification sender.
 * Sends web push notifications to subscribed users.
 */

import { getSupabaseAdmin } from "@/lib/supabase-client"
import webPush from "web-push"
import logger from "@/lib/logger"

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ""
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || ""

let vapidConfigured = false

function initPush() {
  if (vapidConfigured) return true
  if (VAPID_PUBLIC && VAPID_PRIVATE) {
    try {
      webPush.setVapidDetails(
        "mailto:estudiowebpin@gmail.com",
        VAPID_PUBLIC,
        VAPID_PRIVATE
      )
      vapidConfigured = true
      return true
    } catch (err: unknown) {
      const e = err as { message?: string }
      logger.error("[push] Invalid VAPID keys", { error: e.message })
      return false
    }
  }
  logger.warn("[push] VAPID keys not configured — push notifications disabled")
  return false
}

interface PushPayload {
  title: string
  body: string
  icon?: string
  badge?: string
  url?: string
  data?: Record<string, unknown>
}

export async function sendPushToAll(payload: PushPayload): Promise<{ sent: number; failed: number }> {
  if (!initPush()) return { sent: 0, failed: 0 }

  const supabase = getSupabaseAdmin()
  const { data: subs } = await supabase.from("push_subscriptions").select("endpoint, p256dh, auth")

  if (!subs?.length) return { sent: 0, failed: 0 }

  let sent = 0
  let failed = 0
  const expiredEndpoints: string[] = []

  const notificationPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon || "/icon-192.png",
    badge: payload.badge || "/badge-72.png",
    url: payload.url || "/predictions",
    data: payload.data || {},
  })

  // Batch: send in chunks of 50 with 200ms pause between chunks
  const CHUNK_SIZE = 50
  const CHUNK_DELAY_MS = 200

  for (let i = 0; i < subs.length; i += CHUNK_SIZE) {
    const chunk = subs.slice(i, i + CHUNK_SIZE)
    const results = await Promise.allSettled(
      chunk.map(async (sub) => {
        try {
          await webPush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            notificationPayload
          )
          sent++
        } catch (err: unknown) {
          failed++
          const e = err as { statusCode?: number }
          if (e?.statusCode === 404 || e?.statusCode === 410) {
            expiredEndpoints.push(sub.endpoint)
          }
        }
      })
    )

    // Batch-delete expired subscriptions
    if (expiredEndpoints.length > 0) {
      await supabase.from("push_subscriptions").delete().in("endpoint", expiredEndpoints)
      expiredEndpoints.length = 0
    }

    // Pause between chunks to avoid FCM rate limits
    if (i + CHUNK_SIZE < subs.length) {
      await new Promise(r => setTimeout(r, CHUNK_DELAY_MS))
    }
  }

  return { sent, failed }
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<boolean> {
  if (!initPush()) return false

  const supabase = getSupabaseAdmin()
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", userId)

  if (!subs?.length) return false

  const notificationPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon || "/icon-192.png",
    badge: payload.badge || "/badge-72.png",
    url: payload.url || "/predictions",
    data: payload.data || {},
  })

  for (const sub of subs) {
    try {
      await webPush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        notificationPayload
      )
    } catch (err: unknown) {
      const e = err as { statusCode?: number }
      if (e?.statusCode === 404 || e?.statusCode === 410) {
        await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint)
      }
    }
  }

  return true
}

export async function getSubscriptionCount(): Promise<number> {
  const supabase = getSupabaseAdmin()
  const { count } = await supabase.from("push_subscriptions").select("*", { count: "exact", head: true })
  return count || 0
}
