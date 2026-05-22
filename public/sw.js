self.addEventListener("push", function(e) {
  let data = {}
  try { data = e.data ? e.data.json() : {} } catch {}
  e.waitUntil(
    self.registration.showNotification(data.title || "Quiniela IA", {
      body: data.body || "Nuevas predicciones disponibles",
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
self.addEventListener("install", e => self.skipWaiting())
self.addEventListener("activate", e => e.waitUntil(clients.claim()))
