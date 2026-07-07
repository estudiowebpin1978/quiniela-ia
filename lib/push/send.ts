/**
 * Push notification sender.
 * Sends web push notifications to subscribed users.
 */

import { createClient } from "@supabase/supabase-js"
import webPush from "web-push"

const SB_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/"/g, "").trim()
const SK_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").replace(/"/g, "").trim()
const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ""
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || ""

function initPush() {
  if (VAPID_PUBLIC && VAPID_PRIVATE) {
    webPush.setVapidDetails(
      "mailto:estudiowebpin@gmail.com",
      VAPID_PUBLIC,
      VAPID_PRIVATE
    )
    return true
  }
  return false
}

interface PushPayload {
  title: string
  body: string
  icon?: string
  badge?: string
  url?: string
  data?: Record<string, any>
}

export async function sendPushToAll(payload: PushPayload): Promise<{ sent: number; failed: number }> {
  if (!initPush()) return { sent: 0, failed: 0 }
  if (!SB_URL || !SK_KEY) return { sent: 0, failed: 0 }

  const supabase = createClient(SB_URL, SK_KEY)
  const { data: subs } = await supabase.from("push_subscriptions").select("endpoint, p256dh, auth")

  if (!subs?.length) return { sent: 0, failed: 0 }

  let sent = 0
  let failed = 0

  const notificationPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon || "/icon-192.png",
    badge: payload.badge || "/badge-72.png",
    url: payload.url || "/predictions",
    data: payload.data || {},
  })

  const results = await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webPush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          notificationPayload
        )
        sent++
      } catch (err: any) {
        failed++
        // Remove expired subscriptions
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint)
        }
      }
    })
  )

  return { sent, failed }
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<boolean> {
  if (!initPush()) return false
  if (!SB_URL || !SK_KEY) return false

  const supabase = createClient(SB_URL, SK_KEY)
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
    } catch (err: any) {
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint)
      }
    }
  }

  return true
}

export async function getSubscriptionCount(): Promise<number> {
  if (!SB_URL || !SK_KEY) return 0
  const supabase = createClient(SB_URL, SK_KEY)
  const { count } = await supabase.from("push_subscriptions").select("*", { count: "exact", head: true })
  return count || 0
}
