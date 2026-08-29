"use client"

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ""

export async function subscribeToPush(): Promise<boolean> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false
  if (!VAPID_PUBLIC_KEY) return false

  try {
    const registration = await navigator.serviceWorker.register("/sw.js")
    await navigator.serviceWorker.ready

    const permission = await Notification.requestPermission()
    if (permission !== "granted") return false

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })

    const sub = subscription.toJSON()
    if (!sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) return false

    // Get userId from localStorage
    let userId: string | null = null
    try {
      const raw = localStorage.getItem("quiniela-ia-auth")
      if (raw) {
        const s = JSON.parse(raw)
        userId = s?.user?.id || null
      }
    } catch {}

    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        userId,
      }),
    })

    return true
  } catch {
    return false
  }
}

export async function unsubscribeFromPush(): Promise<boolean> {
  if (!("serviceWorker" in navigator)) return false

  try {
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    if (!subscription) return false

    const endpoint = subscription.endpoint
    await subscription.unsubscribe()

    await fetch("/api/push/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint }),
    })

    return true
  } catch {
    return false
  }
}

export async function isSubscribed(): Promise<boolean> {
  if (!("serviceWorker" in navigator)) return false

  try {
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    return !!subscription
  } catch {
    return false
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}
