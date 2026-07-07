// Quiniela IA - Service Worker for Push Notifications
const CACHE_NAME = "quiniela-v1"
const OFFLINE_URL = "/offline.html"

self.addEventListener("install", (event) => {
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(clients.claim())
})

self.addEventListener("push", (event) => {
  let data = { title: "Quiniela IA", body: "Nuevo resultado disponible", url: "/predictions" }

  try {
    if (event.data) {
      const payload = event.data.json()
      data = { ...data, ...payload }
    }
  } catch {}

  const isReminder = data.type === "sorteo_reminder"

  const options = {
    body: data.body,
    icon: data.icon || "/icon-192.png",
    badge: data.badge || "/badge-72.png",
    vibrate: isReminder ? [300, 100, 300, 100, 300] : [200, 100, 200],
    tag: isReminder ? `quiniela-reminder-${data.data?.turno || "x"}` : "quiniela-notification",
    renotify: true,
    requireInteraction: isReminder,
    data: { url: data.url || "/predictions", ...data.data },
    actions: isReminder
      ? [
          { action: "open", title: "Generar análisis", icon: "/icon-192.png" },
          { action: "dismiss", title: "Cerrar", icon: "/icon-192.png" },
        ]
      : [
          { action: "open", title: "Ver resultados", icon: "/icon-192.png" },
          { action: "dismiss", title: "Cerrar", icon: "/icon-192.png" },
        ],
  }

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()

  if (event.action === "dismiss") return

  const url = event.notification.data?.url || "/predictions"

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      return clients.openWindow(url)
    })
  )
})

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return

  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request).then((response) => {
        if (response.status === 200) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
        }
        return response
      }).catch(() => {
        if (event.request.destination === "document") {
          return caches.match(OFFLINE_URL)
        }
      })
    })
  )
})
