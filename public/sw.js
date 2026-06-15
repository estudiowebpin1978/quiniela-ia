const CACHE_NAME = "quiniela-ia-v1"
const PRECACHE = [
  "/",
  "/predictions",
  "/login",
  "/icon-192.png",
  "/icon-512.png",
  "/favicon.png"
]

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(c => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => clients.claim())
  )
})

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return
  if (e.request.url.includes("/api/")) {
    e.respondWith(
      fetch(e.request).catch(() =>
        new Response(JSON.stringify({ error: "Sin conexión" }), {
          headers: { "Content-Type": "application/json" }
        })
      )
    )
    return
  }
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) {
        fetch(e.request).then(resp => {
          if (resp && resp.status === 200) {
            caches.open(CACHE_NAME).then(c => c.put(e.request, resp))
          }
        }).catch(() => {})
        return cached
      }
      return fetch(e.request).then(resp => {
        if (!resp || resp.status !== 200) return resp
        const clone = resp.clone()
        caches.open(CACHE_NAME).then(c => c.put(e.request, clone))
        return resp
      }).catch(() => {
        if (e.request.destination === "document") {
          return caches.match("/")
        }
        return new Response("", { status: 503 })
      })
    })
  )
})

self.addEventListener("push", function(e) {
  let data = {}
  try { data = e.data ? e.data.json() : {} } catch {}
  e.waitUntil(
    self.registration.showNotification(data.title || "Quiniela IA", {
      body: data.body || "Nuevos análisis disponibles",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      vibrate: [200, 100, 200],
      data: { url: data.url || "/predictions" },
      requireInteraction: true
    })
  )
})

self.addEventListener("notificationclick", function(e) {
  e.notification.close()
  e.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(function(clientList) {
      for (const client of clientList) {
        if (client.url.includes("/predictions") && "focus" in client) return client.focus()
      }
      return clients.openWindow(e.notification.data.url || "/predictions")
    })
  )
})
