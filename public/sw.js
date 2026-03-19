const CACHE="quiniela-ia-v1"
const STATIC=["/","/login","/predictions"]
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(STATIC))))
self.addEventListener("fetch",e=>e.respondWith(fetch(e.request).catch(()=>caches.match(e.request))))
