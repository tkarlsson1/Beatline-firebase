// NOTESTREAM /test – Service Worker v1.1
const NS_CACHE = "ns-test-v1"; // Uppdatera detta vid varje ny release
const NS_ASSETS = [
  "/", "/index.html",
  "/styles.css", "/script.js", "/sessions.js",
  "/offline.html"
];

// Install: cachea app shell
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(NS_CACHE).then((cache) => cache.addAll(NS_ASSETS))
  );
  self.skipWaiting();
});

// Activate: rensa gamla cache-versioner
self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key !== NS_CACHE).map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

// Fetch: nätverk först, fallback till cache
self.addEventListener("fetch", (e) => {
  const req = e.request;
  e.respondWith(
    (async () => {
      try {
        const netRes = await fetch(req);
        return netRes;
      } catch {
        const cacheRes = await caches.match(req);
        if (cacheRes) return cacheRes;
        const offlineRes = await caches.match("/offline.html");
        return offlineRes || new Response("Offline", { status: 503 });
      }
    })()
  );
});
