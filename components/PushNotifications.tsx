"use client"
import { useCallback, useEffect, useRef, useState } from "react"

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ""

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = atob(b64)
  return Uint8Array.from(raw.split("").map(c => c.charCodeAt(0)))
}

async function registerSW(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" })
  } catch {
    return null
  }
}

export function usePushNotifications() {
  const [subscribed, setSubscribed] = useState(false)
  const [supported] = useState(() => typeof window !== "undefined"
    ? "Notification" in window && "PushManager" in window && !!navigator.serviceWorker
    : false)
  const [loading, setLoading] = useState(false)
  const swReg = useRef<ServiceWorkerRegistration | null>(null)

  useEffect(() => {
    if (!supported) return
    registerSW().then(reg => {
      if (reg) {
        swReg.current = reg
        reg.pushManager.getSubscription().then(sub => {
          setSubscribed(!!sub)
        })
      }
    })
  }, [])

  const toggle = useCallback(async () => {
    if (!swReg.current) return
    setLoading(true)
    try {
      const sub = await swReg.current.pushManager.getSubscription()
      if (sub) {
        await sub.unsubscribe()
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint })
        })
        setSubscribed(false)
      } else {
        const perm = await Notification.requestPermission()
        if (perm !== "granted") { setLoading(false); return }
        const subscription = await swReg.current.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as any
        })
        const subJSON = subscription.toJSON()
        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            endpoint: subJSON.endpoint,
            p256dh: subJSON.keys!.p256dh,
            auth: subJSON.keys!.auth
          })
        })
        setSubscribed(true)
      }
    } catch { }
    setLoading(false)
  }, [])

  return { subscribed, supported, loading, toggle }
}
