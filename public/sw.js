self.addEventListener("push", function(e) {
  const data = e.data ? e.data.json() : {}
  e.waitUntil(
    self.registration.showNotification(data.title || "Quiniela IA", {
      body: data.body || "Nuevas predicciones disponibles",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      vibrate: [200, 100, 200],
      data: { url: data.url || "/" }
    })
  )
})
self.addEventListener("notificationclick", function(e) {
  e.notification.close()
  e.waitUntil(clients.openWindow(e.notification.data.url || "/"))
})
self.addEventListener("install", e => self.skipWaiting())
self.addEventListener("activate", e => e.waitUntil(clients.claim()))
