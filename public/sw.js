// Quiniela IA - Service Worker for Push Notifications
//
// v3: la estrategia de caché cambió. Antes (v2) TODO era cache-first, así que
// el HTML de /predictions quedaba congelado en la versión con la que se visitó
// por primera vez y los deploys NUNCA se veían. Ahora:
//   - /_next/static/* (assets con hash, nombre inmutable): cache-first.
//   - Todo lo demás (HTML, RSC, estáticos sin hash): network-first, y la caché
//     solo entra como fallback cuando no hay red (offline).
//   - Al activarse se purgan las cachés de versiones anteriores.
const CACHE_NAME = "quiniela-v3"
const OFFLINE_URL = "/offline.html"

self.addEventListener("install", (event) => {
  self.skipWaiting()
  // Precachear la página offline (best-effort: si no hay red, no frenar la instalación)
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.add(OFFLINE_URL).catch(() => undefined))
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Purgar cachés de versiones anteriores (v1/v2 guardaban HTML viejo)
      const claves = await caches.keys()
      const viejas = claves.filter((k) => k !== CACHE_NAME)
      await Promise.all(viejas.map((k) => caches.delete(k)))
      await clients.claim()
      // Upgrade desde una versión con caché vieja: recargar las pestañas
      // abiertas para que vean el deploy nuevo sin refresh manual.
      if (viejas.length > 0) {
        const ventanas = await clients.matchAll({ type: "window" })
        await Promise.all(ventanas.map((c) => c.navigate(c.url).catch(() => null)))
      }
    })()
  )
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
    badge: data.badge || "/icon-192.png",
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

  const url = new URL(event.request.url)
  if (url.pathname.startsWith("/api/")) return

  // Assets con hash (nombre inmutable): cache-first es seguro y rápido.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(event.request).then(
        (cached) =>
          cached ||
          fetch(event.request).then((response) => {
            if (response.status === 200) {
              const clone = response.clone()
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
            }
            return response
          })
      )
    )
    return
  }

  // Todo lo demás (HTML, RSC, imágenes): network-first para que cualquier
  // deploy se vea siempre. La caché solo responde sin conexión.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.status === 200) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
        }
        return response
      })
      .catch(async () => {
        const cached = await caches.match(event.request)
        if (cached) return cached
        if (event.request.destination === "document") {
          return caches.match(OFFLINE_URL)
        }
        return new Response(null, { status: 503, statusText: "Service Unavailable" })
      })
  )
})
